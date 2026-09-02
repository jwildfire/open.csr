// Pure selection-state logic for the Demo app (open.csr #113 increment A).
//
// The Demo surface is one page with four panes — Reader, Tables, Text,
// Templates — that share a selection. This module owns what that selection IS
// and how it is encoded, with no DOM in sight, so the builder, the client and
// the test suite all agree on the same rules: pure logic here, DOM wiring in
// client.js.
//
// The load-bearing idea: the panes are the existing standalone surfaces,
// unmodified. What makes them one app is that a link *between* them is
// intercepted and resolved into a selection change instead of a navigation.
// That is why `resolveAppLink` is the centre of this file — cross-pane
// behaviour is a link-rewriting rule, not a rewrite of every renderer.

export const TAB_IDS = ['documents', 'displays', 'text', 'values', 'data', 'templates'];

export const DEFAULT_TAB = 'documents';

/** Is this a tab the app knows how to show? */
export function isTab(id) {
  return TAB_IDS.includes(String(id || ''));
}

/**
 * Decode the app's selection from a URL hash.
 *
 * `#tab=tables&display=t-ae-overview&focus=binding-3`
 *
 * Unknown tabs fall back to the default rather than rendering an empty app, and
 * a hash from an older link shape simply loses the parts this version does not
 * understand. A deep link is a convenience; it must never be able to break the
 * page.
 */
export function parseAppHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const params = new URLSearchParams(raw);
  const tab = params.get('tab');
  return {
    tab: isTab(tab) ? tab : DEFAULT_TAB,
    doc: params.get('doc') || null,
    display: params.get('display') || null,
    block: params.get('block') || null,
    focus: params.get('focus') || null
  };
}

/** Encode a selection back into a hash. Empty parts are omitted, so the common case stays short. */
export function formatAppHash({
  tab = DEFAULT_TAB,
  doc = null,
  display = null,
  block = null,
  focus = null
} = {}) {
  const params = new URLSearchParams();
  params.set('tab', isTab(tab) ? tab : DEFAULT_TAB);
  if (doc) params.set('doc', doc);
  if (display) params.set('display', display);
  if (block) params.set('block', block);
  if (focus) params.set('focus', focus);
  return `#${params.toString()}`;
}

/**
 * Resolve a link found inside the app into a selection change, or `null` to let
 * the browser navigate normally.
 *
 * Three of the four panes are the standalone `/reader/`, `/gallery/` and
 * `/text/` surfaces, which link to each other with relative hrefs like
 * `../gallery/t-ae-overview.html`. Inside the app those destinations are panes,
 * so the link becomes a tab switch carrying a selection. Everything else —
 * Quality, Design & Research, the repository, any absolute URL — is a real
 * navigation and is left alone.
 *
 * @param {string} href the link's raw href attribute
 * @returns {{tab: string, display?: string, block?: string, focus?: string}|null}
 */
