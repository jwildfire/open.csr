// Review page client (open.csr #2, requirement obot.roadmap#115).
//
// The page is static HTML on GitHub Pages. There is no server, so there is
// nothing to authenticate against and nothing to proxy through: the reviewer
// connects once per browser with a fine-grained token held in localStorage, and
// every call after that goes straight to api.github.com, which sends CORS
// headers. (GitHub's OAuth device flow does not, which is why that shape needs
// a proxy and this one does not — obot.roadmap#109.)
//
// Everything the page does without script still works: the prose, the
// provenance, the binding tables and the ledger are all server-rendered. This
// file only ever ADDS capability — it enables the sign-off buttons once a token
// is present, dispatches the decision, follows the run, and refreshes the
// ledger from the API rather than from the CDN, which caches the deployed copy
// for minutes and would show a ledger without the decision just made.

import {
  buildDispatchPayload,
  describeRunState,
  dispatchRequest,
  ledgerRequest,
  ledgerRowHtml,
  normalizeLedger,
  runRequest,
  runsRequest,
  selectRun,
  userRequest
} from './core.js';

const TOKEN_KEY = 'opencsr-review-token';
const USER_KEY = 'opencsr-review-user';
const POLL_MS = 4000;
const POLL_LIMIT = 90; // ~6 minutes, then the page hands over to the run link.

const store = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  },
  set(key, value) {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch (error) {
      /* private mode: the session simply does not persist */
    }
  }
};

const configEl = document.getElementById('review-config');
if (configEl) {
  const cfg = JSON.parse(configEl.textContent || '{}');
  start(cfg);
}

