#!/usr/bin/env node
/**
 * assemble.mjs — walk the ICH E3 document model, resolve the Text Library against
 * the current ARDs, place display variants, assign Section 14 numbering, generate
 * the 16.1.9 provenance appendix, and emit the assembled CSR.
 *
 * Outputs
 *   docs/assembled/csr.json   document model consumed by the site builder
 *   docs/assembled/csr.html   self-contained readable rendering (no CDN, no JS deps)
 *
 * ---------------------------------------------------------------------------
 * csr.json SHAPE (schema "opencsr/csr/v1") — the site builder's contract
 * ---------------------------------------------------------------------------
 * {
 *   schema, generated,                     // ISO timestamp
 *   study:      { …assembly.yaml `study` verbatim… },
 *   template:   { id, title, version, source, sectionCount },
 *   ok:         boolean,                   // false if any gate failed
 *   sections: [                            // FLAT, document order; nest via `parent`
 *     { number, title, slug, level, parent,
 *       content: [ "text" | "in_text_display" | … ],   // from sections.yaml
 *       populated: boolean,                            // demo fills this section
 *       note,                                          // E3 guidance, may be null
 *       blocks: [                                      // resolved Text Library prose
 *         { id, title, tier, version, requirements, approval, provenance,
 *           included,                                  // false => gated out (draft)
 *           exclusionReason,
 *           text,                                      // markdown, bindings resolved
 *           html,                                      // rendered markdown
 *           bindings: [ { address, display, analysis, stat_name, qualifiers,
 *                         resolved, value, formatted, row } ],
 *           crossReferences: [ { type, target, text, resolved } ],
 *           numericFidelity: { ok, violations, exemptionsUsed } } ],
 *       displays: [                                    // in-text variants placed here
 *         { slug, variant: "in_text", number, label, title, type,
 *           html, ardSource, ardPath, rowCount } ],
 *       postText: [ { …same shape, variant: "post_text"… } ],
 *       provenance: { … } | null                       // only on 16.1.9
 *     } ],
 *   displayIndex: [ { slug, type, number, label, title, section,
 *                     variants: ["in_text","post_text"], ardSource, ardPath,
 *                     ard: { created, provenance } } ],
 *   textBlocks:  [ { id, title, tier, e3_section, approval, provenance,
 *                    included, bindings, requirements, file } ],
 *   provenanceAppendix: { section, displays: [ { slug, number, specHash,
 *                          displayHash, data: [...], environment, gitCommit,
 *                          created, source } ] },
 *   gates: { structure, bindingResolution, numericFidelity, approval,
 *            crossReferences, warnings, blocks: [...] }
 * }
 * ---------------------------------------------------------------------------
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

import {
  loadTextLibrary,
  loadArd,
  renderBlock,
  renderMarkdown,
  runGates,
  checkApproval,
  checkNumericFidelity,
  formatValue,
} from './text-lib.mjs';
import {
  loadSections,
  validateSections,
  loadAssembly,
  validateAssembly,
  assignDisplayNumbers,
  sectionIndex,
  loadDisplaySpec,
  compareSectionNumbers,
  DISPLAY_TYPE_LABELS,
} from './template-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PATHS = {
  sections: join(ROOT, 'library/templates/ich-e3/sections.yaml'),
  assembly: join(ROOT, 'library/templates/ich-e3/assembly.yaml'),
  text: join(ROOT, 'library/text'),
  tfl: join(ROOT, 'library/tfl'),
  outputs: join(ROOT, 'outputs'),
  fixtures: join(ROOT, 'tests/fixtures/ard'),
  out: join(ROOT, 'docs/assembled'),
};

/** Titles used when the TFL Library has not (yet) supplied a display.yaml. */
const FALLBACK_TITLES = {
  't-disposition': 'Subject Disposition',
  't-demographics': 'Demographic and Baseline Characteristics',
  't-exposure': 'Extent of Exposure',
  't-ae-overview': 'Overview of Treatment-Emergent Adverse Events',
  't-ae-common': 'Treatment-Emergent Adverse Events by System Organ Class and Preferred Term',
  'l-ae-serious': 'Listing of Deaths, Serious Adverse Events and Adverse Events Leading to Withdrawal',
};

// ---------------------------------------------------------------------------
// ARD discovery: real pipeline outputs first, fixtures as a documented fallback
// ---------------------------------------------------------------------------

/** Resolve `outputs/<slug>/current.json` to an ard.json path, tolerating shapes. */
function currentArdPath(slug) {
  const dir = join(PATHS.outputs, slug);
  if (!existsSync(dir)) return null;
  const pointer = join(dir, 'current.json');
  if (existsSync(pointer)) {
    let doc;
    try {
      doc = JSON.parse(readFileSync(pointer, 'utf8'));
    } catch {
      doc = null;
    }
    const candidates = [];
    if (typeof doc === 'string') candidates.push(doc);
    if (doc && typeof doc === 'object') {
      for (const key of ['ard', 'ard_file', 'ardFile', 'path', 'version', 'iteration', 'current']) {
        if (typeof doc[key] === 'string') candidates.push(doc[key]);
      }
    }
    for (const c of candidates) {
      for (const p of [
        resolve(ROOT, c),
        resolve(dir, c),
        resolve(ROOT, c, 'ard.json'),
        resolve(dir, c, 'ard.json'),
      ]) {
        if (existsSync(p) && p.endsWith('.json')) return p;
      }
    }
  }
  // Fall back to the highest-numbered iteration directory.
  const versions = readdirSync(dir)
    .filter((n) => /^v\d+$/.test(n))
    .sort()
    .reverse();
  for (const v of versions) {
    const p = join(dir, v, 'ard.json');
    if (existsSync(p)) return p;
  }
  return null;
}

