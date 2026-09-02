// The Data section: what was measured (open.csr #76, R1 of the sidebar refactor).
//
// Everything on these pages already existed in the repository before the pages
// did — the vendored package's PROVENANCE.json, the `provenance.data` envelope
// of every current ARD, and the source-agreement record — so this module reads
// and indexes; it computes nothing about the study. The one thing it adds is
// the reverse index: from a dataset to every display that read it, with the
// iteration and the hash each one recorded. That is the link the user meeting
// asked for and the display header could not offer as a label.
//
// Every dataset entry carries a `source` — `pipeline` for a vendored file the
// preparation layer reads, `derived` for an analysis dataset the pipeline
// builds from another, `alternate` for one only the alternate lane serves — so
// the page an ARD received from an outside producer will need (design D13) is
// a new value of that field, not a redesign of these pages.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chip, empty, escapeHtml } from './site-lib.mjs';

const DOMAIN_LABEL = { adam: 'ADaM', sdtm: 'SDTM' };
const SOURCE_LABEL = {
  pipeline: 'vendored file, prepared by the pipeline',
  derived: 'derived by the pipeline from another dataset',
  alternate: 'served only by the alternate lane'
};

function readJson(file) {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function shortHash(value) {
  return String(value || '')
    .replace(/^sha256:/, '')
    .slice(0, 7);
}

function relative(rootDir, file) {
  return path.relative(rootDir, file).replaceAll('\\', '/');
}

/** The lane a source_pkg string names, in the words the pages use. */
export function laneLabel(sourcePkg) {
  const raw = String(sourcePkg || '');
  if (!raw) return '—';
  if (/^phuse/i.test(raw)) return "the study's own package (phuse-org/phuse-scripts)";
  if (/pharmaverseadam/i.test(raw)) return 'the pharmaverse re-derivation (pharmaverseadam)';
  return raw;
}

/** Where a dataset's standalone page lives, relative to `root`. */
export function datasetHref(id, root = '../') {
  return `${root}data/${encodeURIComponent(String(id))}.html`;
}

/**
 * Read the data registry (`site/config.json` → `data`) together with the
 * vendored package's provenance record and the lanes record.
 *
 * A registered dataset whose file is not in the provenance record is reported
 * as not vendored (the explorer shows it as planned); a file in the provenance
 * record that no registry entry names is added with `registered: false` and a
 * warning, the way an unregistered display is — the page then exists, but
 * carries no reviewed title or notes.
 */
export function loadDataPackage(rootDir, config = {}) {
  const spec = config.data || null;
  const warnings = [];
  if (!spec) {
    return { configured: false, package: null, datasets: [], lanes: { file: null, record: null }, warnings };
  }
  const pkgDir = path.join(rootDir, spec.package?.dir || 'pipeline/inst/extdata/phuse-cdiscpilot01');
  const provenanceFile = path.join(pkgDir, spec.package?.provenance || 'PROVENANCE.json');
  const provenance = readJson(provenanceFile);
  if (!provenance) warnings.push(`${relative(rootDir, provenanceFile)} is missing or unreadable — the Data section has no package record.`);
  const files = new Map((provenance?.files || []).map((entry) => [entry.dataset, entry]));
  const datasets = (spec.datasets || []).map((entry) => {
    const file = entry.file || entry.id;
    // A derived or alternate-lane dataset has no vendored file of its own — even
    // when a file shares its name, as the relabelled `adcm` copy does with the
    // derived medications dataset.
    const record = entry.source === 'alternate' || entry.source === 'derived' ? null : files.get(file) || null;
    if (entry.source !== 'alternate' && entry.source !== 'derived' && !record) {
      warnings.push(`data: ${entry.id} is registered but ${file} is not in ${relative(rootDir, provenanceFile)} — shown as planned.`);
    }
    return {
      id: entry.id,
      file,
      domain: entry.domain || 'adam',
      title: entry.title || entry.id,
      blurb: entry.blurb || '',
      source: entry.source || 'pipeline',
      lane: entry.lane || null,
      derivedFrom: entry.derivedFrom || null,
      notes: Array.isArray(entry.notes) ? entry.notes : [],
      vendored: !!record,
      provenance: record,
      registered: true
    };
  });
  // Only an entry that reads a vendored file claims one; a derived dataset that
  // happens to share a file's name does not, so the file is still reported.
  const registeredFiles = new Set(datasets.filter((entry) => entry.vendored).map((entry) => entry.file));
  const ids = new Set(datasets.map((entry) => entry.id));
  for (const [dataset, record] of files) {
    if (registeredFiles.has(dataset)) continue;
    warnings.push(`data: ${dataset} is vendored but not registered in site/config.json — published without reviewed metadata.`);
    const id = ids.has(dataset) ? `${dataset}-file` : dataset;
    ids.add(id);
    datasets.push({
      id,
      file: dataset,
      domain: /sdtm/i.test(record.upstream_path || '') ? 'sdtm' : 'adam',
      title: dataset,
      blurb: '',
      source: 'pipeline',
      lane: null,
      derivedFrom: null,
      notes: [],
      vendored: true,
      provenance: record,
      registered: false
    });
  }
  const lanesFile = spec.lanes?.file ? path.join(rootDir, spec.lanes.file) : null;
  const lanesRecord = lanesFile ? readJson(lanesFile) : null;
  if (lanesFile && !lanesRecord) warnings.push(`${relative(rootDir, lanesFile)} is missing or unreadable — the lanes page has no record.`);
  return {
    configured: true,
    package: {
      dir: relative(rootDir, pkgDir),
      title: spec.package?.title || "The study's data package",
      blurb: spec.package?.blurb || '',
      verify: spec.package?.verify || null,
      readme: spec.package?.readme || null,
      provenanceFile: relative(rootDir, provenanceFile),
      provenance: provenance
        ? {
            source_repo: provenance.source_repo || null,
            commit: provenance.commit || null,
            commit_date: provenance.commit_date || null,
            retrieved: provenance.retrieved || null,
            licence: provenance.licence || null,
            licence_url: provenance.licence_url || null,
            verification: provenance.verification || null,
            files: (provenance.files || []).length
          }
        : null
    },
    datasets,
    lanes: {
      file: lanesFile ? relative(rootDir, lanesFile) : null,
      default: spec.lanes?.default || null,
      alternate: spec.lanes?.alternate || null,
      record: lanesRecord
    },
    warnings
  };
}

/**
 * The reverse index: dataset id → every display whose CURRENT ARD names it in
 * its provenance envelope, with what that envelope recorded. Built from the
 * ARDs alone, so a display that reads a dataset the registry does not know
 * still appears under that dataset's id.
 */
export function buildDataIndex({ datasets = [], displays = [] } = {}) {
  const index = new Map();
  const ensure = (id) => {
    if (!index.has(id)) index.set(id, { id, readBy: [], packages: [], rows: [], hashes: [] });
    return index.get(id);
  };
  for (const dataset of datasets) ensure(dataset.id);
  for (const display of displays) {
    const current = display.outputs?.current;
    const data = current?.ard?.provenance?.data;
    if (!Array.isArray(data)) continue;
    for (const entry of data) {
      if (!entry?.dataset) continue;
      const bucket = ensure(entry.dataset);
      bucket.readBy.push({
        slug: display.slug,
        title: display.title || display.slug,
        version: current.version || null,
        hash: entry.hash || null,
        n_row: entry.n_row ?? null,
        source_pkg: entry.source_pkg || null,
        source_version: entry.source_version || null,
        ardHash: current.ardHash || null
      });
      if (entry.source_pkg && !bucket.packages.includes(entry.source_pkg)) bucket.packages.push(entry.source_pkg);
      if (entry.n_row != null && !bucket.rows.includes(entry.n_row)) bucket.rows.push(entry.n_row);
      if (entry.hash && !bucket.hashes.includes(entry.hash)) bucket.hashes.push(entry.hash);
    }
  }
  for (const bucket of index.values()) bucket.readBy.sort((a, b) => a.slug.localeCompare(b.slug));
  return index;
}

/** The explorer's view of a dataset: planned until vendored, flagged when nothing reads it. */
export function datasetStatus(dataset, index) {
  const entry = index?.get?.(dataset.id);
  if (dataset.source === 'derived') return entry?.readBy?.length ? 'ok' : 'unread';
  if (dataset.source === 'alternate') return 'unread';
  if (!dataset.vendored) return 'planned';
  return entry?.readBy?.length ? 'ok' : 'unread';
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function stat(value, label, sub = '') {
  return (
    `<div class="stat"><span class="stat-value">${escapeHtml(String(value))}</span>` +
    `<span class="stat-label">${escapeHtml(label)}</span>` +
    (sub ? `<span class="stat-sub">${escapeHtml(sub)}</span>` : '') +
    `</div>`
  );
}

function facts(rows) {
  const body = rows
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`)
    .join('');
  return `<dl class="facts wide">${body}</dl>`;
}

function mono(value) {
  return `<span class="mono">${escapeHtml(String(value))}</span>`;
}

function repoLink(pkg, file) {
  const prov = pkg?.provenance;
  if (!prov?.source_repo || !prov?.commit || !file) return null;
  return `${prov.source_repo.replace(/\/$/, '')}/blob/${prov.commit}/${file}`;
}

function readBySection(dataset, index, root) {
  const entry = index?.get?.(dataset.id);
  const readBy = entry?.readBy || [];
  if (!readBy.length) {
    return (
      `<h4>Read by</h4>` +
      `<p class="muted">No display's current iteration names this dataset in its ARD.</p>`
    );
  }
  const rows = readBy
    .map(
      (use) =>
        `<tr><td><a href="${escapeHtml(root)}gallery/${escapeHtml(use.slug)}.html">${escapeHtml(use.title)}</a>` +
        ` <span class="sub mono">${escapeHtml(use.slug)}</span></td>` +
        `<td class="mono">${escapeHtml(use.version || '—')}</td>` +
        `<td class="num">${escapeHtml(String(use.n_row ?? '—'))}</td>` +
        `<td class="mono" title="${escapeHtml(use.hash || '')}">${escapeHtml(shortHash(use.hash) || '—')}</td>` +
        `<td class="mono" title="${escapeHtml(use.ardHash || '')}">${escapeHtml(shortHash(use.ardHash) || '—')}</td></tr>`
    )
    .join('');
  return (
    `<h4>Read by</h4>` +
    `<p class="sub">Every display whose current iteration names this dataset in its ARD's provenance ` +
    `envelope, with the row count and hash that iteration recorded for the prepared frame.</p>` +
    `<div class="scroll"><table class="data"><thead><tr><th>Display</th><th>Iteration</th>` +
    `<th>Rows</th><th>Prepared hash</th><th>ARD hash</th></tr></thead><tbody>${rows}</tbody></table></div>`
  );
}

