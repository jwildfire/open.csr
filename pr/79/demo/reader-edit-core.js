// Editing from the reading view: the pure half (open.csr #15, obot.roadmap #129 C).
//
// The Text pane can edit a block; the Reader can only read one. A writer who
// notices a sentence while reading has to leave the report to change it. Option C
// of #129 closes that seam the cheap way: clicking Edit on a block in the Reader
// opens **the editor that already exists** in a drawer beneath that block, and the
// block above the drawer re-renders as the prose changes — so the reading view is
// the preview and reading context is never lost.
//
// Two rules make this an overlay rather than a second editor, and both live here
// because both are worth testing:
//
//   1. ONE INSTANCE PER BLOCK. The Reader does not render an editor. It renders an
//      empty drawer, and the client *moves* the Text pane's editor node into it,
//      returning it to its home when the drawer closes. Two editors for one block
//      would mean two drafts, two textareas with the same DOM id, and a patch that
//      depends on which surface the writer happened to use last.
//
//   2. A DRAFT IS NEVER THE REPORT. The assembled document on the page is what the
//      pipeline built from committed source. While a draft differs from it, the
//      block says so — because a reading view that silently shows uncommitted text
//      is a reading view that lies about what the report says.
//
// The rendering of a draft is deliberately NOT markdown: `marked` does not ship to
// the browser (contracts §9 — no CDN, no bundler), and the editor's own preview
// made the same call for the same reason. Paragraphs and marked values are what a
// writer is checking; the pipeline renders the final markdown.

/** The drawer that hosts the editor for a block, by block id. */
export function readerDrawerId(blockId) {
  return `rdr-drawer-${slug(blockId)}`;
}

/** The anchor the editor returns to when the drawer closes. */
export function readerHomeId(blockId) {
  return `rdr-home-${slug(blockId)}`;
}

function slug(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-');
}

/**
 * Which blocks in the reading view may be edited.
 *
 * A block is editable when it is a text block with an id, it is *in* the document
 * (an excluded draft is reported, not edited, and editing it here would imply it
 * were part of the report), and the build actually mounted an editor for it. The
 * last condition is what keeps the affordance honest on the standalone /reader/
 * page, where no editor exists to adopt: no editors, no Edit buttons.
 *
 * @param {Array} blocks   the section's content blocks, as normalized by normalizeCsr
 * @param {Set<string>|Array<string>} editable ids the build mounted an editor for
 */
export function readerEditableIds(blocks = [], editable = new Set()) {
  const available = editable instanceof Set ? editable : new Set(editable || []);
  return blocks
    .filter(
      (block) =>
        block &&
        block.kind !== 'display' &&
        block.id &&
        block.included !== false &&
        available.has(block.id)
    )
    .map((block) => block.id);
}

/** Is this one block editable in the reading view? */
export function isReaderEditable(block, editable = new Set()) {
  return readerEditableIds([block], editable).length === 1;
}

const SEGMENT_CLASS = {
  bound: 'binding is-draft',
  xref: 'xref is-draft',
  violation: 'fidelity-violation'
};

const SEGMENT_TITLE = {
  bound: 'Computed from the committed ARD',
  xref: 'Cross-reference, resolved at assembly',
  violation: 'This number came from no binding — the numeric-fidelity gate fails it'
};

/**
 * Render an evaluated draft as reading-view prose.
 *
 * The classes are the Reader's own (`binding`, `fidelity-violation`) plus
 * `is-draft`, so an edited block looks like the document it is part of rather than
 * like a text box that happens to sit in one — but never *identical* to it: a
 * draft binding carries no trace hooks, because the trace panel answers questions
 * about the committed report and a draft is not in it.
 *
 * @param {Array<{kind: string, text: string}>} segments from `previewSegments`
 * @param {(text: string) => string} escape HTML escaper (the caller's, so this
 *   module stays dependency-free and identical in node and the browser)
 */
export function draftProseHtml(segments = [], escape = (text) => text) {
  const paragraphs = [[]];
  for (const segment of segments) {
    const parts = String(segment.text).split(/\n{2,}/);
    parts.forEach((part, index) => {
      if (index > 0) paragraphs.push([]);
      if (part !== '') paragraphs[paragraphs.length - 1].push({ ...segment, text: part });
    });
  }
  return paragraphs
    .filter((paragraph) => paragraph.length)
    .map(
      (paragraph) =>
        `<p>${paragraph
          .map((segment) => {
            const html = escape(segment.text).replace(/\n/g, ' ');
            const className = SEGMENT_CLASS[segment.kind];
            if (!className) return html;
            return (
              `<span class="${className}" title="${escape(SEGMENT_TITLE[segment.kind])}">` +
              `${html}</span>`
            );
          })
          .join('')}</p>`
    )
    .join('');
}

/**
 * What the block should say about itself right now.
 *
 * Four states, and the difference between them is the whole honesty argument:
 * a block that has not been touched is the report; a block being edited whose
 * draft still matches the committed source is the report; a block whose draft
 * differs is NOT the report and says so; and a draft that fails the gates says
 * that too, because a writer should not have to open the drawer to learn it.
 *
 * @returns {{state: 'committed'|'editing'|'draft'|'failing', label: string|null}}
 */
export function draftStatus({ open = false, changed = false, ok = true } = {}) {
  if (changed && !ok) {
    return {
      state: 'failing',
      label: 'Unsaved draft — gates fail. The report still says what the committed source says.'
    };
  }
  if (changed) {
    return {
      state: 'draft',
      label: 'Unsaved draft shown. The assembled report still says what the committed source says.'
    };
  }
  if (open) {
    return { state: 'editing', label: 'Editing — the prose matches the committed source.' };
  }
  return { state: 'committed', label: null };
}