/** Load the ARD for one display. Returns { ard, source, path } or null. */
function loadDisplayArd(slug) {
  const live = currentArdPath(slug);
  if (live) return { ard: loadArd(live), source: 'outputs', path: relative(live) };
  const fixture = join(PATHS.fixtures, `${slug}.json`);
  if (existsSync(fixture)) {
    return { ard: loadArd(fixture), source: 'fixture', path: relative(fixture) };
  }
  return null;
}

const relative = (p) => p.replace(`${ROOT}/`, '');

// ---------------------------------------------------------------------------
// Display rendering
// ---------------------------------------------------------------------------

const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Strip a spec-supplied "Table 14.x.y" prefix; the assembler owns the number. */
function baseTitle(slug, specs) {
  const raw = specs.display?.title ?? specs.analysis?.title ?? FALLBACK_TITLES[slug] ?? slug;
  return String(raw)
    .replace(/^\s*(Table|Listing|Figure)\s+[\d.]+\s*/i, '')
    .trim();
}

function displayType(slug, specs) {
  if (specs.analysis?.type) return specs.analysis.type;
  if (slug.startsWith('l-')) return 'listing';
  if (slug.startsWith('f-')) return 'figure';
  return 'table';
}

/**
 * Percentages: the pipeline emits `p` as a proportion in [0,1] with stat_label "%".
 * Prose scales explicitly via the binding's `scale` qualifier; this fallback
 * renderer applies the same convention, and leaves anything above 1 untouched so an
 * ARD that already stores 0-100 is not double-scaled.
 */
const asPercent = (v) => (typeof v === 'number' && v >= 0 && v <= 1 ? v * 100 : v);

/** A rendered table built directly from the ARD, used when no table.html exists. */
function tableFromArd(ard, { minPct = null } = {}) {
  const listingRows = ard.rows.filter(
    (r) => r.context === 'listing' || (r.row !== undefined && r.row !== null)
  );
  if (listingRows.length) return listingFromArd(listingRows);

  const groups = [];
  for (const r of ard.rows) {
    const g = r.group1_level ?? '(all)';
    if (!groups.includes(g)) groups.push(g);
  }
  const keyOf = (r) => `${r.analysis}||${r.variable ?? ''}||${r.variable_level ?? ''}`;
  const order = [];
  const buckets = new Map();
  for (const r of ard.rows) {
    const k = keyOf(r);
    if (!buckets.has(k)) {
      buckets.set(k, { analysis: r.analysis, variable: r.variable, level: r.variable_level, cells: new Map() });
      order.push(k);
    }
    const bucket = buckets.get(k);
    const g = r.group1_level ?? '(all)';
    if (!bucket.cells.has(g)) bucket.cells.set(g, new Map());
    bucket.cells.get(g).set(r.stat_name, r);
  }

  const outRows = [];
  for (const k of order) {
    const b = buckets.get(k);
    const statNames = new Set();
    for (const stats of b.cells.values()) for (const n of stats.keys()) statNames.add(n);
    const label = b.level ?? b.analysis;
    if (statNames.has('n') && !hasContinuousStats(statNames)) {
      const cells = groups.map((g) => {
        const stats = b.cells.get(g);
        if (!stats?.has('n')) return '';
        const n = formatValue(stats.get('n').stat);
        if (!stats.has('p')) return n;
        return `${n} (${formatValue(asPercent(stats.get('p').stat), 1)}%)`;
      });
      const maxPct = Math.max(
        ...groups
          .map((g) => Number(asPercent(b.cells.get(g)?.get('p')?.stat ?? NaN)))
          .filter(Number.isFinite),
        -Infinity
      );
      if (minPct !== null && Number.isFinite(maxPct) && maxPct < minPct) continue;
      outRows.push({ label, cells });
    } else {
      for (const statName of statNames) {
        const cells = groups.map((g) => {
          const row = b.cells.get(g)?.get(statName);
          if (!row) return '';
          const digits = ['mean', 'median'].includes(statName)
            ? 1
            : ['sd', 'se'].includes(statName)
              ? 2
              : null;
          return formatValue(row.stat, digits);
        });
        const first = [...b.cells.values()][0]?.get(statName);
        outRows.push({ label: `${label} — ${first?.stat_label ?? statName}`, cells, indent: true });
      }
    }
  }

  const head = `<tr><th scope="col">Statistic</th>${groups
    .map((g) => `<th scope="col">${escapeHtml(g)}</th>`)
    .join('')}</tr>`;
  const body = outRows
    .map(
      (r) =>
        `<tr><th scope="row"${r.indent ? ' class="indent"' : ''}>${escapeHtml(r.label)}</th>${r.cells
          .map((c) => `<td>${escapeHtml(c)}</td>`)
          .join('')}</tr>`
    )
    .join('\n');
  return { html: `<table class="display"><thead>${head}</thead><tbody>${body}</tbody></table>`, rowCount: outRows.length };
}

