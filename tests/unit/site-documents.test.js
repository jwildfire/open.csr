// The demo site follows the template LIBRARY, not one member of it (#32).
//
// #29 made library/templates/ plural and CI assembles every object in it, but
// the site read docs/assembled/csr.json and one configured template directory —
// so the second document was built, committed, published and unreachable.
//
// Two properties are worth a guard, and neither is "the synopsis renders":
//
//   1. A THIRD template object costs nothing. The fixture below invents one that
//      appears in no config, and asserts it acquires a reader, a template page, a
//      switcher entry and a home-page card anyway. A test that only exercised the
//      two objects the repo happens to hold would pass just as well against a
//      site with the synopsis hard-coded into it.
//   2. A document says whether its prose has been reviewed. The approval gate
//      holds GENERATED-tier blocks only, so an unapproved boilerplate block
//      assembles into the document — "assembled" is not "reviewed", and the
//      difference is invisible on the page unless it is stated there.

import { describe, expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import {
  documentBasename,
  listTemplateObjects,
  loadDocuments,
  builtDocuments,
  proseState,
  renderDocumentSwitcher,
  renderProseNotice,
  renderHome,
  renderCsrReader,
  buildTraceIndex,
  loadDisplays,
  loadTextBlocks
} from '../../scripts/site-lib.mjs';
import { buildNavTree, renderSidebar } from '../../scripts/app-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '..', '..');

// A repo tree holding three template objects, of which the config declares one.
// `third` is the point: nothing in the site knows it exists.
function fixtureRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'opencsr-docs-'));
  const write = (relative, body) => {
    const file = path.join(dir, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, typeof body === 'string' ? body : JSON.stringify(body));
  };
  const assembled = (id, title, blocks) => ({
    template: { id, title, version: '1.0.0', source: `spec for ${id}`, sectionCount: 2 },
    sections: [
      { number: '1', title: 'One', slug: 'one', level: 1, populated: true },
      { number: '2', title: 'Two', slug: 'two', level: 1, populated: false }
    ],
    displayIndex: [],
    textBlocks: blocks
  });
  const block = (id, state, included = true) => ({
    id,
    title: id,
    approval: { state, by: null, at: null },
    included
  });

  for (const id of ['ich-e3', 'e3-synopsis', 'third']) {
    write(`library/templates/${id}/sections.yaml`, `title: ${id}\nsections:\n  - number: '1'\n`);
    write(`library/templates/${id}/assembly.yaml`, `slots: []\n`);
  }
  write('docs/assembled/csr.json', assembled('ich-e3', 'ICH E3 Clinical Study Report', [
    block('TXT-E3-0001', 'approved'),
    block('TXT-E3-0002', 'approved'),
    block('TXT-E3-0003', 'draft', false)
  ]));
  write('docs/assembled/e3-synopsis.json', assembled('e3-synopsis', 'ICH E3 Annex I Study Synopsis', [
    block('TXT-SYN-0101', 'draft'),
    block('TXT-SYN-0102', 'draft')
  ]));
  write('docs/assembled/third.json', assembled('third', 'A Third Document', [
    block('TXT-3RD-0001', 'approved'),
    block('TXT-3RD-0002', 'draft')
  ]));

  const config = {
    documents: [
      { id: 'csr', title: 'Clinical Study Report', abbr: 'CSR', template: 'ich-e3', status: 'built' },
      { id: 'sap', title: 'Statistical Analysis Plan', template: null, status: 'planned' }
    ]
  };
  return { dir, config };
}

const { dir: fixtureDir, config: fixtureConfig } = fixtureRepo();
const fixtureDocs = loadDocuments(fixtureDir, fixtureConfig);

