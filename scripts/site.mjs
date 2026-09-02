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
  artifactFileName,
  buildTraceIndex,
  displayUsage,
  builtDocuments,
  loadDocuments,
  loadDisplays,
  loadEvidence,
  loadRequirements,
  requirementsFor,
  loadTextBlocks,
  renderCsrReader,
  renderTraceChrome,
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
import { renderTextStatus } from './text-status-lib.mjs';
import { loadValueStore, valueUsage } from './values-lib.mjs';
import {
  ardPayload,
  ardUrl,
  editorContext,
  editorDisplays,
  editorIntro,
  renderBlockEditor,
  renderEditorBar
} from './text-editor-lib.mjs';
import {
  APP_TABS,
  GLOBAL_TABS,
  buildNavTree,
  renderAppBar,
  renderAppPage,
  renderDocumentsPane,
  renderSidebar,
  renderTablesPane,
  renderTemplatesPane,
  renderValuesPane
} from './app-lib.mjs';
import { loadAssembly, loadSections } from './template-lib.mjs';
import { buildDataIndex, datasetStatus, loadDataPackage, renderDataPane, renderDatasetPage, renderLanesPage } from './data-lib.mjs';
import { METADATA_PAGES, loadMetadata, metadataNavItems, renderMetadataPage, renderMetadataPane } from './metadata-lib.mjs';
import { loadStudyModel } from './study-lib.mjs';
import { loadPipeline, pipelineNavItems, renderFunctionPage, renderPipelinePane } from './pipeline-lib.mjs';
import yaml from 'js-yaml';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = path.join(rootDir, 'site', '_build');
const config = JSON.parse(readFileSync(path.join(rootDir, 'site', 'config.json'), 'utf8'));
const shell = readFileSync(path.join(rootDir, 'site', 'shell.html'), 'utf8');

const errors = [];
const warnings = [];

function page(file, { title, content, root = '', description = '', appbar = '', bodyClass = '' }) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(
    file,
    renderShell({ shell, title, content, root, description, config, appbar, bodyClass })
  );
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
// Every template object in library/templates/ that has been assembled, plus any
// document the config declares as planned. The site follows the library: a third
// template object acquires a reader page, a template page, a nav entry and a
// home-page row from this one call (#32).
const documents = loadDocuments(rootDir, config);
const openDocuments = builtDocuments(documents);
const csr = documents.find((doc) => doc.primary) || { json: null, html: null };
for (const doc of openDocuments) {
  if (!doc.declared) {
    warnings.push(
      `${doc.templateId}: assembled from library/templates/ but not declared in ` +
        'site/config.json — publishing it with the title and blurb from its own template model.'
    );
  }
}
const traceIndex = buildTraceIndex(displays);
// Which documents place each display, over the whole library rather than over
// the primary document. Read by the gallery, by each display's own page, and by
// the explorer, so all three agree about where a display appears (#42).
const usage = displayUsage(documents);
// The values store and, from the last assembly, the verdict of the gate that
// re-derived it — the pane states whether the numbers still match their sources
// rather than implying it (#129 B).
const valueStore = loadValueStore(rootDir);
const valueGate = csr.json?.gates?.values || null;
const valueUsageIndex = valueUsage(
  textBlocks.filter((block) => block.exists !== false).map((block) => ({ id: block.id, body: block.body }))
);
const ards = Object.fromEntries(
  displays
    .filter((display) => display.outputs?.current?.ard)
    .map((display) => [display.slug, display.outputs.current.ard])
);

