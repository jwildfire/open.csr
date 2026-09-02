// The Pipeline section: what turns inputs into outputs (open.csr #82, R6 of the
// sidebar refactor).
//
// The functions are declared in the registry (`site/config.json` → `pipeline`)
// by the code's own names, with what each reads and writes and where its code
// is. What each one PRODUCED is indexed here from the records the earlier
// increments already collect — the datasets the ARDs name, the displays with a
// current iteration, the values in the store, the documents assembled — so a
// function's page lists every element it made, each a link back.

import { chip, empty, escapeHtml } from './site-lib.mjs';
import { renderFlow, repoBlob } from './flow-lib.mjs';

const KIND_LABEL = { R: 'R function', node: 'Node script', qc: 'QC script' };

function link(entry, root) {
  if (!entry) return '';
  const label = escapeHtml(entry.label || '');
  return entry.href ? `<a href="${escapeHtml(root)}${escapeHtml(entry.href)}">${label}</a>` : label;
}

function asBox(entry, root) {
  if (typeof entry === 'string') return { label: entry };
  return { label: entry.label, sub: entry.sub || null, href: entry.href ? `${root}${entry.href}` : null };
}

/**
 * Read the registry's functions and index what each produced.
 *
 * `produces` on a registry entry names the collection the function writes into
 * — `datasets`, `displays`, `values`, `documents` or `site` — and the page lists
 * that collection's members with links; anything else lists nothing.
 */
export function loadPipeline(rootDir, { config = {}, dataIndex = null, dataPackage = null, displays = [], valueStore = null, documents = [] } = {}) {
  const spec = config.pipeline || null;
  const warnings = [];
  if (!spec?.functions?.length) {
    return { configured: false, functions: [], warnings };
  }
  const produced = {
    datasets: (dataPackage?.datasets || [])
      .filter((dataset) => (dataIndex?.get?.(dataset.id)?.readBy?.length || 0) > 0)
      .map((dataset) => ({
        label: dataset.id,
        sub: `${dataset.title} · read by ${dataIndex.get(dataset.id).readBy.length} display${dataIndex.get(dataset.id).readBy.length === 1 ? '' : 's'}`,
        href: `data/${dataset.id}.html`
      })),
    displays: displays
      .filter((display) => display.outputs?.current)
      .map((display) => ({
        label: display.slug,
        sub: `${display.title} · ${display.outputs.current.version}`,
        href: `gallery/${display.slug}.html`
      })),
    values: (valueStore?.values || []).map((value) => ({
      label: value.id,
      sub: value.label || '',
      href: `values/index.html#${value.id}`
    })),
    documents: documents
      .filter((doc) => doc.status === 'built')
      .map((doc) => ({ label: doc.title || doc.id, sub: doc.templateId ? `template ${doc.templateId}` : '', href: doc.readerPath || 'reader/index.html' })),
    site: []
  };
  const ids = new Set(spec.functions.map((entry) => entry.id));
  const functions = spec.functions.map((entry) => {
    for (const callee of entry.calls || []) {
      if (!ids.has(callee)) warnings.push(`pipeline: ${entry.id} calls ${callee}, which is not a registered function.`);
    }
    return {
      id: entry.id,
      label: entry.label || entry.id,
      kind: entry.kind || 'R',
      kindLabel: KIND_LABEL[entry.kind] || entry.kind || 'Function',
      code: entry.code || null,
      codeHref: repoBlob(config, entry.code),
      blurb: entry.blurb || '',
      reads: Array.isArray(entry.reads) ? entry.reads : [],
      writes: Array.isArray(entry.writes) ? entry.writes : [],
      calls: Array.isArray(entry.calls) ? entry.calls : [],
      gates: Array.isArray(entry.gates) ? entry.gates : [],
      produces: entry.produces || null,
      produced: produced[entry.produces] || []
    };
  });
  return { configured: true, functions, warnings };
}

/** The explorer's items: one per function, its kind as the number. */
export function pipelineNavItems(pipeline) {
  return (pipeline?.functions || []).map((fn) => ({ id: fn.id, title: fn.label, number: fn.kind, status: 'ok' }));
}

