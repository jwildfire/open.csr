// A flow diagram on every element (open.csr #83, R7).
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderFlow } from '../../scripts/flow-lib.mjs';
import { buildTraceIndex, displayFlow, loadDisplays, loadTextBlocks, renderBlockInputs, renderDisplayPage, renderDocumentInputs } from '../../scripts/site-lib.mjs';
import { renderValuesPane } from '../../scripts/app-lib.mjs';
import { buildDataIndex, datasetFlow, loadDataPackage, renderDatasetPage } from '../../scripts/data-lib.mjs';
import { loadPipeline, renderFunctionPage } from '../../scripts/pipeline-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '..', '..');
const repoDir = path.join(here, '..', 'fixtures', 'site', 'repo');
const rootConfig = JSON.parse(readFileSync(path.join(rootDir, 'site', 'config.json'), 'utf8'));
const config = { ...JSON.parse(readFileSync(path.join(repoDir, 'site', 'config.json'), 'utf8')), repoUrl: 'https://github.com/example/repo', sourceBranch: 'dev' };
const displays = loadDisplays(repoDir, config);
const textBlocks = loadTextBlocks(repoDir, config);
const ards = Object.fromEntries(displays.filter((d) => d.outputs.current?.ard).map((d) => [d.slug, d.outputs.current.ard]));
const traceIndex = buildTraceIndex(displays);
const demo = displays.find((d) => d.slug === 't-demo');
const dataPackage = loadDataPackage(repoDir, config);
const dataIndex = buildDataIndex({ datasets: dataPackage.datasets, displays });

