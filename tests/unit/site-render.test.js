import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildQualitySummary,
  buildTraceIndex,
  deriveStatus,
  loadCsr,
  loadDisplayOutputs,
  loadDisplays,
  loadTextBlocks,
  normalizeCsr,
  normalizeIterations,
  pickCurrentVersion,
  renderArdTable,
  renderCsrReader,
  renderDisplayPage,
  renderDocsIndex,
  renderEvidencePage,
  renderGallery,
  renderHome,
  renderIterationTimeline,
  renderQualityIndex,
  renderNav,
  renderShell,
  renderTextLibrary,
  rewriteDocLinks,
  displayUsage
} from '../../scripts/site-lib.mjs';
import { resolveAppLink } from '../../site/demo/core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '..', '..');
const repoDir = path.join(here, '..', 'fixtures', 'site', 'repo');
const config = JSON.parse(readFileSync(path.join(repoDir, 'site', 'config.json'), 'utf8'));

const displays = loadDisplays(repoDir, config);
const textBlocks = loadTextBlocks(repoDir, config);
const bySlug = Object.fromEntries(displays.map((d) => [d.slug, d]));
const ards = Object.fromEntries(
  displays.filter((d) => d.outputs.current?.ard).map((d) => [d.slug, d.outputs.current.ard])
);
const traceIndex = buildTraceIndex(displays);