function datasetFacts(dataset, index, data, root) {
  const entry = index?.get?.(dataset.id);
  const prov = dataset.provenance;
  const upstream = repoLink(data.package, prov?.upstream_path);
  const lane = entry?.packages?.length
    ? entry.packages.map(laneLabel).join(' · ')
    : dataset.lane
      ? laneLabel(dataset.lane)
      : dataset.source === 'alternate'
        ? laneLabel('pharmaverseadam')
        : '—';
  return facts([
    ['Domain', DOMAIN_LABEL[dataset.domain] || escapeHtml(dataset.domain)],
    ['Source', escapeHtml(SOURCE_LABEL[dataset.source] || dataset.source)],
    ['Lane', escapeHtml(lane)],
    dataset.derivedFrom
      ? ['Derived from', `<a class="mono" href="${escapeHtml(datasetHref(dataset.derivedFrom, root))}">${escapeHtml(dataset.derivedFrom)}</a>`]
      : ['Derived from', null],
    [
      'Upstream path',
      prov?.upstream_path
        ? upstream
          ? `<a class="mono" href="${escapeHtml(upstream)}">${escapeHtml(prov.upstream_path)}</a>`
          : mono(prov.upstream_path)
        : dataset.source === 'alternate'
          ? escapeHtml('the pharmaverseadam package, not vendored')
          : null
    ],
    ['Blob SHA-1', prov?.blob_sha1 ? mono(prov.blob_sha1) : null],
    ['SHA-256', prov?.sha256 ? mono(prov.sha256) : null],
    ['Bytes', prov?.bytes != null ? escapeHtml(String(prov.bytes)) : null],
    ['Vendored file', prov?.vendored ? `${mono(`${data.package.dir}/${prov.vendored}`)}${prov.gz_sha256 ? ` <span class="sub mono">gz ${escapeHtml(shortHash(prov.gz_sha256))}</span>` : ''}` : null],
    ['Prepared rows', entry?.rows?.length ? escapeHtml(entry.rows.join(' / ')) : null],
    ['Prepared hash', entry?.hashes?.length ? entry.hashes.map((h) => `<span class="mono" title="${escapeHtml(h)}">${escapeHtml(shortHash(h))}</span>`).join(' / ') : null],
    ['Read by', entry?.readBy?.length ? escapeHtml(`${entry.readBy.length} display${entry.readBy.length === 1 ? '' : 's'}`) : escapeHtml('no display')]
  ]);
}

