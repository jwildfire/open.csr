// The Data section: what was measured (open.csr #76, R1 of the sidebar refactor).
//
// The pages are built from records that already exist — the vendored package's
// PROVENANCE.json and every current ARD's provenance envelope — so the tests
// check the reading and the indexing against the fixture repository, and the
// rendering for the links the user meeting asked for: from a display to the
// exact dataset it read, and from a dataset back to every display that read it.
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDataIndex,
  datasetHref,
  datasetStatus,
  laneLabel,
  loadDataPackage,
  renderDataPane,
  renderDatasetPage,
  renderLanesPage
} from '../../scripts/data-lib.mjs';
import { datasetLinks, loadDisplays, renderDisplayPage } from '../../scripts/site-lib.mjs';
import { APP_TABS, STUDY_TABS, buildNavTree, renderSidebar } from '../../scripts/app-lib.mjs';
import { TAB_IDS, isTab, resolveAppLink } from '../../site/demo/core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.join(here, '..', 'fixtures', 'site', 'repo');
const config = JSON.parse(readFileSync(path.join(repoDir, 'site', 'config.json'), 'utf8'));
const displays = loadDisplays(repoDir, config);
const data = loadDataPackage(repoDir, config);
const index = buildDataIndex({ datasets: data.datasets, displays });
const byId = Object.fromEntries(data.datasets.map((d) => [d.id, d]));

describe('the data registry and the package record', () => {
  test('QC-DATA-001: every registered dataset is read with its provenance, and the package carries its pinned commit (#76)', () => {
    expect(data.configured).toBe(true);
    expect(data.package.provenance.commit).toBe('0123456789abcdef0123456789abcdef01234567');
    expect(data.package.provenance.files).toBe(4);
    expect(data.package.dir).toBe('pipeline/inst/extdata/fixture-pkg');
    expect(byId.adae.vendored).toBe(true);
    expect(byId.adae.provenance.upstream_path).toBe('data/adam/fixture/adae.xpt');
    expect(byId.adae.provenance.sha256).toBe('cccc3333');
    expect(byId.adae.registered).toBe(true);
    expect(byId.adae.source).toBe('pipeline');
  });

  test('QC-DATA-001: a registered dataset with no vendored file is planned, a derived or alternate one is not a missing file, and a vendored file nobody registered is published with a warning (#76)', () => {
    expect(byId.advs.vendored).toBe(false);
    expect(datasetStatus(byId.advs, index)).toBe('planned');
    expect(data.warnings.some((w) => w.includes('advs is registered but'))).toBe(true);
    expect(byId.adcm.source).toBe('derived');
    expect(byId.adcm.derivedFrom).toBe('cm');
    expect(byId.adcm.vendored).toBe(false);
    expect(byId.adcm.provenance).toBeNull();
    expect(data.warnings.some((w) => w.includes('adcm is registered but'))).toBe(false);
    expect(byId.adex.source).toBe('alternate');
    expect(datasetStatus(byId.adex, index)).toBe('unread');
    expect(byId.dm).toBeDefined();
    expect(byId.dm.registered).toBe(false);
    expect(byId.dm.domain).toBe('sdtm');
    expect(data.warnings.some((w) => w.includes('dm is vendored but not registered'))).toBe(true);
    // A vendored file that shares a derived dataset's name is still reported, under its own id.
    expect(byId['adcm-file']).toBeDefined();
    expect(byId['adcm-file'].registered).toBe(false);
    expect(byId['adcm-file'].provenance.sha256).toBe('ffff6666');
    expect(data.warnings.some((w) => w.includes('adcm is vendored but not registered'))).toBe(true);
  });

  test('QC-DATA-001: a repository with no data registry renders the empty state rather than throwing (#76)', () => {
    const none = loadDataPackage(repoDir, {});
    expect(none.configured).toBe(false);
    expect(none.datasets).toEqual([]);
    const html = renderDataPane({ data: none, index: new Map() });
    expect(html).toContain('No data registry yet');
  });
});

describe('the reverse index: from a dataset to every display that read it', () => {
  test('QC-DATA-002: a display whose current ARD names a dataset appears under it with the iteration, rows and hash that ARD recorded (#76)', () => {
    const adae = index.get('adae');
    expect(adae.readBy.map((use) => use.slug)).toEqual(['t-demo']);
    expect(adae.readBy[0]).toMatchObject({
      version: 'v002',
      hash: 'sha256:cccc3333',
      n_row: 1191,
      source_pkg: 'pharmaverseadam'
    });
    expect(adae.rows).toEqual([1191]);
    expect(adae.hashes).toEqual(['sha256:cccc3333']);
    expect(index.get('adsl').readBy[0].n_row).toBe(254);
    expect(datasetStatus(byId.adae, index)).toBe('ok');
  });

  test('QC-DATA-002: a dataset no current ARD names has an empty index entry, and a dataset an ARD names that the registry does not know still gets one (#76)', () => {
    expect(index.get('advs').readBy).toEqual([]);
    const stray = buildDataIndex({
      datasets: [],
      displays: [{ slug: 't-x', title: 'X', outputs: { current: { version: 'v001', ardHash: 'sha256:ff', ard: { provenance: { data: [{ dataset: 'adzz', hash: 'sha256:zz', n_row: 3 }] } } } } }]
    });
    expect(stray.get('adzz').readBy[0]).toMatchObject({ slug: 't-x', version: 'v001', n_row: 3 });
  });
});

