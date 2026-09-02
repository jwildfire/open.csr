// Every artifact links what it was made from, and what was made from it, both
// ways (open.csr #78, R3 of the sidebar refactor).
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildTraceIndex,
  loadCsr,
  loadDisplays,
  loadTextBlocks,
  renderBlockInputs,
  renderCsrReader,
  renderDisplayPage,
  renderDocumentInputs,
  renderTextLibrary
} from '../../scripts/site-lib.mjs';
import { buildNavTree, renderSidebar, renderValuesPane } from '../../scripts/app-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.join(here, '..', 'fixtures', 'site', 'repo');
const config = JSON.parse(readFileSync(path.join(repoDir, 'site', 'config.json'), 'utf8'));
const displays = loadDisplays(repoDir, config);
const textBlocks = loadTextBlocks(repoDir, config);
const ards = Object.fromEntries(
  displays.filter((d) => d.outputs.current?.ard).map((d) => [d.slug, d.outputs.current.ard])
);
const traceIndex = buildTraceIndex(displays);
const demo = displays.find((d) => d.slug === 't-demo');

describe('a display links what it was built against and what was built from it', () => {
  test('QC-LINK-001: given the links, the header names the analysis set from the study model, the specification history, the environment, the blocks that bind it and the values sourced from it, each a link; without them the header prints as before (#78)', () => {
    const links = {
      studyId: 'CDISCPILOT01',
      analysisSet: { name: 'safety', label: 'Safety Analysis Set', flag: 'SAFFL' },
      group: 'TRT01A',
      iterations: 2,
      environment: { r: '4.3.3', os: 'darwin' },
      textBlocks: ['TXT-E3-1202'],
      values: ['randomised-n']
    };
    const html = renderDisplayPage({ config, display: demo, evidence: null, requirements: {}, links });
    expect(html).toContain('<a href="../metadata/study.html">Safety Analysis Set</a>');
    expect(html).toContain('SAFFL');
    expect(html).toContain('grouped by <span class="mono">TRT01A</span>');
    expect(html).toContain('href="../metadata/specs.html#spec-t-demo">2 iterations</a>');
    expect(html).toContain('<a href="../metadata/environments.html">R 4.3.3</a>');
    expect(html).toContain('href="../text/index.html#TXT-E3-1202"');
    expect(html).toContain('href="../values/index.html#randomised-n"');
    const plain = renderDisplayPage({ config, display: demo, evidence: null, requirements: {} });
    expect(plain).not.toContain('metadata/study.html');
    expect(plain).not.toContain('Bound by');
    const bare = renderDisplayPage({ config, display: demo, evidence: null, requirements: {}, links: { studyId: 'S', iterations: 1, textBlocks: [], values: [] } });
    expect(bare).toContain('No text block binds it');
    expect(bare).toContain('No value is sourced from it');
  });
});

describe('a document links what it was built from', () => {
  const inputs = {
    template: { id: 'ich-e3', title: 'ICH E3 Clinical Study Report', version: '1.0.0' },
    study: { id: 'CDISCPILOT01', file: 'library/study.yaml', cutoff: '2014-07-01' },
    displays: [{ slug: 't-demo', number: '14.3.1', title: 'Demo display', iteration: 'v002', ardHash: 'sha256:abc', datasets: [{ dataset: 'adae', hash: 'sha256:cccc3333', n_row: 1191 }] }],
    datasets: [{ dataset: 'adae', hash: 'sha256:cccc3333', n_row: 1191, readBy: ['t-demo'] }],
    textBlocks: [{ id: 'TXT-E3-1202', section: '12.2.1', tier: 'parameterized', state: 'approved', included: true, displays: ['t-demo'], values: [] }, { id: 'TXT-E3-9999', section: '9', tier: 'generated', state: 'draft', included: false, displays: [], values: ['randomised-n'] }],
    values: ['randomised-n']
  };

  test('QC-LINK-002: the inputs panel links the document model, the study model, every placed display with its iteration, every block with its state, every value cited and every dataset reached (#78)', () => {
    const html = renderDocumentInputs(inputs, { root: '../' });
    expect(html).toContain('<a href="../metadata/models.html">ICH E3 Clinical Study Report</a>');
    expect(html).toContain('<a href="../metadata/study.html">CDISCPILOT01</a>');
    expect(html).toContain('href="../gallery/t-demo.html"');
    expect(html).toContain('v002');
    expect(html).toContain('href="../text/index.html#TXT-E3-1202"');
    expect(html).toContain('href="../text/index.html#TXT-E3-9999"');
    expect(html).toContain('excluded');
    expect(html).toContain('href="../values/index.html#randomised-n"');
    expect(html).toContain('href="../data/adae.html"');
    expect(html).toContain('1191 rows · cccc333');
    expect(renderDocumentInputs(null)).toBe('');
  });

  test('QC-LINK-002: the Reader carries the panel above the text and renders the provenance appendix as links to the display, each dataset and the environment (#78)', () => {
    const csr = loadCsr(repoDir);
    const json = {
      ...csr.json,
      inputs,
      sections: csr.json.sections.map((section, index) =>
        index === 0
          ? {
              ...section,
              provenance: {
                displays: [
                  { slug: 't-demo', number: '14.3.1', title: 'Demo display', specHash: 'sha256:aaaa1111', displayHash: 'sha256:bbbb2222', data: [{ dataset: 'adae', n_row: 1191, hash: 'sha256:cccc3333' }], environment: { r: '4.3.3' }, gitCommit: 'abc1234def', created: '2026-07-25T00:00:00Z' }
                ]
              }
            }
          : section
      )
    };
    const html = renderCsrReader({ config, csr: { ...csr, json }, displays, ards, traceIndex, textBlocks, root: '../' });
    expect(html).toContain('class="doc-inputs"');
    expect(html.indexOf('doc-inputs')).toBeLessThan(html.indexOf('<div class="reader">'));
    expect(html).toContain('<a class="mono" href="../gallery/t-demo.html">t-demo</a>');
    expect(html).toContain('<a class="mono" href="../data/adae.html">adae</a>');
    expect(html).toContain('<a href="../metadata/environments.html">R 4.3.3</a>');
    expect(html).toContain('abc1234');
  });
});