// --- Data: what was measured (#76) -----------------------------------------
// The registry names the package and its datasets; the pages are built from
// the package's provenance record and from every current ARD's envelope.
const dataPackage = loadDataPackage(rootDir, config);
warnings.push(...dataPackage.warnings);
const dataIndex = buildDataIndex({ datasets: dataPackage.datasets, displays });
// The links both ways (#78): what each display was built against (the study
// model's analysis set, its iterations, its environment) and what was built
// from it (the text blocks that bind it, the values sourced from it); the
// datasets behind each display; the documents that place each text block.
let studyModel = null;
try {
  studyModel = loadStudyModel(rootDir);
} catch (error) {
  warnings.push(`library/study.yaml: ${error.message}`);
}
const boundBy = new Map();
for (const block of textBlocks) {
  if (block.exists === false) continue;
  for (const address of block.bindings || []) {
    const slug = String(address).split(':')[0];
    if (!slug) continue;
    if (!boundBy.has(slug)) boundBy.set(slug, []);
    if (!boundBy.get(slug).includes(block.id)) boundBy.get(slug).push(block.id);
  }
}
const valuesByDisplay = new Map();
for (const value of valueStore?.values || []) {
  const slug = value.source?.display;
  if (!slug) continue;
  if (!valuesByDisplay.has(slug)) valuesByDisplay.set(slug, []);
  valuesByDisplay.get(slug).push(value.id);
}
const datasetsByDisplay = new Map(
  displays.map((display) => [
    display.slug,
    (display.outputs?.current?.ard?.provenance?.data || []).map((entry) => entry.dataset).filter(Boolean)
  ])
);
const documentsByBlock = new Map();
for (const doc of documents) {
  for (const block of doc.json?.textBlocks || []) {
    if (!documentsByBlock.has(block.id)) documentsByBlock.set(block.id, []);
    documentsByBlock.get(block.id).push({ id: doc.id, title: doc.title, readerPath: doc.readerPath || null });
  }
}
const displayLinks = (display) => {
  let spec = null;
  try {
    spec = display.outputs?.specs?.analysis?.text ? yaml.load(display.outputs.specs.analysis.text) : null;
  } catch {
    spec = null;
  }
  const setName = spec?.analysis_set ?? null;
  const set = setName && studyModel?.analysis_sets ? studyModel.analysis_sets[setName] : null;
  return {
    studyId: studyModel?.id ?? null,
    analysisSet: setName ? { name: setName, label: set?.label ?? null, flag: set?.flag ?? null } : null,
    group: Array.isArray(spec?.group) ? spec.group.join(', ') : spec?.group ?? null,
    iterations: display.outputs?.versions?.length ?? 0,
    environment: display.outputs?.current?.ard?.provenance?.environment ?? null,
    textBlocks: boundBy.get(display.slug) || [],
    values: valuesByDisplay.get(display.slug) || []
  };
};

const navDatasets = [
  ...dataPackage.datasets.map((dataset) => ({
    id: dataset.id,
    title: dataset.title,
    status: datasetStatus(dataset, dataIndex)
  })),
  ...(dataPackage.configured ? [{ id: 'lanes', title: 'Source lanes', status: 'ok' }] : [])
];

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
  content: renderHome({ config, displays, textBlocks, quality, documents })
});

// --- TFL Gallery ------------------------------------------------------------

page(path.join(buildDir, 'gallery', 'index.html'), {
  title: `TFL Gallery · ${config.siteTitle}`,
  root: '../',
  description:
    'Every display in the library: analysis spec, display spec, ARD, rendered output, and the ' +
    'iteration timeline of every regeneration.',
  content: renderGallery({ config, displays, usage })
});

// Rendered once, used twice: as the /gallery/<slug>.html permalink and as a
// panel of the Demo app's Tables pane. The two cannot drift because they are
// the same string.
const displayFragments = displays.map((display) => {
  const evidence = loadEvidence(rootDir, display.module);
  // The per-display file carries the WHOLE matrix; `prefixes` is what says which
  // rows are this display's. Without this the page lists all 49 for everything.
  const requirements = requirementsFor(
    loadRequirements(rootDir, display.module).requirements,
    display.prefixes
  );
  return {
    slug: display.slug,
    title: display.title,
    regulatoryId: display.regulatoryId,
    type: display.type,
    status: display.status,
    html: renderDisplayPage({
      config,
      display,
      evidence,
      requirements,
      usedIn: usage.get(display.slug),
      datasets: dataIndex,
      links: displayLinks(display)
    })
  };
});

