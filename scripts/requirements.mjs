// Requirement-text sync CLI (open.csr #1): extracts the reviewed requirement
// text from quality/requirements/*.md into docs/requirements/<component>.json
// so the evidence pages can show what each test evidences.
//
//   node scripts/requirements.mjs           regenerate the JSON extracts
//   node scripts/requirements.mjs --check   freshness guard: re-extract and
//                                           compare against every committed
//                                           extract (exit 1 on drift); with no
//                                           matrix present, validate that the
//                                           committed extract is well-formed
//   node scripts/requirements.mjs --strict  make unresolved IDs a hard failure
//
// Which component maps to which matrix comes from site/config.json, so a new
// display or component needs no edits here: add the registry entry with its
// `matrix` and its extract appears on the next run. Components whose matrix has
// not been written yet are reported and skipped — their evidence page degrades
// to IDs-only rather than failing the build.
//
// open.csr addition over safety.viz (research §16): the UNRESOLVED-ID REPORT.
// safety.viz resolves requirement text by exact ID match and degrades silently
// when it misses, so a matrix row split into -001A/-001B after tests cite -001
// just stops rendering text and nobody notices. Every run here reports both
// directions of the mismatch: IDs referenced by tests that no matrix defines,
// and reviewed requirements no test references.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildRequirementSet,
  compareRequirements,
  extractIdsFromTestSource,
  resolveRequirementCoverage
} from './requirements-lib.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(rootDir, 'docs', 'requirements');
const outputPathFor = (component) => path.join(outputRoot, `${component}.json`);
const matrixRoot = path.resolve(
  rootDir,
  process.env.REQUIREMENTS_SRC || 'quality/requirements'
);
const rel = (p) => path.relative(rootDir, p);

const mode = process.argv.includes('--check') ? 'check' : 'run';
const strict = process.argv.includes('--strict');

const config = JSON.parse(readFileSync(path.join(rootDir, 'site', 'config.json'), 'utf8'));

// Every registered module that names a matrix — components and displays alike.
// Several displays share displays.md; each still gets its own extract so its
// evidence page is self-contained.
const targets = [...(config.components || []), ...(config.displays || [])]
  .filter((entry) => entry.matrix)
  .map((entry) => ({ component: entry.module || entry.slug, matrix: entry.matrix }));

// ---------------------------------------------------------------------------
// Test-source scan: which requirement IDs do the suites actually claim?
// ---------------------------------------------------------------------------

const TEST_DIRS = ['tests/unit', 'tests/testthat', 'pipeline/tests/testthat', 'qc'];
const TEST_FILE = /\.(test\.[jm]?js|spec\.[jm]?js|[Rr])$/;

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const file = path.join(dir, entry);
    if (statSync(file).isDirectory()) return walk(file);
    return TEST_FILE.test(entry) ? [file] : [];
  });
}

function referencedIds() {
  const ids = new Set();
  for (const dir of TEST_DIRS) {
    for (const file of walk(path.join(rootDir, dir))) {
      for (const id of extractIdsFromTestSource(readFileSync(file, 'utf8'))) ids.add(id);
    }
  }
  // Committed evidence sets are a second source: they survive even if a suite
  // is temporarily unrunnable.
  const evidenceRoot = path.join(rootDir, 'docs', 'evidence');
  if (existsSync(evidenceRoot)) {
    for (const entry of readdirSync(evidenceRoot)) {
      const file = path.join(evidenceRoot, entry, 'evidence.json');
      if (!existsSync(file)) continue;
      try {
        const evidence = JSON.parse(readFileSync(file, 'utf8'));
        for (const rec of evidence.records || []) {
          for (const id of rec.requirementIds || []) ids.add(id);
        }
      } catch {
        console.warn(`⚠ ${rel(file)} is not valid JSON — skipped for the unresolved-ID report.`);
      }
    }
  }
  return [...ids].sort();
}

// ---------------------------------------------------------------------------

const matrixPathFor = (matrix) => path.join(matrixRoot, matrix);
const readMatrix = (matrix) => readFileSync(matrixPathFor(matrix), 'utf8');

const sets = new Map();
const missingMatrices = [];
for (const { component, matrix } of targets) {
  if (!existsSync(matrixPathFor(matrix))) {
    missingMatrices.push({ component, matrix });
    continue;
  }
  sets.set(component, buildRequirementSet({ component, matrix, markdown: readMatrix(matrix) }));
}