function start(cfg) {
  const connect = document.getElementById('connect');
  const state = {
    token: store.get(TOKEN_KEY),
    user: store.get(USER_KEY)
  };

  const $ = (role, scope) => (scope || document).querySelector(`[data-role="${role}"]`);
  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  async function call(request) {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body
    });
    if (!response.ok) {
      const detail =
        response.status === 401
          ? 'the token was rejected — it may have expired'
          : response.status === 403
            ? 'forbidden — check the token has Contents: write on this repository'
            : response.status === 404
              ? 'not found — check the token is scoped to this repository'
              : await response.text().then((text) => text.slice(0, 200)).catch(() => '');
      const error = new Error(`GitHub API ${response.status}: ${detail}`);
      error.status = response.status;
      throw error;
    }
    if (response.status === 204) return null;
    const type = response.headers.get('content-type') || '';
    return type.indexOf('json') === -1 ? response.text() : response.json();
  }

  // ---------------------------------------------------------------- connected
  function paint() {
    const label = $('connect-state', connect);
    const hint = state.token
      ? `connected as @${state.user || 'unknown'}`
      : 'not connected';
    if (label) {
      label.innerHTML = state.token
        ? `<span class="chip chip-good">connected</span> ${hint}`
        : `<span class="chip chip-muted">read-only</span> ${hint}`;
    }
    document.querySelectorAll('.signoff').forEach((form) => {
      const locked = form.querySelector('[data-locked="approved"]');
      form.querySelectorAll('button[data-decision]').forEach((button) => {
        const isLockedApprove = button === locked;
        button.disabled = !state.token || isLockedApprove;
      });
      const formHint = $('hint', form);
      if (!formHint) return;
      formHint.textContent = state.token
        ? locked
          ? 'Already approved — requesting changes sends it back.'
          : 'Signed off as @' + (state.user || 'you') + '.'
        : 'Connect to sign off — the page is read-only until you do.';
    });
  }

  if (connect) {
    const form = $('connect-form', connect);
    const toggle = $('connect-toggle', connect);
    const status = $('connect-status', connect);

    if (toggle && form) {
      toggle.addEventListener('click', () => {
        form.hidden = !form.hidden;
        if (!form.hidden) {
          const input = $('token', form);
          if (input) input.focus();
        }
      });
    }

    const connectButton = $('connect', form);
    if (connectButton) {
      connectButton.addEventListener('click', async () => {
        const token = ($('token', form) || {}).value || '';
        const declared = (($('reviewer', form) || {}).value || '').trim().replace(/^@/, '');
        if (!token.trim()) {
          if (status) status.textContent = 'Paste a token first.';
          return;
        }
        if (status) status.textContent = 'Checking the token…';
        try {
          const user = await call(userRequest(token.trim()));
          state.token = token.trim();
          state.user = (user && user.login) || declared || null;
          store.set(TOKEN_KEY, state.token);
          store.set(USER_KEY, state.user);
          if (status) status.textContent = `Connected as @${state.user}. The token stays in this browser.`;
          const input = $('token', form);
          if (input) input.value = '';
          paint();
        } catch (error) {
          if (status) status.textContent = String(error.message || error);
        }
      });
    }

    const disconnect = $('disconnect', form);
    if (disconnect) {
      disconnect.addEventListener('click', () => {
        state.token = null;
        state.user = null;
        store.set(TOKEN_KEY, null);
        store.set(USER_KEY, null);
        if (status) status.textContent = 'Token forgotten. The page is read-only again.';
        paint();
      });
    }
  }

  // ------------------------------------------------------------------ decide
  async function follow(statusEl, since) {
    let run = null;
    for (let attempt = 0; attempt < POLL_LIMIT; attempt += 1) {
      await wait(POLL_MS);
      try {
        if (!run) {
          const runs = await call(runsRequest(cfg.repo, state.token));
          run = selectRun(runs && runs.workflow_runs, { since, workflow: cfg.workflow });
          if (!run) {
            statusEl.innerHTML = `<span class="chip chip-info">dispatched</span> waiting for the apply lane to pick it up…`;
            continue;
          }
        } else {
          run = await call(runRequest(cfg.repo, run.id, state.token));
        }
      } catch (error) {
        statusEl.innerHTML = `<span class="chip chip-warn">lost track of the run</span> ${escape(
          String(error.message || error)
        )}`;
        return null;
      }
      const described = describeRunState(run);
      const link = described.url ? ` <a href="${described.url}">run ${run.id}</a>` : '';
      statusEl.innerHTML =
        `<span class="chip chip-${described.kind}">${escape(described.label)}</span>${link}`;
      if (described.state === 'done') return { run, described };
    }
    statusEl.innerHTML += ' — still running; follow the run link for the outcome.';
    return null;
  }

  async function refreshLedger(blockId) {
    const body = document.getElementById('ledger-body');
    if (!body) return;
    try {
      const raw = await call(
        ledgerRequest(cfg.repo, state.token, { path: cfg.ledgerPath, ref: cfg.branch })
      );
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const ledger = normalizeLedger(parsed);
      body.innerHTML = ledger.decisions
        .map((entry) => ledgerRowHtml(entry, { blockHref: `#${entry.blockId}` }))
        .join('');
      const row = body.querySelector(`tr[data-block="${blockId}"]`);
      if (row) row.classList.add('just-landed');
      const empty = document.querySelector('#ledger .empty');
      if (empty && ledger.decisions.length) empty.remove();
    } catch (error) {
      /* the ledger will be right on the next deploy; the run link is authoritative */
    }
  }

  function escape(text) {
    return String(text).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  }

  document.querySelectorAll('.signoff').forEach((form) => {
    form.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-decision]');
      if (!button || button.disabled) return;
      event.preventDefault();
      const statusEl = $('status', form);
      const noteEl = $('note', form);
      const blockId = form.getAttribute('data-block');

      let payload;
      try {
        payload = buildDispatchPayload({
          decision: button.getAttribute('data-decision'),
          blockId,
          note: noteEl ? noteEl.value : '',
          reviewer: state.user
        });
      } catch (error) {
        statusEl.innerHTML = `<span class="chip chip-bad">not sent</span> ${escape(
          String(error.message || error)
        )}`;
        if (noteEl) noteEl.focus();
        return;
      }

      const buttons = [...form.querySelectorAll('button[data-decision]')];
      buttons.forEach((element) => {
        element.disabled = true;
      });
      statusEl.innerHTML = '<span class="chip chip-info">dispatching…</span>';
      const since = new Date().toISOString();

      try {
        await call(dispatchRequest(cfg.repo, payload, state.token));
      } catch (error) {
        statusEl.innerHTML = `<span class="chip chip-bad">dispatch failed</span> ${escape(
          String(error.message || error)
        )}`;
        paint();
        return;
      }

      const finished = await follow(statusEl, since);
      await refreshLedger(blockId);
      if (finished && finished.described.conclusion === 'success') {
        const card = document.getElementById(blockId);
        if (card) card.classList.add('decided');
        statusEl.innerHTML +=
          payload.client_payload.decision === 'approve'
            ? ' — approval committed; the report was reassembled with this block in it. Reload for the rebuilt page.'
            : ' — change request recorded against the block.';
      }
      paint();
    });
  });

  paint();
}
