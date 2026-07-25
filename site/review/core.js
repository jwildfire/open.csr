// Review surface — the pure core (open.csr #2, requirement obot.roadmap#115).
//
// This module is shared verbatim by three callers: the Node site builder
// (scripts/review-lib.mjs), the vitest suite, and the browser client that runs
// on the published page. It therefore imports NOTHING — no node: builtins, no
// DOM — and holds only pure functions: request descriptors, payload
// construction, run selection, ledger normalization, row markup.
//
// Two invariants live here rather than in the client, because a rule that is
// only enforced inside an event handler is not enforced at all:
//
//   1. The reviewer's token is attached to api.github.com requests and to
//      nothing else. `assertApiUrl` is called by every request builder, so a
//      future caller cannot construct an authenticated request to another host
//      without deleting a line of this file.
//   2. A decision is validated before it is dispatched. "Request changes" with
//      no note is not a decision — the note IS the request.

export const API_ROOT = 'https://api.github.com';
export const EVENT_TYPE = 'text-decision';
export const DECISIONS = ['approve', 'changes'];
export const NOTE_MAX = 2000;
// A block id is a file stem under library/text/. The apply lane re-checks the
// resolved path, but a dispatch that could name `../../etc/passwd` should never
// leave the browser in the first place.
export const BLOCK_ID = /^TXT-[A-Za-z0-9][A-Za-z0-9_-]*$/;