// The union of every reviewed ID across all matrices: an ID defined in a
// sibling component's matrix counts as resolved, not unresolved.
const knownIds = new Set();
for (const set of sets.values()) for (const id of Object.keys(set.requirements)) knownIds.add(id);
const referenced = referencedIds();

const global = resolveRequirementCoverage({
  requirements: Object.fromEntries([...knownIds].map((id) => [id, true])),
  referenced,
  known: knownIds
});

function reportUnresolved() {
  console.log('');
  console.log(
    `▸ Requirement resolution: ${knownIds.size} reviewed IDs across ${sets.size} matrices, ` +
      `${referenced.length} referenced by tests.`
  );
  if (global.unresolved.length) {
    console.warn(
      `⚠ ${global.unresolved.length} UNRESOLVED requirement ID(s) — referenced by a test but ` +
        'defined in no matrix (typo, rename, or an A/B split that broke the link):'
    );
    global.unresolved.forEach((id) => console.warn(`  - ${id}`));
  } else if (referenced.length) {
    console.log('✓ Every requirement ID referenced by a test resolves to a reviewed matrix row.');
  }
  if (global.uncovered.length) {
    console.log(
      `· ${global.uncovered.length} reviewed requirement(s) not yet referenced by any test: ` +
        `${global.uncovered.slice(0, 12).join(', ')}${global.uncovered.length > 12 ? ', …' : ''}`
    );
  }
  for (const { component, matrix } of missingMatrices) {
    console.log(`· ${component}: no ${matrix} in ${rel(matrixRoot)} — evidence page shows IDs only.`);
  }
}

let failed = false;

if (mode === 'check') {
  for (const { component } of targets) {
    const outputPath = outputPathFor(component);
    const fresh = sets.get(component);
    const hasCommitted = existsSync(outputPath);

    if (fresh) {
      if (!hasCommitted) {
        failed = true;
        console.error(`✗ ${rel(outputPath)} is missing — run npm run requirements and commit.`);
        continue;
      }
      const committed = JSON.parse(readFileSync(outputPath, 'utf8'));
      const { stale, differences } = compareRequirements(committed, fresh);
      if (stale) {
        failed = true;
        console.error(`✗ ${rel(outputPath)} is stale — run npm run requirements and commit:`);
        differences.forEach((d) => console.error(`  - ${d}`));
      } else {
        console.log(`✓ ${rel(outputPath)} fresh: ${Object.keys(fresh.requirements).length} rows.`);
      }
    } else if (hasCommitted) {
      const committed = JSON.parse(readFileSync(outputPath, 'utf8'));
      const entries = Object.entries(committed.requirements || {});
      const bad = entries.filter(([, text]) => typeof text !== 'string' || !text.trim());
      if (!entries.length || bad.length) {
        failed = true;
        console.error(
          `✗ ${rel(outputPath)} is malformed — ${
            entries.length ? `${bad.length} empty/invalid entries` : 'no requirement text'
          }.`
        );
      } else {
        console.log(`✓ ${rel(outputPath)} well-formed: ${entries.length} rows (no matrix source).`);
      }
    }
  }
} else {
  mkdirSync(outputRoot, { recursive: true });
  for (const [component, set] of [...sets].sort(([a], [b]) => a.localeCompare(b))) {
    const coverage = resolveRequirementCoverage({
      requirements: set.requirements,
      referenced,
      known: knownIds
    });
    writeFileSync(outputPathFor(component), JSON.stringify(set, null, 2) + '\n');
    console.log(
      `✓ Wrote ${rel(outputPathFor(component))} — ${Object.keys(set.requirements).length} ` +
        `requirements, ${coverage.covered.length} referenced by tests`
    );
  }
  if (!sets.size) {
    console.warn(
      `⚠ No requirement matrices found in ${rel(matrixRoot)} — nothing extracted. ` +
        'Every evidence page will render requirement IDs only.'
    );
  }
}

reportUnresolved();

if (strict && global.unresolved.length) {
  console.error('✗ --strict: unresolved requirement IDs are a build failure.');
  failed = true;
}
if (failed) process.exit(1);