function notesList(dataset, root) {
  if (!dataset.notes.length) return '';
  return (
    `<h4>Derivations and notes</h4>` +
    `<ul class="plain">${dataset.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>` +
    `<p class="sub">The preparation layer's derivations are documented in ` +
    `<a href="${escapeHtml(root)}docs/docs-design-contracts.html">the contracts, §4</a>.</p>`
  );
}

function datasetSection(dataset, { index, data, root, standalone = false }) {
  const status = datasetStatus(dataset, index);
  const flag =
    status === 'planned'
      ? chip('not vendored', 'warn')
      : status === 'unread'
        ? chip('read by no display', 'muted')
        : chip(`${index.get(dataset.id).readBy.length} display${index.get(dataset.id).readBy.length === 1 ? '' : 's'}`, 'good');
  const heading = standalone
    ? `<header class="page-head"><p class="eyebrow">${escapeHtml(DOMAIN_LABEL[dataset.domain] || dataset.domain)} · ${escapeHtml(dataset.id)}</p>` +
      `<h1>${escapeHtml(dataset.title)}</h1>` +
      (dataset.blurb ? `<p class="lede">${escapeHtml(dataset.blurb)}</p>` : '') +
      `</header>`
    : `<h3 id="${escapeHtml(dataset.id)}"><span class="mono">${escapeHtml(dataset.id)}</span> ${escapeHtml(dataset.title)} ${flag}</h3>` +
      (dataset.blurb ? `<p class="sub">${escapeHtml(dataset.blurb)}</p>` : '');
  const unregistered = dataset.registered
    ? ''
    : `<p class="callout warn">This file is vendored but not registered in <span class="mono">site/config.json</span>, so it has no reviewed title or notes.</p>`;
  return (
    `<section class="app-block dataset" data-app-dataset="${escapeHtml(dataset.id)}"${standalone ? '' : ` id="dataset-${escapeHtml(dataset.id)}"`}>` +
    heading +
    unregistered +
    datasetFacts(dataset, index, data, root) +
    notesList(dataset, root) +
    readBySection(dataset, index, root) +
    `</section>`
  );
}

