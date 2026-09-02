// The Metadata section: what was declared (open.csr #77, R2 of the sidebar refactor).
//
// Six pages, all read from files that already exist and none of them typed:
//   study         library/study.yaml — arms, group variables, analysis sets, cut-off
//   models        the template objects under library/templates/ and the documents built from each
//   specs         every display's two specifications with their iteration history, and the value declarations
//   approvals     every text block's tier, version, approval and generation provenance
//   environments  every distinct R environment any iteration was built in, with the iterations built in it
//   requirements  the requirement matrices and the evidence pages that carry them
//
// The pane is one page with an id per section, the Data and Values arrangement,
// so the explorer's item and a link from any artifact land by `focus`.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { loadStudyModel } from './study-lib.mjs';
import { chip, empty, escapeHtml, listTemplateObjects } from './site-lib.mjs';

function readText(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

function readYaml(file) {
  const text = readText(file);
  if (text === null) return null;
  try {
    return yaml.load(text);
  } catch {
    return null;
  }
}

function shortHash(value) {
  return String(value || '')
    .replace(/^sha256:/, '')
    .slice(0, 7);
}

function mono(value) {
  return `<span class="mono">${escapeHtml(String(value))}</span>`;
}

function facts(rows) {
  const body = rows
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`)
    .join('');
  return `<dl class="facts wide">${body}</dl>`;
}

function stat(value, label, sub = '') {
  return (
    `<div class="stat"><span class="stat-value">${escapeHtml(String(value))}</span>` +
    `<span class="stat-label">${escapeHtml(label)}</span>` +
    (sub ? `<span class="stat-sub">${escapeHtml(sub)}</span>` : '') +
    `</div>`
  );
}

function repoFile(config, file) {
  if (!config?.repoUrl || !file) return null;
  return `${String(config.repoUrl).replace(/\/$/, '')}/blob/${config.sourceBranch || 'main'}/${file}`;
}

/** `custom_from: <slug>` in an analysis.yaml, or null. */
export function customFromOf(analysisText) {
  const match = String(analysisText || '').match(/^custom_from:\s*([A-Za-z0-9_-]+)/m);
  return match ? match[1] : null;
}

/** One iteration's record in the vocabulary the pages use, from either manifest shape. */
function iterationRecord(version) {
  const m = version.manifest || {};
  return {
    version: version.version,
    created: m.created || m.date || null,
    actor: m.actor || null,
    request: m.change_request || m.request || null,
    spec_hash: m.spec_hash || m.specHash || null,
    display_hash: m.display_hash || m.displayHash || null,
    ard_hash: m.ard_hash || m.ardHash || version.ardHash || null,
    git_commit: m.git_commit || m.commit || null,
    environment: m.environment || version.ard?.provenance?.environment || null
  };
}

function environmentKey(env) {
  if (!env || typeof env !== 'object') return null;
  const packages = Object.entries(env.packages || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, v]) => `${name} ${v}`)
    .join(', ');
  return `R ${env.r || '?'} · ${env.os || '?'} · ${packages}`;
}

/**
 * Read everything the section shows. `displays`, `textBlocks` and `documents`
 * are the site's loaded objects (site-lib), so the pages agree with the rest
 * of the site by construction rather than by a second reading of the tree.
 */
export function loadMetadata(rootDir, { config = {}, displays = [], textBlocks = [], documents = [] } = {}) {
  const warnings = [];

  // --- study -----------------------------------------------------------------
  let study = null;
  const studyFile = 'library/study.yaml';
  if (existsSync(path.join(rootDir, studyFile))) {
    try {
      study = loadStudyModel(rootDir);
    } catch (error) {
      warnings.push(`${studyFile}: ${error.message}`);
    }
  } else {
    warnings.push(`${studyFile} is absent — the Metadata section has no study model.`);
  }

  // --- document models ----------------------------------------------------------
  const models = listTemplateObjects(rootDir).map((id) => {
    const dir = path.join(rootDir, 'library', 'templates', id);
    const sections = readYaml(path.join(dir, 'sections.yaml'));
    const assembly = readYaml(path.join(dir, 'assembly.yaml'));
    const meta = sections?.model || {};
    return {
      id,
      dir: `library/templates/${id}`,
      title: meta.title || id,
      version: meta.version || null,
      source: meta.source || null,
      reference: meta.reference || null,
      sections: Array.isArray(sections?.sections) ? sections.sections.length : 0,
      slots: Array.isArray(assembly?.slots) ? assembly.slots.length : 0,
      postText: Array.isArray(assembly?.post_text) ? assembly.post_text.length : 0,
      documents: documents
        .filter((doc) => doc.templateId === id)
        .map((doc) => ({ id: doc.id, title: doc.title, status: doc.status, readerPath: doc.readerPath || null }))
    };
  });

  // --- specifications --------------------------------------------------------------
  const specs = displays.map((display) => {
    const outputs = display.outputs || {};
    const analysisText = outputs.specs?.analysis?.text || '';
    const customFrom = customFromOf(analysisText);
    const iterations = (outputs.versions || []).map(iterationRecord);
    const current = outputs.current ? iterationRecord(outputs.current) : null;
    return {
      slug: display.slug,
      title: display.title,
      regulatoryId: display.regulatoryId || null,
      type: display.type || null,
      e3Section: display.e3Section || null,
      status: display.status,
      analysisFile: outputs.specs?.analysis?.file || null,
      displayFile: outputs.specs?.display?.file || null,
      customFile: outputs.specs?.custom?.file || null,
      customFrom,
      sharedWith: [],
      current,
      iterations
    };
  });
  for (const spec of specs) {
    if (spec.customFrom) {
      const owner = specs.find((entry) => entry.slug === spec.customFrom);
      if (owner) owner.sharedWith.push(spec.slug);
    }
  }

  // --- value declarations --------------------------------------------------------
  const valuesFile = 'library/values/values.yaml';
  const valuesYaml = readYaml(path.join(rootDir, valuesFile));
  const values = Array.isArray(valuesYaml?.values)
    ? valuesYaml.values.map((entry) => ({
        id: entry.id,
        label: entry.label || entry.id,
        kind: entry.derived ? 'derived' : 'source',
        source: entry.source || null,
        derived: entry.derived ? `${entry.derived.op}(${(entry.derived.inputs || []).join(', ')})` : null,
        format: entry.format ? Object.entries(entry.format).map(([k, v]) => `${k} ${v}`).join(', ') : null,
        notes: entry.notes || null
      }))
    : [];

  // --- approvals -----------------------------------------------------------------
  const approvals = textBlocks
    .filter((block) => block.exists !== false)
    .map((block) => ({
      id: block.id,
      title: block.title || block.id,
      e3Section: block.e3Section || null,
      tier: block.tier || 'boilerplate',
      version: block.version ?? null,
      state: block.approval?.state || 'draft',
      by: block.approval?.by || null,
      at: block.approval?.at || null,
      model: block.provenance?.model || null,
      requirements: block.requirements || [],
      displays: block.displays || [],
      file: block.file || null
    }));

  // --- environments ---------------------------------------------------------------
  const envMap = new Map();
  for (const spec of specs) {
    for (const iteration of spec.iterations) {
      const key = environmentKey(iteration.environment);
      if (!key) continue;
      if (!envMap.has(key)) {
        envMap.set(key, {
          key,
          r: iteration.environment.r || null,
          os: iteration.environment.os || null,
          packages: iteration.environment.packages || {},
          iterations: []
        });
      }
      envMap.get(key).iterations.push({ slug: spec.slug, version: iteration.version, created: iteration.created });
    }
  }
  const environments = [...envMap.values()].sort((a, b) => {
    const fa = a.iterations.map((i) => i.created || '').sort()[0] || '';
    const fb = b.iterations.map((i) => i.created || '').sort()[0] || '';
    return fa.localeCompare(fb);
  });

  // --- requirements --------------------------------------------------------------
  const matrixDir = path.join(rootDir, 'quality', 'requirements');
  const matrices = existsSync(matrixDir)
    ? readdirSync(matrixDir)
        .filter((file) => file.endsWith('.md'))
        .sort()
        .map((file) => {
          const component = (config.components || []).find((entry) => entry.matrix === file);
          return {
            file,
            title: component?.title || file.replace(/\.md$/, ''),
            module: component?.module || null,
            rows: (readText(path.join(matrixDir, file)) || '').split('\n').filter((line) => /^\| [A-Z]{2,4}-[A-Z]+-\d+/.test(line)).length,
            href: config.matrixBaseUrl ? `${String(config.matrixBaseUrl).replace(/\/$/, '')}/${file}` : null
          };
        })
    : [];

  return { studyFile, study, models, specs, values, valuesFile, approvals, environments, matrices, warnings };
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export const METADATA_PAGES = [
  { id: 'study', label: 'Study', blurb: 'What the study is, declared once' },
  { id: 'models', label: 'Document models', blurb: 'What a document of each kind is' },
  { id: 'specs', label: 'Specifications', blurb: 'Every display and value, as declared, with history' },
  { id: 'approvals', label: 'Approvals', blurb: 'Every text block’s tier, version and sign-off' },
  { id: 'environments', label: 'Environments', blurb: 'The R environments every iteration was built in' },
  { id: 'requirements', label: 'Requirements', blurb: 'The matrices and their evidence' }
];

/** The study model's `source`: a string, or `{default, default_label, alternates}`. */
function sourceLabel(source) {
  if (!source) return null;
  if (typeof source === 'string') return escapeHtml(source);
  const parts = [];
  if (source.default_label || source.default) {
    parts.push(`${escapeHtml(source.default_label || source.default)}${source.default_label && source.default ? ` <span class="sub mono">${escapeHtml(source.default)}</span>` : ''}`);
  }
  if (Array.isArray(source.alternates) && source.alternates.length) {
    parts.push(`<span class="sub">alternate${source.alternates.length === 1 ? '' : 's'}: ${source.alternates.map((a) => escapeHtml(String(a))).join(', ')}</span>`);
  }
  return parts.join('<br>') || escapeHtml(JSON.stringify(source));
}

function studySection(meta, config, root) {
  const model = meta.study;
  const head = `<h3 id="study">Study</h3>`;
  if (!model) {
    return `<section class="app-block" id="section-study">${head}${empty(`No study model: ${meta.studyFile} is absent or invalid.`)}</section>`;
  }
  const labels = (model.arms || []).map((arm) => arm.label);
  const arms =
    `<h4>Arms, in print order</h4><div class="scroll"><table class="data"><thead><tr><th>Id</th><th>Label</th></tr></thead><tbody>` +
    (model.arms || []).map((arm) => `<tr><td class="mono">${escapeHtml(arm.id || '')}</td><td>${escapeHtml(arm.label || '')}</td></tr>`).join('') +
    `</tbody></table></div>`;
  const groupVars = model.group_variables && typeof model.group_variables === 'object'
    ? `<h4>Columns that carry an arm label</h4><dl class="facts">` +
      Object.entries(model.group_variables)
        .map(([column, assignment]) => `<div><dt class="mono">${escapeHtml(column)}</dt><dd>${escapeHtml(String(assignment))}</dd></div>`)
        .join('') +
      `</dl>`
    : '';
  const sets =
    `<h4>Analysis sets</h4>` +
    `<p class="sub">The subjects each set holds per arm are data, measured from the package and ` +
    `re-measured by <span class="mono">test-study-model.R</span> on every run; the assembler's ` +
    `treatment-consistency gate holds every placed display to them.</p>` +
    `<div class="scroll"><table class="data"><thead><tr><th>Set</th><th>Label</th><th>Flag</th>` +
    labels.map((label) => `<th>${escapeHtml(label)}</th>`).join('') +
    `<th>Total</th></tr></thead><tbody>` +
    Object.entries(model.analysis_sets || {})
      .map(([name, set]) => {
        const counts = labels.map((label) => set.subjects?.[label] ?? null);
        const total = counts.reduce((sum, n) => sum + (Number(n) || 0), 0);
        return (
          `<tr><td class="mono">${escapeHtml(name)}</td><td>${escapeHtml(set.label || '')}</td>` +
          `<td class="mono">${escapeHtml(set.flag == null ? '—' : String(set.flag))}</td>` +
          counts.map((n) => `<td class="num">${escapeHtml(n == null ? '—' : String(n))}</td>`).join('') +
          `<td class="num">${escapeHtml(String(total))}</td></tr>`
        );
      })
      .join('') +
    `</tbody></table></div>`;
  return (
    `<section class="app-block" id="section-study">` +
    head +
    `<p class="sub">${mono(meta.studyFile)} declares what the study is; everything that names an arm, an analysis set or the cut-off reads it.</p>` +
    facts([
      ['Id', mono(model.id)],
      ['Title', model.title ? escapeHtml(String(model.title).trim()) : null],
      ['Phase', model.phase ? escapeHtml(model.phase) : null],
      ['Cut-off', model.cutoff ? mono(model.cutoff) : null],
      ['Source', sourceLabel(model.source)],
      ['Data', `<a href="${escapeHtml(root)}data/index.html">every dataset the package carries</a>`],
      ['Reference report', model.reference?.profile ? `${escapeHtml(model.reference.profile)}${model.reference.report ? ` · ${mono(model.reference.report)}` : ''}` : null],
      ['File', repoFile(config, meta.studyFile) ? `<a class="mono" href="${escapeHtml(repoFile(config, meta.studyFile))}">${escapeHtml(meta.studyFile)}</a>` : mono(meta.studyFile)]
    ]) +
    arms +
    groupVars +
    sets +
    `</section>`
  );
}

function modelsSection(meta, config, root) {
  const head = `<h3 id="models">Document models</h3>`;
  if (!meta.models.length) {
    return `<section class="app-block" id="section-models">${head}${empty('No template objects under library/templates/ yet.')}</section>`;
  }
  const rows = meta.models
    .map(
      (model) =>
        `<tr><td class="mono">${escapeHtml(model.id)}</td><td>${escapeHtml(model.title)}` +
        (model.version ? ` <span class="sub mono">v${escapeHtml(model.version)}</span>` : '') +
        (model.source ? `<br><span class="sub">${escapeHtml(model.source)}</span>` : '') +
        `</td><td class="num">${escapeHtml(String(model.sections))}</td>` +
        `<td class="num">${escapeHtml(String(model.slots))} / ${escapeHtml(String(model.postText))}</td>` +
        `<td>${
          model.documents.length
            ? model.documents
                .map((doc) =>
                  doc.readerPath && doc.status === 'built'
                    ? `<a href="${escapeHtml(root)}${escapeHtml(doc.readerPath)}">${escapeHtml(doc.title)}</a>`
                    : `${escapeHtml(doc.title)} <span class="sub">${escapeHtml(doc.status)}</span>`
                )
                .join('<br>')
            : `<span class="muted">none</span>`
        }</td>` +
        `<td><a class="mono" href="${escapeHtml(root)}templates/index.html">open</a></td></tr>`
    )
    .join('');
  return (
    `<section class="app-block" id="section-models">` +
    head +
    `<p class="sub">A template object says what a kind of document IS (<span class="mono">sections.yaml</span>) and ` +
    `what this study puts in each section (<span class="mono">assembly.yaml</span>). Display numbers are derived from ` +
    `assembly order at build time, never written. The <a href="${escapeHtml(root)}templates/index.html">Templates view</a> ` +
    `walks every section of a model; this table is the index of the models.</p>` +
    `<div class="scroll"><table class="data"><thead><tr><th>Id</th><th>Model</th><th>Sections</th>` +
    `<th>Slots / post-text</th><th>Documents assembled from it</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` +
    `</section>`
  );
}

function specsSection(meta, config, root) {
  const head = `<h3 id="specs">Specifications</h3>`;
  const displays = meta.specs
    .map((spec) => {
      const files = [
        spec.analysisFile ? [`analysis`, spec.analysisFile] : null,
        spec.displayFile ? [`display`, spec.displayFile] : null,
        spec.customFile ? [`custom`, spec.customFile] : null
      ].filter(Boolean);
      const shared =
        spec.customFrom
          ? `borrows <a class="mono" href="#spec-${escapeHtml(spec.customFrom)}">${escapeHtml(spec.customFrom)}</a>'s custom code`
          : spec.sharedWith.length
            ? `custom code shared with ${spec.sharedWith.map((slug) => `<a class="mono" href="#spec-${escapeHtml(slug)}">${escapeHtml(slug)}</a>`).join(', ')}`
            : null;
      const iterations = spec.iterations.length
        ? `<div class="scroll"><table class="data"><thead><tr><th>Iteration</th><th>Created</th><th>Actor</th>` +
          `<th>Change request</th><th>Spec</th><th>Display</th><th>ARD</th></tr></thead><tbody>` +
          spec.iterations
            .map(
              (it) =>
                `<tr><td class="mono">${escapeHtml(it.version)}</td><td class="mono">${escapeHtml(it.created || '—')}</td>` +
                `<td>${escapeHtml(it.actor || '—')}</td><td>${escapeHtml(it.request || '—')}</td>` +
                `<td class="mono" title="${escapeHtml(it.spec_hash || '')}">${escapeHtml(shortHash(it.spec_hash) || '—')}</td>` +
                `<td class="mono" title="${escapeHtml(it.display_hash || '')}">${escapeHtml(shortHash(it.display_hash) || '—')}</td>` +
                `<td class="mono" title="${escapeHtml(it.ard_hash || '')}">${escapeHtml(shortHash(it.ard_hash) || '—')}</td></tr>`
            )
            .join('') +
          `</tbody></table></div>`
        : `<p class="muted">No iteration on disk yet.</p>`;
      return (
        `<div class="spec" id="spec-${escapeHtml(spec.slug)}">` +
        `<h4><a class="mono" href="${escapeHtml(root)}gallery/${escapeHtml(spec.slug)}.html">${escapeHtml(spec.slug)}</a> ${escapeHtml(spec.title)}` +
        (spec.regulatoryId ? ` <span class="sub mono">${escapeHtml(spec.regulatoryId)}</span>` : '') +
        `</h4>` +
        facts([
          ['Type', spec.type ? escapeHtml(spec.type) : null],
          ['E3 position', spec.e3Section ? `§${escapeHtml(spec.e3Section)}` : null],
          ['Files', files.length ? files.map(([kind, file]) => `${escapeHtml(kind)} ${repoFile(config, file) ? `<a class="mono" href="${escapeHtml(repoFile(config, file))}">${escapeHtml(file)}</a>` : mono(file)}`).join('<br>') : null],
          ['Custom code', shared],
          ['Current', spec.current ? `${mono(spec.current.version)} · spec ${mono(shortHash(spec.current.spec_hash) || '—')} · display ${mono(shortHash(spec.current.display_hash) || '—')} · ARD ${mono(shortHash(spec.current.ard_hash) || '—')}` : null]
        ]) +
        iterations +
        `</div>`
      );
    })
    .join('');
  const values = meta.values.length
    ? `<h4 id="value-declarations">Value declarations</h4>` +
      `<p class="sub">${mono(meta.valuesFile)}: a number the report reuses, named once. The store the pipeline resolves from it is the ` +
      `<a href="${escapeHtml(root)}values/index.html">Values view</a>.</p>` +
      `<div class="scroll"><table class="data"><thead><tr><th>Id</th><th>Label</th><th>Kind</th><th>Declaration</th><th>Format</th></tr></thead><tbody>` +
      meta.values
        .map(
          (value) =>
            `<tr><td><a class="mono" href="${escapeHtml(root)}values/index.html#${escapeHtml(value.id)}">${escapeHtml(value.id)}</a></td>` +
            `<td>${escapeHtml(value.label)}</td><td>${chip(value.kind === 'derived' ? 'derived' : 'ARD', value.kind === 'derived' ? 'info' : 'good')}</td>` +
            `<td class="mono">${escapeHtml(value.source || value.derived || '')}</td><td class="mono">${escapeHtml(value.format || '—')}</td></tr>`
        )
        .join('') +
      `</tbody></table></div>`
    : '';
  return (
    `<section class="app-block" id="section-specs">` +
    head +
    `<p class="sub">A display is declared twice — what to compute (<span class="mono">analysis.yaml</span>) and how to show it ` +
    `(<span class="mono">display.yaml</span>) — and every rebuild keeps a snapshot of both beside the ARD, so the history below ` +
    `is the specification's, iteration by iteration, with the hashes each manifest recorded.</p>` +
    (meta.specs.length ? displays : empty('No displays registered yet.')) +
    values +
    `</section>`
  );
}

function approvalsSection(meta, config, root) {
  const head = `<h3 id="approvals">Approvals</h3>`;
  if (!meta.approvals.length) {
    return `<section class="app-block" id="section-approvals">${head}${empty('No text blocks on disk yet.')}</section>`;
  }
  const approved = meta.approvals.filter((block) => block.state === 'approved').length;
  const generated = meta.approvals.filter((block) => block.tier === 'generated');
  const held = generated.filter((block) => block.state !== 'approved').length;
  const stats =
    `<div class="stat-row">` +
    stat(meta.approvals.length, 'text blocks', 'boilerplate, parameterized, generated') +
    stat(approved, 'approved', 'by name and date in the frontmatter') +
    stat(meta.approvals.length - approved, 'draft', 'a lifecycle state, not a failure') +
    stat(held, 'generated blocks held out', 'until a person approves them') +
    `</div>`;
  const rows = meta.approvals
    .map(
      (block) =>
        `<tr><td><a class="mono" href="${escapeHtml(root)}text/index.html#${escapeHtml(block.id)}">${escapeHtml(block.id)}</a></td>` +
        `<td>${escapeHtml(block.title)}${block.e3Section ? ` <span class="sub mono">§${escapeHtml(block.e3Section)}</span>` : ''}</td>` +
        `<td>${escapeHtml(block.tier)}${block.version != null ? ` <span class="sub mono">v${escapeHtml(String(block.version))}</span>` : ''}</td>` +
        `<td>${chip(block.state, block.state === 'approved' ? 'good' : 'warn')}</td>` +
        `<td>${escapeHtml(block.by || '—')}</td><td class="mono">${escapeHtml(block.at || '—')}</td>` +
        `<td class="mono">${escapeHtml(block.model || '—')}</td></tr>`
    )
    .join('');
  return (
    `<section class="app-block" id="section-approvals">` +
    head +
    `<p class="sub">Every text block's frontmatter carries its tier, its version and its approval — who, and when. ` +
    `A generated block stays out of the report until that approval exists; the assembler's gate enforces it.</p>` +
    stats +
    `<div class="scroll"><table class="data"><thead><tr><th>Block</th><th>Title</th><th>Tier</th><th>State</th>` +
    `<th>By</th><th>At</th><th>Drafted by</th></tr></thead><tbody>${rows}</tbody></table></div>` +
    `</section>`
  );
}

function environmentsSection(meta, config, root) {
  const head = `<h3 id="environments">Environments</h3>`;
  if (!meta.environments.length) {
    return `<section class="app-block" id="section-environments">${head}${empty('No iteration carries an environment record yet.')}</section>`;
  }
  const blocks = meta.environments
    .map((env, index) => {
      const packages = Object.entries(env.packages || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, version]) => `${escapeHtml(name)} ${escapeHtml(String(version))}`)
        .join(' · ');
      const iterations = env.iterations
        .sort((a, b) => (a.created || '').localeCompare(b.created || '') || a.slug.localeCompare(b.slug))
        .map(
          (it) =>
            `<a class="mono" href="${escapeHtml(root)}gallery/${escapeHtml(it.slug)}.html">${escapeHtml(it.slug)}</a> ${escapeHtml(it.version)}` +
            (it.created ? ` <span class="sub mono">${escapeHtml(it.created.slice(0, 10))}</span>` : '')
        )
        .join(', ');
      return (
        `<div class="environment" id="environment-${index + 1}">` +
        `<h4>Environment ${index + 1} · R ${escapeHtml(env.r || '?')} · ${escapeHtml(env.os || '?')}</h4>` +
        `<p class="mono">${packages || '—'}</p>` +
        `<p class="sub">${env.iterations.length} iteration${env.iterations.length === 1 ? '' : 's'} built here: ${iterations}</p>` +
        `</div>`
      );
    })
    .join('');
  return (
    `<section class="app-block" id="section-environments">` +
    head +
    `<p class="sub">Every iteration's manifest records the R version, the operating system and the package versions it was built ` +
    `with. This is every distinct record across the library, with the iterations built in each.</p>` +
    blocks +
    `</section>`
  );
}