for (const fragment of displayFragments) {
  const display = displays.find((entry) => entry.slug === fragment.slug);
  page(path.join(buildDir, 'gallery', `${fragment.slug}.html`), {
    title: `${display.title} · ${config.siteTitle}`,
    root: '../',
    description: display.blurb || `The ${display.title} display, its ARD, and its specs.`,
    content: fragment.html
  });
}

// --- Submission artifacts ---------------------------------------------------
// The RTF the pipeline wrote for each display's current iteration, published
// flat so the display pages (and the Tables pane, which is the same fragment)
// can offer it as a download without the site knowing anything about iteration
// directories (#129 A).

const artifactDir = path.join(buildDir, 'artifacts');
let artifactCount = 0;
for (const display of displays) {
  for (const artifact of display.outputs?.current?.artifacts || []) {
    const source = path.join(rootDir, artifact.file);
    if (!existsSync(source)) {
      warnings.push(`${artifact.file} is named in a manifest but is not on disk — not published.`);
      continue;
    }
    mkdirSync(artifactDir, { recursive: true });
    copyFileSync(source, path.join(artifactDir, artifactFileName(display.slug, artifact)));
    artifactCount += 1;
  }
}

// --- CSR Reader -------------------------------------------------------------

if (!csr.json && !csr.html) {
  warnings.push(
    'docs/assembled/csr.json is missing — the CSR Reader renders its "not assembled yet" state.'
  );
}

// One reader page per assembled document, from one renderer and one list. The
// primary document keeps /reader/; the rest are sibling files in the same
// directory, so every reader sits one level down and the ../gallery, ../text and
// ../quality links the trace index emits resolve for all of them.
for (const doc of openDocuments.length ? openDocuments : [csr]) {
  page(path.join(buildDir, ...(doc.readerPath || 'reader/index.html').split('/')), {
    title: `${doc.title || 'CSR Reader'} · ${config.siteTitle}`,
    root: '../',
    description:
      `The assembled ${doc.title || 'Clinical Study Report'} with a trace panel: click any bound ` +
      'number or display to follow the data → ARD → display → sentence chain.' +
      (doc.prose?.draft ? ' Its prose blocks are unapproved drafts.' : ''),
    content: renderCsrReader({
      config,
      csr: doc,
      displays,
      ards,
      traceIndex,
      textBlocks,
      documents,
      root: '../'
    })
  });
}

// --- Text Library -----------------------------------------------------------

page(path.join(buildDir, 'text', 'index.html'), {
  title: `Text Library · ${config.siteTitle}`,
  root: '../',
  description:
    'ICH E3-aligned prose blocks in three tiers, with approval state and every number bound to an ' +
    'ARD address rather than typed.',
  content: renderTextLibrary({ textBlocks, ards, traceIndex, documentsByBlock })
});

// The template model comes from template-lib, the same tested loaders the
// assembler uses — so the pane's numbering is the document's numbering (D6)
// rather than a second implementation of it.
const templateFor = (doc) => {
  const dir = path.join(rootDir, doc.template?.dir || 'library/templates/ich-e3');
  return {
    id: doc.templateId,
    dir: path.relative(rootDir, dir).replaceAll('\\', '/'),
    sections: existsSync(path.join(dir, 'sections.yaml'))
      ? loadSections(path.join(dir, 'sections.yaml'))
      : null,
    assembly: existsSync(path.join(dir, 'assembly.yaml'))
      ? loadAssembly(path.join(dir, 'assembly.yaml'))
      : null
  };
};
const templates = new Map(openDocuments.map((doc) => [doc.id, templateFor(doc)]));
const template = templates.get(csr.id) || templateFor(csr);
for (const [id, entry] of templates) {
  if (!entry.sections?.sections?.length) {
    warnings.push(
      `${entry.dir}/sections.yaml is missing or empty — the Templates page for ${id} renders its ` +
        '"not committed yet" state.'
    );
  }
}

