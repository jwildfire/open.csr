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
  renderAppBar,
  renderAppPage,
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
    const selection = { tab: 'tables', display: 't-ae-overview', block: 'TXT-E3-1221', focus: 'bind-2' };
    expect(parseAppHash(formatAppHash(selection))).toEqual(selection);
  });

  test('QC-DEMO-001: empty parts are omitted from the hash so the common case stays short (#1)', () => {
    expect(formatAppHash({ tab: 'reader' })).toBe('#tab=reader');
  });

  test('QC-DEMO-002: an unknown or absent tab decodes to the default rather than an empty app (#1)', () => {
    expect(parseAppHash('#tab=nonsense').tab).toBe(DEFAULT_TAB);
    expect(parseAppHash('').tab).toBe(DEFAULT_TAB);
    expect(parseAppHash(undefined).tab).toBe(DEFAULT_TAB);
    expect(formatAppHash({ tab: 'nonsense' })).toBe(`#tab=${DEFAULT_TAB}`);
  });

  test('QC-DEMO-002: the four tabs the requirement names are the tabs the app knows (#1)', () => {
    expect(TAB_IDS).toEqual(['reader', 'tables', 'text', 'templates']);
    expect(APP_TABS.map((tab) => tab.id)).toEqual(TAB_IDS);
    expect(TAB_IDS.every(isTab)).toBe(true);
    expect(isTab('gallery')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The absorption: a link between panes is a selection change
// ---------------------------------------------------------------------------

describe('pane crossings', () => {
  test('QC-DEMO-003: a display permalink resolves to the Tables tab with that display selected (#1)', () => {
    expect(resolveAppLink('../gallery/t-ae-overview.html')).toEqual({
      tab: 'tables',
      display: 't-ae-overview',
      focus: null
    });
  });

  test('QC-DEMO-003: the reader, the gallery index and the text library each resolve to a pane (#1)', () => {
    expect(resolveAppLink('../reader/index.html').tab).toBe('reader');
    expect(resolveAppLink('../gallery/index.html').tab).toBe('tables');
    expect(resolveAppLink('../text/index.html').tab).toBe('text');
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
    const current = { tab: 'tables', display: 't-ae-common', block: null, focus: null };
    const next = applySelection(current, resolveAppLink('../reader/index.html'));
    expect(next).toEqual({ tab: 'reader', display: 't-ae-common', block: null, focus: null });
  });

  test('QC-DEMO-005: applying nothing changes nothing (#1)', () => {
    const current = { tab: 'text', display: 't-exposure', block: 'TXT-E3-1201', focus: null };
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
    { id: 'reader', html: '<h2>Reader body</h2>' },
    { id: 'tables', html: '<h2>Tables body</h2>' },
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
    expect(html).toContain('aria-labelledby="app-tab-reader"');
  });

  test('QC-DEMO-008: a tab with no rendered pane is dropped rather than rendered empty (#1)', () => {
    const html = renderAppPage({ panes: [{ id: 'reader', html: '<p>only pane</p>' }] });
    expect(html).toContain('data-app-pane="reader"');
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

  test('QC-DEMO-016: the four views are real links to real pages, so the bar works with no JS (#1)', () => {
    // demo-layout.md §5. The client upgrades a click into a pane switch through
    // the same interception rule the panes use; without it these still navigate.
    const html = renderAppBar({ config: { study: { id: 'CDISCPILOT01' } } });
    expect(html).toContain('href="../reader/index.html"');
    expect(html).toContain('href="../gallery/index.html"');
    expect(html).toContain('href="../text/index.html"');
    expect(html).toContain('href="../templates/index.html"');
    expect(html).not.toContain('<button');
    for (const id of TAB_IDS) expect(html).toContain(`data-app-tab="${id}"`);
  });

  test('QC-DEMO-016: the current view is marked as navigation, not as a selected control (#1)', () => {
    const html = renderAppBar({ active: 'tables' });
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