const CONTINUOUS_STATS = ['mean', 'sd', 'median', 'min', 'max', 'p25', 'p75', 'q1', 'q3', 'se'];
const hasContinuousStats = (names) => CONTINUOUS_STATS.some((s) => names.has(s));

/**
 * Listing rendering. The pipeline keys listing records with group1 = "record" and
 * group1_level = a zero-padded record id; column order follows first appearance,
 * which is the order declared in analysis.yaml `variables`.
 */
function listingFromArd(rows) {
  const columns = [];
  const records = new Map();
  for (const r of rows) {
    const key = r.group1_level ?? r.row;
    if (!columns.includes(r.variable)) columns.push(r.variable);
    if (!records.has(key)) records.set(key, {});
    records.get(key)[r.variable] = r.stat;
  }
  const head = `<tr>${columns.map((c) => `<th scope="col">${escapeHtml(c)}</th>`).join('')}</tr>`;
  const body = [...records.entries()]
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(
      ([, rec]) => `<tr>${columns.map((c) => `<td>${escapeHtml(rec[c] ?? '')}</td>`).join('')}</tr>`
    )
    .join('\n');
  return {
    html: `<table class="display listing"><thead>${head}</thead><tbody>${body}</tbody></table>`,
    rowCount: records.size,
  };
}