describe('the pages', () => {
  const pane = renderDataPane({ data, index, root: '../' });

  test('QC-DATA-003: the Data pane carries the package, one section per dataset with its facts, and the lanes, each addressable by id (#76)', () => {
    expect(pane).toContain('id="package"');
    expect(pane).toContain('0123456789abcdef0123456789abcdef01234567');
    expect(pane).toContain('Rscript qc/vendor-fixture.R --check');
    for (const dataset of data.datasets) expect(pane).toContain(`id="dataset-${dataset.id}"`);
    expect(pane).toContain('id="lanes"');
    // The upstream path links into the source repository at the pinned commit.
    expect(pane).toContain(
      'https://github.com/example/fixture-scripts/blob/0123456789abcdef0123456789abcdef01234567/data/adam/fixture/adae.xpt'
    );
    // A dataset that reads a display links to it — in the form the app absorbs.
    expect(pane).toContain('href="../gallery/t-demo.html"');
    expect(pane).toContain('cccc333');
    // The unvendored, the alternate-only and the unregistered say so.
    expect(pane).toContain('not vendored');
    expect(pane).toContain(laneLabel('pharmaverseadam'));
    expect(pane).toContain('vendored but not registered');
    // The notes are the registry's, and point at the contract.
    expect(pane).toContain('TRT01A from ADSL.');
    expect(pane).toContain('docs/docs-design-contracts.html');
    // A derived dataset links what it was derived from.
    expect(pane).toContain(`href="${datasetHref('cm', '../')}"`);
  });

  test('QC-DATA-003: the lanes section names both packagings and lists only the variables that differ, from the agreement record (#76)', () => {
    const lanes = renderLanesPage({ data, root: '../' });
    expect(lanes).toContain("fixture: the pilot package");
    expect(lanes).toContain('fixture: the re-derivation');
    expect(lanes).toContain('AGEGR1');
    expect(lanes).toContain('&lt;65 &gt; 18-64 (33)');
    expect(lanes).not.toMatch(/<td class="mono">AGE<\/td>/);
    expect(lanes).toContain('All 1 compared variables agree on every record.');
  });

  test('QC-DATA-003: a dataset has a standalone page with the same facts and the read-by table (#76)', () => {
    const html = renderDatasetPage({ data, dataset: byId.adae, index, root: '../' });
    expect(html).toContain('<h1>Adverse events</h1>');
    expect(html).toContain('href="../gallery/t-demo.html"');
    expect(html).toContain('v002');
    expect(html).toContain('1191');
    expect(html).toContain('<a href="index.html">Data</a>');
  });
});

describe('the links from a display to its data', () => {
  const display = displays.find((entry) => entry.slug === 't-demo');

  test('QC-DATA-004: given the index, the display header links each dataset to its page with the hash and rows this iteration recorded; without it, the labels print as before (#76)', () => {
    const linked = renderDisplayPage({ config, display, evidence: null, requirements: {}, datasets: index });
    expect(linked).toContain('href="../data/adae.html"');
    expect(linked).toContain('href="../data/adsl.html"');
    expect(linked).toContain('title="1191 rows · sha256:cccc3333"');
    expect(linked).toContain('cccc333');
    const plain = renderDisplayPage({ config, display, evidence: null, requirements: {} });
    expect(plain).not.toContain('data/adae.html');
    expect(plain).toContain('<span class="mono">adae</span>');
  });

  test('QC-DATA-004: a dataset the header names but this iteration’s ARD does not is still linked, and says so (#76)', () => {
    const html = datasetLinks(['adae', 'adxx'], { ard: display.outputs.current.ard });
    expect(html).toContain('href="../data/adxx.html"');
    expect(html).toContain('not named in this iteration');
  });
});

describe('the explorer and the deep links', () => {
  test('QC-DATA-005: Data is a view of the study, after Values, and a collection in the tree with one item per dataset (#76)', () => {
    expect(TAB_IDS).toContain('data');
    expect(isTab('data')).toBe(true);
    expect(STUDY_TABS.map((tab) => tab.id)).toEqual(['data', 'metadata', 'text', 'pipeline', 'displays', 'values', 'documents']);
    expect(APP_TABS.find((tab) => tab.id === 'data').href).toBe('../data/index.html');
    const tree = buildNavTree({
      config,
      displays,
      datasets: [
        { id: 'adae', title: 'Adverse events', status: 'ok' },
        { id: 'advs', title: 'Vital signs', status: 'planned' },
        { id: 'lanes', title: 'Source lanes', status: 'ok' }
      ]
    });
    const group = tree.groups.find((entry) => entry.id === 'data');
    expect(tree.groups.map((entry) => entry.id)).toEqual(['documents', 'displays', 'text', 'values', 'data', 'metadata', 'pipeline']);
    expect(group.items.map((item) => [item.id, item.number, item.status])).toEqual([
      ['adae', 'adae', 'ok'],
      ['advs', 'advs', 'planned'],
      ['lanes', 'lanes', 'ok']
    ]);
    const html = renderSidebar({ tree, active: 'data', selected: { focus: 'dataset-adae' } });
    expect(html).toContain('data-nav-group-root="data"');
    expect(html).toContain('data-nav-group="data" data-nav-item="adae"');
    expect(html).toMatch(/data-nav-item="advs" aria-disabled="true"/);
  });

  test('QC-DATA-005: a dataset permalink is absorbed into the Data view with that dataset in focus, and the lanes and index likewise (#76)', () => {
    expect(resolveAppLink('../data/adsl.html')).toEqual({ tab: 'data', focus: 'dataset-adsl' });
    expect(resolveAppLink('../../data/adsl.html')).toEqual({ tab: 'data', focus: 'dataset-adsl' });
    expect(resolveAppLink('../data/lanes.html')).toEqual({ tab: 'data', focus: 'lanes' });
    expect(resolveAppLink('../data/index.html')).toEqual({ tab: 'data', focus: null });
    expect(resolveAppLink('../data/index.html#package')).toEqual({ tab: 'data', focus: 'package' });
  });
});
