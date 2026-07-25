// Demo app client: tab switching and the shared selection (open.csr #113).
//
// All logic worth testing lives in core.js; this file is the DOM wiring only.
// It is the same split the review client uses, and for the same reason — the
// rules are unit-tested, the wiring is verified in the browser.
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
  const tabs = [...app.querySelectorAll('[data-app-tab]')];
  const panes = [...app.querySelectorAll('[data-app-pane]')];
  const displaySlugs = [...app.querySelectorAll('[data-app-display-panel]')].map((el) =>
    el.getAttribute('data-app-display-panel')
  );

  let state = { tab: DEFAULT_TAB, display: null, block: null, focus: null };

  function showTab(id) {
    for (const tab of tabs) {
      const on = tab.getAttribute('data-app-tab') === id;
      tab.classList.toggle('current', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
    }
    for (const pane of panes) {
      const on = pane.getAttribute('data-app-pane') === id;
      pane.hidden = !on;
      pane.classList.toggle('current', on);
    }
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
  // is a review queue, and losing your place in it is worse than scrolling.
  //
  // The review card owns `id="<blockId>"` (it is what the decision ledger and the
  // review client both target), so that is what is looked up here rather than a
  // second attribute that would have to be kept in sync with it.
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

  // Roving arrow-key focus across the tablist, as the ARIA pattern expects.
  const tablist = app.querySelector('[role="tablist"]');
  if (tablist) {
    tablist.addEventListener('keydown', (event) => {
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
