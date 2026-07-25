// Static demo-site build (open.csr #1): assembles site/_build/ from the site
// shell + registry plus the committed artifacts — display outputs, ARDs, text
// blocks, the assembled CSR, requirement extracts and evidence sets.
//
// The build is a pure function of the repo tree: no test execution, no network,
// no CDN. It fails on a broken internal link or an external resource reference,
// so a site that cannot be served offline never publishes.
//
// Every input is optional. Displays with no output render a "not generated yet"
// state, a missing CSR renders the trace index alone, a component with no matrix
// degrades to requirement IDs — the site publishes on day one and fills in.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildQualitySummary,
  buildTraceIndex,
  loadCsr,
  loadDisplays,
  loadEvidence,
  loadRequirements,
  loadTextBlocks,
  renderCsrReader,
  renderDocPage,
  renderDocsIndex,
  renderDisplayPage,
  renderEvidencePage,
  renderGallery,
  renderHome,
  renderMarkdown,
  renderQualityIndex,
  renderShell,
  renderTextLibrary,
  rewriteDocLinks,
  validateNoExternalResources,
  validateSiteLinks
} from './site-lib.mjs';
import { loadDecisions, renderReviewPage, reviewConfig } from './review-lib.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = path.join(rootDir, 'site', '_build');
const config = JSON.parse(readFileSync(path.join(rootDir, 'site', 'config.json'), 'utf8'));
const shell = readFileSync(path.join(rootDir, 'site', 'shell.html'), 'utf8');

const errors = [];
const warnings = [];

function page(file, { title, content, root = '', description = '' }) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, renderShell({ shell, title, content, root, description, config }));
}

// --- Reset ------------------------------------------------------------------

rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });
copyFileSync(path.join(rootDir, 'site', 'site.css'), path.join(buildDir, 'site.css'));

const assetsDir = path.join(rootDir, 'site', 'assets');
if (existsSync(assetsDir)) {
  mkdirSync(path.join(buildDir, 'assets'), { recursive: true });
  for (const file of readdirSync(assetsDir)) {
    copyFileSync(path.join(assetsDir, file), path.join(buildDir, 'assets', file));
  }
}

// --- Load the repository ----------------------------------------------------

const displays = loadDisplays(rootDir, config);
const textBlocks = loadTextBlocks(rootDir, config);
const csr = loadCsr(rootDir);
const traceIndex = buildTraceIndex(displays);
const ards = Object.fromEntries(
  displays
    .filter((display) => display.outputs?.current?.ard)
    .map((display) => [display.slug, display.outputs.current.ard])
);

const KIND_LABEL = {
  engine: 'Engine',
  text: 'Text Library',
  templates: 'Report Templates',
  framework: 'Framework',
  display: 'Display'
};

// Quality modules = registered components + every display, each with the
// metadata the evidence pages need.
const qualityModules = [
  ...(config.components || []).map((entry) => ({
    ...entry,
    kindLabel: KIND_LABEL[entry.kind] || 'Component',
    status: existsSync(path.join(rootDir, 'docs', 'evidence', entry.module, 'evidence.json'))
      ? 'evidenced'
      : entry.status || 'planned'
  })),
  ...displays.map((display) => ({
    module: display.module,
    title: display.title,
    kind: 'display',
    kindLabel: KIND_LABEL.display,
    matrix: display.matrix || 'displays.md',
    status: display.status,
    blurb: display.blurb || '',
    display
  }))
];

const quality = buildQualitySummary({ modules: qualityModules, rootDir });

// --- Home -------------------------------------------------------------------

page(path.join(buildDir, 'index.html'), {
  title: `${config.siteTitle} — ${config.tagline}`,
  description: config.description,
  content: renderHome({ config, displays, textBlocks, quality })
});

// --- TFL Gallery ------------------------------------------------------------

page(path.join(buildDir, 'gallery', 'index.html'), {
  title: `TFL Gallery · ${config.siteTitle}`,
  root: '../',
  description:
    'Every display in the library: analysis spec, display spec, ARD, rendered output, and the ' +
    'iteration timeline of every regeneration.',
  content: renderGallery({ config, displays })
});

for (const display of displays) {
  const evidence = loadEvidence(rootDir, display.module);
  const requirements = loadRequirements(rootDir, display.module).requirements || {};
  page(path.join(buildDir, 'gallery', `${display.slug}.html`), {
    title: `${display.title} · ${config.siteTitle}`,
    root: '../',
    description: display.blurb || `The ${display.title} display, its ARD, and its specs.`,
    content: renderDisplayPage({ config, display, evidence, requirements })
  });
}

// --- CSR Reader -------------------------------------------------------------

if (!csr.json && !csr.html) {
  warnings.push(
    'docs/assembled/csr.json is missing — the CSR Reader renders its "not assembled yet" state.'
  );
}
page(path.join(buildDir, 'reader', 'index.html'), {
  title: `CSR Reader · ${config.siteTitle}`,
  root: '../',
  description:
    'The assembled Clinical Study Report with a trace panel: click any bound number or display ' +
    'to follow the data → ARD → display → sentence chain.',
  content: renderCsrReader({ config, csr, displays, ards, traceIndex, textBlocks })
});

// --- Text Library -----------------------------------------------------------

page(path.join(buildDir, 'text', 'index.html'), {
  title: `Text Library · ${config.siteTitle}`,
  root: '../',
  description:
    'ICH E3-aligned prose blocks in three tiers, with approval state and every number bound to an ' +
    'ARD address rather than typed.',
  content: renderTextLibrary({ textBlocks, ards, traceIndex })
});