describe('the shared shell', () => {
  const shell = readFileSync(path.join(rootDir, 'site', 'shell.html'), 'utf8');

  test('QC-SITE-001: every shell token is substituted and none leaks into the output (#1)', () => {
    const html = renderShell({
      shell,
      title: 'Quality · open.csr',
      description: 'evidence',
      content: '<h1>Body</h1>',
      root: '../',
      config
    });
    expect(html).toContain('<title>Quality · open.csr</title>');
    expect(html).toContain('<h1>Body</h1>');
    expect(html).toMatch(/<link rel="stylesheet" href="\.\.\/site\.css"/);
    expect(html).not.toMatch(/\{\{[a-zA-Z]+\}\}/);
  });

  test('QC-SITE-001: navigation links are relative to the page root so any mount depth works (#1)', () => {
    const atRoot = renderShell({ shell, title: 't', content: '', root: '', config });
    const nested = renderShell({ shell, title: 't', content: '', root: '../', config });
    // Asserted against the nav as rendered rather than one hard-coded entry, so
    // changing what the site links to (as #113 did) cannot silently stop this
    // from checking anything.
    const entries = [...renderNav('').matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    expect(entries.length).toBeGreaterThan(1);
    for (const href of entries) {
      expect(atRoot).toContain(`href="${href}"`);
      expect(nested).toContain(`href="../${href}"`);
    }
    expect(nested).not.toMatch(/href="\/[a-z]/);
  });
});

describe('the display registry', () => {
  test('QC-SITE-005: status is derived from the filesystem, not from the declared value (#1)', () => {
    expect(bySlug['t-demo'].status).toBe('built');
    expect(bySlug['t-missing'].status).toBe('planned');
    expect(deriveStatus({ status: 'planned' }, { exists: true, hasEvidence: true })).toBe(
      'evidenced'
    );
    expect(deriveStatus({ status: 'evidenced' }, { exists: false })).toBe('planned');
  });

  test('QC-SITE-007: a display on disk but absent from the registry is surfaced, not dropped (#1)', () => {
    expect(bySlug['t-orphan']).toBeTruthy();
    expect(bySlug['t-orphan'].registered).toBe(false);
    expect(renderGallery({ config, displays })).toContain('unregistered');
  });

  test('QC-SITE-006: a display with no outputs loads to empty structures rather than throwing (#1)', () => {
    const outputs = loadDisplayOutputs(repoDir, 't-missing');
    expect(outputs.versions).toEqual([]);
    expect(outputs.current).toBeNull();
    expect(outputs.displayFile).toBeNull();
    expect(outputs.iterations).toEqual([]);
  });
});

describe('iterations', () => {
  test('TRC-ITER-002: current.json names the live iteration (#1)', () => {
    expect(bySlug['t-demo'].outputs.current.version).toBe('v002');
    expect(pickCurrentVersion(['v001', 'v002'], { version: 'v001' })).toBe('v001');
  });

  test('TRC-ITER-002: with no pointer, or a pointer to a missing version, the highest wins (#1)', () => {
    expect(pickCurrentVersion(['v001', 'v002', 'v010'], null)).toBe('v010');
    expect(pickCurrentVersion(['v001', 'v002'], { version: 'v009' })).toBe('v002');
    expect(pickCurrentVersion([], null)).toBeNull();
  });

  test('TRC-ITER-001: the timeline merges the ledger with the output manifests (#1)', () => {
    const iterations = bySlug['t-demo'].outputs.iterations;
    expect(iterations.map((entry) => entry.version)).toEqual(['v001', 'v002', 'v003']);
    expect(iterations[1].request).toBe('Add a percentage column to the high-dose arm.');
    expect(iterations[1].hasOutput).toBe(true);
  });

  test('TRC-ITER-001: manifests alone reconstruct the timeline when no ledger exists (#1)', () => {
    const iterations = normalizeIterations(null, [
      { version: 'v001', manifest: { date: '2026-07-01', actor: '@a', request: 'first' } }
    ]);
    expect(iterations).toEqual([
      {
        version: 'v001',
        date: '2026-07-01',
        actor: '@a',
        request: 'first',
        commit: null,
        hasOutput: true
      }
    ]);
  });

  test('TRC-ITER-003: a ledger entry with no output directory is rendered and flagged (#1)', () => {
    const html = renderIterationTimeline(bySlug['t-demo']);
    expect(html).toContain('v003');
    expect(html).toContain('no output');
    expect(html).toContain('current');
  });

  test('QC-SITE-006: a display with no iterations renders a documented empty state (#1)', () => {
    expect(renderIterationTimeline(bySlug['t-missing'])).toContain('No iterations recorded yet');
  });
});

describe('the trace index', () => {
  test('TRC-CHAIN-001: each entry carries datasets, specs, ARD, hashes, iteration and commit (#1)', () => {
    expect(traceIndex['t-demo']).toMatchObject({
      slug: 't-demo',
      datasets: ['adae', 'adsl'],
      analysisFile: 'library/tfl/t-demo/analysis.yaml',
      displayFile: 'library/tfl/t-demo/display.yaml',
      ardFile: 'outputs/t-demo/v002/ard.json',
      specHash: 'sha256:aaaa1111',
      commit: 'abc1234def5678',
      iteration: 'v002'
    });
    expect(traceIndex['t-demo'].dataHashes.adae).toBe('sha256:cccc3333');
  });

  test('TRC-ARD-004: the ARD hash is computed from the committed file when needed (#1)', () => {
    expect(traceIndex['t-demo'].ardHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test('TRC-CHAIN-002: every entry links to its gallery page and its evidence page (#1)', () => {
    expect(traceIndex['t-demo'].page).toBe('../gallery/t-demo.html');
    expect(traceIndex['t-demo'].evidence).toBe('../quality/t-demo.html');
  });
});

describe('the ARD tab', () => {
  test('QC-SITE-005: the ARD renders one row per statistic with its condition columns (#1)', () => {
    const html = renderArdTable(bySlug['t-demo'].outputs.current.ard);
    expect(html).toContain('<th>stat_name</th>');
    expect(html).toContain('<th>warning</th>');
    expect(html).toContain('NAs introduced by coercion');
    expect((html.match(/<tr>/g) || []).length).toBe(6); // 1 header + 5 rows
  });

  test('QC-SITE-006: an absent ARD renders the empty state rather than an empty table (#1)', () => {
    expect(renderArdTable(null)).toContain('has not been generated yet');
    expect(renderArdTable({ rows: [] })).toContain('has not been generated yet');
  });
});

describe('page rendering', () => {
  const quality = buildQualitySummary({
    modules: [
      { module: 'tfl-engine', title: 'TFL Engine', kindLabel: 'Engine', matrix: 'tfl-engine.md', status: 'planned' },
      { module: 't-demo', title: 'Demo display', kindLabel: 'Display', matrix: 'displays.md', status: 'built' }
    ],
    rootDir: repoDir
  });

  test('QC-SITE-006: the home page renders from an empty repository without throwing (#1)', () => {
    const html = renderHome({ config, displays, textBlocks, quality });
    expect(html).toContain('closed loop');
    expect(html).toContain('Architecture');
    expect(html).toContain('displays registered');
  });

  test('QC-SITE-005: the gallery card shows the iteration and ARD row count (#1)', () => {
    const html = renderGallery({ config, displays });
    expect(html).toContain('Demo display');
    expect(html).toContain('v002 · 5 ARD rows');
    expect(html).toContain('No iteration generated yet');
  });

  test('QC-SITE-005: the display page renders all four tabs (#1)', () => {
    const html = renderDisplayPage({
      config,
      display: bySlug['t-demo'],
      evidence: null,
      requirements: {}
    });
    for (const tab of ['Rendered display', 'ARD', 'Specs', 'Iteration timeline']) {
      expect(html).toContain(tab);
    }
    expect(html).toContain('analysis.yaml');
    expect(html).toContain('Table 14.3.1.1');
  });

  test('QC-SITE-006: the display page for an ungenerated display is all empty states (#1)', () => {
    const html = renderDisplayPage({
      config,
      display: bySlug['t-missing'],
      evidence: null,
      requirements: {}
    });
    expect(html).toContain('has not been rendered yet');
    expect(html).toContain('No iterations recorded yet');
    expect(html).not.toContain('undefined');
  });

  test('QC-SITE-005: the text library shows tier, approval state and binding resolution (#1)', () => {
    const html = renderTextLibrary({ textBlocks, ards, traceIndex });
    expect(html).toContain('parameterized');
    expect(html).toContain('approved');
    expect(html).toContain('Unresolved bindings');
    expect(html).toContain('TXT-E3-9999');
  });

  test('QC-SITE-005: the quality index rolls up requirements, tests and coverage (#1)', () => {
    const html = renderQualityIndex({
      config,
      modules: [
        {
          module: 'tfl-engine',
          title: 'TFL Engine',
          kindLabel: 'Engine',
          matrix: 'tfl-engine.md',
          status: 'planned'
        }
      ],
      rootDir: repoDir,
      quality
    });
    expect(html).toContain('reviewed requirements');
    expect(html).toContain('Requirement ID scheme');
    expect(html).toContain('tfl-engine.html');
  });

  test('QC-SITE-006: an evidence page with neither matrix nor evidence degrades to a stated gap (#1)', () => {
    const html = renderEvidencePage({
      config,
      module: { module: 'templates', title: 'Templates', kindLabel: 'Framework', matrix: 'templates.md' },
      evidence: null,
      requirements: { component: 'templates', matrix: null, requirements: {}, rows: [] },
      display: null
    });
    expect(html).toContain('No reviewed matrix for this component yet');
    expect(html).toContain('No evidence set for this module yet');
    expect(html).not.toContain('NaN');
  });

  test('QC-SITE-005: an evidence page joins reviewed rows to the tests that evidence them (#1)', () => {
    const html = renderEvidencePage({
      config,
      module: { module: 't-demo', title: 'Demo display', kindLabel: 'Display', matrix: 'displays.md' },
      evidence: {
        generated: '2026-07-25T00:00:00Z',
        environment: { node: 'v24' },
        traceability: { adamDatasets: ['adae'], ardFile: 'outputs/t-demo/v002/ard.json' },
        records: [
          {
            suite: 'r-unit',
            title: 'DSP-DEMO-001: counts match (#1)',
            passed: true,
            requirementIds: ['DSP-DEMO-001'],
            file: 'test-t-demo.R'
          }
        ]
      },
      requirements: {
        component: 't-demo',
        matrix: 'displays.md',
        requirements: { 'DSP-DEMO-001': 'Counts match ADSL.', 'DSP-DEMO-002': 'Untested.' },
        rows: [
          { id: 'DSP-DEMO-001', area: 'Demographics', text: 'Counts match ADSL.', evidence: 'r-unit' },
          { id: 'DSP-DEMO-002', area: 'Demographics', text: 'Untested.', evidence: 'r-unit' }
        ]
      },
      display: bySlug['t-demo']
    });
    expect(html).toContain('1 passing');
    expect(html).toContain('no test');
    expect(html).toContain('Traceability');
    expect(html).toContain('outputs/t-demo/v002/ard.json');
  });
});

describe('the CSR reader', () => {
  const csr = loadCsr(repoDir);

  test('TRC-DOC-001: the assembled document normalizes into sections and nested sections (#1)', () => {
    const normalized = normalizeCsr(csr.json);
    expect(normalized.sections).toHaveLength(1);
    expect(normalized.sections[0].number).toBe('12.2.1');
    expect(normalized.sections[0].content.map((block) => block.kind)).toEqual(['text', 'display']);
    expect(normalized.sections[0].sections[0].title).toBe('Nested subsection');
  });

  test('TRC-DOC-001: an absent or unusable assembly normalizes to null instead of throwing (#1)', () => {
    expect(normalizeCsr(null)).toBeNull();
    expect(normalizeCsr({}).sections).toEqual([]);
  });

  test('TRC-CHAIN-001: the reader renders bound numbers and embeds the trace index (#1)', () => {
    const html = renderCsrReader({ config, csr, displays, ards, traceIndex });
    expect(html).toContain('data-trace="binding"');
    expect(html).toContain('id="trace-index"');
    expect(html).toContain('>79<');
    expect(html).toContain('Nested subsection');
  });

  test('QC-SITE-006: with no assembled CSR the reader states the gap and still offers the trace index (#1)', () => {
    const html = renderCsrReader({
      config,
      csr: { json: null, html: null },
      displays,
      ards,
      traceIndex
    });
    expect(html).toContain('has not been assembled yet');
    expect(html).toContain('Trace index');
    expect(html).toContain('id="trace-index"');
  });
});

describe('design and research pages', () => {
  test('QC-SITE-001: cross-references between documents rewrite to the built pages (#1)', () => {
    const docPages = new Map([['research/sections/05_safetyviz-evidence-framework.md', 'research-sections-05-safetyviz-evidence-framework.html']]);
    const html = rewriteDocLinks(
      '<a href="../../research/sections/05_safetyviz-evidence-framework.md#section-11">§05</a>',
      { docPages, repoUrl: 'https://github.com/jwildfire/open.csr', sourceFile: 'docs/design/design.md' }
    );
    expect(html).toContain('href="research-sections-05-safetyviz-evidence-framework.html#section-11"');
  });

  test('QC-SITE-001: a link to a file that is not a rendered page points at the repository (#1)', () => {
    const html = rewriteDocLinks('<a href="../../pipeline/DESCRIPTION">pkg</a>', {
      docPages: new Map(),
      repoUrl: 'https://github.com/jwildfire/open.csr',
      sourceFile: 'docs/design/design.md'
    });
    expect(html).toContain('https://github.com/jwildfire/open.csr/blob/main/pipeline/DESCRIPTION');
  });

  test('QC-SITE-006: a registered document that is missing is listed and flagged (#1)', () => {
    const html = renderDocsIndex({
      config,
      docs: [{ file: 'docs/design/design.md', title: 'Design', page: 'design.html', exists: false }]
    });
    expect(html).toContain('missing');
    expect(html).toContain('design.html');
  });
});

// ---------------------------------------------------------------------------
// The display store knows its documents, and a document links to the store
// (open.csr #42)
// ---------------------------------------------------------------------------
//
// @jwildfire: *"I'd like to improve the linkage between the in-document displays
// and the display store. There should be a hyperlink in the document that links
// to the display store. The display store should provide a list of all the
// documents where the display is used (just like the value store does already)"*
//
// Both halves are the same fact seen from two ends, so both come from one
// index built over the whole library rather than over the primary document.

describe('a display and the documents that place it', () => {
  const library = [
    {
      id: 'csr',
      title: 'Clinical Study Report',
      status: 'built',
      readerPath: 'reader/index.html',
      json: {
        displayIndex: [
          { slug: 't-demo', number: '14.3.1.1', label: 'Table' },
          { slug: 't-solo', number: '14.3.1.2', label: 'Table' }
        ]
      }
    },
    {
      id: 'e3-synopsis',
      title: 'Study Synopsis',
      status: 'built',
      readerPath: 'reader/e3-synopsis.html',
      json: { displayIndex: [{ slug: 't-demo', number: '13.1', label: 'Table' }] }
    },
    { id: 'sap', title: 'Statistical Analysis Plan', status: 'planned', json: null }
  ];

  test('QC-SITE-013: the index reads the whole library, and records what each document calls a display (#42)', () => {
    const usage = displayUsage(library);
    expect(usage.get('t-demo').map((entry) => entry.id)).toEqual(['csr', 'e3-synopsis']);
    // The same display, two assemblies, two numbers — which is exactly why the
    // number cannot be a property of the display.
    expect(usage.get('t-demo').map((entry) => entry.number)).toEqual(['14.3.1.1', '13.1']);
    expect(usage.get('t-solo').map((entry) => entry.title)).toEqual(['Clinical Study Report']);
    // A planned document places nothing, and an unplaced display is absent
    // rather than present-and-empty.
    expect(usage.has('t-missing')).toBe(false);
    expect(displayUsage([]).size).toBe(0);
    expect(displayUsage().size).toBe(0);
  });

  test('QC-SITE-013: the display page lists every document that places it, and its number there (#42)', () => {
    const html = renderDisplayPage({
      config,
      display: bySlug['t-demo'],
      evidence: null,
      requirements: {},
      usedIn: displayUsage(library).get('t-demo')
    });
    expect(html).toContain('Used in');
    expect(html).toContain('Clinical Study Report');
    expect(html).toContain('Study Synopsis');
    // Each document's own link, and each document's own number for this display.
    expect(html).toContain('href="../reader/index.html"');
    expect(html).toContain('href="../reader/e3-synopsis.html"');
    expect(html).toContain('14.3.1.1');
    expect(html).toContain('13.1');
  });

  test('QC-SITE-013: a display no document places says so rather than showing an empty row (#42)', () => {
    const html = renderDisplayPage({
      config,
      display: bySlug['t-missing'],
      evidence: null,
      requirements: {},
      usedIn: displayUsage(library).get('t-missing')
    });
    expect(html).toContain('Used in');
    expect(html).toContain('No document places it yet');
    expect(html).not.toContain('undefined');
  });

  test('QC-SITE-013: the gallery card names the documents that place each display (#42)', () => {
    const html = renderGallery({ config, displays, usage: displayUsage(library) });
    expect(html).toContain('Clinical Study Report');
    expect(html).toContain('Study Synopsis');
    // A gallery built without the index is the gallery it has always been.
    expect(renderGallery({ config, displays })).toContain('Demo display');
  });

  test('QC-SITE-014: a display placed in a document hyperlinks to its entry in the store (#42)', () => {
    const html = renderCsrReader({ config, csr: loadCsr(repoDir), displays, ards, traceIndex });
    // The same gesture a text block already offers — a trailing reference line
    // whose link is the object's page in its own library. Inside the demo app
    // the link is absorbed into a pane switch; on the standalone reader page it
    // navigates. One href, both behaviours, no second interaction to learn.
    expect(html).toContain('class="display-ref"');
    expect(html).toMatch(/<a href="\.\.\/gallery\/t-demo\.html">/);
    // Written the way core.js recognises a pane crossing, or the app would leave
    // the demo to show a display it is already holding.
    expect(resolveAppLink('../gallery/t-demo.html')).toMatchObject({
      tab: 'displays',
      display: 't-demo'
    });
  });
});