describe('the renderer', () => {
  test('QC-FLOW-001: three lanes, every box a link when it has one, sub-lines kept, empty lanes say so, nothing external (#83)', () => {
    const html = renderFlow({
      label: 'A test flow',
      inputs: [{ label: 'adae', sub: '1191 rows', href: '../data/adae.html', kind: 'data' }],
      steps: [{ label: 'build_ard()', href: '../pipeline/build-ard.html', kind: 'fn' }],
      outputs: []
    });
    expect(html).toContain('aria-label="A test flow"');
    expect(html).toContain('<div class="flow-lane-label">Inputs</div>');
    expect(html).toContain('<div class="flow-lane-label">Function</div>');
    expect(html).toContain('<div class="flow-lane-label">Outputs</div>');
    expect(html).toContain('<a class="flow-label" href="../data/adae.html">adae</a>');
    expect(html).toContain('<span class="flow-sub">1191 rows</span>');
    expect(html).toContain('flow-box flow-fn');
    expect(html).toContain('no outputs recorded');
    expect((html.match(/class="flow-arrow"/g) || []).length).toBe(2);
    expect(html).not.toMatch(/https?:\/\//);
    expect(renderFlow({ inputs: [{ label: 'x' }] })).toContain('<span class="flow-label">x</span>');
  });
});

describe('a display', () => {
  test('QC-FLOW-002: the flow lists the datasets with rows and hash, the specs and the study model, the four functions, and the iteration\'s files (#83)', () => {
    const html = displayFlow(demo, { config, links: { analysisSet: { name: 'safety', label: 'Safety Analysis Set' } }, datasets: dataIndex, root: '../' });
    expect(html).toContain('<a class="flow-label" href="../data/adae.html">adae</a>');
    expect(html).toContain('1191 rows · cccc333');
    expect(html).toContain('analysis.yaml');
    expect(html).toContain('href="../metadata/specs.html#spec-t-demo"');
    expect(html).toContain('Safety Analysis Set');
    for (const fn of ['prepare-data', 'build-ard', 'render-display', 'render-rtf']) expect(html).toContain(`href="../pipeline/${fn}.html"`);
    expect(html).toContain('regenerate(&#39;t-demo&#39;)');
    expect(html).toContain('ard.json');
    expect(html).toContain('v002');
    expect(html).toContain('href="https://github.com/example/repo/blob/dev/outputs/t-demo/v002/ard.json"');
    expect(html).toContain('manifest.json');
    const page = renderDisplayPage({ config, display: demo, evidence: null, requirements: {}, datasets: dataIndex });
    expect(page).toContain('aria-label="How t-demo was made"');
    const missing = displays.find((d) => d.slug === 't-missing');
    expect(displayFlow(missing, { config })).toBe('');
  });
});

describe('a value, a text block, a document', () => {
  test('QC-FLOW-003: a value flows from one ARD row or its inputs through regenerate_values() to its store entry; a block through the renderer into the documents that place it; a document through the assembler\'s gates into its JSON and HTML (#83)', () => {
    const store = {
      values: [
        { id: 'safety-n-high', label: 'Safety N', kind: 'ard', value: 84, formatted: '84', source: { address: 't-demo:any_ae:N;group=Xanomeline High Dose', display: 't-demo' } },
        { id: 'sum', label: 'A sum', kind: 'derived', value: 1, formatted: '1', derivation: { op: 'sum', inputs: ['safety-n-high', 'safety-n-high'] } }
      ]
    };
    const values = renderValuesPane({ store, usage: new Map(), root: '../', config });
    expect(values).toContain('aria-label="How safety-n-high was made"');
    expect(values).toContain('<a class="flow-label" href="../gallery/t-demo.html">t-demo</a>');
    expect(values).toContain('href="../pipeline/regenerate-values.html"');
    expect(values).toContain('href="https://github.com/example/repo/blob/dev/outputs/values/values.json"');
    expect(values).toContain('aria-label="How sum was made"');
    expect(values).toContain('sum(…)');
    const block = textBlocks.find((entry) => entry.id === 'TXT-E3-1202');
    const card = renderBlockInputs(block, { ards, traceIndex, root: '../', documentsByBlock: new Map([['TXT-E3-1202', [{ id: 'csr', title: 'Clinical Study Report', readerPath: 'reader/index.html' }]]]) });
    expect(card).toContain('aria-label="How TXT-E3-1202 is rendered"');
    expect(card).toContain('<a class="flow-label" href="../gallery/t-demo.html">t-demo</a>');
    expect(card).toContain('renderBlock()');
    expect(card).toContain('<a class="flow-label" href="../reader/index.html">Clinical Study Report</a>');
    const inputs = { template: { id: 'ich-e3', title: 'ICH E3 Clinical Study Report', version: '1.0.0' }, study: { id: 'CDISCPILOT01' }, displays: [{ slug: 't-demo' }], datasets: [], textBlocks: [{ id: 'TXT-E3-1202', state: 'approved', included: true }, { id: 'TXT-E3-9999', state: 'draft', included: false }], values: ['randomised-n'] };
    const doc = renderDocumentInputs(inputs, { root: '../', config, basename: 'csr' });
    expect(doc).toContain('aria-label="How this document was assembled"');
    expect(doc).toContain('1 displays');
    expect(doc).toContain('2 text blocks');
    expect(doc).toContain('1 included');
    expect(doc).toContain('href="../pipeline/assemble.html"');
    expect(doc).toContain('href="https://github.com/example/repo/blob/dev/docs/assembled/csr.json"');
  });
});

describe('a dataset and a function', () => {
  test('QC-FLOW-004: a vendored dataset flows from its upstream file through vendoring and preparation to the prepared frame and the displays computed from it; a derived one from its source; a function from what it reads to what it writes (#83)', () => {
    const byId = Object.fromEntries(dataPackage.datasets.map((d) => [d.id, d]));
    const adae = datasetFlow(byId.adae, { index: dataIndex, data: dataPackage, root: '../' });
    expect(adae).toContain('href="https://github.com/example/fixture-scripts/blob/0123456789abcdef0123456789abcdef01234567/data/adam/fixture/adae.xpt"');
    expect(adae).toContain('blob aaaa · 100 bytes');
    expect(adae).toContain('vendor + verify');
    expect(adae).toContain('1 derivation');
    expect(adae).toContain('1191 rows · cccc333');
    expect(adae).toContain('1 display');
    const adcm = datasetFlow(byId.adcm, { index: dataIndex, data: dataPackage, root: '../' });
    expect(adcm).toContain('<a class="flow-label" href="../data/cm.html">cm</a>');
    expect(adcm).toContain('derive_adcm()');
    const page = renderDatasetPage({ data: dataPackage, dataset: byId.adae, index: dataIndex, root: '../' });
    expect(page).toContain('aria-label="How adae reaches a display"');
    const pipeline = loadPipeline(repoDir, { config: { ...config, pipeline: rootConfig.pipeline }, dataIndex, dataPackage, displays });
    const fn = renderFunctionPage('build-ard', { pipeline, root: '../' });
    expect(fn).toContain('aria-label="What build_ard() reads and writes"');
    expect(fn).toContain('<a class="flow-label" href="../metadata/specs.html">analysis.yaml</a>');
    expect(fn).toContain('ARD rows');
  });
});