function packageSection(data, index, root) {
  const pkg = data.package;
  const prov = pkg.provenance;
  const commitLink =
    prov?.source_repo && prov?.commit ? `${prov.source_repo.replace(/\/$/, '')}/tree/${prov.commit}` : null;
  return (
    `<section class="app-block" id="package">` +
    `<h3>${escapeHtml(pkg.title)}</h3>` +
    (pkg.blurb ? `<p class="sub">${escapeHtml(pkg.blurb)}</p>` : '') +
    (prov
      ? facts([
          ['Source repository', `<a href="${escapeHtml(prov.source_repo)}">${escapeHtml(prov.source_repo)}</a>`],
          ['Pinned commit', commitLink ? `<a class="mono" href="${escapeHtml(commitLink)}">${escapeHtml(prov.commit)}</a>` : mono(prov.commit)],
          ['Commit date', prov.commit_date ? escapeHtml(prov.commit_date) : null],
          ['Retrieved', prov.retrieved ? escapeHtml(prov.retrieved) : null],
          ['Licence', prov.licence ? (prov.licence_url ? `<a href="${escapeHtml(prov.licence_url)}">${escapeHtml(prov.licence)}</a>` : escapeHtml(prov.licence)) : null],
          ['Files', escapeHtml(String(prov.files))],
          ['Vendored under', mono(pkg.dir)],
          ['Record', mono(pkg.provenanceFile)],
          ['Verification', prov.verification ? escapeHtml(prov.verification) : null],
          ['Verify', pkg.verify ? mono(pkg.verify) : null]
        ])
      : empty(`No provenance record at ${pkg.provenanceFile}.`)) +
    `</section>`
  );
}