function requirementsSection(meta, config, root) {
  const head = `<h3 id="requirements">Requirements</h3>`;
  if (!meta.matrices.length) {
    return `<section class="app-block" id="section-requirements">${head}${empty('No requirement matrices under quality/requirements/ yet.')}</section>`;
  }
  const rows = meta.matrices
    .map(
      (matrix) =>
        `<tr><td>${escapeHtml(matrix.title)}</td><td class="mono">${matrix.href ? `<a href="${escapeHtml(matrix.href)}">${escapeHtml(matrix.file)}</a>` : escapeHtml(matrix.file)}</td>` +
        `<td class="num">${escapeHtml(String(matrix.rows))}</td>` +
        `<td>${matrix.module ? `<a href="${escapeHtml(root)}quality/${escapeHtml(matrix.module)}.html">evidence</a>` : `<a href="${escapeHtml(root)}quality/index.html">evidence</a>`}</td></tr>`
    )
    .join('');
  return (
    `<section class="app-block" id="section-requirements">` +
    head +
    `<p class="sub">Requirements live in matrices under <span class="mono">quality/requirements/</span>; every test names ` +
    `the requirement it evidences, and the <a href="${escapeHtml(root)}quality/index.html">Quality pages</a> trace each one to its tests.</p>` +
    `<div class="scroll"><table class="data"><thead><tr><th>Matrix</th><th>File</th><th>Rows</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` +
    `</section>`
  );
}