export function escapeHtml(text) {
  return String(text ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

// --------------------------------------------------------------------------
// 1. The decision payload
// --------------------------------------------------------------------------

// The dispatch carries a decision, never an operation: the apply lane reads the
// block id, edits that block's approval frontmatter and nothing else, and
// re-runs the gates before it commits. Everything here is therefore about
// making the decision unambiguous — an unknown verb, an unnamed block or a
// changes request with no note is refused in the browser rather than becoming a
// workflow run that fails three minutes later.
export function buildDispatchPayload({ decision, blockId, note = '', reviewer = null } = {}) {
  const verb = String(decision || '').trim();
  if (!DECISIONS.includes(verb)) {
    throw new Error(`decision must be one of ${DECISIONS.join(' | ')} — got "${decision}"`);
  }
  const id = String(blockId || '').trim();
  if (!BLOCK_ID.test(id)) throw new Error(`"${blockId}" is not a text-block id`);

  const trimmed = String(note ?? '').trim().slice(0, NOTE_MAX);
  if (verb === 'changes' && !trimmed) {
    throw new Error('requesting changes needs a note — the note is the request');
  }
  const who = String(reviewer || '').trim().replace(/^@/, '');

  return {
    event_type: EVENT_TYPE,
    client_payload: {
      decision: verb,
      blockId: id,
      note: trimmed,
      reviewer: who || null
    }
  };
}

// --------------------------------------------------------------------------
// 2. Request descriptors
// --------------------------------------------------------------------------

export function assertApiUrl(url) {
  const value = String(url || '');
  if (!value.startsWith(`${API_ROOT}/`)) {
    throw new Error(`refusing to send a credential to ${value || '(empty url)'}`);
  }
  return value;
}

function headers(token, accept = 'application/vnd.github+json') {
  const base = { Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' };
  return token ? { ...base, Authorization: `Bearer ${token}` } : base;
}

function apiUrl(pathname, params = {}) {
  const query = Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return assertApiUrl(`${API_ROOT}${pathname}${query ? `?${query}` : ''}`);
}

export function dispatchRequest(repo, payload, token) {
  return {
    url: apiUrl(`/repos/${repo}/dispatches`),
    method: 'POST',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  };
}

// The dispatch response carries no run id (204, empty body), so the run has to
// be found: newest repository_dispatch runs, filtered to ones created after the
// click. `?event=repository_dispatch` is the whole reason this is reliable.
export function runsRequest(repo, token, { event = 'repository_dispatch', perPage = 15 } = {}) {
  return {
    url: apiUrl(`/repos/${repo}/actions/runs`, { event, per_page: perPage }),
    method: 'GET',
    headers: headers(token)
  };
}

export function runRequest(repo, runId, token) {
  return { url: apiUrl(`/repos/${repo}/actions/runs/${runId}`), method: 'GET', headers: headers(token) };
}

// The ledger is re-read through the contents API rather than from the site
// itself: the CDN caches the deployed copy for minutes, which would show the
// reviewer a ledger without the decision they just made.
export function ledgerRequest(repo, token, { path = 'site/text-decisions.json', ref = 'dev' } = {}) {
  return {
    url: apiUrl(`/repos/${repo}/contents/${path}`, { ref }),
    method: 'GET',
    headers: headers(token, 'application/vnd.github.raw+json')
  };
}

export function userRequest(token) {
  return { url: apiUrl('/user'), method: 'GET', headers: headers(token) };
}

// --------------------------------------------------------------------------
// 3. Runs
// --------------------------------------------------------------------------

function runWorkflowFile(run) {
  return String(run?.path || '').split('/').pop() || '';
}

// Pick the run this click produced: same workflow, created at or after the
// dispatch (minus a small clock allowance), newest first. A run that started
// before the click is somebody else's and is never adopted — reporting the
// wrong run is worse than reporting none.
export function selectRun(runs = [], { since = null, workflow = null, skewMs = 60000 } = {}) {
  const floor = since ? new Date(since).getTime() - skewMs : null;
  const candidates = (Array.isArray(runs) ? runs : runs?.workflow_runs || [])
    .filter((run) => !workflow || runWorkflowFile(run) === workflow)
    .filter((run) => {
      if (floor === null) return true;
      const created = new Date(run?.created_at || 0).getTime();
      return Number.isFinite(created) && created >= floor;
    })
    .sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0));
  return candidates[0] || null;
}

const CONCLUSION_KIND = {
  success: 'good',
  failure: 'bad',
  cancelled: 'warn',
  timed_out: 'bad',
  startup_failure: 'bad',
  action_required: 'warn',
  neutral: 'info',
  skipped: 'muted'
};

// One place that turns Actions' status/conclusion pair into something a
// reviewer reads. `waiting`/`requested`/`pending` all mean "not started yet".
export function describeRunState(run) {
  if (!run) return { state: 'unknown', label: 'no run located yet', kind: 'info', url: null };
  const status = String(run.status || '').toLowerCase();
  const url = run.html_url || null;
  if (status === 'completed') {
    const conclusion = String(run.conclusion || 'unknown').toLowerCase();
    return {
      state: 'done',
      label: conclusion === 'success' ? 'applied' : conclusion.replace(/_/g, ' '),
      conclusion,
      kind: CONCLUSION_KIND[conclusion] || 'warn',
      url
    };
  }
  if (status === 'in_progress') return { state: 'running', label: 'running', kind: 'info', url };
  return { state: 'queued', label: status ? status.replace(/_/g, ' ') : 'queued', kind: 'info', url };
}

// --------------------------------------------------------------------------
// 4. The decision ledger
// --------------------------------------------------------------------------
//
// Written by the apply lane (site/text-decisions.json), read here. The reader
// is deliberately forgiving about shape — a ledger produced by a workflow this
// page does not own must never be able to blank the page — but strict about
// order: newest first, because the last decision on a block is the one that
// counts.

const OUTCOMES = {
  applied: { label: 'applied', kind: 'good', hint: 'The block was edited, the gates re-ran, the commit landed.' },
  failed: { label: 'failed', kind: 'bad', hint: 'A gate failed — nothing was committed.' },
  rejected: { label: 'changes requested', kind: 'warn', hint: 'Recorded against the block; not approved.' },
  recorded: { label: 'recorded', kind: 'warn', hint: 'Recorded against the block; not approved.' },
  pending: { label: 'pending', kind: 'info', hint: 'Dispatched; the run has not reported yet.' },
  blocked: { label: 'blocked', kind: 'warn', hint: 'The lane could not act on this decision.' }
};

export function outcomePill(outcome) {
  const key = String(outcome || 'pending').toLowerCase();
  return OUTCOMES[key] || { label: key, kind: 'info', hint: '' };
}

// The producer (scripts/text-decision-lib.mjs `makeEntry`) writes a flat record:
// { block, decision, reviewer, at, note, outcome, detail, tier, priorState,
//   newState, runId, runUrl }. The alternates below (`blockId`, `by`, a nested
// `run` object) cost nothing and mean a shape change on the writing side
// degrades a column rather than blanking the history.
export function normalizeDecision(entry = {}) {
  const run = entry.run || null;
  const nestedId = typeof run === 'object' && run ? run.id ?? null : typeof run === 'number' ? run : null;
  const nestedUrl =
    typeof run === 'string' ? run : typeof run === 'object' && run ? run.url || run.html_url || null : null;
  const decision = String(entry.decision || '').trim().toLowerCase();
  const transition =
    entry.priorState && entry.newState && entry.priorState !== entry.newState
      ? `${entry.priorState} → ${entry.newState}`
      : '';
  // The producer's `detail` often already spells the transition out ("draft ->
  // approved"); repeating it beside itself reads as a bug in the ledger.
  const detailText = String(entry.detail || '');
  const transitionSaid = transition && detailText.replace(/-+>/g, '→').includes(transition);
  return {
    blockId: entry.blockId || entry.block || entry.id || null,
    decision: DECISIONS.includes(decision) ? decision : decision || 'unknown',
    by: String(entry.by || entry.reviewer || '').replace(/^@/, '') || null,
    at: entry.at || entry.timestamp || null,
    note: entry.note || '',
    outcome: String(entry.outcome || 'pending').toLowerCase(),
    detail: [detailText, transitionSaid ? '' : transition].filter(Boolean).join(' · '),
    tier: entry.tier || null,
    commit: entry.commit || null,
    runId: entry.runId ?? nestedId,
    runUrl: entry.runUrl ?? nestedUrl
  };
}

export function normalizeLedger(json) {
  const raw = Array.isArray(json) ? json : Array.isArray(json?.decisions) ? json.decisions : [];
  const decisions = raw
    .filter((entry) => entry && typeof entry === 'object')
    .map(normalizeDecision)
    .filter((entry) => entry.blockId);
  decisions.sort((a, b) => {
    const at = new Date(b.at || 0) - new Date(a.at || 0);
    return Number.isNaN(at) ? 0 : at;
  });
  return { version: json?.version ?? 1, decisions };
}

export function formatTimestamp(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)} UTC`;
}

const DECISION_LABEL = { approve: 'approved', changes: 'changes requested' };

// One row of the ledger. Shared by the builder (server render) and the client
// (after a decision lands) so a freshly added row is indistinguishable from a
// rebuilt one.
export function ledgerRowHtml(entry, { blockHref = null } = {}) {
  const decision = normalizeDecision(entry);
  const pill = outcomePill(decision.outcome);
  const block = blockHref
    ? `<a class="mono" href="${escapeHtml(blockHref)}">${escapeHtml(decision.blockId)}</a>`
    : `<span class="mono">${escapeHtml(decision.blockId)}</span>`;
  const run = decision.runUrl
    ? `<a href="${escapeHtml(decision.runUrl)}">run${decision.runId ? ` ${escapeHtml(decision.runId)}` : ''}</a>`
    : decision.runId
      ? `<span class="mono">run ${escapeHtml(decision.runId)}</span>`
      : '<span class="sub">—</span>';
  return (
    `<tr data-block="${escapeHtml(decision.blockId)}" data-outcome="${escapeHtml(decision.outcome)}">` +
    `<td>${block}</td>` +
    `<td>${escapeHtml(DECISION_LABEL[decision.decision] || decision.decision)}</td>` +
    `<td>${decision.by ? `@${escapeHtml(decision.by)}` : '<span class="sub">—</span>'}</td>` +
    `<td class="mono nowrap">${escapeHtml(formatTimestamp(decision.at))}</td>` +
    `<td class="ledger-note">` +
    (decision.note ? escapeHtml(decision.note) : '') +
    (decision.detail ? `<span class="sub">${decision.note ? ' ' : ''}${escapeHtml(decision.detail)}</span>` : '') +
    (decision.note || decision.detail ? '' : '<span class="sub">—</span>') +
    `</td>` +
    `<td><span class="chip chip-${pill.kind}" title="${escapeHtml(pill.hint)}">${escapeHtml(pill.label)}</span></td>` +
    `<td>${run}</td>` +
    `</tr>`
  );
}

// The fallback the page prints when nobody is connected: the same decision,
// carried by the gh CLI. An expired token must not mean there is no way to sign
// off (obot.roadmap#109).
export function fallbackCommand(repo, { decision, blockId, note = '', reviewer = null } = {}) {
  const payload = buildDispatchPayload({ decision, blockId, note, reviewer });
  const fields = [
    `-f event_type=${payload.event_type}`,
    `-f 'client_payload[decision]=${payload.client_payload.decision}'`,
    `-f 'client_payload[blockId]=${payload.client_payload.blockId}'`,
    `-f 'client_payload[note]=${payload.client_payload.note.replace(/'/g, "'\\''")}'`,
    `-f 'client_payload[reviewer]=${payload.client_payload.reviewer ?? ''}'`
  ];
  return `gh api repos/${repo}/dispatches ${fields.join(' ')}`;
}