export function resolveAppLink(href) {
  const raw = String(href || '').trim();
  if (!raw) return null;
  // Absolute URLs, protocol-relative URLs, mailto: and bare fragments are never
  // pane crossings. A bare fragment is in-pane scrolling and must keep working.
  if (/^([a-z]+:|\/\/|#)/i.test(raw)) return null;

  const [pathPart, fragment = ''] = raw.split('#');
  // Strip any number of leading ../ so the rule holds at whatever depth the
  // pane fragment was authored for.
  const clean = pathPart.replace(/^(\.\.?\/)+/, '').replace(/^\/+/, '');
  const focus = fragment || null;

  // The emitted paths keep their v0 names — /reader/ and /gallery/ are what the
  // evidence pages and the trace panel already link to — while the views they
  // open are now called Documents and Displays. Renaming the directories would
  // break every one of those links for a vocabulary change.
  // Every document publishes a standalone reader page, and inside the app each
  // one is a PANEL rather than a destination — the same absorption the gallery
  // already got. `reader/index.html` is the primary document's page, so it
  // names the document `index`; every other object names itself. The document
  // key travels as the file's own basename because that is what a link between
  // panes actually says; the client resolves it to a document id against the
  // panels the page rendered (open.csr #36).
  if (clean === 'reader/index.html' || clean === 'reader/') {
    return { tab: 'documents', doc: 'index', focus };
  }
  const reader = clean.match(/^reader\/([a-z0-9-]+)\.html$/);
  if (reader) {
    return { tab: 'documents', doc: reader[1], focus };
  }
  if (clean === 'gallery/index.html' || clean === 'gallery/') {
    return { tab: 'displays', focus };
  }
  const gallery = clean.match(/^gallery\/([a-z0-9-]+)\.html$/);
  if (gallery) {
    return { tab: 'displays', display: gallery[1], focus };
  }
  if (clean === 'templates/index.html' || clean === 'templates/') {
    return { tab: 'templates', focus };
  }
  if (clean === 'text/index.html' || clean === 'text/') {
    return { tab: 'text', block: blockFromFragment(fragment), focus };
  }
  // The values surface (#129 B). A value is selected by its own anchor rather
  // than by a fourth selection key: the pane is one list, and `focus` already
  // means "the thing in this pane I am looking at".
  if (clean === 'values/index.html' || clean === 'values/') {
    return { tab: 'values', focus };
  }
  // The Data pane (#76). A dataset is one section of one page, so its
  // standalone permalink becomes the pane with that section in focus — the
  // Values arrangement, for the same reason: the pane is one list.
  if (clean === 'data/index.html' || clean === 'data/') {
    return { tab: 'data', focus };
  }
  const dataset = clean.match(/^data\/([a-z0-9-]+)\.html$/);
  if (dataset) {
    return { tab: 'data', focus: dataset[1] === 'lanes' ? 'lanes' : `dataset-${dataset[1]}` };
  }
  return null;
}

/**
 * A text-block anchor inside the Text pane is `#TXT-E3-1202` or
 * `#block-TXT-E3-1202`; either way the block id is the selection.
 */
export function blockFromFragment(fragment) {
  const raw = String(fragment || '').replace(/^#/, '');
  if (!raw) return null;
  const match = raw.match(/(TXT-[A-Z0-9]+-\d+)/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Apply a resolved link to the current selection.
 *
 * A crossing that names no display keeps the display already selected, so
 * moving Reader → Tables → Reader does not silently reset what the visitor was
 * looking at. That persistence is the whole point of a shared selection.
 */
export function applySelection(current, change) {
  if (!change) return current;
  return {
    tab: isTab(change.tab) ? change.tab : current.tab,
    doc: change.doc || current.doc,
    display: change.display || current.display,
    block: change.block || current.block,
    focus: change.focus ?? null
  };
}

/**
 * Which document should the Documents pane show?
 *
 * The selection may arrive as a document id (the explorer names documents) or
 * as the basename of that document's standalone reader page (a link between
 * panes names pages). Both mean the same document, so both resolve here rather
 * than forcing every caller to know which vocabulary it holds.
 *
 * Falls back to the first rendered document — a stale deep link degrades to the
 * primary document rather than to an empty pane, exactly as `resolveDisplay`
 * degrades to the first display.
 *
 * @param {string|null} selected a document id or a reader-page basename
 * @param {Array<{id: string, file?: string}|string>} available rendered documents
 * @returns {string|null} the id of the document to show
 */
export function resolveDocument(selected, available = []) {
  const entries = available
    .map((entry) =>
      typeof entry === 'string'
        ? { id: entry, file: null }
        : { id: String(entry?.id ?? ''), file: entry?.file ? String(entry.file) : null }
    )
    .filter((entry) => entry.id);
  if (!entries.length) return null;
  const want = String(selected == null ? '' : selected);
  if (want) {
    const hit = entries.find((entry) => entry.id === want || entry.file === want);
    if (hit) return hit.id;
  }
  return entries[0].id;
}

/**
 * Which display should the Tables pane show?
 *
 * Falls back to the first available display rather than showing an empty pane,
 * and rejects a slug that is not in the build — a stale deep link degrades to
 * the default instead of a blank screen.
 */
export function resolveDisplay(selected, available = []) {
  const list = available.map(String);
  if (selected && list.includes(String(selected))) return String(selected);
  return list[0] || null;
}