// --- Text status ------------------------------------------------------------
// The Demo app's Text pane: where every prose block stands — tier, approval
// state, provenance, resolved bindings, and which blocks the assembly gate is
// currently holding out of the report. Read-only, and rendered only as a pane:
// in-app sign-off was removed on 2026-07-25 (design §12), and a status view
// needs no permalink of its own — a single block's permalink is the Text
// Library page at /text/#<block-id>.

// #113 increment B: the pane's blocks become editable. The editor resolves
// bindings and runs the numeric-fidelity gate in the browser against the ARDs
// published below, and its output is a patch against the block's source file —
// it writes nothing, posts nowhere and cannot touch a block's frontmatter (see
// scripts/text-editor-lib.mjs). Approval remains frontmatter applied by the
// pipeline; the editor is the "agents write source" half of D9, in a browser.
const editorSlugs = Object.keys(ards);
const textEditor = {
  intro: editorIntro(),
  bar: renderEditorBar({
    context: editorContext({ template, displays, csr, values: valueStore?.values || [] })
  }),
  render: (block) =>
    renderBlockEditor(block, {
      source: existsSync(path.join(rootDir, block.file))
        ? readFileSync(path.join(rootDir, block.file), 'utf8')
        : '',
      displays: editorDisplays(block, editorSlugs)
    })
};

const textStatusContent = renderTextStatus({
  config,
  textBlocks,
  ards,
  traceIndex,
  editor: textEditor
});

// The ARDs the editor resolves against, published as their own files and fetched
// only when a block that binds them is opened: the AE-by-SOC/PT ARD alone is
// 3,048 rows, and most visitors never open an editor. Same origin, no external
// host, no API — a build artifact served as a build artifact.
mkdirSync(path.join(buildDir, 'demo', 'ard'), { recursive: true });
for (const [slug, ard] of Object.entries(ards)) {
  writeFileSync(path.join(buildDir, 'demo', ardUrl(slug)), JSON.stringify(ardPayload(ard)));
}

// --- Demo app ---------------------------------------------------------------
// #113 increment A: the four browsing surfaces as panes of one view, sharing a
// selection. Every pane is the same HTML the standalone page serves; what makes
// it an app is site/app/client.js resolving a link between panes into a
// selection change instead of a navigation.

// Selection metadata for the app bar's context readout: what the chrome says you
// are looking at (demo-layout.md §5).
const displayContext = displays.map((display) => ({
  slug: display.slug,
  title: display.title,
  number: (csr.json?.displayIndex || []).find((entry) => entry.slug === display.slug)?.number || null,
  version: display.outputs?.current?.version || null,
  ardHash: display.outputs?.current?.ardHash || null
}));

// The Documents pane is the same Reader with one addition: an Edit affordance on
// every block the build mounted an editor for (#129 C, open.csr#15). The
// standalone /reader/ page keeps the read-only render — there is no editor there
// to adopt, and an affordance that opens nothing is worse than none.
//
// One panel per assembled document, from the same renderer and the same list
// that produces the standalone reader pages (#36). The pane follows the library:
// a third template object becomes a third panel here with no change below this
// line. Each document renders WITHOUT its own trace panel — one shared panel is
// hoisted into the pane, because `id="trace"` can only mean one element.
const editableBlocks = new Set(
  textBlocks.filter((block) => block.exists !== false).map((block) => block.id)
);
const readerDocuments = openDocuments.length ? openDocuments : [csr];
const documentEntries = readerDocuments.map((doc) => ({
  // A tree with nothing assembled still renders the pane: the fallback document
  // is the CSR's own "not assembled yet" state, and it needs a key like any other.
  id: doc.id || 'csr',
  // The basename of this document's standalone reader page: `index` for the
  // primary, the template id for every other object. It is what a link between
  // panes names, so the panel answers to it as well as to the document id.
  file: path.basename(doc.readerPath || 'reader/index.html', '.html'),
  title: doc.title,
  html: renderCsrReader({
    config,
    csr: doc,
    displays,
    ards,
    traceIndex,
    textBlocks,
    documents,
    trace: false,
    root: '../',
    editable: editableBlocks
  })
}));
const readerAppContent = renderDocumentsPane({
  entries: documentEntries,
  selected: csr.id,
  trace: renderTraceChrome(traceIndex)
});

