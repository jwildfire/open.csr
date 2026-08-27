// The Demo surface: four panes, one shared selection (open.csr #113 A).
//
// Two things are worth testing here and they are tested separately. The pure
// selection rules in site/demo/core.js are the app's contract — what a link
// between panes means, and what a deep link decodes to. The renderers in
// scripts/app-lib.mjs are the composition — one pane per tab, one display
// visible, and a template model that derives its numbering instead of stating
// it.
//
// The renderers are given fixtures rather than the real repository so a failure
// points at the composition and not at whatever the pipeline last generated.

import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_TAB,
  TAB_IDS,
  applySelection,
  blockFromFragment,
  formatAppHash,
  isTab,
  parseAppHash,
  resolveAppLink,
  resolveDisplay,
  resolveDocument
} from '../../site/demo/core.js';
import {
  APP_TABS,
  GLOBAL_TABS,
  STUDY_TABS,
  buildNavTree,
  renderAppBar,
  renderAppPage,
  renderSidebar,
  navChildrenId,
  renderDocumentsPane,
  renderTablesPane,
  renderTemplatesPane,
  renderValuesPane
} from '../../scripts/app-lib.mjs';
import { loadAssembly, loadSections } from '../../scripts/template-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '..', '..');

// ---------------------------------------------------------------------------
// The shared selection
// ---------------------------------------------------------------------------