describe('the document set', () => {
  test('QC-SITE-009: every assembled template object becomes a document, declared or not (#32)', () => {
    expect(listTemplateObjects(fixtureDir)).toEqual(['e3-synopsis', 'ich-e3', 'third']);
    const built = builtDocuments(fixtureDocs).map((doc) => doc.templateId);
    // `third` appears in no config entry and still publishes.
    expect(built).toContain('third');
    expect(built).toHaveLength(3);
    expect(fixtureDocs.find((doc) => doc.templateId === 'third').declared).toBe(false);
  });

  test('QC-SITE-009: an undeclared template object is titled from its own model (#32)', () => {
    const third = fixtureDocs.find((doc) => doc.templateId === 'third');
    expect(third.title).toBe('A Third Document');
    expect(third.blurb).toBe('spec for third');
    // A declared document keeps the config's editorial title over the model's.
    expect(fixtureDocs.find((doc) => doc.templateId === 'ich-e3').title).toBe(
      'Clinical Study Report'
    );
  });

  test('QC-SITE-009: the primary document keeps the published URLs and the rest sit beside it (#32)', () => {
    const [primary, ...rest] = builtDocuments(fixtureDocs);
    expect(primary.templateId).toBe('ich-e3');
    expect(primary.readerPath).toBe('reader/index.html');
    expect(primary.templatePath).toBe('templates/index.html');
    // Same directory depth for every document, so one set of ../ links serves all.
    for (const doc of rest) {
      expect(doc.readerPath).toBe(`reader/${doc.templateId}.html`);
      expect(doc.templatePath).toBe(`templates/${doc.templateId}.html`);
      expect(doc.readerPath.split('/')).toHaveLength(2);
    }
    expect(documentBasename('ich-e3')).toBe('csr');
    expect(documentBasename('third')).toBe('third');
  });

  test('QC-SITE-009: a planned document with no template object keeps its place (#32)', () => {
    const sap = fixtureDocs.find((doc) => doc.id === 'sap');
    expect(sap.status).toBe('planned');
    expect(sap.json).toBeNull();
  });

  test('QC-SITE-009: the switcher offers every other document from any document (#32)', () => {
    const html = renderDocumentSwitcher({
      documents: fixtureDocs,
      current: 'e3-synopsis',
      root: '../'
    });
    expect(html).toContain('href="../reader/index.html"');
    expect(html).toContain('href="../reader/third.html"');
    // The current document is marked, not linked to itself.
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('href="../reader/e3-synopsis.html"');
    // A single-document site gets no switcher at all.
    expect(renderDocumentSwitcher({ documents: [fixtureDocs[0]], current: 'csr' })).toBe('');
  });

  test('QC-SITE-009: a document not on screen is a link out, not a dead selection (#32)', () => {
    const tree = buildNavTree({
      config: fixtureConfig,
      documents: fixtureDocs,
      current: 'csr',
      root: '../'
    });
    const items = tree.groups.find((group) => group.id === 'documents').items;
    expect(items.map((item) => item.id)).toEqual(['csr', 'e3-synopsis', 'third', 'sap']);
    expect(items.find((item) => item.id === 'csr').href).toBeNull();
    expect(items.find((item) => item.id === 'e3-synopsis').href).toBe('../reader/e3-synopsis.html');
    // Only the document on screen carries section anchors — they are this page's.
    expect(items.find((item) => item.id === 'csr').sections.length).toBeGreaterThan(0);
    expect(items.find((item) => item.id === 'third').sections).toEqual([]);

    const sidebar = renderSidebar({ tree, active: 'documents', selected: { doc: 'csr' } });
    expect(sidebar).toContain('href="../reader/third.html"');
    // An ordinary link, so the app's click interception leaves it alone.
    expect(sidebar).not.toMatch(/data-nav-item="third"/);
  });

  test('QC-SITE-009: the home page lists the documents and links both of a document\'s pages (#32)', () => {
    const html = renderHome({
      config: fixtureConfig,
      displays: [],
      textBlocks: [],
      quality: { totalRequirements: 0, totalTests: 0, matrices: 0, suites: [] },
      documents: fixtureDocs
    });
    expect(html).toContain('A Third Document');
    expect(html).toContain('href="reader/third.html"');
    expect(html).toContain('href="templates/third.html"');
    // No documents at all and the panel is simply absent, not an empty shell.
    expect(
      renderHome({
        config: {},
        displays: [],
        textBlocks: [],
        quality: { totalRequirements: 0, totalTests: 0, matrices: 0, suites: [] }
      })
    ).not.toContain('The documents');
  });
});