const templatesContent = renderTemplatesPane({
  config,
  template,
  displays,
  documents,
  current: csr.id,
  root: '../'
});
const valuesContent = renderValuesPane({
  store: valueStore,
  usage: valueUsageIndex,
  gate: valueGate,
  datasetsByDisplay,
  documentsByBlock,
  root: '../',
  config
});

// The Data pane and its standalone pages (#76): one page per dataset, one for
// the lanes, and the index that is also the pane — the Values arrangement.
const dataContent = renderDataPane({ data: dataPackage, index: dataIndex, root: '../' });
page(path.join(buildDir, 'data', 'index.html'), {
  title: `Data · ${config.siteTitle}`,
  root: '../',
  description:
    'What was measured: every dataset the study\'s package carries, where each file came from, ' +
    'what the preparation layer did to it, and every display whose results were computed from it.',
  content: dataContent
});
if (dataPackage.configured) {
  for (const dataset of dataPackage.datasets) {
    page(path.join(buildDir, 'data', `${dataset.id}.html`), {
      title: `${dataset.title} · data · ${config.siteTitle}`,
      root: '../',
      description: dataset.blurb || `The ${dataset.id} dataset: provenance, preparation, and the displays that read it.`,
      content: renderDatasetPage({ data: dataPackage, dataset, index: dataIndex, root: '../' })
    });
  }
  page(path.join(buildDir, 'data', 'lanes.html'), {
    title: `Source lanes · data · ${config.siteTitle}`,
    root: '../',
    description: 'The two packagings of the study, which one each dataset resolves to, and the measured divergences between them.',
    content: renderLanesPage({ data: dataPackage, root: '../' })
  });
}

// The Metadata pane and its standalone pages (#77): six sections, one page
// each, and the index that is also the pane.
const metadata = loadMetadata(rootDir, { config, displays, textBlocks, documents });
warnings.push(...metadata.warnings);
const metadataContent = renderMetadataPane({ meta: metadata, config, root: '../' });
page(path.join(buildDir, 'metadata', 'index.html'), {
  title: `Metadata · ${config.siteTitle}`,
  root: '../',
  description:
    'What was declared: the study model, the document models, every specification with its history, ' +
    'every text block\'s approval, the environments the iterations were built in, and the requirements.',
  content: metadataContent
});
for (const entry of METADATA_PAGES) {
  page(path.join(buildDir, 'metadata', `${entry.id}.html`), {
    title: `${entry.label} · metadata · ${config.siteTitle}`,
    root: '../',
    description: entry.blurb,
    content: renderMetadataPage(entry.id, { meta: metadata, config, root: '../' })
  });
}

// The Pipeline pane and its function pages (#82).
const pipeline = loadPipeline(rootDir, { config, dataIndex, dataPackage, displays, valueStore, documents });
warnings.push(...pipeline.warnings);
const pipelineContent = renderPipelinePane({ pipeline, root: '../' });
page(path.join(buildDir, 'pipeline', 'index.html'), {
  title: `Pipeline · ${config.siteTitle}`,
  root: '../',
  description: 'What turns inputs into outputs: every pipeline function, what it reads, what it writes, where its code is, and every element it produced.',
  content: pipelineContent
});
for (const fn of pipeline.functions) {
  page(path.join(buildDir, 'pipeline', `${fn.id}.html`), {
    title: `${fn.label} · pipeline · ${config.siteTitle}`,
    root: '../',
    description: fn.blurb || `The ${fn.label} function: what it reads, what it writes, and what it produced.`,
    content: renderFunctionPage(fn.id, { pipeline, root: '../' })
  });
}

