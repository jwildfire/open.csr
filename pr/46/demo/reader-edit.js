// Editing from the reading view: the DOM wiring (open.csr #15, obot.roadmap #129 C).
//
// Every rule worth testing is in reader-edit-core.js, editor-core.js and
// text-core.js. This file does one thing those cannot: it MOVES the editor.
//
// The move is the design. The Text pane already mounts an editor per block, with
// its own textarea, its own listeners and its own draft; the Reader renders an
// empty drawer. Clicking Edit relocates that existing node into the drawer and
// closing returns it home. So there is exactly one editor per block on the page,
// one draft, one set of DOM ids, and one implementation — the one CI runs — no
// matter which surface the writer is looking at. A writer can start a sentence in
// the Reader, switch to the Text pane, and find their draft where they left it.
//
// While the drawer is open the block above it renders the draft, so the reading
// view IS the preview. The editor's own preview column is hidden in this context
// (it would be the same words twice), and restored when the editor goes home.
//
// Nothing here writes, posts or approves. The output is still a patch.

import { evaluateDraft, previewSegments } from './editor-core.js';
import { draftProseHtml, draftStatus, readerHomeId } from './reader-edit-core.js';

function escape(text) {
  return String(text).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );
}

const ardCache = new Map();

// Same artifact, same path and same cache mode as the Text pane's editor: a
// block opened in one surface costs nothing to open in the other.
async function loadArd(slug) {
  if (ardCache.has(slug)) return ardCache.get(slug);
  const pending = fetch(`ard/${slug}.json`, { cache: 'force-cache' })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
  ardCache.set(slug, pending);
  return pending;
}

/**
 * Wire the reading view's Edit affordances.
 *
 * @param {Document|Element} root
 * @param {object} options
 * @param {object} options.context xref + values indices, as the editor uses
 */
export function initReaderEditors(root = document, { context = null } = {}) {
  const blocks = [...root.querySelectorAll('[data-reader-block]')];
  if (!blocks.length) return;

  let indices = context;
  if (!indices) {
    // The same index the Text pane's editor reads. Sharing it means the Reader
    // cannot resolve a cross-reference or a named value differently from the
    // editor, which would be a third opinion about what the gates say.
    try {
      const bar = root.querySelector('[data-editor-all]') || document.querySelector('[data-editor-all]');
      indices = JSON.parse(bar?.getAttribute('data-editor-context') || '{}');
    } catch {
      indices = {};
    }
  }

  for (const block of blocks) attachBlock(block, indices);
}

function attachBlock(block, context) {
  const id = block.getAttribute('data-reader-block');
  const button = block.querySelector('[data-reader-edit]');
  const drawer = block.querySelector('[data-reader-drawer]');
  const prose = block.querySelector('[data-reader-prose]');
  const note = block.querySelector('[data-reader-draft-note]');
  if (!id || !button || !drawer || !prose) return;

  // The document's own rendering of this block, kept so that closing the drawer
  // or reverting the draft restores the report rather than a re-render of it.
  const committedHtml = prose.innerHTML;
  const ards = {};
  let editor = null;
  let meta = {};
  let source = null;
  let loaded = false;

  function markDraft({ open, changed, ok }) {
    const status = draftStatus({ open, changed, ok });
    block.dataset.readerState = status.state;
    if (!note) return;
    note.textContent = status.label || '';
    note.hidden = !status.label;
  }

  function renderDraft() {
    if (!source) return;
    const body = source.value;
    const changed = body !== source.defaultValue;
    if (!changed) {
      prose.innerHTML = committedHtml;
      markDraft({ open: true, changed: false, ok: true });
      return;
    }
    const result = evaluateDraft({ meta, body, ards, context });
    prose.innerHTML = draftProseHtml(
      previewSegments(result.text, result.spans, result.violations),
      escape
    );
    markDraft({ open: true, changed: true, ok: result.ok });
  }

  async function open() {
    editor = document.querySelector(`[data-editor="${cssEscape(id)}"]`);
    if (!editor) {
      // No editor was mounted for this block — the affordance should not have
      // rendered, so say so rather than opening an empty drawer.
      button.disabled = true;
      button.title = 'No editor is available for this block in this build.';
      return;
    }
    if (!editor.dataset.readerHome) {
      // Leave a marker where the editor lives so it can be put back exactly
      // there, however the writer leaves the drawer.
      const home = document.createElement('span');
      home.id = readerHomeId(id);
      home.hidden = true;
      home.setAttribute('data-reader-home-for', id);
      editor.parentNode.insertBefore(home, editor);
      editor.dataset.readerHome = home.id;
    }

    drawer.hidden = false;
    drawer.appendChild(editor);
    editor.classList.add('in-reader');
    editor.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    button.textContent = 'Close editor';
    block.classList.add('is-editing');

    meta = JSON.parse(editor.getAttribute('data-editor-meta') || '{}');
    source = editor.querySelector('[data-editor-source]');

    // Open the editor's own panel through its own control, so the Reader never
    // needs to know how the editor opens itself.
    const toggle = editor.querySelector('[data-editor-toggle]');
    if (toggle && toggle.getAttribute('aria-expanded') !== 'true') toggle.click();

    if (!loaded) {
      loaded = true;
      const slugs = (editor.getAttribute('data-editor-ards') || '').split(/\s+/).filter(Boolean);
      const results = await Promise.all(slugs.map((slug) => loadArd(slug)));
      slugs.forEach((slug, index) => {
        if (results[index]) ards[slug] = results[index];
      });
    }
    renderDraft();
    if (source && !source.dataset.readerBound) {
      source.dataset.readerBound = 'true';
      source.addEventListener('input', () => {
        if (block.classList.contains('is-editing')) renderDraft();
      });
    }
    block.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function close() {
    if (editor) {
      const home = document.getElementById(editor.dataset.readerHome || '');
      editor.classList.remove('in-reader');
      if (home && home.parentNode) home.parentNode.insertBefore(editor, home);
      const toggle = editor.querySelector('[data-editor-toggle]');
      if (toggle && toggle.getAttribute('aria-expanded') === 'true') toggle.click();
    }
    drawer.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    button.textContent = 'Edit';
    block.classList.remove('is-editing');
    // The document is the document again. A draft that is still in the editor is
    // not lost — it is where the writer left it, in the Text pane.
    prose.innerHTML = committedHtml;
    const changed = Boolean(source && source.value !== source.defaultValue);
    markDraft({ open: false, changed: false, ok: true });
    if (changed && note) {
      note.hidden = false;
      note.textContent = 'An unsaved draft of this block is open in the Text pane.';
    }
  }

  button.addEventListener('click', () => {
    if (drawer.hidden) open();
    else close();
  });
}

function cssEscape(value) {
  return window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/["\\]/g, '\\$&');
}