function scalarRows(record) {
  return Object.entries(record || {})
    .filter(([key, value]) => key !== 'variables' && (value === null || typeof value !== 'object'))
    .map(([key, value]) => [key.replaceAll('_', ' '), escapeHtml(String(value))]);
}

function objectRows(record) {
  return Object.entries(record || {})
    .filter(([key, value]) => key !== 'variables' && value && typeof value === 'object')
    .map(([key, value]) => [
      key.replaceAll('_', ' '),
      escapeHtml(
        Object.entries(value)
          .map(([k, v]) => `${k}: ${typeof v === 'object' && v !== null ? JSON.stringify(v) : v}`)
          .join(' · ')
      )
    ]);
}

function lanesSection(data, root) {
  const lanes = data.lanes;
  const record = lanes.record;
  const head =
    `<section class="app-block" id="lanes"><h3>Source lanes</h3>` +
    `<p class="sub">Two packagings of the same study exist. The pipeline's registry resolves every ` +
    `dataset to ${escapeHtml(laneLabel(lanes.default || 'phuse'))} by default; ` +
    `${escapeHtml(laneLabel(lanes.alternate || 'pharmaverseadam'))} stays reachable by name and is ` +
    `measured against it by <span class="mono">qc/source-agreement.R</span>, whose record is ` +
    `${lanes.file ? mono(lanes.file) : 'not on disk'}.</p>`;
  if (!record) return head + empty('No source-agreement record yet.') + `</section>`;
  const sources = Object.entries(record.sources || {})
    .map(([id, label]) => `<div><dt>${escapeHtml(id)}</dt><dd>${escapeHtml(String(label))}</dd></div>`)
    .join('');
  const skip = new Set(['study', 'sources', 'environment', 'comparison_rule']);
  const perDataset = Object.entries(record)
    .filter(([key, value]) => !skip.has(key) && value && typeof value === 'object')
    .map(([id, value]) => {
      const variables = value.variables && typeof value.variables === 'object' ? value.variables : null;
      const differing = variables
        ? Object.entries(variables).filter(([, v]) => (v?.n_diff ?? 0) > 0)
        : [];
      const agree = variables ? Object.keys(variables).length - differing.length : 0;
      return (
        `<h4><a class="mono" href="${escapeHtml(datasetHref(id, root))}">${escapeHtml(id)}</a></h4>` +
        facts([...scalarRows(value), ...objectRows(value)]) +
        (variables
          ? differing.length
            ? `<p class="sub">${agree} variable${agree === 1 ? '' : 's'} agree on every record; ` +
              `${differing.length} differ:</p>` +
              `<div class="scroll"><table class="data"><thead><tr><th>Variable</th><th>Records differing</th>` +
              `<th>How</th></tr></thead><tbody>` +
              differing
                .map(
                  ([name, v]) =>
                    `<tr><td class="mono">${escapeHtml(name)}</td><td class="num">${escapeHtml(String(v.n_diff))}</td>` +
                    `<td>${escapeHtml(
                      v.pairs
                        ? Object.entries(v.pairs)
                            .map(([pair, n]) => `${pair} (${n})`)
                            .join('; ')
                        : v.note || ''
                    )}</td></tr>`
                )
                .join('') +
              `</tbody></table></div>`
            : `<p class="sub">All ${agree} compared variables agree on every record.</p>`
          : '')
      );
    })
    .join('');
  return (
    head +
    `<dl class="facts">${sources}</dl>` +
    (record.comparison_rule ? `<p class="sub">${escapeHtml(record.comparison_rule)}</p>` : '') +
    perDataset +
    `</section>`
  );
}