/** Prefer a pipeline-rendered table.html when the R side produced one. */
function prerenderedHtml(slug, variant) {
  const ardPath = currentArdPath(slug);
  if (!ardPath) return null;
  const dir = dirname(ardPath);
  const names =
    variant === 'in_text'
      ? ['table-in-text.html', 'table_in_text.html', 'in-text.html']
      : ['table.html', 'table-post-text.html'];
  for (const name of names) {
    const p = join(dir, name);
    if (existsSync(p)) {
      // Strip <script> — the assembled document must stay static and self-contained.
      return readFileSync(p, 'utf8').replace(/<script[\s\S]*?<\/script>/gi, '');
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export function assemble({ write = true } = {}) {
  const sectionModel = loadSections(PATHS.sections);
  const sectionErrors = validateSections(sectionModel);
  const assembly = loadAssembly(PATHS.assembly);
  const library = loadTextLibrary(PATHS.text);

  // --- displays referenced anywhere in this CSR -----------------------------
  const referenced = new Set();
  for (const slot of assembly.slots) slot.displays.forEach((s) => referenced.add(s));
  for (const entry of assembly.postText) entry.displays.forEach((s) => referenced.add(s));
  for (const block of library.values()) (block.displays ?? []).forEach((s) => referenced.add(s));

  const ards = new Map();
  const ardMeta = new Map();
  const missingArds = [];
  for (const slug of referenced) {
    const loaded = loadDisplayArd(slug);
    if (!loaded) {
      missingArds.push(slug);
      continue;
    }
    ards.set(slug, loaded.ard);
    ardMeta.set(slug, { source: loaded.source, path: loaded.path });
  }

  const { numbers, errors: numberingErrors } = assignDisplayNumbers(assembly, sectionModel);
  const assemblyErrors = validateAssembly(assembly, sectionModel, {
    textIds: [...library.keys()],
    displaySlugs: [...ards.keys()],
  });

  // --- display index (drives {{xref:display:…}} and the site) ---------------
  const displayIndex = new Map();
  for (const slug of referenced) {
    const specs = {
      display: loadDisplaySpec(PATHS.tfl, slug),
      analysis: loadAnalysisSpec(slug),
    };
    const assigned = numbers.get(slug) ?? null;
    const type = displayType(slug, specs);
    displayIndex.set(slug, {
      slug,
      type,
      label: DISPLAY_TYPE_LABELS[type] ?? 'Display',
      number: assigned?.number ?? null,
      section: assigned?.section ?? null,
      title: baseTitle(slug, specs),
      specs,
      ardSource: ardMeta.get(slug)?.source ?? null,
      ardPath: ardMeta.get(slug)?.path ?? null,
      variants: [],
    });
  }

  const context = { displayIndex, sectionIndex: sectionIndex(sectionModel) };
  const gates = runGates([...library.values()], ards, context);

  // --- place content into sections -----------------------------------------
  const slotBySection = new Map(assembly.slots.map((s) => [s.section, s]));
  const postTextBySection = new Map(assembly.postText.map((s) => [s.section, s]));

  const sections = sectionModel.sections
    .slice()
    .sort((a, b) => compareSectionNumbers(a.number, b.number))
    .map((section) => {
      const slot = slotBySection.get(section.number);
      const post = postTextBySection.get(section.number);
      const blocks = [];
      for (const id of slot?.text ?? []) {
        const block = library.get(id);
        if (!block) continue;
        const rendered = renderBlock(block, ards, context);
        const approval = checkApproval(block);
        const fidelity = checkNumericFidelity(rendered, block);
        blocks.push({
          id: block.id,
          title: block.title,
          tier: block.tier,
          version: block.version,
          file: relative(block.file),
          requirements: block.requirements,
          approval: block.approval,
          provenance: block.provenance,
          disclosure: block.disclosure,
          included: approval.included,
          exclusionReason: approval.reason,
          text: rendered.text,
          html: renderMarkdown(rendered.text),
          bindings: rendered.bindings.map(({ start, ...b }) => b),
          crossReferences: rendered.xrefs.map(({ start, ...x }) => x),
          numericFidelity: {
            ok: fidelity.ok,
            violations: fidelity.violations,
            exemptionsUsed: fidelity.exemptionsUsed,
          },
        });
      }

      const displays = (slot?.displays ?? []).map((slug) =>
        renderPlacedDisplay(slug, 'in_text', displayIndex, ards, ardMeta)
      );
      const postText = (post?.displays ?? []).map((slug) =>
        renderPlacedDisplay(slug, 'post_text', displayIndex, ards, ardMeta)
      );

      const provenance =
        section.number === assembly.provenanceSection
          ? buildProvenanceAppendix(displayIndex, ards, ardMeta)
          : null;

      return {
        number: section.number,
        title: section.title,
        slug: section.slug,
        level: section.level,
        parent: section.parent,
        content: section.content,
        note: section.note,
        populated: Boolean(blocks.length || displays.length || postText.length || provenance),
        blocks,
        displays,
        postText,
        provenance,
      };
    });

  const buildErrors = [
    ...sectionErrors.map((e) => `sections.yaml: ${e}`),
    ...numberingErrors.map((e) => `numbering: ${e}`),
    ...assemblyErrors.map((e) => `assembly.yaml: ${e}`),
    ...missingArds.map((s) => `no ARD (outputs or fixture) for display ${s}`),
  ];

  const doc = {
    schema: 'opencsr/csr/v1',
    generated: new Date().toISOString(),
    study: assembly.study,
    template: {
      id: sectionModel.model.id ?? 'ich-e3',
      title: sectionModel.model.title ?? null,
      version: sectionModel.model.version ?? null,
      source: sectionModel.model.source ?? null,
      sectionCount: sectionModel.sections.length,
    },
    ok: buildErrors.length === 0 && gates.ok,
    buildErrors,
    sections,
    displayIndex: [...displayIndex.values()].map((d) => ({
      slug: d.slug,
      type: d.type,
      label: d.label,
      number: d.number,
      section: d.section,
      title: d.title,
      variants: d.variants,
      ardSource: d.ardSource,
      ardPath: d.ardPath,
      ard: ards.has(d.slug)
        ? { created: ards.get(d.slug).created ?? null, provenance: ards.get(d.slug).provenance ?? null }
        : null,
    })),
    textBlocks: [...library.values()].map((b) => ({
      id: b.id,
      title: b.title,
      tier: b.tier,
      version: b.version,
      e3_section: b.e3_section,
      displays: b.displays,
      approval: b.approval,
      provenance: b.provenance,
      disclosure: b.disclosure,
      requirements: b.requirements,
      included: checkApproval(b).included,
      file: relative(b.file),
    })),
    provenanceAppendix: {
      section: assembly.provenanceSection,
      displays: buildProvenanceAppendix(displayIndex, ards, ardMeta).displays,
    },
    gates,
  };

  if (write) {
    mkdirSync(PATHS.out, { recursive: true });
    writeFileSync(join(PATHS.out, 'csr.json'), `${JSON.stringify(doc, null, 2)}\n`);
    writeFileSync(join(PATHS.out, 'csr.html'), renderDocumentHtml(doc));
  }
  return doc;
}

/** analysis.yaml is consulted only for `title` and `type` (contracts.md §2). */
function loadAnalysisSpec(slug) {
  const p = join(PATHS.tfl, slug, 'analysis.yaml');
  if (!existsSync(p)) return null;
  try {
    return yaml.load(readFileSync(p, 'utf8')) ?? null;
  } catch {
    return null;
  }
}

function renderPlacedDisplay(slug, variant, displayIndex, ards, ardMeta) {
  const entry = displayIndex.get(slug);
  const ard = ards.get(slug);
  if (!entry.variants.includes(variant)) entry.variants.push(variant);
  const minPct =
    variant === 'in_text' ? (entry.specs?.display?.variants?.in_text?.filter?.min_pct ?? null) : null;
  const pre = prerenderedHtml(slug, variant);
  const built = ard ? tableFromArd(ard, { minPct }) : { html: '<p class="missing">No ARD available.</p>', rowCount: 0 };
  return {
    slug,
    variant,
    type: entry.type,
    label: entry.label,
    number: entry.number,
    title: entry.title,
    caption:
      variant === 'post_text' && entry.number
        ? `${entry.label} ${entry.number}  ${entry.title}`
        : `${entry.title}`,
    html: pre ?? built.html,
    rendered: pre ? 'pipeline' : 'assembler',
    rowCount: built.rowCount,
    ardSource: ardMeta.get(slug)?.source ?? null,
    ardPath: ardMeta.get(slug)?.path ?? null,
    populationLabel: entry.specs?.display?.population_label ?? null,
    footnotes: entry.specs?.display?.footnotes ?? [],
    source: entry.specs?.display?.source ?? null,
  };
}

/** Section 16.1.9, generated from each ARD's provenance envelope (D5 / E3 §16.1.9). */
function buildProvenanceAppendix(displayIndex, ards, ardMeta) {
  const displays = [];
  for (const [slug, entry] of displayIndex) {
    const ard = ards.get(slug);
    if (!ard) continue;
    const p = ard.provenance ?? {};
    displays.push({
      slug,
      number: entry.number,
      title: entry.title,
      created: ard.created ?? null,
      specHash: p.spec_hash ?? null,
      displayHash: p.display_hash ?? null,
      data: p.data ?? [],
      environment: p.environment ?? null,
      gitCommit: p.git_commit ?? null,
      source: ardMeta.get(slug)?.source ?? null,
      ardPath: ardMeta.get(slug)?.path ?? null,
      fixture: Boolean(p.fixture),
    });
  }
  displays.sort((a, b) => String(a.number ?? 'zz').localeCompare(String(b.number ?? 'zz')));
  return { displays };
}

// ---------------------------------------------------------------------------
// HTML rendering — self-contained, no external requests
// ---------------------------------------------------------------------------

function renderDocumentHtml(doc) {
  const study = doc.study ?? {};
  const toc = doc.sections
    .map(
      (s) =>
        `<li class="lvl-${s.level}${s.populated ? '' : ' empty'}"><a href="#s-${s.slug}"><span class="num">${escapeHtml(
          s.number
        )}</span> ${escapeHtml(s.title)}</a></li>`
    )
    .join('\n');

  const body = doc.sections.map((s) => renderSectionHtml(s, doc)).join('\n');

  const gateRows = doc.gates.blocks
    .map(
      (b) =>
        `<tr><td><code>${escapeHtml(b.id)}</code></td><td>${escapeHtml(b.e3_section ?? '')}</td><td>${escapeHtml(
          b.tier
        )}</td><td>${escapeHtml(b.approval?.state ?? '')}</td><td>${b.bindings}</td><td>${
          b.unresolvedBindings === 0 ? '<span class="ok">pass</span>' : `<span class="fail">${b.unresolvedBindings} unresolved</span>`
        }</td><td>${
          b.numericFidelity ? '<span class="ok">pass</span>' : `<span class="fail">${b.violations.length} violation(s)</span>`
        }</td><td>${b.included ? '<span class="ok">included</span>' : '<span class="warn">excluded</span>'}</td></tr>`
    )
    .join('\n');

  const buildErrors = doc.buildErrors.length
    ? `<div class="banner fail"><strong>Build errors</strong><ul>${doc.buildErrors
        .map((e) => `<li>${escapeHtml(e)}</li>`)
        .join('')}</ul></div>`
    : '';

  const fixtureUsed = doc.displayIndex.some((d) => d.ardSource === 'fixture');
  const fixtureBanner = fixtureUsed
    ? `<div class="banner warn"><strong>Fixture data.</strong> One or more displays resolved against synthetic fixture ARDs under <code>tests/fixtures/ard/</code> because no pipeline output was present. Values are plausible for CDISCPILOT01 but are not a pipeline run. Every affected display is marked in ${escapeHtml(
        doc.provenanceAppendix.section
      )}.</div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(study.id ?? 'CSR')} — Clinical Study Report</title>
<style>${CSS}</style>
</head>
<body>
<header class="cover">
  <p class="eyebrow">Clinical Study Report · ICH E3</p>
  <h1>${escapeHtml(study.title ?? 'Clinical Study Report')}</h1>
  <dl class="meta">
    <div><dt>Study</dt><dd>${escapeHtml(study.id ?? '')}</dd></div>
    <div><dt>Phase</dt><dd>${escapeHtml(study.phase ?? '')}</dd></div>
    <div><dt>Indication</dt><dd>${escapeHtml(study.indication ?? '')}</dd></div>
    <div><dt>Investigational product</dt><dd>${escapeHtml(study.product ?? '')}</dd></div>
    <div><dt>Design</dt><dd>${escapeHtml(study.design ?? '')}</dd></div>
    <div><dt>Data cut-off</dt><dd>${escapeHtml(study.cutoff ?? '')}</dd></div>
    <div><dt>Analysis set</dt><dd>${escapeHtml(study.primary_analysis_set ?? '')}</dd></div>
    <div><dt>Data source</dt><dd>${escapeHtml(study.data_source ?? '')}</dd></div>
  </dl>
  <p class="assembled">Assembled ${escapeHtml(doc.generated)} from
  <code>${escapeHtml(doc.template.id)}</code> v${escapeHtml(String(doc.template.version ?? ''))}
  (${doc.template.sectionCount} sections) by <code>scripts/assemble.mjs</code>.</p>
  ${study.scope_note ? `<p class="scope">${escapeHtml(study.scope_note)}</p>` : ''}
  ${buildErrors}
  ${fixtureBanner}
</header>

<nav class="toc" aria-label="Table of contents">
  <h2>3 &nbsp;Table of Contents</h2>
  <ol>${toc}</ol>
</nav>

<main>${body}</main>

<section class="gates" id="gates">
  <h2>Build gates</h2>
  <p>Every text block passes through three gates before it may appear in the assembled
  report: <strong>binding resolution</strong> (each
  <code>&#123;&#123;ard:&hellip;&#125;&#125;</code> reference resolves to exactly one
  ARD row), <strong>numeric fidelity</strong> (no digit in rendered prose that did not come from a
  binding or a declared exemption), and <strong>approval</strong> (generated-tier prose is excluded
  until a human approves it).</p>
  <table class="gate-table">
    <thead><tr><th>Block</th><th>E3 §</th><th>Tier</th><th>Approval</th><th>Bindings</th><th>Resolution</th><th>Numeric fidelity</th><th>Assembly</th></tr></thead>
    <tbody>${gateRows}</tbody>
  </table>
</section>

<footer>
  <p>Generated by open.csr — every number in this document resolves to a row in a committed
  analysis results dataset. Prose is drafted against ARDs, never against rendered tables.</p>
</footer>
</body>
</html>
`;
}

function renderSectionHtml(section, doc) {
  const h = Math.min(section.level + 1, 6);
  const parts = [];
  parts.push(
    `<section class="section lvl-${section.level}" id="s-${escapeHtml(section.slug)}">
<h${h}><span class="num">${escapeHtml(section.number)}</span> ${escapeHtml(section.title)}</h${h}>`
  );

  if (section.number === '3') {
    parts.push('<p class="generated-note">Generated by the assembler — see the contents list above.</p>');
  }

  for (const block of section.blocks) {
    const tier = `<span class="tier tier-${escapeHtml(block.tier)}">${escapeHtml(block.tier)}</span>`;
    const approval = `<span class="approval approval-${escapeHtml(
      block.approval?.state ?? 'draft'
    )}">${escapeHtml(block.approval?.state ?? 'draft')}</span>`;
    const meta = `<p class="block-meta"><code>${escapeHtml(block.id)}</code> ${tier} ${approval} · ${
      block.bindings.length
    } bound value${block.bindings.length === 1 ? '' : 's'}</p>`;
    if (block.included) {
      parts.push(`<div class="block">${meta}${block.html}</div>`);
    } else {
      parts.push(
        `<div class="block excluded"><p class="excluded-note"><strong>Excluded from the assembled report.</strong> ${escapeHtml(
          block.exclusionReason ?? ''
        )} The draft is shown for review; it is not part of the report until approved.</p>${meta}${block.html}</div>`
      );
    }
  }

  for (const d of section.displays) parts.push(renderDisplayHtml(d, 'In-text display'));
  for (const d of section.postText) parts.push(renderDisplayHtml(d, 'Post-text display'));

  if (section.provenance) parts.push(renderProvenanceHtml(section.provenance, doc));

  if (!section.populated) {
    parts.push(
      `<p class="unpopulated">Not populated in this demonstration.${
        section.note ? ` <span class="e3-note">${escapeHtml(section.note)}</span>` : ''
      }</p>`
    );
  } else if (section.note) {
    parts.push(`<p class="e3-note">${escapeHtml(section.note)}</p>`);
  }

  parts.push('</section>');
  return parts.join('\n');
}

function renderDisplayHtml(d, kindLabel) {
  const number = d.number ? `${d.label} ${d.number}` : d.label;
  const footnotes = (d.footnotes ?? []).map((f) => `<li>${escapeHtml(f)}</li>`).join('');
  return `<figure class="display-block" id="d-${escapeHtml(d.slug)}-${escapeHtml(d.variant)}">
  <figcaption>
    <span class="kind">${escapeHtml(kindLabel)}</span>
    <strong>${escapeHtml(number)}</strong> ${escapeHtml(d.title)}
    <span class="slug">slug <code>${escapeHtml(d.slug)}</code> · variant <code>${escapeHtml(
      d.variant
    )}</code> · ARD <code>${escapeHtml(d.ardPath ?? 'none')}</code>${
      d.ardSource === 'fixture' ? ' <em>(fixture)</em>' : ''
    }</span>
  </figcaption>
  <div class="table-wrap">${d.html}</div>
  ${footnotes ? `<ul class="footnotes">${footnotes}</ul>` : ''}
  ${d.source ? `<p class="source">${escapeHtml(d.source)}</p>` : ''}
</figure>`;
}

function renderProvenanceHtml(prov, doc) {
  const rows = prov.displays
    .map(
      (p) => `<tr>
  <td><code>${escapeHtml(p.slug)}</code><br><span class="muted">${escapeHtml(p.number ?? '—')}</span></td>
  <td>${escapeHtml(p.title)}</td>
  <td><code>${escapeHtml(p.specHash ?? '—')}</code><br><code>${escapeHtml(p.displayHash ?? '—')}</code></td>
  <td>${(p.data ?? [])
    .map(
      (d) =>
        `${escapeHtml(d.dataset)} (n=${escapeHtml(d.n_row)}, ${escapeHtml(d.source_pkg ?? '')} ${escapeHtml(
          d.source_version ?? ''
        )})<br><code>${escapeHtml(d.hash)}</code>`
    )
    .join('<br>')}</td>
  <td>${p.environment ? `R ${escapeHtml(p.environment.r ?? '')}<br>${Object.entries(p.environment.packages ?? {})
    .map(([k, v]) => `${escapeHtml(k)} ${escapeHtml(v)}`)
    .join('<br>')}` : '—'}</td>
  <td><code>${escapeHtml(p.gitCommit ?? 'uncommitted')}</code><br><span class="muted">${escapeHtml(
    p.created ?? ''
  )}</span>${p.fixture ? '<br><em>fixture</em>' : ''}</td>
</tr>`
    )
    .join('\n');
  return `<div class="provenance">
<p>This appendix is generated mechanically at assembly time from the provenance envelope of
every analysis results dataset used in this report. ICH E3 reserved this slot for the
documentation of statistical methods in 1995; open.csr fills it with the specification
hashes, input dataset hashes, software environment and source commit that produced each
number in the document.</p>
<div class="table-wrap"><table class="display provenance-table">
<thead><tr><th>Display</th><th>Title</th><th>Spec / display hash</th><th>Input data</th><th>Environment</th><th>Commit</th></tr></thead>
<tbody>${rows}</tbody>
</table></div>
<p class="muted">Template: <code>${escapeHtml(doc.template.id)}</code> v${escapeHtml(
    String(doc.template.version ?? '')
  )} — ${escapeHtml(doc.template.source ?? '')}</p>
</div>`;
}

const CSS = `
:root{--ink:#12161c;--muted:#5c6672;--rule:#dde3ea;--bg:#fdfdfc;--accent:#1c4f7c;--warn:#8a5a00;--warnbg:#fff6e0;--fail:#8f1d1d;--failbg:#fdeceb;--ok:#1d6a3a;--panel:#f5f7f9;}
@media (prefers-color-scheme: dark){:root{--ink:#e8ecf1;--muted:#9aa5b1;--rule:#2b3440;--bg:#11151a;--accent:#8fc0ec;--warn:#e5b95d;--warnbg:#2e2412;--fail:#f0a5a0;--failbg:#33191a;--ok:#7fd3a0;--panel:#181e25;}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 "Iowan Old Style",Georgia,"Times New Roman",serif;}
main,header,nav,section.gates,footer{max-width:52rem;margin:0 auto;padding:0 1.5rem;}
header.cover{padding-top:3rem;padding-bottom:2rem;border-bottom:2px solid var(--rule);}
.eyebrow{font:600 .75rem/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);margin:0 0 .75rem;}
h1{font-size:1.9rem;line-height:1.25;margin:0 0 1.25rem;}
dl.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:.4rem 1.5rem;margin:0 0 1.25rem;font:14px/1.5 ui-sans-serif,system-ui,sans-serif;}
dl.meta div{display:flex;gap:.5rem;border-bottom:1px solid var(--rule);padding:.35rem 0;}
dl.meta dt{color:var(--muted);min-width:9.5rem;}
dl.meta dd{margin:0;}
.assembled,.scope{font:13px/1.6 ui-sans-serif,system-ui,sans-serif;color:var(--muted);}
.banner{border-radius:6px;padding:.75rem 1rem;margin:1rem 0;font:14px/1.55 ui-sans-serif,system-ui,sans-serif;}
.banner.warn{background:var(--warnbg);color:var(--warn);border:1px solid currentColor;}
.banner.fail{background:var(--failbg);color:var(--fail);border:1px solid currentColor;}
nav.toc{padding-top:2rem;padding-bottom:1rem;}
nav.toc h2{font:600 1.1rem/1.3 ui-sans-serif,system-ui,sans-serif;}
nav.toc ol{list-style:none;padding:0;margin:0;font:14px/1.5 ui-sans-serif,system-ui,sans-serif;column-width:19rem;column-gap:2rem;}
nav.toc li{break-inside:avoid;padding:.1rem 0;}
nav.toc li.empty a{color:var(--muted);}
nav.toc a{color:inherit;text-decoration:none;}
nav.toc a:hover{text-decoration:underline;}
nav.toc .num{display:inline-block;min-width:3.4rem;color:var(--muted);font-variant-numeric:tabular-nums;}
.lvl-2{padding-left:1rem}.lvl-3{padding-left:2rem}.lvl-4{padding-left:3rem}
section.section{padding:1.25rem 0;border-top:1px solid var(--rule);}
section.section h2,section.section h3,section.section h4,section.section h5,section.section h6{font-family:ui-sans-serif,system-ui,sans-serif;line-height:1.3;margin:0 0 .6rem;}
section.section h2{font-size:1.4rem}section.section h3{font-size:1.15rem}section.section h4{font-size:1rem}section.section h5,section.section h6{font-size:.95rem}
.num{color:var(--muted);font-variant-numeric:tabular-nums;margin-right:.5rem;}
.block p{margin:0 0 1rem;}
.block-meta{font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);margin:0 0 .5rem;}
.tier,.approval{display:inline-block;border-radius:3px;padding:.05rem .35rem;font:11px/1.5 ui-sans-serif,system-ui,sans-serif;border:1px solid var(--rule);}
.tier-generated{color:var(--accent);border-color:currentColor;}
.approval-draft{color:var(--warn);border-color:currentColor;}
.approval-approved{color:var(--ok);border-color:currentColor;}
.block.excluded{background:var(--warnbg);border-left:3px solid var(--warn);padding:1rem 1rem .25rem;border-radius:0 4px 4px 0;}
.excluded-note{font:13px/1.55 ui-sans-serif,system-ui,sans-serif;color:var(--warn);margin:0 0 .5rem;}
.unpopulated{font:13px/1.55 ui-sans-serif,system-ui,sans-serif;color:var(--muted);font-style:italic;margin:0;}
.e3-note{font:13px/1.55 ui-sans-serif,system-ui,sans-serif;color:var(--muted);}
.generated-note{font:13px/1.55 ui-sans-serif,system-ui,sans-serif;color:var(--muted);}
figure.display-block{margin:1.5rem 0;padding:1rem;background:var(--panel);border:1px solid var(--rule);border-radius:6px;}
figcaption{font:13px/1.5 ui-sans-serif,system-ui,sans-serif;margin-bottom:.75rem;}
figcaption .kind{display:inline-block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin-right:.5rem;}
figcaption .slug{display:block;color:var(--muted);font-size:11.5px;margin-top:.3rem;}
.table-wrap{overflow-x:auto;}
table.display{border-collapse:collapse;width:100%;font:13px/1.45 ui-sans-serif,system-ui,sans-serif;}
table.display th,table.display td{border-bottom:1px solid var(--rule);padding:.35rem .6rem;text-align:right;vertical-align:top;}
table.display th[scope=row]{text-align:left;font-weight:500;}
table.display th[scope=row].indent{padding-left:1.6rem;font-weight:400;color:var(--muted);}
table.display thead th{border-bottom:1.5px solid var(--ink);font-weight:600;}
ul.footnotes{font:12px/1.5 ui-sans-serif,system-ui,sans-serif;color:var(--muted);margin:.6rem 0 0;padding-left:1.1rem;}
.source{font:12px/1.5 ui-sans-serif,system-ui,sans-serif;color:var(--muted);margin:.4rem 0 0;}
.provenance p{font:13px/1.6 ui-sans-serif,system-ui,sans-serif;}
table.provenance-table{font-size:11.5px;}
table.provenance-table td{text-align:left;}
table.provenance-table code{font-size:10.5px;word-break:break-all;}
.muted{color:var(--muted);}
section.gates{padding:2rem 1.5rem;border-top:2px solid var(--rule);}
section.gates h2{font:600 1.3rem/1.3 ui-sans-serif,system-ui,sans-serif;}
section.gates p{font:14px/1.6 ui-sans-serif,system-ui,sans-serif;}
table.gate-table{border-collapse:collapse;width:100%;font:12.5px/1.5 ui-sans-serif,system-ui,sans-serif;}
table.gate-table th,table.gate-table td{border-bottom:1px solid var(--rule);padding:.35rem .5rem;text-align:left;}
.ok{color:var(--ok);font-weight:600;}
.fail{color:var(--fail);font-weight:600;}
.warn{color:var(--warn);font-weight:600;}
footer{padding:2rem 1.5rem 3rem;color:var(--muted);font:13px/1.6 ui-sans-serif,system-ui,sans-serif;border-top:1px solid var(--rule);}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em;}
`;

// Entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const doc = assemble({ write: true });
  const { gates } = doc;
  const line = (label, ok, detail) =>
    console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`open.csr assembler — ${doc.study.id ?? 'CSR'}`);
  console.log(`  ${doc.sections.length} sections, ${doc.sections.filter((s) => s.populated).length} populated`);
  console.log(`  ${doc.displayIndex.length} displays, ${doc.textBlocks.length} text blocks`);
  line('structure', gates.structure.ok, gates.structure.errors.join('; '));
  line('binding resolution', gates.bindingResolution.ok, gates.bindingResolution.errors.join('; '));
  line(
    'numeric fidelity',
    gates.numericFidelity.ok,
    gates.numericFidelity.violations.map((v) => `${v.block}:"${v.value}"`).join('; ')
  );
  line('cross-references', gates.crossReferences.ok, gates.crossReferences.errors.join('; '));
  line(
    'approval',
    true,
    gates.approval.excluded.length ? `${gates.approval.excluded.length} draft block(s) excluded` : 'all blocks included'
  );
  if (doc.buildErrors.length) for (const e of doc.buildErrors) console.log(`  ! ${e}`);
  for (const w of gates.warnings) console.log(`  ~ ${w}`);
  console.log(`  wrote docs/assembled/csr.json and docs/assembled/csr.html`);
  process.exit(doc.ok ? 0 : 1);
}
