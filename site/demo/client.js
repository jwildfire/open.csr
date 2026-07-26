// Demo app client: tab switching and the shared selection (open.csr #113).
//
// All logic worth testing lives in core.js; this file is the DOM wiring only.
// The rules are unit-tested; the wiring is verified in the browser.
//
// Progressive enhancement is deliberate: the page ships with every pane
// server-rendered and the first pane visible, so with JavaScript off a visitor
// still reads the whole report, all six displays, the prose and the template
// model. This script makes it one app; it is not what makes it work.

import {
  DEFAULT_TAB,
  applySelection,
  formatAppHash,
  isTab,
  parseAppHash,
  resolveAppLink,
  resolveDisplay
} from './core.js';

const app = document.querySelector('[data-app]');
if (app) {
  // The views live in the app bar, which sits above <main> and so OUTSIDE
  // [data-app] (demo-layout.md §5). Panes are looked up inside the app; views and
  // the context readout are looked up in the document.
  const bar = document.querySelector('[data-app-bar]');
  const tabs = [...document.querySelectorAll('[data-app-tab]')];
  const panes = [...app.querySelectorAll('[data-app-pane]')];
  const contextEl = document.querySelector('[data-app-context]');
  const displaySlugs = [...app.querySelectorAll('[data-app-display-panel]')].map((el) =>
    el.getAttribute('data-app-display-panel')
  );

  let contextIndex = { study: '', displays: {} };
  try {
    const node = document.getElementById('app-context-index');
    if (node) contextIndex = JSON.parse(node.textContent);
  } catch (e) {
    /* a malformed index degrades to the study alone */
  }

  let state = { tab: DEFAULT_TAB, display: null, block: null, focus: null };

  function showTab(id) {
    for (const tab of tabs) {
      const on = tab.getAttribute('data-app-tab') === id;
      tab.classList.toggle('current', on);
      if (on) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    }
    for (const pane of panes) {
      const on = pane.getAttribute('data-app-pane') === id;
      pane.hidden = !on;
      pane.classList.toggle('current', on);
    }
  }

  // The context readout: what you are looking at, in the chrome rather than in a
  // dialog. Only the parts that apply to the current view are shown — the
  // display's number and provenance are meaningless in the Templates view.
  function showContext() {
    if (!contextEl) return;
    const parts = [];
    if (contextIndex.study) parts.push(`<span class="ac-study">${contextIndex.study}</span>`);
    const entry = state.tab === 'tables' ? contextIndex.displays[state.display] : null;
    if (entry) {
      if (entry.number) parts.push(`<span class="ac-number">${entry.number}</span>`);
      parts.push(`<span class="ac-slug">${state.display}</span>`);
      if (entry.version) parts.push(`<span class="ac-version">${entry.version}</span>`);
      if (entry.hash) {
        parts.push(`<span class="ac-hash" title="ARD sha256">ard&nbsp;${entry.hash}</span>`);
      }
    } else if (state.tab === 'text' && state.block) {
      parts.push(`<span class="ac-slug">${state.block}</span>`);
    }
    contextEl.innerHTML = parts.join('<span class="ac-sep" aria-hidden="true">·</span>');
  }

  function showDisplay(slug) {
    const resolved = resolveDisplay(slug, displaySlugs);
    for (const panel of app.querySelectorAll('[data-app-display-panel]')) {
      panel.hidden = panel.getAttribute('data-app-display-panel') !== resolved;
    }
    for (const option of app.querySelectorAll('[data-app-select-display]')) {
      const on = option.getAttribute('data-app-select-display') === resolved;
      option.classList.toggle('current', on);
      if (option.tagName === 'BUTTON') option.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    return resolved;
  }

  // Highlight the selected text block without hiding the others: the Text pane
  // is a status list, and losing your place in it is worse than scrolling.
  //
  // The block card owns `id="<blockId>"` — the same anchor the Text Library page
  // and the template model link to — so that is what is looked up here rather
  // than a second attribute that would have to be kept in sync with it.
  function markBlock(id) {
    for (const card of app.querySelectorAll('.app-selected')) card.classList.remove('app-selected');
    if (!id) return;
    const card =
      app.querySelector(`[data-app-block="${cssEscape(id)}"]`) ||
      app.querySelector(`#${cssEscape(id)}`);
    if (card) card.classList.add('app-selected');
  }

  function scrollToFocus(focus) {
    if (!focus) return;
    const target =
      app.querySelector(`#${cssEscape(focus)}`) ||
      app.querySelector(`[data-app-block="${cssEscape(focus)}"]`) ||
      app.querySelector(`[name="${cssEscape(focus)}"]`);
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  function cssEscape(value) {
    return window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/["\\]/g, '\\$&');
  }

  function render({ push = false } = {}) {
    showTab(state.tab);
    state.display = showDisplay(state.display);
    markBlock(state.block);
    showContext();
    const hash = formatAppHash(state);
    if (push && location.hash !== hash) {
      history.pushState(null, '', hash);
    }
    // Focus lands after the pane is visible, or the target has no layout yet.
    requestAnimationFrame(() => scrollToFocus(state.focus));
  }

  function goto(change, { push = true } = {}) {
    state = applySelection(state, change);
    render({ push });
  }

  // --- tab clicks ---------------------------------------------------------
  for (const tab of tabs) {
    tab.addEventListener('click', (event) => {
      event.preventDefault();
      goto({ tab: tab.getAttribute('data-app-tab'), focus: null });
    });
  }

  // Arrow keys move along the view bar. These are links, not a tablist, so Tab
  // still reaches each one — the arrows are an addition for a bar the user is
  // already inside, not a replacement for normal focus order.
  if (bar) {
    bar.addEventListener('keydown', (event) => {
      if (!event.target.closest('[data-app-tab]')) return;
      const index = tabs.findIndex((tab) => tab.getAttribute('data-app-tab') === state.tab);
      let next = null;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      if (next === null) return;
      event.preventDefault();
      goto({ tab: tabs[next].getAttribute('data-app-tab') });
      tabs[next].focus();
    });
  }

  // --- display selection -------------------------------------------------
  for (const option of app.querySelectorAll('[data-app-select-display]')) {
    option.addEventListener('click', (event) => {
      event.preventDefault();
      goto({ tab: 'tables', display: option.getAttribute('data-app-select-display'), focus: null });
    });
  }

  // --- the absorption: intra-app links become selection changes ----------
  // Every pane is an unmodified standalone surface, so it links to its siblings
  // with hrefs like ../gallery/t-ae-overview.html. core.js decides which of
  // those are pane crossings; the rest navigate for real.
  app.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button) {
      return;
    }
    const link = event.target.closest('a[href]');
    if (!link || !app.contains(link)) return;
    if (link.target && link.target !== '_self') return;
    const change = resolveAppLink(link.getAttribute('href'));
    if (!change) return;
    event.preventDefault();
    goto(change);
  });

  // --- history -----------------------------------------------------------
  window.addEventListener('popstate', () => {
    state = { ...parseAppHash(location.hash) };
    render({ push: false });
  });
  window.addEventListener('hashchange', () => {
    const next = parseAppHash(location.hash);
    if (formatAppHash(next) === formatAppHash(state)) return;
    state = { ...next };
    render({ push: false });
  });

  // --- boot --------------------------------------------------------------
  const initial = parseAppHash(location.hash);
  state = {
    ...initial,
    tab: isTab(initial.tab) ? initial.tab : DEFAULT_TAB
  };
  app.classList.add('app-live');
  render({ push: false });
}
