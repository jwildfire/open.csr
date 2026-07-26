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
  resolveDisplay
} from '../../site/demo/core.js';
import {
  APP_TABS,
  GLOBAL_TABS,
  STUDY_TABS,
  buildNavTree,
  renderAppBar,
  renderAppPage,
  renderSidebar,
  renderTablesPane,
  renderTemplatesPane
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

  test('QC-DEMO-002: the four tabs the requirement names are the tabs the app knows (#1)', () => {
    expect(TAB_IDS).toEqual(['documents', 'displays', 'text', 'templates']);
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
      tab: 'documents',
      doc: null,
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
    expect(STUDY_TABS.map((tab) => tab.id)).toEqual(['documents', 'displays', 'text']);
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

  test('QC-DEMO-018: the study is the root, and documents, displays and text hang off it (#1)', () => {
    const tree = buildNavTree({ config, csr, displays, textBlocks });
    expect(tree.study).toMatchObject({ id: 'CDISCPILOT01', cutoff: '2014-07-01' });
    expect(tree.groups.map((group) => group.id)).toEqual(['documents', 'displays', 'text']);
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
});
