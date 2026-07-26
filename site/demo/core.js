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

export const TAB_IDS = ['reader', 'tables', 'text', 'templates'];

export const DEFAULT_TAB = 'reader';

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
    display: params.get('display') || null,
    block: params.get('block') || null,
    focus: params.get('focus') || null
  };
}

/** Encode a selection back into a hash. Empty parts are omitted, so the common case stays short. */
export function formatAppHash({ tab = DEFAULT_TAB, display = null, block = null, focus = null } = {}) {
  const params = new URLSearchParams();
  params.set('tab', isTab(tab) ? tab : DEFAULT_TAB);
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

  if (clean === 'reader/index.html' || clean === 'reader/') {
    return { tab: 'reader', focus };
  }
  if (clean === 'gallery/index.html' || clean === 'gallery/') {
    return { tab: 'tables', focus };
  }
  const gallery = clean.match(/^gallery\/([a-z0-9-]+)\.html$/);
  if (gallery) {
    return { tab: 'tables', display: gallery[1], focus };
  }
  if (clean === 'text/index.html' || clean === 'text/') {
    return { tab: 'text', block: blockFromFragment(fragment), focus };
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
    display: change.display || current.display,
    block: change.block || current.block,
    focus: change.focus ?? null
  };
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