describe('a text block lists its inputs, derived from its bindings', () => {
  test('QC-LINK-003: the card lists each display the block binds with the iteration and ARD hash resolved against, the values it cites, its section and its approval, each a link (#78)', () => {
    const block = textBlocks.find((entry) => entry.id === 'TXT-E3-1202');
    const html = renderBlockInputs(block, { ards, traceIndex, root: '../' });
    expect(html).toContain('<h4>Inputs</h4>');
    expect(html).toContain('href="../gallery/t-demo.html"');
    expect(html).toContain('v002');
    expect(html).toContain('href="../metadata/models.html">§12.2.1</a>');
    expect(html).toContain('href="../metadata/approvals.html"');
    const library = renderTextLibrary({ textBlocks, ards, traceIndex });
    expect(library).toContain('<h4>Inputs</h4>');
  });

  test('QC-LINK-003: a value cited is listed, and a declared display the block binds nothing from is named as drift rather than hidden (#78)', () => {
    const block = { id: 'TXT-X', exists: true, tier: 'parameterized', e3Section: '10.1', body: 'There were {{value:randomised-n}} subjects.', bindings: [], displays: ['t-demo'], approval: { state: 'draft' } };
    const html = renderBlockInputs(block, { ards, traceIndex, root: '../' });
    expect(html).toContain('href="../values/index.html#randomised-n"');
    expect(html).toContain('Declares <span class="mono">t-demo</span> but binds nothing from it.');
  });
});

describe('values and the explorer', () => {
  test('QC-LINK-004: the values pane links the arm a source address names to the study model, the data behind its display, and the documents that place the blocks citing it (#78)', () => {
    const store = {
      values: [
        { id: 'safety-n-high', label: 'Safety N, high dose', kind: 'ard', value: 84, formatted: '84', source: { address: 't-demo:any_ae:N;group=Xanomeline High Dose', display: 't-demo', analysis: 'any_ae', iteration: 'v002', ard_file: 'outputs/t-demo/v002/ard.json', ard_hash: 'sha256:abc' } },
        { id: 'sum', label: 'A sum', kind: 'derived', value: 1, formatted: '1', derivation: { op: 'sum', inputs: ['safety-n-high', 'safety-n-high'] } }
      ]
    };
    const usage = new Map([['safety-n-high', ['TXT-E3-1202']]]);
    const html = renderValuesPane({
      store,
      usage,
      datasetsByDisplay: new Map([['t-demo', ['adae', 'adsl']]]),
      documentsByBlock: new Map([['TXT-E3-1202', [{ id: 'csr', title: 'Clinical Study Report', readerPath: 'reader/index.html' }]]]),
      root: '../'
    });
    expect(html).toContain('arm <a href="../metadata/study.html">Xanomeline High Dose</a>');
    expect(html).toContain('href="../data/adae.html"');
    expect(html).toContain('href="../data/adsl.html"');
    expect(html).toContain('in <a href="../reader/index.html">Clinical Study Report</a>');
    // The arm needs no map, so it is always linked; the data and document links need theirs.
    const plain = renderValuesPane({ store, usage });
    expect(plain).toContain('arm <a href="../metadata/study.html">Xanomeline High Dose</a>');
    expect(plain).not.toContain('data/adae.html');
    expect(plain).not.toContain('reader/index.html');
  });

  test('QC-LINK-005: a document whose build failed a gate is flagged in the explorer, and one that passed is not (#78)', () => {
    const failed = { id: 'csr', title: 'CSR', status: 'built', primary: true, json: { ok: false, sections: [] } };
    const passed = { id: 'syn', title: 'Synopsis', status: 'built', json: { ok: true, sections: [] } };
    const tree = buildNavTree({ config, documents: [failed, passed], current: 'csr' });
    expect(tree.groups[0].items.map((item) => [item.id, item.gateOk])).toEqual([['csr', false], ['syn', true]]);
    const html = renderSidebar({ tree, active: 'documents', selected: { doc: 'csr' } });
    expect(html).toMatch(/data-nav-item="csr"[^]*?gates fail/);
    expect(html).not.toMatch(/data-nav-item="syn"[^]*?gates fail[^]*?data-nav-group-root="displays"/);
  });
});