const SECTIONS = {
  study: studySection,
  models: modelsSection,
  specs: specsSection,
  approvals: approvalsSection,
  environments: environmentsSection,
  requirements: requirementsSection
};

/** The explorer's items: one per page, with a number that says how much is there. */
export function metadataNavItems(meta) {
  const approved = meta.approvals.filter((block) => block.state === 'approved').length;
  const numbers = {
    study: meta.study?.id || null,
    models: `${meta.models.length}`,
    specs: `${meta.specs.length} + ${meta.values.length}`,
    approvals: `${approved}/${meta.approvals.length}`,
    environments: `${meta.environments.length}`,
    requirements: `${meta.matrices.length}`
  };
  return METADATA_PAGES.map((page) => ({
    id: page.id,
    title: page.label,
    number: numbers[page.id],
    status: page.id === 'study' && !meta.study ? 'planned' : 'ok'
  }));
}

/** The Metadata pane: every section on one page, each addressable by id. */
export function renderMetadataPane({ meta, config = {}, root = '../' } = {}) {
  const head =
    `<header class="page-head">` +
    `<p class="eyebrow">Metadata</p>` +
    `<h2>What was declared</h2>` +
    `<p class="lede">Everything the report was built from that is neither measured nor written: the study model, ` +
    `the document models, every display's and value's specification with its history, every text block's ` +
    `approval, the environments the iterations were built in, and the requirements the tests evidence. ` +
    `Each is read from the file that declares it.</p>` +
    `</header>`;
  const approved = meta.approvals.filter((block) => block.state === 'approved').length;
  const stats =
    `<div class="stat-row">` +
    stat(meta.study ? (meta.study.arms || []).length : '—', 'arms', meta.study ? `${Object.keys(meta.study.analysis_sets || {}).length} analysis sets` : 'no study model') +
    stat(meta.models.length, 'document models', 'template objects') +
    stat(meta.specs.length, 'display specifications', `${meta.values.length} value declarations`) +
    stat(`${approved}/${meta.approvals.length}`, 'text blocks approved', `${meta.environments.length} environment${meta.environments.length === 1 ? '' : 's'}`) +
    `</div>`;
  const nav =
    `<nav class="section-links" aria-label="Metadata pages">` +
    METADATA_PAGES.map((page) => `<a href="#section-${page.id}">${escapeHtml(page.label)}</a>`).join('') +
    `</nav>`;
  const sections = METADATA_PAGES.map((page) => SECTIONS[page.id](meta, config, root)).join('\n');
  return [head, stats, nav, sections].join('\n');
}

/** One section as a standalone page (`metadata/<id>.html`). */
export function renderMetadataPage(id, { meta, config = {}, root = '../' } = {}) {
  const page = METADATA_PAGES.find((entry) => entry.id === id);
  if (!page) return empty(`No metadata page named ${id}.`);
  return (
    `<p class="crumb"><a href="index.html">Metadata</a> / <span class="mono">${escapeHtml(id)}</span></p>` +
    `<header class="page-head"><p class="eyebrow">Metadata</p><h1>${escapeHtml(page.label)}</h1>` +
    `<p class="lede">${escapeHtml(page.blurb)}</p></header>` +
    SECTIONS[id](meta, config, root)
  );
}