// --- Review and sign-off ----------------------------------------------------

const reviewCfg = reviewConfig(config);
const ledger = loadDecisions(rootDir, reviewCfg);
if (!ledger.present) {
  warnings.push(
    `${reviewCfg.ledgerPath} is missing — the Review page renders its "no decision recorded yet" state.`
  );
}
if (ledger.malformed) {
  warnings.push(`${reviewCfg.ledgerPath} is not valid JSON — the decision ledger renders empty.`);
}

page(path.join(buildDir, 'review', 'index.html'), {
  title: `Review & sign-off · ${config.siteTitle}`,
  root: '../',
  description:
    'Human review of agent-drafted CSR prose: resolved text, model provenance, every binding ' +
    'resolved to its ARD row, and one-click approval that commits through the gates.',
  content: renderReviewPage({ config, textBlocks, ards, traceIndex, ledger })
});

// The review client is the only script the site loads from a file rather than
// inline: it is an ES module so its pure core (site/review/core.js) is the same
// code the builder and the test suite use. Both files are copied verbatim —
// there is no bundler, and no external anything.
for (const file of ['core.js', 'client.js']) {
  copyFileSync(path.join(rootDir, 'site', 'review', file), path.join(buildDir, 'review', file));
}
// Machine-readable ledger beside the page it renders, as the audit page does.
const ledgerSource = path.join(rootDir, reviewCfg.ledgerPath);
if (existsSync(ledgerSource)) {
  copyFileSync(ledgerSource, path.join(buildDir, 'review', 'text-decisions.json'));
}

// --- Quality ----------------------------------------------------------------

page(path.join(buildDir, 'quality', 'index.html'), {
  title: `Quality · ${config.siteTitle}`,
  root: '../',
  description:
    'Requirement matrices, requirement-traced test evidence across testthat and vitest, coverage, ' +
    'and the drift guards that keep the committed artifacts honest.',
  content: renderQualityIndex({ config, modules: qualityModules, rootDir, quality })
});

for (const module of qualityModules) {
  const evidence = loadEvidence(rootDir, module.module);
  const requirements = loadRequirements(rootDir, module.module);
  page(path.join(buildDir, 'quality', `${module.module}.html`), {
    title: `${module.title} evidence · ${config.siteTitle}`,
    root: '../',
    description: `Requirement-traced test evidence for the ${module.title} component of open.csr.`,
    content: renderEvidencePage({
      config,
      module,
      evidence,
      requirements,
      display: module.display || null
    })
  });
}

// --- Design & Research ------------------------------------------------------

const docPages = new Map();
const docs = (config.docs || []).map((entry) => {
  const slug = entry.file
    .replace(/\.md$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  const doc = {
    ...entry,
    slug,
    page: `${slug}.html`,
    exists: existsSync(path.join(rootDir, entry.file))
  };
  docPages.set(entry.file, doc.page);
  return doc;
});

page(path.join(buildDir, 'docs', 'index.html'), {
  title: `Design & Research · ${config.siteTitle}`,
  root: '../',
  description:
    'The open.csr design document, the normative interface contracts, and the landscape research ' +
    'behind them.',
  content: renderDocsIndex({ config, docs })
});

for (const doc of docs) {
  if (!doc.exists) {
    warnings.push(`${doc.file} is registered in site/config.json but does not exist — skipped.`);
    docPages.delete(doc.file);
    continue;
  }
  const markdown = readFileSync(path.join(rootDir, doc.file), 'utf8');
  const html = rewriteDocLinks(renderMarkdown(markdown), {
    docPages,
    repoUrl: config.repoUrl,
    sourceFile: doc.file
  });
  page(path.join(buildDir, 'docs', doc.page), {
    title: `${doc.title} · ${config.siteTitle}`,
    root: '../',
    description: `${doc.title} — rendered from ${doc.file}.`,
    content: renderDocPage({ doc, html })
  });
}

// A registered-but-missing doc leaves a dangling index link; emit a stub so the
// link validator stays meaningful instead of being worked around.
for (const doc of docs.filter((entry) => !entry.exists)) {
  page(path.join(buildDir, 'docs', doc.page), {
    title: `${doc.title} · ${config.siteTitle}`,
    root: '../',
    description: `${doc.title} has not been written yet.`,
    content:
      `<p class="crumb"><a href="index.html">Design &amp; Research</a></p>` +
      `<h1>${doc.title}</h1>` +
      `<p class="empty">${doc.file} is registered in site/config.json but is not in the ` +
      `repository yet.</p>`
  });
}

// --- Validate ---------------------------------------------------------------

errors.push(...validateSiteLinks(buildDir));
errors.push(...validateNoExternalResources(buildDir));

warnings.forEach((warning) => console.warn(`⚠ ${warning}`));

if (errors.length) {
  console.error('✗ Site build failed validation:');
  errors.forEach((error) => console.error(`  - ${error}`));
  process.exit(1);
}

const built = displays.filter((display) => display.status !== 'planned').length;
console.log(
  `✓ Built site/_build/ — ${displays.length} displays (${built} generated), ` +
    `${textBlocks.filter((b) => b.exists).length} text blocks ` +
    `(${textBlocks.filter((b) => b.exists && b.tier === 'generated' && b.approval?.state !== 'approved').length} ` +
    `awaiting review), ${qualityModules.length} evidence pages, ${docs.length} documents. ` +
    `All internal links resolve; no external resources referenced.`
);