function functionSection(fn, { pipeline, root, standalone = false }) {
  const flow = renderFlow({
    label: `What ${fn.label} reads and writes`,
    inputs: fn.reads.map((entry) => asBox(entry, root)),
    steps: [{ label: fn.label, sub: fn.code || null, href: fn.codeHref, kind: 'fn' }],
    outputs: fn.writes.map((entry) => asBox(entry, root))
  });
  const heading = standalone
    ? `<header class="page-head"><p class="eyebrow">Pipeline · ${escapeHtml(fn.kindLabel)}</p>` +
      `<h1><span class="mono">${escapeHtml(fn.label)}</span></h1>` +
      (fn.blurb ? `<p class="lede">${escapeHtml(fn.blurb)}</p>` : '') +
      `</header>`
    : `<h3 id="${escapeHtml(fn.id)}"><span class="mono">${escapeHtml(fn.label)}</span> ${chip(fn.kindLabel, 'muted')}</h3>` +
      (fn.blurb ? `<p class="sub">${escapeHtml(fn.blurb)}</p>` : '');
  const calls = fn.calls.length
    ? `<p class="sub">Calls ${fn.calls
        .map((id) => {
          const callee = pipeline.functions.find((entry) => entry.id === id);
          return `<a class="mono" href="${escapeHtml(root)}pipeline/${escapeHtml(id)}.html">${escapeHtml(callee?.label || id)}</a>`;
        })
        .join(', ')}.</p>`
    : '';
  const gates = fn.gates.length
    ? `<h4>Gates</h4><ul class="plain compact">${fn.gates.map((gate) => `<li>${escapeHtml(gate)}</li>`).join('')}</ul>`
    : '';
  const producedList = fn.produced.length
    ? `<h4>Produced</h4><ul class="plain compact">${fn.produced
        .map((entry) => `<li><a class="mono" href="${escapeHtml(root)}${escapeHtml(entry.href)}">${escapeHtml(entry.label)}</a>${entry.sub ? ` <span class="sub">${escapeHtml(entry.sub)}</span>` : ''}</li>`)
        .join('')}</ul>`
    : fn.produces
      ? `<h4>Produced</h4><p class="muted">Nothing in the ${escapeHtml(fn.produces)} collection yet.</p>`
      : '';
  const code = fn.code
    ? `<p class="sub">Code: ${fn.codeHref ? `<a class="mono" href="${escapeHtml(fn.codeHref)}">${escapeHtml(fn.code)}</a>` : `<span class="mono">${escapeHtml(fn.code)}</span>`}</p>`
    : '';
  return (
    `<section class="app-block pipeline-function" data-app-function="${escapeHtml(fn.id)}"${standalone ? '' : ` id="function-${escapeHtml(fn.id)}"`}>` +
    heading +
    flow +
    code +
    calls +
    gates +
    producedList +
    `</section>`
  );
}

/** The whole pipeline as one flow: the three input collections, the functions in order, the three output collections. */
export function renderPipelineOverview(pipeline, root = '../') {
  return renderFlow({
    label: 'The pipeline, end to end',
    inputs: [
      { label: 'Data', sub: 'what was measured', href: `${root}data/index.html` },
      { label: 'Metadata', sub: 'what was declared', href: `${root}metadata/index.html` },
      { label: 'Text', sub: 'what was written', href: `${root}text/index.html` }
    ],
    steps: (pipeline?.functions || []).map((fn) => ({ label: fn.label, sub: fn.kindLabel, href: `${root}pipeline/${fn.id}.html`, kind: 'fn' })),
    outputs: [
      { label: 'Displays', sub: 'ARDs and rendered tables', href: `${root}gallery/index.html` },
      { label: 'Values', sub: 'the named-number store', href: `${root}values/index.html` },
      { label: 'Documents', sub: 'the assembled reports', href: `${root}reader/index.html` }
    ]
  });
}

/** The Pipeline pane: the overview and one section per function, each addressable by id. */
export function renderPipelinePane({ pipeline, root = '../' } = {}) {
  if (!pipeline?.configured) {
    return empty(
      'No pipeline registry yet. `site/config.json` → `pipeline.functions` names the functions that turn ' +
        'inputs into outputs; their pages are built from it and from what each one produced.'
    );
  }
  const head =
    `<header class="page-head">` +
    `<p class="eyebrow">Pipeline</p>` +
    `<h2>What turns inputs into outputs</h2>` +
    `<p class="lede">The functions, by the names the code gives them. Each one reads inputs someone wrote and ` +
    `writes outputs nobody edits; each page says what it reads, what it writes, where its code is, and every ` +
    `element it produced. The invariant in one view: agents write source, the pipeline regenerates, humans approve.</p>` +
    `</header>`;
  const overview = `<section class="app-block" id="pipeline-overview"><h3>End to end</h3>${renderPipelineOverview(pipeline, root)}</section>`;
  const sections = pipeline.functions.map((fn) => functionSection(fn, { pipeline, root })).join('\n');
  return [head, overview, sections].join('\n');
}

/** One function's standalone page (`pipeline/<id>.html`). */
export function renderFunctionPage(id, { pipeline, root = '../' } = {}) {
  const fn = (pipeline?.functions || []).find((entry) => entry.id === id);
  if (!fn) return empty(`No pipeline function named ${id}.`);
  return (
    `<p class="crumb"><a href="index.html">Pipeline</a> / <span class="mono">${escapeHtml(fn.label)}</span></p>` +
    functionSection(fn, { pipeline, root, standalone: true })
  );
}

export { link as pipelineLink };