const appPanes = [
  { id: 'documents', html: readerAppContent },
  {
    id: 'displays',
    // No in-pane picker: the explorer lists every display, and two pickers for
    // one selection is one too many.
    html: renderTablesPane({
      picker: false,
      entries: displayFragments.map((fragment) => ({
        ...fragment,
        number: displayContext.find((entry) => entry.slug === fragment.slug)?.number || null
      }))
    })
  },
  { id: 'text', html: textStatusContent },
  { id: 'values', html: valuesContent },
  { id: 'data', html: dataContent },
  { id: 'metadata', html: metadataContent },
  { id: 'pipeline', html: pipelineContent },
  { id: 'templates', html: templatesContent }
];

const navTree = buildNavTree({
  config,
  csr: csr.json,
  displays,
  textBlocks,
  values: valueStore?.values || [],
  datasets: navDatasets,
  metadata: metadataNavItems(metadata),
  pipeline: pipelineNavItems(pipeline),
  documents,
  current: csr.id,
  rendered: documentEntries.map((entry) => entry.id),
  root: '../'
});

page(path.join(buildDir, 'demo', 'index.html'), {
  title: `Demo · ${config.siteTitle}`,
  root: '../',
  description:
    'The open.csr demo: read the assembled report, inspect the table and ARD behind any number, ' +
    'see where the prose that quotes it stands, and see the ICH E3 model it assembles into — one ' +
    'view, four panes, one shared selection.',
  // The app fills the viewport: an explorer plus a wide table has no business
  // inside the 74rem measure the documentation pages read at.
  bodyClass: 'app-page',
  appbar: renderAppBar({ config, tabs: GLOBAL_TABS, displays: displayContext }),
  content: renderAppPage({
    config,
    panes: appPanes,
    tabs: APP_TABS,
    active: 'documents',
    sidebar: renderSidebar({
      tree: navTree,
      active: 'documents',
      selected: { doc: (config.documents || [])[0]?.id || null }
    })
  })
});

// Every view in the app bar is a real link to a real page, so the Templates view
// needs the permalink the other three already had. That is what makes the bar
// work with JavaScript off (demo-layout.md §5).
page(path.join(buildDir, 'values', 'index.html'), {
  title: `Values · ${config.siteTitle}`,
  root: '../',
  description:
    'The values store: every number this report reuses by name, its display format, the ARD row ' +
    'or declared derivation it comes from, and the prose that cites it.',
  content: valuesContent
});

// One template page per document, same renderer, same list.
for (const doc of openDocuments.length ? openDocuments : [csr]) {
  page(path.join(buildDir, ...(doc.templatePath || 'templates/index.html').split('/')), {
    title: `${doc.title || 'Report template'} · template · ${config.siteTitle}`,
    root: '../',
    description:
      `The ${doc.title || 'ICH E3'} document model as data: the full section skeleton, what this ` +
      'report puts in each section, and the display numbering derived from assembly order.',
    content:
      doc.id === csr.id
        ? templatesContent
        : renderTemplatesPane({
            config,
            template: templates.get(doc.id),
            displays,
            documents,
            current: doc.id,
            root: '../'
          })
  });
}

// The demo client and its pure core, copied verbatim — no bundler, no external
// anything (contracts §9). It is the only script the site loads from a file:
// an ES module, so its pure core is the same code the test suite runs.
for (const file of [
  'core.js',
  'client.js',
  'text-core.js',
  'editor-core.js',
  'editor.js',
  'reader-edit-core.js',
  'reader-edit.js'
]) {
  copyFileSync(path.join(rootDir, 'site', 'demo', file), path.join(buildDir, 'demo', file));
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
    `draft, held out of the report), ${qualityModules.length} evidence pages, ${docs.length} documents. ` +
    `${artifactCount} submission RTFs published. ` +
    `All internal links resolve; no external resources referenced.`
);
