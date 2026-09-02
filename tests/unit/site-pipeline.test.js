// The Pipeline section and the explorer's three parts (open.csr #82, R6).
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPipeline, pipelineNavItems, renderFunctionPage, renderPipelineOverview, renderPipelinePane } from '../../scripts/pipeline-lib.mjs';
import { buildDataIndex, loadDataPackage } from '../../scripts/data-lib.mjs';
import { loadDisplays, loadDocuments } from '../../scripts/site-lib.mjs';
import { APP_TABS, GLOBAL_TABS, STUDY_TABS, buildNavTree, renderSidebar } from '../../scripts/app-lib.mjs';
import { TAB_IDS, isTab, resolveAppLink } from '../../site/demo/core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '..', '..');
const repoDir = path.join(here, '..', 'fixtures', 'site', 'repo');
const rootConfig = JSON.parse(readFileSync(path.join(rootDir, 'site', 'config.json'), 'utf8'));
const config = { ...JSON.parse(readFileSync(path.join(repoDir, 'site', 'config.json'), 'utf8')), pipeline: rootConfig.pipeline, repoUrl: 'https://github.com/example/repo', sourceBranch: 'dev' };
const displays = loadDisplays(repoDir, config);
const documents = loadDocuments(repoDir, config);
const dataPackage = loadDataPackage(repoDir, config);
const dataIndex = buildDataIndex({ datasets: dataPackage.datasets, displays });
const valueStore = { values: [{ id: 'randomised-n', label: 'Subjects randomised' }] };
const pipeline = loadPipeline(repoDir, { config, dataIndex, dataPackage, displays, valueStore, documents });

describe('the registry and the function pages', () => {
  test('QC-PIPE-001: every declared function is read with its kind, code, reads, writes, calls and gates, and lists what it produced from the records (#82)', () => {
    expect(pipeline.configured).toBe(true);
    expect(pipeline.functions.map((fn) => fn.id)).toEqual(['prepare-data', 'build-ard', 'render-display', 'render-rtf', 'regenerate', 'regenerate-values', 'assemble', 'site']);
    const regenerate = pipeline.functions.find((fn) => fn.id === 'regenerate');
    expect(regenerate.calls).toEqual(['prepare-data', 'build-ard', 'render-display', 'render-rtf']);
    expect(regenerate.codeHref).toBe('https://github.com/example/repo/blob/dev/pipeline/R/regenerate.R');
    // Every display with a current iteration, registered or not — the fixture's orphan included.
    expect(regenerate.produced.map((entry) => entry.label)).toEqual(['t-demo', 't-orphan']);
    const prepare = pipeline.functions.find((fn) => fn.id === 'prepare-data');
    expect(prepare.produced.map((entry) => entry.label).sort()).toEqual(['adae', 'adsl']);
    const values = pipeline.functions.find((fn) => fn.id === 'regenerate-values');
    expect(values.produced[0]).toMatchObject({ label: 'randomised-n', href: 'values/index.html#randomised-n' });
    const assemble = pipeline.functions.find((fn) => fn.id === 'assemble');
    expect(assemble.gates.length).toBe(7);
    expect(pipeline.warnings).toEqual([]);
    const html = renderFunctionPage('regenerate', { pipeline, root: '../' });
    expect(html).toContain('<h1><span class="mono">regenerate()</span></h1>');
    expect(html).toContain('href="https://github.com/example/repo/blob/dev/pipeline/R/regenerate.R"');
    expect(html).toContain('href="../pipeline/prepare-data.html"');
    expect(html).toContain('href="../gallery/t-demo.html"');
    expect(html).toContain('outputs/&lt;slug&gt;/vNNN/');
  });

  test('QC-PIPE-001: a call to an unregistered function is a warning, and no registry renders the empty state (#82)', () => {
    const odd = loadPipeline(repoDir, { config: { pipeline: { functions: [{ id: 'a', label: 'a()', calls: ['zz'] }] } } });
    expect(odd.warnings.some((w) => w.includes('a calls zz'))).toBe(true);
    const none = loadPipeline(repoDir, { config: {} });
    expect(none.configured).toBe(false);
    expect(renderPipelinePane({ pipeline: none })).toContain('No pipeline registry yet');
  });
});

describe('the explorer and the pane', () => {
  test('QC-PIPE-002: the explorer has three parts in the pipeline\'s order, each holding its groups, while the flat groups list still carries every group; the strip follows the same order (#82)', () => {
    const tree = buildNavTree({ config, displays, pipeline: pipelineNavItems(pipeline) });
    expect(tree.parts.map((part) => [part.id, part.groups])).toEqual([
      ['inputs', ['data', 'metadata', 'text']],
      ['pipeline', ['pipeline']],
      ['outputs', ['displays', 'values', 'documents']]
    ]);
    expect(tree.groups.map((group) => group.id)).toEqual(['documents', 'displays', 'text', 'values', 'data', 'metadata', 'pipeline']);
    const group = tree.groups.find((entry) => entry.id === 'pipeline');
    expect(group.items.map((item) => [item.id, item.number])).toContainEqual(['regenerate', 'R']);
    const html = renderSidebar({ tree, active: 'pipeline', selected: { focus: 'function-regenerate' } });
    const order = ['data-nav-part="inputs"', 'data-nav-group-root="data"', 'data-nav-group-root="metadata"', 'data-nav-group-root="text"', 'data-nav-part="pipeline"', 'data-nav-group-root="pipeline"', 'data-nav-part="outputs"', 'data-nav-group-root="displays"', 'data-nav-group-root="values"', 'data-nav-group-root="documents"'];
    const positions = order.map((needle) => html.indexOf(needle));
    expect(positions.every((pos) => pos >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html).toContain('data-nav-group="pipeline" data-nav-item="regenerate"');
    expect(STUDY_TABS.map((tab) => tab.id)).toEqual(['data', 'metadata', 'text', 'pipeline', 'displays', 'values', 'documents']);
    expect(GLOBAL_TABS.map((tab) => tab.id)).toEqual(['templates']);
    expect(APP_TABS.map((tab) => tab.id)).toEqual(TAB_IDS);
  });

  test('QC-PIPE-003: the pane opens with the whole pipeline as one flow and carries every function by id; a function permalink is absorbed into the view with that function in focus (#82)', () => {
    const pane = renderPipelinePane({ pipeline, root: '../' });
    expect(pane).toContain('id="pipeline-overview"');
    for (const fn of pipeline.functions) expect(pane).toContain(`id="function-${fn.id}"`);
    const overview = renderPipelineOverview(pipeline, '../');
    expect(overview).toContain('href="../data/index.html"');
    expect(overview).toContain('href="../pipeline/assemble.html"');
    expect(overview).toContain('href="../reader/index.html"');
    expect(isTab('pipeline')).toBe(true);
    expect(resolveAppLink('../pipeline/regenerate.html')).toEqual({ tab: 'pipeline', focus: 'function-regenerate' });
    expect(resolveAppLink('../pipeline/index.html#pipeline-overview')).toEqual({ tab: 'pipeline', focus: 'pipeline-overview' });
  });
});