describe('draft prose is disclosed where it is read', () => {
  test('QC-SITE-010: prose state is read off the assembled document, not asserted (#32)', () => {
    const synopsis = fixtureDocs.find((doc) => doc.templateId === 'e3-synopsis');
    expect(synopsis.prose).toMatchObject({ total: 2, unapproved: 2, draft: true });
    const csr = fixtureDocs.find((doc) => doc.templateId === 'ich-e3');
    // The excluded draft is not counted: it never reached the document.
    expect(csr.prose).toMatchObject({ total: 2, unapproved: 0, draft: false });
    // A document with one unapproved block of two is still draft.
    expect(fixtureDocs.find((doc) => doc.templateId === 'third').prose).toMatchObject({
      total: 2,
      unapproved: 1,
      draft: true
    });
    expect(proseState(null)).toMatchObject({ total: 0, draft: false });
  });

  test('QC-SITE-010: an unreviewed document says so above its first section (#32)', () => {
    const synopsis = fixtureDocs.find((doc) => doc.templateId === 'e3-synopsis');
    const notice = renderProseNotice(synopsis);
    expect(notice).toContain('Draft prose');
    expect(notice).toContain('not reviewed');
    expect(notice).toContain('All 2 prose blocks');
    expect(notice).toContain('callout warn');
    // And a reviewed document makes the opposite claim rather than saying nothing.
    const csr = fixtureDocs.find((doc) => doc.templateId === 'ich-e3');
    expect(renderProseNotice(csr)).toContain('approved');
    expect(renderProseNotice(csr)).not.toContain('Draft prose');
  });

  test('QC-SITE-010: the notice is on the rendered reader, before the document body (#32)', () => {
    const synopsis = fixtureDocs.find((doc) => doc.templateId === 'e3-synopsis');
    const html = renderCsrReader({
      config: fixtureConfig,
      csr: synopsis,
      displays: [],
      ards: {},
      traceIndex: buildTraceIndex([]),
      documents: fixtureDocs,
      root: '../'
    });
    expect(html.indexOf('Draft prose')).toBeGreaterThan(-1);
    expect(html.indexOf('Draft prose')).toBeLessThan(html.indexOf('<article class="csr-doc">'));
    // The reader titles itself from the document it was handed.
    expect(html).toContain('ICH E3 Annex I Study Synopsis');
  });

  test('QC-SITE-010: the switcher and the sidebar carry the same flag as the page (#32)', () => {
    const switcher = renderDocumentSwitcher({
      documents: fixtureDocs,
      current: 'csr',
      root: '../'
    });
    expect(switcher).toContain('draft prose');
    const tree = buildNavTree({ config: fixtureConfig, documents: fixtureDocs, current: 'csr' });
    const items = tree.groups.find((group) => group.id === 'documents').items;
    expect(items.find((item) => item.id === 'e3-synopsis').draftProse).toBe(true);
    expect(items.find((item) => item.id === 'csr').draftProse).toBe(false);
  });
});

describe('the repository this site is built from', () => {
  test('QC-SITE-009: this repo\'s own library is plural and every object is assembled (#32)', () => {
    const objects = listTemplateObjects(rootDir);
    expect(objects.length).toBeGreaterThan(1);
    const docs = loadDocuments(rootDir, JSON.parse(
      readFileSync(path.join(rootDir, 'site', 'config.json'), 'utf8')
    ));
    for (const id of objects) {
      const doc = docs.find((entry) => entry.templateId === id);
      expect(doc, `${id} has no document`).toBeTruthy();
      expect(doc.status, `${id} is not assembled — run scripts/assemble.mjs --all`).toBe('built');
    }
  });

  test('QC-SITE-010: the committed synopsis is unreviewed, and nothing in the site pretends otherwise (#32)', () => {
    const docs = loadDocuments(rootDir, JSON.parse(
      readFileSync(path.join(rootDir, 'site', 'config.json'), 'utf8')
    ));
    const synopsis = docs.find((doc) => doc.templateId === 'e3-synopsis');
    expect(synopsis.prose.unapproved).toBe(synopsis.prose.total);
    expect(synopsis.prose.total).toBeGreaterThan(0);
    expect(renderProseNotice(synopsis)).toContain('Draft prose');
  });
});
