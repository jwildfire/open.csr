// The study model, and the gate that holds every display to it.
//
// library/study.yaml declares the study once: the arms in print order, the
// analysis sets with the subjects each holds per arm, the data source. Every ARD
// the pipeline writes carries a `population` record — the analysis set it was
// built on and the distinct subjects per arm in its denominator. This module
// compares the two for every display an assembly places, and reports:
//
//   - a display whose per-arm counts differ from the model's for its analysis
//     set (the display read a different packaging of the study, or the model is
//     stale — either way the document must not build);
//   - two displays that report the same analysis set with different counts
//     inside one document (the "two versions of the study" the 1 September
//     assessment found, confirmed from the data on D0032);
//   - a display with no population record at all, as a WARNING that names it —
//     "not gated" is reported, never silently passed as "gated and clean".
//
// The model is the authority for counts, and the test suite re-measures the
// model against the data, so the chain is closed: data ↔ model ↔ every display.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

/** Load and validate library/study.yaml under `root`. */
export function loadStudyModel(root) {
  const path = join(root, 'library', 'study.yaml');
  const model = yaml.load(readFileSync(path, 'utf8'));
  const fail = (msg) => {
    throw new Error(`library/study.yaml: ${msg}`);
  };
  if (!model || typeof model !== 'object') fail('is not a mapping');
  if (!model.id) fail('`id` is required');
  if (!Array.isArray(model.arms) || !model.arms.length) fail('`arms` must list at least one arm');
  const labels = armLabels(model);
  if (labels.some((l) => !l) || new Set(labels).size !== labels.length) fail('every arm needs a distinct `label`');
  if (!model.analysis_sets || typeof model.analysis_sets !== 'object') fail('`analysis_sets` is required');
  for (const [name, set] of Object.entries(model.analysis_sets)) {
    if (!set || typeof set !== 'object' || !('flag' in set)) fail(`analysis set "${name}" must declare \`flag\``);
    const have = Object.keys(set.subjects ?? {});
    if (have.length !== labels.length || labels.some((l) => !(l in (set.subjects ?? {})))) {
      fail(`analysis set "${name}" must declare \`subjects\` for exactly the arms: ${labels.join(', ')}`);
    }
  }
  return model;
}

/** The arm labels in print order. */
export function armLabels(model) {
  return (model.arms ?? []).map((a) => String(a.label ?? ''));
}

/**
 * Hold every ARD in `ards` (Map slug → parsed ard.json) to the study model.
 *
 * Returns { ok, errors, warnings, checked, lanes } where `lanes` records which
 * data source(s) each display's ARD was built from, so the document can say
 * which packaging each number came from without anyone re-running the pipeline.
 */
export function checkTreatmentConsistency(model, ards) {
  const labels = armLabels(model);
  const errors = [];
  const warnings = [];
  const checked = [];
  const lanes = {};
  const bySet = new Map();

  for (const [slug, ard] of ards) {
    const prov = ard?.provenance ?? {};
    lanes[slug] = [...new Set((prov.data ?? []).map((d) => d.source_pkg).filter(Boolean))];
    const pop = prov.population;
    if (!pop) {
      warnings.push(`${slug}: its ARD carries no population record, so it is NOT gated by the study model — regenerate it`);
      continue;
    }
    if (!pop.n) {
      warnings.push(
        `${slug}: population record has no per-arm counts (${pop.analysis_set}, grouped by ${pop.group ?? 'nothing'}); not gated by arm`
      );
      continue;
    }
    const set = model.analysis_sets?.[pop.analysis_set];
    if (!set) {
      errors.push(`${slug}: analysis set "${pop.analysis_set}" is not declared in library/study.yaml`);
      continue;
    }
    checked.push(slug);
    for (const label of labels) {
      const got = pop.n[label];
      const want = set.subjects[label];
      if (got !== want) {
        errors.push(
          `${slug}: ${label} has ${got ?? 'no'} subjects in its ${pop.analysis_set} set; library/study.yaml says ${want}`
        );
      }
    }
    const key = labels.map((l) => pop.n[l]).join(' / ');
    if (!bySet.has(pop.analysis_set)) bySet.set(pop.analysis_set, new Map());
    const m = bySet.get(pop.analysis_set);
    m.set(key, [...(m.get(key) ?? []), slug]);
  }

  for (const [set, m] of bySet) {
    if (m.size > 1) {
      const groups = [...m.entries()].map(([k, slugs]) => `${slugs.join(', ')} → ${k}`);
      errors.push(`the ${set} set is reported with ${m.size} different arm counts in one document: ${groups.join(' | ')}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings, checked, lanes };
}

/**
 * An assembly's own `study.treatment_groups`, if it declares one, must be the
 * model's arms in the model's order — otherwise two files spell the study.
 */
export function checkAssemblyStudy(model, assemblyStudy) {
  const errors = [];
  const declared = assemblyStudy?.treatment_groups;
  if (Array.isArray(declared)) {
    const want = armLabels(model);
    if (declared.length !== want.length || declared.some((d, i) => d !== want[i])) {
      errors.push(
        `assembly.yaml study.treatment_groups [${declared.join(', ')}] differs from library/study.yaml arms [${want.join(', ')}]`
      );
    }
  }
  if (assemblyStudy?.id && model.id && assemblyStudy.id !== model.id) {
    errors.push(`assembly.yaml study.id "${assemblyStudy.id}" differs from library/study.yaml id "${model.id}"`);
  }
  return errors;
}