describe('the shared selection', () => {
  test('QC-DEMO-001: a selection round-trips through the URL hash (#1)', () => {
    const selection = { tab: 'displays', doc: null, display: 't-ae-overview', block: 'TXT-E3-1221', focus: 'bind-2' };
    expect(parseAppHash(formatAppHash(selection))).toEqual(selection);
  });

  test('QC-DEMO-001: empty parts are omitted from the hash so the common case stays short (#1)', () => {
    expect(formatAppHash({ tab: 'documents' })).toBe('#tab=documents');
  });

  test('QC-DEMO-002: an unknown or absent tab decodes to the default rather than an empty app (#1)', () => {
    expect(parseAppHash('#tab=nonsense').tab).toBe(DEFAULT_TAB);
    expect(parseAppHash('').tab).toBe(DEFAULT_TAB);
    expect(parseAppHash(undefined).tab).toBe(DEFAULT_TAB);
    expect(formatAppHash({ tab: 'nonsense' })).toBe(`#tab=${DEFAULT_TAB}`);
  });

  test('QC-DEMO-002: the tabs the requirements name are the tabs the app knows (#1)', () => {
    // Four in #113 A; Values joined them with the values store (#129 B).
    expect(TAB_IDS).toEqual(['documents', 'displays', 'text', 'values', 'templates']);
    expect(APP_TABS.map((tab) => tab.id)).toEqual(TAB_IDS);
    expect(TAB_IDS.every(isTab)).toBe(true);
    expect(isTab('gallery')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The absorption: a link between panes is a selection change
// ---------------------------------------------------------------------------

describe('pane crossings', () => {
  test('QC-DEMO-003: a display permalink resolves to the Displays view with that display selected (#1)', () => {
    expect(resolveAppLink('../gallery/t-ae-overview.html')).toEqual({
      tab: 'displays',
      display: 't-ae-overview',
      focus: null
    });
  });

  test('QC-DEMO-003: each standalone permalink resolves to the view that replaced it (#1)', () => {
    // The directories keep their v0 names because the evidence pages and the
    // trace panel link to them; only the vocabulary changed.
    expect(resolveAppLink('../reader/index.html').tab).toBe('documents');
    expect(resolveAppLink('../gallery/index.html').tab).toBe('displays');
    expect(resolveAppLink('../text/index.html').tab).toBe('text');
    expect(resolveAppLink('../templates/index.html').tab).toBe('templates');
  });

  test('QC-DEMO-003: a crossing carries the text block named in the fragment (#1)', () => {
    expect(resolveAppLink('../text/index.html#TXT-E3-1221')).toEqual({
      tab: 'text',
      block: 'TXT-E3-1221',
      focus: 'TXT-E3-1221'
    });
    expect(blockFromFragment('#block-TXT-E3-1102')).toBe('TXT-E3-1102');
    expect(blockFromFragment('')).toBe(null);
  });

  test('QC-DEMO-003: the rule holds at any authored depth, because panes are written for their own (#1)', () => {
    expect(resolveAppLink('gallery/t-exposure.html')?.display).toBe('t-exposure');
    expect(resolveAppLink('../../gallery/t-exposure.html')?.display).toBe('t-exposure');
  });

  test('QC-DEMO-004: links that are not pane crossings are left to navigate (#1)', () => {
    // Quality and Design & Research stay separate surfaces (#113).
    expect(resolveAppLink('../quality/text.html')).toBe(null);
    expect(resolveAppLink('../docs/docs-design-design.html')).toBe(null);
    expect(resolveAppLink('https://github.com/jwildfire/open.csr')).toBe(null);
    expect(resolveAppLink('//example.org/x')).toBe(null);
    expect(resolveAppLink('mailto:someone@example.org')).toBe(null);
    expect(resolveAppLink('')).toBe(null);
    expect(resolveAppLink(null)).toBe(null);
  });

  test('QC-DEMO-004: a bare fragment stays in-pane scrolling and is never intercepted (#1)', () => {
    // The Text pane and the Reader both link within themselves this way;
    // intercepting those would break scrolling inside the visible pane.
    expect(resolveAppLink('#awaiting')).toBe(null);
    expect(resolveAppLink('#TXT-E3-1206')).toBe(null);
  });

  test('QC-DEMO-005: a crossing that names no display keeps the one already selected (#1)', () => {
    const current = { tab: 'displays', doc: null, display: 't-ae-common', block: null, focus: null };
    const next = applySelection(current, resolveAppLink('../reader/index.html'));
    expect(next).toEqual({
      // The crossing DOES name a document — `reader/index.html` is the primary
      // document's page (#36) — and it names no display, which is the property
      // under test: the display already selected survives the move.
      tab: 'documents',
      doc: 'index',
      display: 't-ae-common',
      block: null,
      focus: null
    });
  });

  test('QC-DEMO-005: applying nothing changes nothing (#1)', () => {
    const current = { tab: 'text', doc: null, display: 't-exposure', block: 'TXT-E3-1201', focus: null };
    expect(applySelection(current, null)).toBe(current);
  });

  test('QC-DEMO-006: a stale display slug degrades to the first available rather than a blank pane (#1)', () => {
    const available = ['t-disposition', 't-demographics'];
    expect(resolveDisplay('t-demographics', available)).toBe('t-demographics');
    expect(resolveDisplay('t-deleted', available)).toBe('t-disposition');
    expect(resolveDisplay(null, available)).toBe('t-disposition');
    expect(resolveDisplay('t-disposition', [])).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

describe('the app page', () => {
  const panes = [
    { id: 'documents', html: '<h2>Reader body</h2>' },
    { id: 'displays', html: '<h2>Tables body</h2>' },
    { id: 'text', html: '<h2>Text body</h2>' },
    { id: 'templates', html: '<h2>Templates body</h2>' }
  ];

  test('QC-DEMO-007: every pane is server-rendered and present, with exactly one visible (#1)', () => {
    const html = renderAppPage({ config: { study: { id: 'CDISCPILOT01' } }, panes });
    for (const pane of panes) {
      expect(html).toContain(`data-app-pane="${pane.id}"`);
      expect(html).toContain(pane.html);
    }
    // Hidden, not absent: the app client wires its listeners once at module
    // load, so a lazily injected pane would get none.
    expect((html.match(/ hidden>/g) || []).length).toBe(panes.length - 1);
  });

  test('QC-DEMO-007: the page carries no title or lede — content starts at the pane (#1)', () => {
    // demo-layout.md §1: the demo page is not a page about the application, it
    // is the application. A paragraph explaining the four views would outrank
    // the views themselves.
    const html = renderAppPage({ config: { study: { id: 'CDISCPILOT01' } }, panes });
    expect(html).not.toContain('app-head');
    expect(html).not.toContain('class="lede"');
    expect(html).not.toMatch(/<h1[ >]/);
  });

  test('QC-DEMO-007: panes do not collide with the shell tab controller (#1)', () => {
    const html = renderAppPage({ panes });
    // shell.html pairs .tab with .tab-panel by index across a whole .tabs group,
    // so the app's own containers must not use those class names or they desync
    // the inner per-display tabs.
    expect(html).not.toMatch(/class="tabs"/);
    expect(html).not.toMatch(/class="tab"/);
    expect(html).not.toMatch(/class="tab-panel/);
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('aria-labelledby="app-tab-documents"');
  });

  test('QC-DEMO-008: a tab with no rendered pane is dropped rather than rendered empty (#1)', () => {
    const html = renderAppPage({ panes: [{ id: 'documents', html: '<p>only pane</p>' }] });
    expect(html).toContain('data-app-pane="documents"');
    expect(html).not.toContain('data-app-pane="templates"');
  });
});

describe('the application strip', () => {
  const displays = [
    {
      slug: 't-ae-common',
      title: 'Common AEs',
      number: '14.3.1.3',
      version: 'v001',
      ardHash: 'sha256:1a2b3c4d5e6f7890'
    }
  ];

  test('QC-DEMO-016: the bar carries only what is not scoped to a study (#1)', () => {
    // Documents, Displays and Text belong to the study and live in the explorer.
    // Templates describe what a report of this kind IS, so they belong to no one
    // study and stay in the header.
    const html = renderAppBar({ config: { study: { id: 'CDISCPILOT01' } } });
    expect(html).toContain('data-app-tab="templates"');
    expect(html).toContain('href="../templates/index.html"');
    for (const id of ['documents', 'displays', 'text']) {
      expect(html).not.toContain(`data-app-tab="${id}"`);
    }
    expect(GLOBAL_TABS.map((tab) => tab.id)).toEqual(['templates']);
    expect(STUDY_TABS.map((tab) => tab.id)).toEqual(['documents', 'displays', 'text', 'values']);
  });

  test('QC-DEMO-016: a view in the bar is a real link, marked as navigation not as a control (#1)', () => {
    const html = renderAppBar({ active: 'templates' });
    expect(html).toContain('aria-current="page"');
    expect((html.match(/aria-current="page"/g) || []).length).toBe(1);
    // Navigation semantics, not tab semantics: these links change the URL and
    // work without the client, so announcing them as tabs would misdescribe them.
    expect(html).not.toContain('role="tab"');
    expect(html).not.toContain('aria-selected');
    expect(html).toContain('aria-label="Views"');
  });

  test('QC-DEMO-017: the bar carries the study, and a context index for the live readout (#1)', () => {
    const html = renderAppBar({ config: { study: { id: 'CDISCPILOT01' } }, displays });
    expect(html).toContain('CDISCPILOT01');
    expect(html).toContain('data-app-context');
    const index = JSON.parse(
      html.match(/<script type="application\/json" id="app-context-index">(.*?)<\/script>/s)[1]
    );
    expect(index.study).toBe('CDISCPILOT01');
    expect(index.displays['t-ae-common']).toEqual({
      number: '14.3.1.3',
      title: 'Common AEs',
      version: 'v001',
      // Identity and provenance live in the chrome: the ARD hash is shortened
      // for the bar but it is the real one.
      hash: '1a2b3c4'
    });
  });

  test('QC-DEMO-017: a display with no iteration yet contributes nulls, not a broken readout (#1)', () => {
    const html = renderAppBar({ displays: [{ slug: 't-new', title: 'New' }] });
    const index = JSON.parse(
      html.match(/<script type="application\/json" id="app-context-index">(.*?)<\/script>/s)[1]
    );
    expect(index.displays['t-new']).toEqual({
      number: null,
      title: 'New',
      version: null,
      hash: null
    });
  });

  test('QC-DEMO-017: the embedded context index cannot close the script element (#1)', () => {
    const html = renderAppBar({ displays: [{ slug: 'x', title: '</script><script>alert(1)' }] });
    expect(html).not.toContain('</script><script>alert(1)');
    expect(html).toContain('\\u003c/script>');
  });
});

describe('the Tables pane', () => {
  const entries = [
    { slug: 't-disposition', title: 'Subject Disposition', number: '14.1.1', html: '<p>disp</p>' },
    { slug: 't-ae-common', title: 'Common AEs', number: '14.3.1.3', html: '<p>ae</p>' }
  ];

  test('QC-DEMO-009: one panel per display, exactly one shown, and every display in the picker (#1)', () => {
    const html = renderTablesPane({ entries });
    expect((html.match(/data-app-display-panel=/g) || []).length).toBe(2);
    expect((html.match(/data-app-select-display=/g) || []).length).toBe(2);
    expect((html.match(/data-app-display-panel="[a-z-]+"( hidden)?>/g) || []).join('|')).toContain(
      'data-app-display-panel="t-ae-common" hidden'
    );
    expect(html).toContain('data-app-display-panel="t-disposition">');
  });

  test('QC-DEMO-009: the pane opens on the selected display when one is asked for (#1)', () => {
    const html = renderTablesPane({ entries, selected: 't-ae-common' });
    expect(html).toContain('data-app-display-panel="t-ae-common">');
    expect(html).toContain('data-app-display-panel="t-disposition" hidden');
  });

  test('QC-DEMO-009: an unknown selection falls back to the first display (#1)', () => {
    const html = renderTablesPane({ entries, selected: 't-gone' });
    expect(html).toContain('data-app-display-panel="t-disposition">');
  });

  test('QC-DEMO-010: an empty library renders a documented empty state, not a broken pane (#1)', () => {
    const html = renderTablesPane({ entries: [] });
    expect(html).toContain('class="empty"');
    expect(html).not.toContain('data-app-display-panel');
  });
});

describe('the Templates pane', () => {
  const templateDir = path.join(rootDir, 'library', 'templates', 'ich-e3');
  const template = {
    dir: 'library/templates/ich-e3',
    sections: loadSections(path.join(templateDir, 'sections.yaml')),
    assembly: loadAssembly(path.join(templateDir, 'assembly.yaml'))
  };
  const displays = [
    { slug: 't-disposition', title: 'Subject Disposition', type: 'table' },
    { slug: 't-demographics', title: 'Demographics', type: 'table' },
    { slug: 't-exposure', title: 'Exposure', type: 'table' },
    { slug: 't-ae-overview', title: 'AE Overview', type: 'table' },
    { slug: 't-ae-common', title: 'Common AEs', type: 'table' },
    { slug: 'l-ae-serious', title: 'SAE Listing', type: 'listing' }
  ];

  test('QC-DEMO-011: the whole E3 skeleton is rendered, not only the sections this report fills (#1)', () => {
    const html = renderTemplatesPane({ template, displays });
    const rows = (html.match(/<tr class="is-(populated|gap)"/g) || []).length;
    expect(rows).toBe(template.sections.sections.length);
    expect(html).toContain('is-gap');
    expect(html).toContain('is-populated');
  });

  test('QC-DEMO-012: display numbers are derived from assembly order, never authored (#1)', () => {
    const html = renderTemplatesPane({ template, displays });
    // D6: the slug is identity and the number is derived. The first post-text
    // display in assembly.yaml takes position 1 of its section.
    const first = template.assembly.postText[0];
    expect(html).toContain(`${first.section}.1`);
    expect(html).toContain('t-disposition');
    // A listing is labelled as one, from the display registry's type.
    expect(html).toMatch(/Listing 14\./);
  });

  test('QC-DEMO-012: reordering the assembly moves every number and no slug (#1)', () => {
    const reversed = {
      ...template,
      assembly: {
        ...template.assembly,
        postText: template.assembly.postText.map((entry) => ({
          ...entry,
          displays: [...entry.displays].reverse()
        }))
      }
    };
    const before = renderTemplatesPane({ template, displays });
    const after = renderTemplatesPane({ template: reversed, displays });
    expect(after).not.toBe(before);
    const section = template.assembly.postText[0].section;
    const last = template.assembly.postText[0].displays.at(-1);
    expect(after).toMatch(
      new RegExp(`${section.replace('.', '\\.')}\\.1</td><td><a href="\\.\\./gallery/${last}\\.html"`)
    );
  });

  test('QC-DEMO-013: a missing section model renders its documented empty state (#1)', () => {
    expect(renderTemplatesPane({ template: null, displays })).toContain('class="empty"');
    expect(renderTemplatesPane({ template: { sections: { sections: [] } }, displays })).toContain(
      'class="empty"'
    );
  });

  test('QC-DEMO-013: the pane renders before the report has ever been assembled (#1)', () => {
    // It reads the template model, not docs/assembled/csr.json, so it works on a
    // tree where the assembler has never run.
    const html = renderTemplatesPane({ template, displays });
    expect(html).toContain('Assigned numbering');
    expect(html.length).toBeGreaterThan(1000);
  });

  test('QC-DEMO-014: the generated provenance section is named as generated (#1)', () => {
    const html = renderTemplatesPane({ template, displays });
    expect(html).toContain(String(template.assembly.provenanceSection));
    expect(html).toContain('generated');
  });
});

// ---------------------------------------------------------------------------
// The explorer
// ---------------------------------------------------------------------------

describe('the navigation tree', () => {
  const config = {
    study: { id: 'CDISCPILOT01', cutoff: '2014-07-01' },
    documents: [
      { id: 'csr', title: 'Clinical Study Report', abbr: 'CSR', status: 'built' },
      { id: 'sap', title: 'Statistical Analysis Plan', abbr: 'SAP', status: 'planned' }
    ]
  };
  const displays = [
    { slug: 't-ae-overview', title: 'AE Overview', status: 'evidenced' },
    { slug: 't-unused', title: 'Not in any document', status: 'built' }
  ];
  const textBlocks = [
    { id: 'TXT-E3-1001', title: 'Disposition', e3Section: '10.1', tier: 'parameterized', exists: true },
    {
      id: 'TXT-E3-1206',
      title: 'Safety Conclusions',
      e3Section: '12.6',
      tier: 'generated',
      approval: { state: 'draft' },
      exists: true
    },
    { id: 'TXT-GONE', title: 'Missing on disk', exists: false }
  ];
  const csr = { displayIndex: [{ slug: 't-ae-overview', number: '14.3.1.2', label: 'Table' }] };

  test('QC-DEMO-018: the study is the root, and documents, displays, text and values hang off it (#1)', () => {
    const tree = buildNavTree({ config, csr, displays, textBlocks });
    expect(tree.study).toMatchObject({ id: 'CDISCPILOT01', cutoff: '2014-07-01' });
    expect(tree.groups.map((group) => group.id)).toEqual([
      'documents',
      'displays',
      'text',
      'values'
    ]);
  });

  test('QC-DEMO-018: more than one document is listed, and an unbuilt one says so (#1)', () => {
    const tree = buildNavTree({ config, csr, displays, textBlocks });
    const documents = tree.groups[0].items;
    expect(documents.map((doc) => doc.id)).toEqual(['csr', 'sap']);
    expect(documents[1].status).toBe('planned');
  });

  test('QC-DEMO-019: a display records the documents that use it rather than living inside one (#1)', () => {
    // A display can be referenced by more than one document, so displays are a
    // peer collection of documents, not a child of one.
    const tree = buildNavTree({ config, csr, displays, textBlocks });
    const items = tree.groups[1].items;
    expect(items.find((item) => item.id === 't-ae-overview')).toMatchObject({
      number: '14.3.1.2',
      usedIn: ['CSR']
    });
    // Registered, generated, and in no document yet — still listed, with nothing
    // claiming it.
    expect(items.find((item) => item.id === 't-unused').usedIn).toEqual([]);
  });

  test('QC-DEMO-019: a text block that is not on disk is left out, and a draft is flagged (#1)', () => {
    const tree = buildNavTree({ config, csr, displays, textBlocks });
    const items = tree.groups[2].items;
    expect(items.map((item) => item.id)).toEqual(['TXT-E3-1001', 'TXT-E3-1206']);
    expect(items.find((item) => item.id === 'TXT-E3-1206').status).toBe('draft');
    expect(items.find((item) => item.id === 'TXT-E3-1001').status).toBe('ok');
  });

  test('QC-DEMO-020: the explorer renders the study, every group, and a count per group (#1)', () => {
    const html = renderSidebar({ tree: buildNavTree({ config, csr, displays, textBlocks }) });
    expect(html).toContain('CDISCPILOT01');
    expect(html).toContain('cut-off 2014-07-01');
    for (const id of ['documents', 'displays', 'text']) {
      expect(html).toContain(`data-nav-group-root="${id}"`);
      expect(html).toContain(`data-nav-group-toggle="${id}"`);
    }
    expect(html).toContain('data-nav-item="t-ae-overview"');
    expect(html).toContain('data-nav-item="TXT-E3-1001"');
  });

  test('QC-DEMO-020: only the active group is open, and the selected item is marked (#1)', () => {
    const tree = buildNavTree({ config, csr, displays, textBlocks });
    const html = renderSidebar({ tree, active: 'displays', selected: { display: 't-ae-overview' } });
    expect(html).toMatch(/class="nav-group open" data-nav-group-root="displays"/);
    expect(html).toMatch(/data-nav-group-root="documents"/);
    expect(html).not.toMatch(/class="nav-group open" data-nav-group-root="documents"/);
    expect(html).toContain('data-nav-item="t-ae-overview" data-current="true"');
  });

  test('QC-DEMO-021: an unbuilt document is not a link, so it cannot be selected (#1)', () => {
    const html = renderSidebar({ tree: buildNavTree({ config, csr, displays, textBlocks }) });
    expect(html).toMatch(/<span class="nav-item is-planned"[^>]*data-nav-item="sap"[^>]*aria-disabled="true">/);
    expect(html).not.toMatch(/<a[^>]*data-nav-item="sap"/);
  });

  test('QC-DEMO-021: every selectable item is a real link carrying its own deep link (#1)', () => {
    const html = renderSidebar({ tree: buildNavTree({ config, csr, displays, textBlocks }) });
    expect(html).toContain('href="#tab=displays&amp;display=t-ae-overview"');
    expect(html).toContain('href="#tab=text&amp;block=TXT-E3-1001"');
    expect(html).toContain('href="#tab=documents&amp;doc=csr"');
  });

  test('QC-DEMO-022: Read is the current mode and Edit is genuinely disabled (#1)', () => {
    // There is nothing to edit until the spec editor lands; a control that looks
    // live but does nothing is worse than one that says so.
    const html = renderAppBar({});
    expect(html).toMatch(/data-app-mode="read"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/data-app-mode="edit"[^>]*disabled/);
    expect(html).toContain('aria-disabled="true"');
  });

  test('QC-DEMO-022: an empty registry renders the explorer without throwing (#1)', () => {
    const tree = buildNavTree({ config: {}, csr: null, displays: [], textBlocks: [] });
    const html = renderSidebar({ tree });
    expect(html).toContain('Nothing registered yet');
    expect(renderSidebar({ tree: null })).toBe('');
  });
});

describe('a document contents in the tree', () => {
  const config = {
    study: { id: 'CDISCPILOT01' },
    documents: [
      { id: 'csr', title: 'Clinical Study Report', status: 'built' },
      { id: 'sap', title: 'Statistical Analysis Plan', status: 'planned' }
    ]
  };
  // E3 puts content in subsections: 12.2.1 carries the AE summary, not 12.
  const csr = {
    displayIndex: [],
    sections: [
      { number: '1', slug: 'title-page', title: 'Title Page', level: 1, populated: false },
      { number: '12', slug: 'safety-evaluation', title: 'Safety Evaluation', level: 1, populated: false },
      { number: '12.1', slug: 'extent-of-exposure', title: 'Extent of Exposure', level: 2, populated: true },
      { number: '13', slug: 'discussion', title: 'Discussion', level: 1, populated: true },
      { number: '15', slug: 'references', title: 'Reference List', level: 1, populated: false }
    ]
  };

  test('QC-DEMO-023: the document lists its own top-level sections, not the whole model (#1)', () => {
    const tree = buildNavTree({ config, csr, displays: [], textBlocks: [] });
    const [doc] = tree.groups[0].items;
    expect(doc.sections.map((section) => section.number)).toEqual(['1', '12', '13', '15']);
    expect(doc.sections[0]).toMatchObject({ id: 'title-page', label: 'Title Page' });
  });

  test('QC-DEMO-023: a section counts as populated when anything beneath it is (#1)', () => {
    // Section 12 is empty itself but 12.1 is filled, so the report does cover it.
    // Testing only the top-level flag would report almost the whole CSR empty.
    const tree = buildNavTree({ config, csr, displays: [], textBlocks: [] });
    const byNumber = Object.fromEntries(
      tree.groups[0].items[0].sections.map((section) => [section.number, section.populated])
    );
    expect(byNumber).toEqual({ 1: false, 12: true, 13: true, 15: false });
  });

  test('QC-DEMO-023: an unbuilt document contributes no sections (#1)', () => {
    const tree = buildNavTree({ config, csr, displays: [], textBlocks: [] });
    expect(tree.groups[0].items[1].sections).toEqual([]);
  });

  test('QC-DEMO-024: sections render under their document, each a deep link to its heading (#1)', () => {
    const tree = buildNavTree({ config, csr, displays: [], textBlocks: [] });
    const html = renderSidebar({ tree, active: 'documents', selected: { doc: 'csr' } });
    expect(html).toContain('class="nav-sections"');
    expect(html).toContain('data-nav-section="safety-evaluation"');
    expect(html).toContain('href="#tab=documents&amp;doc=csr&amp;focus=safety-evaluation"');
    // The unpopulated ones stay navigable — the heading really is in the
    // document, saying it was not populated.
    expect(html).toContain('class="nav-section is-empty"');
    expect(html).toContain('Modelled but not populated');
  });

  test('QC-DEMO-024: the sections belong to their document, so a second document has its own (#1)', () => {
    const tree = buildNavTree({ config, csr, displays: [], textBlocks: [] });
    const html = renderSidebar({ tree, active: 'documents', selected: { doc: 'csr' } });
    // The planned document has none, so exactly one section list exists.
    expect((html.match(/class="nav-sections"/g) || []).length).toBe(1);
  });

  // --- expand / collapse (open.csr #10) ------------------------------------

  test('QC-DEMO-025: a node with children carries a keyboard-reachable disclosure control (#1)', () => {
    const tree = buildNavTree({ config, csr, displays: [], textBlocks: [] });
    const html = renderSidebar({ tree, active: 'documents', selected: { doc: 'csr' } });
    // A real button, not a styled span: it has to be reachable by Tab and
    // operable by Enter and Space without the app implementing key handling.
    expect(html).toContain('<button type="button" class="nav-twisty" data-nav-toggle="csr"');
    expect(html).toContain(`aria-controls="${navChildrenId('documents', 'csr')}"`);
    expect(html).toContain(`<ul class="nav-sections" id="${navChildrenId('documents', 'csr')}">`);
    // Named for a screen reader; the chevron itself is decorative.
    expect(html).toContain('Show or hide the contents of Clinical Study Report');
    expect(html).toMatch(/data-nav-toggle="csr"[^>]*aria-expanded="true"/);
  });

  test('QC-DEMO-025: a node with nothing beneath it gets no chevron at all (#1)', () => {
    const tree = buildNavTree({
      config,
      csr,
      displays: [{ slug: 't-ae-overview', title: 'AE Overview', status: 'built' }],
      textBlocks: []
    });
    const html = renderSidebar({ tree, active: 'displays', selected: { display: 't-ae-overview' } });
    // The display has no children, so it is a flat row: an affordance that
    // expands nothing is worse than no affordance.
    expect(html).toContain('data-nav-item="t-ae-overview"');
    expect(html).not.toContain('data-nav-toggle="t-ae-overview"');
    // The unbuilt document likewise contributes no sections and no control.
    expect(html).not.toContain('data-nav-toggle="sap"');
  });

  test('QC-DEMO-026: an unpopulated section is dimmed and keeps its explanatory tooltip (#1)', () => {
    const tree = buildNavTree({ config, csr, displays: [], textBlocks: [] });
    const html = renderSidebar({ tree, active: 'documents', selected: { doc: 'csr' } });
    expect(html).toContain('class="nav-section is-empty"');
    expect(html).toContain('data-nav-empty="true"');
    expect(html).toContain('title="Modelled but not populated in this demonstration"');
    // A populated section is a plain link at full contrast, with no dimming
    // class and no tooltip explaining an absence that is not there.
    expect(html).toMatch(/class="nav-section" [^>]*data-nav-section="discussion"/);
  });

  test('QC-DEMO-026: a group with no items is a heading rather than an empty folder (#1)', () => {
    const tree = buildNavTree({ config: {}, csr: null, displays: [], textBlocks: [] });
    const html = renderSidebar({ tree });
    expect(html).toContain('nav-group is-empty');
    expect(html).toMatch(/data-nav-group-toggle="displays"[^>]*aria-expanded="false"/);
    // No caret on a group that opens onto nothing.
    const displaysGroup = html.slice(html.indexOf('data-nav-group-root="displays"'));
    expect(displaysGroup.slice(0, displaysGroup.indexOf('</button>'))).not.toContain('nav-caret');
  });
});

// ---------------------------------------------------------------------------
// The Values pane (obot.roadmap #129 B)
// ---------------------------------------------------------------------------

describe('the Values pane', () => {
  const store = {
    schema: 'opencsr/values/v1',
    created: '2026-07-26T00:00:00Z',
    values: [
      {
        id: 'randomised-n',
        label: 'Subjects randomised',
        kind: 'ard',
        value: 254,
        formatted: '254',
        format: { scale: 1, digits: 0 },
        source: {
          address: 't-disposition:randomised:n;group=Total',
          display: 't-disposition',
          iteration: 'v002',
          ard_file: 'outputs/t-disposition/v002/ard.json',
          ard_hash: 'sha256:abcdef1234567890'
        }
      },
      {
        id: 'ae-excess',
        label: 'Additional subjects with an AE',
        kind: 'derived',
        value: 22,
        formatted: '22',
        format: { scale: 1, digits: 0 },
        derivation: { op: 'difference', inputs: ['ae-any-n-high', 'ae-any-n-placebo'] }
      }
    ]
  };
  const usage = new Map([['randomised-n', ['TXT-E3-1002']]]);

  test('QC-DEMO-027: every value shows its name, its number and where it came from (#1)', () => {
    const html = renderValuesPane({ store, usage });
    expect(html).toContain('randomised-n');
    expect(html).toContain('Subjects randomised');
    expect(html).toContain('t-disposition:randomised:n;group=Total');
    expect(html).toContain('outputs/t-disposition/v002/ard.json');
    // A derived value shows the arithmetic instead of an address — it has no ARD
    // row of its own, and pretending otherwise would be the lie the store exists
    // to prevent.
    expect(html).toContain('difference(ae-any-n-high, ae-any-n-placebo)');
  });

  test('QC-DEMO-027: the blocks that cite a value are listed against it (#1)', () => {
    const html = renderValuesPane({ store, usage });
    expect(html).toContain('href="../text/index.html#TXT-E3-1002"');
    // A value nothing cites is shown as uncited rather than hidden: an unused
    // name is a fact about the report, not an error.
    expect(html).toContain('—');
  });

  test('QC-DEMO-028: the pane states the verdict of the gate that re-derived the store (#1)', () => {
    const passing = renderValuesPane({ store, usage, gate: { ok: true, checked: 15, violations: [] } });
    expect(passing).toContain('15 values were re-derived');
    const failing = renderValuesPane({
      store,
      usage,
      gate: { ok: false, checked: 15, violations: [{ id: 'randomised-n', message: 'stored value 999' }] }
    });
    expect(failing).toContain('callout warn');
    expect(failing).toContain('randomised-n — stored value 999');
  });

  test('QC-DEMO-028: a repository with no values store renders the documented empty state (#1)', () => {
    expect(renderValuesPane({ store: null })).toContain('library/values/values.yaml');
    expect(renderValuesPane({ store: { values: [] } })).toContain('No values are declared yet');
  });

  test('QC-DEMO-029: values are a collection of the study, listed in the tree with their numbers (#1)', () => {
    const tree = buildNavTree({
      config: { study: { id: 'CDISCPILOT01' } },
      csr: null,
      displays: [],
      textBlocks: [],
      values: store.values
    });
    const group = tree.groups.find((entry) => entry.id === 'values');
    expect(group.items.map((item) => item.id)).toEqual(['randomised-n', 'ae-excess']);
    expect(group.items[0]).toMatchObject({ label: 'Subjects randomised', number: '254' });
    expect(group.items[1].status).toBe('derived');

    const html = renderSidebar({ tree, active: 'values' });
    // Selecting a value focuses it in the pane rather than introducing a fourth
    // selection key: the pane is one list, and `focus` already means that.
    expect(html).toContain('href="#tab=values&amp;focus=randomised-n"');
  });
});

// ---------------------------------------------------------------------------
// The Documents pane holds the LIBRARY, not one member of it (open.csr #36)
// ---------------------------------------------------------------------------
//
// #33 made the site follow `library/templates/`, so a third template object
// acquires a reader page, a template page, a nav entry and a home-page row for
// free. The demo app was the layer that move did not reach: it rendered one
// document and made every other one a link OUT of the app —
//
//     <a class="nav-item is-elsewhere" href="../reader/e3-synopsis.html">
//
// The tests below guard the generalisation rather than "the synopsis renders".
// Every fixture holds THREE documents on purpose: a suite that exercised the two
// this repo happens to hold would pass just as well against a shell with the
// synopsis wired in by hand.

describe('a link to a reader page is a pane crossing', () => {
  test('QC-DEMO-030: every document\'s reader page resolves to the Documents view naming it (#36)', () => {
    // The primary document keeps /reader/index.html, so it is named `index`;
    // every other template object is a sibling file named after itself.
    expect(resolveAppLink('../reader/index.html')).toEqual({
      tab: 'documents',
      doc: 'index',
      focus: null
    });
    expect(resolveAppLink('../reader/e3-synopsis.html')).toEqual({
      tab: 'documents',
      doc: 'e3-synopsis',
      focus: null
    });
    // A template object nothing in the suite knows about resolves the same way.
    expect(resolveAppLink('reader/post-text.html')?.doc).toBe('post-text');
    expect(resolveAppLink('../../reader/post-text.html')?.doc).toBe('post-text');
  });

  test('QC-DEMO-030: a reader crossing carries the heading named in its fragment (#36)', () => {
    expect(resolveAppLink('../reader/e3-synopsis.html#objectives')).toEqual({
      tab: 'documents',
      doc: 'e3-synopsis',
      focus: 'objectives'
    });
  });

  test('QC-DEMO-030: pages outside the reader directory are still left to navigate (#36)', () => {
    // The rule is scoped to reader/*.html; widening it would swallow the
    // Quality and Design surfaces, which are separate surfaces on purpose.
    expect(resolveAppLink('../quality/traceability.html')).toBe(null);
    expect(resolveAppLink('../reader/e3-synopsis/index.html')).toBe(null);
    expect(resolveAppLink('../reader/E3-Synopsis.html')).toBe(null);
  });
});

describe('which document the pane shows', () => {
  const rendered = [
    { id: 'csr', file: 'index' },
    { id: 'e3-synopsis', file: 'e3-synopsis' },
    { id: 'third', file: 'third' }
  ];

  test('QC-DEMO-031: a document resolves from its id or from its reader page\'s name (#36)', () => {
    // The explorer names documents; a link between panes names pages. Both mean
    // the same document, so both resolve here rather than at every caller.
    expect(resolveDocument('e3-synopsis', rendered)).toBe('e3-synopsis');
    expect(resolveDocument('index', rendered)).toBe('csr');
    expect(resolveDocument('third', rendered)).toBe('third');
  });

  test('QC-DEMO-031: an unknown or absent document falls back to the first rendered one (#36)', () => {
    expect(resolveDocument('sap', rendered)).toBe('csr');
    expect(resolveDocument(null, rendered)).toBe('csr');
    expect(resolveDocument('', rendered)).toBe('csr');
    // A page that rendered nothing has no document to show, and says so rather
    // than naming one it does not hold.
    expect(resolveDocument('csr', [])).toBe(null);
    expect(resolveDocument('csr')).toBe(null);
  });

  test('QC-DEMO-031: a plain list of ids is accepted, so the caller need not build pairs (#36)', () => {
    expect(resolveDocument('e3-synopsis', ['csr', 'e3-synopsis'])).toBe('e3-synopsis');
    expect(resolveDocument('index', ['csr', 'e3-synopsis'])).toBe('csr');
  });
});

describe('the Documents pane', () => {
  const entries = [
    { id: 'csr', file: 'index', title: 'Clinical Study Report', html: '<article>report</article>' },
    {
      id: 'e3-synopsis',
      file: 'e3-synopsis',
      title: 'Study Synopsis',
      html: '<article>synopsis</article>'
    },
    { id: 'third', file: 'third', title: 'A Third Document', html: '<article>third</article>' }
  ];
  const trace = '<aside class="trace" id="trace" hidden></aside>';

  test('QC-DEMO-032: one panel per document, keyed by id and by reader-page name (#36)', () => {
    const html = renderDocumentsPane({ entries, selected: 'csr', trace });
    expect((html.match(/data-app-document-panel="/g) || []).length).toBe(3);
    expect(html).toContain('data-app-document-panel="e3-synopsis" data-app-document-file="e3-synopsis"');
    expect(html).toContain('data-app-document-panel="csr" data-app-document-file="index"');
    // The pane renders the fragments it was handed — nothing about a document's
    // rendering is duplicated here, which is what makes a fourth document free.
    expect(html).toContain('<article>synopsis</article>');
    expect(html).toContain('<article>third</article>');
  });

  test('QC-DEMO-032: exactly one panel is visible, and it is the one requested (#36)', () => {
    const html = renderDocumentsPane({ entries, selected: 'e3-synopsis', trace });
    expect((html.match(/data-app-document-panel="[^"]+" data-app-document-file="[^"]+" hidden/g) || []).length).toBe(2);
    expect(html).toMatch(/data-app-document-panel="e3-synopsis" data-app-document-file="e3-synopsis">/);
  });

  test('QC-DEMO-032: a document may be requested by its reader page\'s name (#36)', () => {
    const html = renderDocumentsPane({ entries, selected: 'index', trace });
    expect(html).toMatch(/data-app-document-panel="csr" data-app-document-file="index">/);
  });

  test('QC-DEMO-032: an unknown request opens the first document rather than none (#36)', () => {
    const html = renderDocumentsPane({ entries, selected: 'sap', trace });
    expect(html).toMatch(/data-app-document-panel="csr" data-app-document-file="index">/);
    // And no assembled document at all renders the documented empty state.
    expect(renderDocumentsPane({ entries: [] })).toContain('No document has been assembled yet');
  });

  test('QC-DEMO-032: one trace panel above the set, never one per document (#36)', () => {
    // `id="trace"` and `id="trace-index"` can each only mean one element, and a
    // second copy of the trace script would answer every click twice.
    const html = renderDocumentsPane({ entries, selected: 'csr', trace });
    expect((html.match(/id="trace"/g) || []).length).toBe(1);
    expect(html.indexOf('id="trace"')).toBeGreaterThan(html.indexOf('<article>third</article>'));
  });
});

describe('a rendered document is selectable, not somewhere else', () => {
  const config = {
    study: { id: 'CDISCPILOT01' },
    documents: [
      { id: 'csr', title: 'Clinical Study Report', status: 'built' },
      { id: 'sap', title: 'Statistical Analysis Plan', status: 'planned' }
    ]
  };
  const sections = [
    { number: '1', slug: 'objectives', title: 'Objectives', level: 1, populated: true },
    { number: '2', slug: 'results', title: 'Results', level: 1, populated: false }
  ];
  const documents = [
    {
      id: 'csr',
      title: 'Clinical Study Report',
      status: 'built',
      primary: true,
      readerPath: 'reader/index.html',
      json: { sections, displayIndex: [] },
      prose: { total: 2, unapproved: 0, draft: false }
    },
    {
      id: 'e3-synopsis',
      title: 'Study Synopsis',
      status: 'built',
      readerPath: 'reader/e3-synopsis.html',
      json: { sections, displayIndex: [] },
      prose: { total: 2, unapproved: 2, draft: true }
    },
    {
      id: 'sap',
      title: 'Statistical Analysis Plan',
      status: 'planned',
      readerPath: 'reader/sap.html',
      json: null,
      prose: { total: 0, unapproved: 0, draft: false }
    }
  ];

  test('QC-DEMO-033: a document the page rendered is an ordinary selection (#36)', () => {
    const tree = buildNavTree({
      config,
      documents,
      current: 'csr',
      rendered: ['csr', 'e3-synopsis'],
      root: '../'
    });
    const items = tree.groups.find((group) => group.id === 'documents').items;
    expect(items.find((item) => item.id === 'e3-synopsis').inApp).toBe(true);

    const html = renderSidebar({ tree, active: 'documents', selected: { doc: 'csr' } });
    expect(html).toContain('data-nav-item="e3-synopsis"');
    // Not a way out of the app any more.
    expect(html).not.toContain('is-elsewhere');
  });

  test('QC-DEMO-033: it keeps its permalink, so the node works with JavaScript off (#36)', () => {
    // The same arrangement the view bar uses: a real link the client upgrades,
    // never a hash that does nothing without a script.
    const tree = buildNavTree({
      config,
      documents,
      current: 'csr',
      rendered: ['csr', 'e3-synopsis'],
      root: '../'
    });
    const html = renderSidebar({ tree, active: 'documents', selected: { doc: 'csr' } });
    expect(html).toMatch(
      /<a class="nav-item" data-nav-group="documents" data-nav-item="e3-synopsis" href="\.\.\/reader\/e3-synopsis\.html">/
    );
  });

  test('QC-DEMO-033: a document the page did NOT render stays a link out (#36)', () => {
    // Which is what every standalone reader page still is: it renders one
    // document and passes no `rendered` set at all.
    const tree = buildNavTree({ config, documents, current: 'csr', root: '../' });
    const items = tree.groups.find((group) => group.id === 'documents').items;
    expect(items.find((item) => item.id === 'e3-synopsis').inApp).toBe(false);
    const html = renderSidebar({ tree, active: 'documents', selected: { doc: 'csr' } });
    expect(html).toContain('class="nav-item is-elsewhere"');
    expect(html).not.toContain('data-nav-item="e3-synopsis"');
  });

  test('QC-DEMO-033: an unbuilt document is not selectable however the page was built (#36)', () => {
    const tree = buildNavTree({
      config,
      documents,
      current: 'csr',
      rendered: ['csr', 'e3-synopsis', 'sap'],
      root: '../'
    });
    const items = tree.groups.find((group) => group.id === 'documents').items;
    expect(items.find((item) => item.id === 'sap').inApp).toBe(false);
    const html = renderSidebar({ tree, active: 'documents', selected: { doc: 'csr' } });
    expect(html).toMatch(/<span class="nav-item is-planned"[^>]*data-nav-item="sap"/);
  });

  test('QC-DEMO-034: every rendered document contributes its own sections, named for it (#36)', () => {
    const tree = buildNavTree({
      config,
      documents,
      current: 'csr',
      rendered: ['csr', 'e3-synopsis'],
      root: '../'
    });
    const items = tree.groups.find((group) => group.id === 'documents').items;
    expect(items.find((item) => item.id === 'csr').sections.length).toBe(2);
    expect(items.find((item) => item.id === 'e3-synopsis').sections.length).toBe(2);
    expect(items.find((item) => item.id === 'sap').sections).toEqual([]);

    const html = renderSidebar({ tree, active: 'documents', selected: { doc: 'csr' } });
    // Both documents model `objectives`, and they are different headings — so
    // every section link says which document it belongs to.
    expect((html.match(/class="nav-sections"/g) || []).length).toBe(2);
    expect(html).toContain('data-nav-doc="csr" data-nav-section="objectives"');
    expect(html).toContain('data-nav-doc="e3-synopsis" data-nav-section="objectives"');
    expect(html).toContain('href="#tab=documents&amp;doc=e3-synopsis&amp;focus=objectives"');
  });

  test('QC-DEMO-034: a document the page did not render contributes no sections (#36)', () => {
    // Its anchors are on its own page; offering them here would be a deep link
    // to a heading this page does not hold.
    const tree = buildNavTree({ config, documents, current: 'csr', root: '../' });
    const items = tree.groups.find((group) => group.id === 'documents').items;
    expect(items.find((item) => item.id === 'e3-synopsis').sections).toEqual([]);
  });

  test('QC-DEMO-035: a draft document is flagged in the tree beside the one that is not (#36)', () => {
    const tree = buildNavTree({
      config,
      documents,
      current: 'csr',
      rendered: ['csr', 'e3-synopsis'],
      root: '../'
    });
    const html = renderSidebar({ tree, active: 'documents', selected: { doc: 'csr' } });
    expect(html).toContain('draft prose');
    expect((html.match(/>draft prose</g) || []).length).toBe(1);
  });
});