function summaryGrid(data, index, root) {
  const cards = data.datasets
    .map((dataset) => {
      const entry = index.get(dataset.id);
      const status = datasetStatus(dataset, index);
      const n = entry?.readBy?.length || 0;
      return (
        `<a class="card dataset-card" href="#dataset-${escapeHtml(dataset.id)}" data-app-dataset-card="${escapeHtml(dataset.id)}">` +
        `<div class="card-top"><span class="mono">${escapeHtml(dataset.id)}</span>` +
        `<span class="card-meta">${escapeHtml(DOMAIN_LABEL[dataset.domain] || dataset.domain)}</span></div>` +
        `<h3>${escapeHtml(dataset.title)}</h3>` +
        `<p class="card-facts">${escapeHtml(
          status === 'planned'
            ? 'not vendored'
            : n
              ? `${entry.rows.length ? `${entry.rows[0]} rows · ` : ''}read by ${n} display${n === 1 ? '' : 's'}`
              : 'read by no display'
        )}</p>` +
        `</a>`
      );
    })
    .join('');
  return `<div class="card-grid three dataset-grid">${cards}</div>`;
}

/**
 * The Data pane: the package, every dataset, and the lanes — one page with an
 * id per dataset, so the explorer's item and a display header's link both
 * land by `focus`, the way the Values pane already works.
 */
export function renderDataPane({ data, index, root = '../' } = {}) {
  if (!data?.configured) {
    return empty(
      'No data registry yet. `site/config.json` → `data` names the study’s package and its datasets; ' +
        'the pages are built from its provenance record and from every ARD’s provenance envelope.'
    );
  }
  const vendored = data.datasets.filter((d) => d.vendored).length;
  const read = data.datasets.filter((d) => (index.get(d.id)?.readBy?.length || 0) > 0).length;
  const readers = new Set();
  for (const bucket of index.values()) for (const use of bucket.readBy) readers.add(use.slug);
  const head =
    `<header class="page-head">` +
    `<p class="eyebrow">Data</p>` +
    `<h2>What was measured</h2>` +
    `<p class="lede">Every number in the report was computed from one of these datasets. Each page ` +
    `states where the file came from, byte for byte, what the preparation layer did to it, and every ` +
    `display whose current results were computed from it — with the row count and hash that display ` +
    `recorded. Nothing here is typed: the facts are the vendored package's provenance record and the ` +
    `provenance envelope every ARD carries.</p>` +
    `</header>`;
  const stats =
    `<div class="stat-row">` +
    stat(vendored, 'files vendored', 'blob-verified against the pinned commit') +
    stat(read, 'datasets read', 'named in a current ARD') +
    stat(readers.size, 'displays reading data', 'every one links back here') +
    stat(data.package?.provenance?.commit ? shortHash(data.package.provenance.commit) : '—', 'pinned commit', data.package?.provenance?.retrieved ? `retrieved ${data.package.provenance.retrieved}` : '') +
    `</div>`;
  const sections = data.datasets.map((dataset) => datasetSection(dataset, { index, data, root })).join('\n');
  return [head, stats, packageSection(data, index, root), summaryGrid(data, index, root), sections, lanesSection(data, root)].join('\n');
}

/** A dataset's standalone page (`data/<id>.html`). */
export function renderDatasetPage({ data, dataset, index, root = '../' } = {}) {
  return (
    `<p class="crumb"><a href="index.html">Data</a> / <span class="mono">${escapeHtml(dataset.id)}</span></p>` +
    datasetSection(dataset, { index, data, root, standalone: true })
  );
}

/** The lanes' standalone page (`data/lanes.html`). */
export function renderLanesPage({ data, root = '../' } = {}) {
  return `<p class="crumb"><a href="index.html">Data</a> / <span class="mono">lanes</span></p>` + lanesSection(data, root);
}
