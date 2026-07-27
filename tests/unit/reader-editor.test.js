// Editing from the reading view (open.csr#15, obot.roadmap#129 part C, Option C).
//
// Option C's claim is narrow: the editor that already exists opens *beneath the
// block being read*, the reading view becomes the preview, and nothing about the
// gates, the patch or the approval model changes. So these tests protect three
// things and ignore the rest:
//
//   1. The Reader offers the affordance exactly where an editor exists to adopt —
//      never on the standalone page, never on a block held out of the report.
//   2. A draft renders as the document renders, minus the affordances that would
//      claim it is part of the committed report.
//   3. The page always says which of the two it is showing.
//
// The moving of the editor node between panes is DOM wiring, verified in the
// browser like every other wiring in this repo; what is tested here is every rule
// that decides what the wiring should do.

import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  draftProseHtml,
  draftStatus,
  isReaderEditable,
  readerDrawerId,
  readerEditableIds,
  readerHomeId
} from '../../site/demo/reader-edit-core.js';
import { evaluateDraft, previewSegments } from '../../site/demo/editor-core.js';
import { renderCsrReader } from '../../scripts/site-lib.mjs';
import { fixtureArds } from './text-test-helpers.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '..', '..');
const ards = fixtureArds();
const ardsBySlug = Object.fromEntries([...ards.entries()]);

// A minimal assembled document: one section, one included block, one excluded
// draft. Enough to exercise every branch of the affordance rule without dragging
// the whole 119-section model into a unit test.
function csrFixture() {
  return {
    json: {
      schema: 'opencsr/csr/v1',
      study: { id: 'CDISCPILOT01' },
      sections: [
        {
          number: '12.2.1',
          slug: 'ae-brief-summary',
          title: 'Brief Summary of Adverse Events',
          level: 1,
          populated: true,
          blocks: [
            {
              id: 'TXT-E3-1221',
              tier: 'parameterized',
              included: true,
              markdown: 'Adverse events were reported by many subjects.',
              bindings: []
            },
            {
              id: 'TXT-E3-1206',
              tier: 'generated',
              included: false,
              exclusionReason: 'generated-tier block is draft',
              markdown: 'A draft conclusion.',
              bindings: []
            }
          ]
        }
      ],
      displayIndex: []
    },
    html: null
  };
}

function renderReader({ editable = null } = {}) {
  return renderCsrReader({
    config: { study: { id: 'CDISCPILOT01' } },
    csr: csrFixture(),
    displays: [],
    ards: ardsBySlug,
    traceIndex: {},
    textBlocks: [],
    editable
  });
}

describe('where the reading view offers to edit', () => {
  test('TXT-EDIT-013: a block with an editor gets an affordance and a drawer bound to it (#15)', () => {
    const html = renderReader({ editable: new Set(['TXT-E3-1221']) });
    expect(html).toContain('data-reader-block="TXT-E3-1221"');
    expect(html).toContain('data-reader-edit="TXT-E3-1221"');
    // The control names the drawer it opens, and the drawer exists to be named.
    expect(html).toContain(`aria-controls="${readerDrawerId('TXT-E3-1221')}"`);
    expect(html).toContain(`id="${readerDrawerId('TXT-E3-1221')}"`);
    expect(html).toMatch(/data-reader-edit="TXT-E3-1221"[^>]*aria-expanded="false"/);
    // A real button, so Tab reaches it and Enter and Space work without the app
    // implementing key handling.
    expect(html).toContain('<button type="button" class="rdr-edit"');
  });

  test('TXT-EDIT-013: the drawer ships empty — the Reader renders no second editor (#15)', () => {
    const html = renderReader({ editable: new Set(['TXT-E3-1221']) });
    expect(html).toContain(`data-reader-drawer="TXT-E3-1221" hidden></div>`);
    // Two editors for one block would mean two drafts and two textareas with the
    // same DOM id. The Reader borrows; it does not copy.
    expect(html).not.toContain('data-editor="TXT-E3-1221"');
    expect(html).not.toContain('data-editor-source');
  });

  test('TXT-EDIT-014: with no editors mounted the Reader renders exactly as before (#15)', () => {
    const plain = renderReader();
    expect(plain).not.toContain('data-reader-edit');
    expect(plain).not.toContain('rdr-drawer');
    expect(plain).not.toContain('data-reader-prose');
    // This is the standalone /reader/ page: there is no editor there to adopt,
    // and an affordance that opens nothing is worse than no affordance.
    expect(plain).toContain('csr-text');
  });

  test('TXT-EDIT-014: a block held out of the report is not editable from the report (#15)', () => {
    const html = renderReader({ editable: new Set(['TXT-E3-1221', 'TXT-E3-1206']) });
    // The excluded block renders as the excluded-block notice, with no control:
    // editing it here would imply it were part of the assembled document.
    expect(html).not.toContain('data-reader-edit="TXT-E3-1206"');
    expect(html).toContain('data-reader-edit="TXT-E3-1221"');
  });

  test('TXT-EDIT-014: the editable rule is one function, and it says why (#15)', () => {
    const blocks = [
      { id: 'A', included: true },
      { id: 'B', included: false },
      { id: 'C', included: true },
      { kind: 'display', slug: 't-ae-overview' },
      { included: true }
    ];
    expect(readerEditableIds(blocks, new Set(['A', 'B', 'C']))).toEqual(['A', 'C']);
    // Not mounted by the build → not editable, whatever the document says.
    expect(readerEditableIds(blocks, new Set(['A']))).toEqual(['A']);
    expect(readerEditableIds(blocks, [])).toEqual([]);
    expect(isReaderEditable({ id: 'A', included: true }, new Set(['A']))).toBe(true);
    expect(isReaderEditable({ id: 'A', included: true }, new Set())).toBe(false);
  });

  test('TXT-EDIT-015: drawer and home ids are derived, never authored, and collision-free (#15)', () => {
    // The server renders the drawer id; the client computes the home id when it
    // moves the editor. They are the same convention or the editor never gets
    // home, so both come from here.
    expect(readerDrawerId('TXT-E3-1221')).toBe('rdr-drawer-txt-e3-1221');
    expect(readerHomeId('TXT-E3-1221')).toBe('rdr-home-txt-e3-1221');
    expect(readerDrawerId('weird id/with.punctuation')).toBe('rdr-drawer-weird-id-with-punctuation');
    expect(readerDrawerId('A')).not.toBe(readerHomeId('A'));
  });
});

describe('what a draft looks like in the reading view', () => {
  const meta = { id: 'TXT-E3-1221', displays: ['t-ae-overview'], allow_digits: [] };
  const body =
    'Adverse events were reported by {{ard:t-ae-overview:any_ae:n;group=Placebo}} subjects ' +
    'receiving placebo.';

  test('TXT-EDIT-016: a computed value is marked in the prose, as the document marks it (#15)', () => {
    const result = evaluateDraft({ meta, body, ards, context: {} });
    const html = draftProseHtml(previewSegments(result.text, result.spans, result.violations), (t) => t);
    expect(html).toContain('<p>');
    expect(html).toContain('class="binding is-draft"');
    expect(html).toContain('Computed from the committed ARD');
    // A draft binding carries no trace hooks: the trace panel answers questions
    // about the committed report, and a draft is not in it.
    expect(html).not.toContain('data-trace');
  });

  test('TXT-EDIT-016: a number that came from no binding is marked as the failure it is (#15)', () => {
    const typed = 'Exactly 42 subjects reported an event.';
    const result = evaluateDraft({ meta, body: typed, ards, context: {} });
    const html = draftProseHtml(previewSegments(result.text, result.spans, result.violations), (t) => t);
    expect(result.ok).toBe(false);
    expect(html).toContain('class="fidelity-violation"');
    expect(html).toContain('the numeric-fidelity gate fails it');
  });

  test('TXT-EDIT-016: paragraphs survive, and the escaper is the caller\'s (#15)', () => {
    const segments = [{ kind: 'text', text: 'First paragraph.\n\nSecond <b>paragraph</b>.' }];
    const escaped = draftProseHtml(segments, (text) =>
      String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;')
    );
    expect(escaped).toBe('<p>First paragraph.</p><p>Second &lt;b&gt;paragraph&lt;/b&gt;.</p>');
    // Empty input is an empty rendering, not a stray paragraph.
    expect(draftProseHtml([], (t) => t)).toBe('');
  });

  test('TXT-EDIT-017: the block always says whether it is showing the report or a draft (#15)', () => {
    expect(draftStatus({ open: false, changed: false, ok: true })).toEqual({
      state: 'committed',
      label: null
    });
    expect(draftStatus({ open: true, changed: false, ok: true }).state).toBe('editing');

    const draft = draftStatus({ open: true, changed: true, ok: true });
    expect(draft.state).toBe('draft');
    // The load-bearing sentence: the reading view must not imply the report changed.
    expect(draft.label).toMatch(/assembled report still says/i);

    const failing = draftStatus({ open: true, changed: true, ok: false });
    expect(failing.state).toBe('failing');
    expect(failing.label).toMatch(/gates fail/i);
    expect(failing.label).toMatch(/committed source/i);
  });

  test('TXT-EDIT-017: an untouched block claims nothing at all (#15)', () => {
    // No label means no live region announcement and no visual marker: a block
    // nobody has edited is simply the report.
    expect(draftStatus({}).label).toBeNull();
    expect(draftStatus({ open: false, changed: true, ok: true }).state).toBe('draft');
  });
});

describe('the wiring the reading view depends on', () => {
  const client = readFileSync(path.join(rootDir, 'site', 'demo', 'reader-edit.js'), 'utf8');

  test('TXT-EDIT-018: the Reader moves the one editor rather than creating another (#15)', () => {
    // The whole "one instance" claim rests on this: the client looks the editor
    // up in the document, appends it to the drawer, and puts it back at a marker
    // it left behind. If this ever becomes innerHTML, drafts fork.
    expect(client).toMatch(/document\.querySelector\(`\[data-editor="\$\{cssEscape\(id\)\}"\]`\)/);
    expect(client).toContain('drawer.appendChild(editor)');
    expect(client).toContain('home.parentNode.insertBefore(editor, home)');
    expect(client).not.toMatch(/drawer\.innerHTML\s*=/);
  });

  test('TXT-EDIT-018: the Reader writes nothing and posts nowhere (#15)', () => {
    // The same guarantee the Text pane's editor makes, checked on the new surface:
    // one fetch of a same-origin build artifact, and no other traffic.
    const fetches = client.match(/fetch\(/g) || [];
    expect(fetches).toHaveLength(1);
    expect(client).toContain("fetch(`ard/${slug}.json`");
    expect(client).not.toMatch(/XMLHttpRequest|navigator\.sendBeacon|method:\s*'POST'/);
    expect(client).not.toMatch(/localStorage|sessionStorage/);
  });

  test('TXT-EDIT-018: closing the drawer restores the committed rendering (#15)', () => {
    // Not a re-render of the committed source — the document's own HTML, kept
    // from before the first edit, so what the reader sees afterwards is exactly
    // what the pipeline built.
    expect(client).toContain('const committedHtml = prose.innerHTML');
    expect(client).toContain('prose.innerHTML = committedHtml');
  });
});
