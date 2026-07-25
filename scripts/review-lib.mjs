// The Review surface (open.csr #2, requirement obot.roadmap#115).
//
// Text blocks in the `generated` tier are drafted by an agent and excluded from
// the assembled report until a human approves them (design D8/D9). Until now
// approving one meant editing YAML frontmatter in a text editor. This module
// renders the page where that judgment is actually made.
//
// What a reviewer needs in front of them, and therefore what this renders:
//
//   the prose AS IT WILL READ, with every computed value marked and linked to
//   the ARD row it came from; the tier and approval state; for agent-drafted
//   blocks the model, the full prompt and the generation date, near the top
//   rather than in a footnote; every binding resolved into a table so a number
//   can be checked without opening another page; and the decisions already
//   taken, on the same page they were taken on.
//
// The page is static. A decision leaves the browser as a `text-decision`
// repository_dispatch (site/review/client.js), is applied by a workflow that
// re-runs the gates before it commits, and comes back as a ledger entry. Read
// only — nobody connected — the page must still be completely readable and say
// plainly how to connect and how to sign off without connecting.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  BINDING_RE,
  chip,
  empty,
  escapeHtml,
  formatStat,
  renderMarkdown,
  renderXrefs,
  resolveBinding
} from './site-lib.mjs';
import {
  EVENT_TYPE,
  fallbackCommand,
  formatTimestamp,
  ledgerRowHtml,
  normalizeLedger
} from '../site/review/core.js';

// ---------------------------------------------------------------------------
// 1. Configuration and inputs
// ---------------------------------------------------------------------------

const DEFAULTS = {
  repo: 'jwildfire/open.csr',
  branch: 'dev',
  workflow: 'text-decision.yml',
  ledgerPath: 'site/text-decisions.json',
  eventType: EVENT_TYPE,
  reviewer: null
};

// The registry may name the apply lane and the branch; everything else is
// derived from repoUrl so a fork does not have to restate it.
export function reviewConfig(config = {}) {
  const declared = config.review || {};
  const fromUrl = String(config.repoUrl || '').match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/);
  return {
    ...DEFAULTS,
    repo: declared.repo || (fromUrl && fromUrl[1]) || DEFAULTS.repo,
    branch: declared.branch || DEFAULTS.branch,
    workflow: declared.workflow || DEFAULTS.workflow,
    ledgerPath: declared.ledgerPath || DEFAULTS.ledgerPath,
    eventType: declared.eventType || DEFAULTS.eventType,
    reviewer: declared.reviewer || DEFAULTS.reviewer,
    repoUrl: config.repoUrl || `https://github.com/${declared.repo || DEFAULTS.repo}`,
    issue: config.reviewIssue || declared.issue || 2
  };
}

// A missing or malformed ledger is the day-one state, not an error: no decision
// has been recorded yet. It must never blank the page.
export function loadDecisions(rootDir, cfg = DEFAULTS) {
  const file = path.join(rootDir, cfg.ledgerPath || DEFAULTS.ledgerPath);
  if (!existsSync(file)) return { version: 1, decisions: [], present: false };
  try {
    return { ...normalizeLedger(JSON.parse(readFileSync(file, 'utf8'))), present: true };
  } catch {
    return { version: 1, decisions: [], present: true, malformed: true };
  }
}

// ---------------------------------------------------------------------------
// 2. The queue
// ---------------------------------------------------------------------------

export function approvalState(block) {
  const state = block?.approval?.state || (block?.exists ? 'draft' : 'planned');
  return String(state);
}

// A block needs judgment when it is agent-drafted and not yet approved: those
// are the blocks the assembly gate is currently holding out of the report.
export function needsJudgment(block) {
  return !!block?.exists && block.tier === 'generated' && approvalState(block) !== 'approved';
}

function sectionKey(block) {
  return String(block?.e3Section || '')
    .split('.')
    .map((part) => String(part).padStart(4, '0'))
    .join('.');
}

// Order: everything blocking assembly first, then the rest by E3 section. The
// page opens on the work, not on the archive.
export function buildReviewQueue(textBlocks = [], decisions = []) {
  const latest = new Map();
  for (const entry of decisions) {
    if (entry.blockId && !latest.has(entry.blockId)) latest.set(entry.blockId, entry);
  }
  return [...textBlocks]
    .map((block) => ({
      block,
      needsJudgment: needsJudgment(block),
      state: approvalState(block),
      lastDecision: latest.get(block.id) || null
    }))
    .sort((a, b) => {
      if (a.needsJudgment !== b.needsJudgment) return a.needsJudgment ? -1 : 1;
      return (
        sectionKey(a.block).localeCompare(sectionKey(b.block)) ||
        String(a.block.id).localeCompare(String(b.block.id))
      );
    });
}

// ---------------------------------------------------------------------------
// 3. Bindings — the table a reviewer checks a number in
// ---------------------------------------------------------------------------

const QUALIFIER_ORDER = ['group', 'group2', 'variable', 'variable_level'];

function describeRow(row) {
  if (!row) return '';
  const parts = [];
  for (const [key, value] of Object.entries(row)) {
    if (/^group\d+_level$/.test(key) && value) parts.push(String(value));
  }
  if (row.variable_level) parts.push(String(row.variable_level));
  else if (row.variable) parts.push(String(row.variable));
  if (row.stat_label && row.stat_label !== row.stat_name) parts.push(String(row.stat_label));
  return parts.join(' · ');
}

// One row per binding ADDRESS (a repeated address is one row, referenced from
// every place the prose uses it). `value` is what the sentence shows: the
// address's own scale/digits qualifiers are presentation and are applied here
// exactly as they are applied in the prose, so the table and the sentence can
// never disagree.
export function bindingRows(block, ards = {}) {
  const seen = new Map();
  const addresses = [...String(block?.body || '').matchAll(BINDING_RE)].map((m) => m[1].trim());
  for (const address of addresses.length ? addresses : block?.bindings || []) {
    if (seen.has(address)) {
      seen.get(address).uses += 1;
      continue;
    }
    const resolved = resolveBinding(address, ards);
    seen.set(address, {
      index: seen.size + 1,
      address,
      uses: 1,
      display: resolved.display,
      analysis: resolved.analysis,
      statName: resolved.statName,
      qualifiers: Object.fromEntries(
        QUALIFIER_ORDER.filter((key) => resolved.filters[key]).map((key) => [key, resolved.filters[key]])
      ),
      scale: resolved.filters.scale ?? null,
      digits: resolved.filters.digits ?? null,
      resolved: resolved.resolved,
      reason: resolved.reason || null,
      row: resolved.row || null,
      rowLabel: describeRow(resolved.row),
      raw: resolved.resolved ? resolved.value : null,
      value: resolved.resolved
        ? formatStat(resolved.value, {
            scale: resolved.filters.scale ?? null,
            digits: resolved.filters.digits ?? null
          })
        : null
    });
  }
  return [...seen.values()];
}

export function bindingAnchor(blockId, index) {
  return `bind-${String(blockId).toLowerCase()}-${index}`;
}

// The stored ARD value, shown beside the presented one so the reviewer can see
// what rounding did. A proportion carries full float noise
// (0.244186046511628) — six significant digits is plenty to check a percentage
// against, and the ARD itself is one click away.
export function rawLabel(value) {
  if (typeof value !== 'number' || Number.isInteger(value)) return String(value);
  return String(Number(value.toPrecision(6)));
}

export function renderBindingTable(block, rows) {
  if (!rows.length) {
    return `<p class="sub">No bindings — this block states no results.</p>`;
  }
  const body = rows
    .map((row) => {
      const qualifiers = Object.entries(row.qualifiers)
        .map(([key, value]) => `<span class="qual"><b>${escapeHtml(key)}</b> ${escapeHtml(value)}</span>`)
        .join(' ');
      const selects = row.resolved
        ? `<span class="mono">${escapeHtml(row.analysis || '')}</span> · ` +
          `<span class="mono">${escapeHtml(row.statName || '')}</span>` +
          (row.rowLabel ? `<br><span class="sub">${escapeHtml(row.rowLabel)}</span>` : '')
        : `<span class="sub">${escapeHtml(row.reason || 'unresolved')}</span>`;
      const presentation =
        row.scale !== null || row.digits !== null
          ? `<span class="sub"> raw ${escapeHtml(rawLabel(row.raw))}` +
            (row.scale !== null ? ` × ${escapeHtml(String(row.scale))}` : '') +
            (row.digits !== null ? `, ${escapeHtml(String(row.digits))} dp` : '') +
            `</span>`
          : '';
      return (
        `<tr id="${bindingAnchor(block.id, row.index)}"${row.resolved ? '' : ' class="unresolved-row"'}>` +
        `<td class="mono num">${row.index}</td>` +
        `<td><code>${escapeHtml(row.address)}</code>` +
        (row.uses > 1 ? ` <span class="sub">used ${row.uses}×</span>` : '') +
        (qualifiers ? `<div class="quals">${qualifiers}</div>` : '') +
        `</td>` +
        `<td><a class="mono" href="../gallery/${escapeHtml(row.display || '')}.html">${escapeHtml(
          row.display || '—'
        )}</a><br>${selects}</td>` +
        `<td class="value">` +
        (row.resolved
          ? `<span class="value-num">${escapeHtml(row.value)}</span>${presentation}`
          : chip('unresolved', 'bad', row.reason || '')) +
        `</td></tr>`
      );
    })
    .join('');
  return (
    `<div class="scroll"><table class="binding-table">` +
    `<thead><tr><th>#</th><th>Binding address</th><th>Display · ARD row</th><th>Value in prose</th></tr></thead>` +
    `<tbody>${body}</tbody></table></div>`
  );
}

// ---------------------------------------------------------------------------
// 4. Resolved prose — the writer's words, with the computed parts marked
// ---------------------------------------------------------------------------

// Every substituted value is rendered as a numbered link into the binding
// table. A reviewer can therefore see at a glance which parts of a sentence the
// pipeline computed, and follow any one of them to the ARD row it selects
// without leaving the page.
export function renderReviewProse(block, rows, { xrefs = null } = {}) {
  const byAddress = new Map(rows.map((row) => [row.address, row]));
  const html = renderMarkdown(block?.body || '');
  const withXrefs = xrefs ? renderXrefs(html, xrefs) : html;
  return withXrefs.replace(BINDING_RE, (_, raw) => {
    const address = String(raw).trim();
    const row = byAddress.get(address);
    if (!row || !row.resolved) {
      return (
        `<span class="bound unresolved" title="${escapeHtml(
          (row && row.reason) || 'unresolved binding'
        )}">⟨unresolved⟩</span>`
      );
    }
    return (
      `<a class="bound" href="#${bindingAnchor(block.id, row.index)}" ` +
      `title="${escapeHtml(address)}">${escapeHtml(row.value)}` +
      `<sup class="bound-ref">${row.index}</sup></a>`
    );
  });
}

// ---------------------------------------------------------------------------
// 5. Provenance — the audit record, not a footnote
// ---------------------------------------------------------------------------

export function renderProvenance(block) {
  const provenance = block?.provenance || {};
  const generated = block?.tier === 'generated';
  if (!generated) {
    return (
      `<aside class="provenance not-generated">` +
      `<h3>Provenance</h3>` +
      `<p class="sub">Not model-authored. This block is <strong>${escapeHtml(
        block?.tier || 'boilerplate'
      )}</strong> tier: a human wrote the words${
        block?.tier === 'parameterized' ? ' and every number is a binding' : ''
      }.</p>` +
      `</aside>`
    );
  }
  const rows = [
    ['Model', provenance.model ? `<span class="mono">${escapeHtml(provenance.model)}</span>` : '<span class="chip chip-bad">not recorded</span>'],
    ['Generated', provenance.generated_at ? escapeHtml(provenance.generated_at) : '<span class="sub">not recorded</span>'],
    ['Version', block.version ? escapeHtml(String(block.version)) : '<span class="sub">1</span>']
  ]
    .map(([term, value]) => `<dt>${escapeHtml(term)}</dt><dd>${value}</dd>`)
    .join('');
  const prompt = provenance.prompt
    ? `<h4>Prompt</h4><pre class="prompt">${escapeHtml(String(provenance.prompt).trim())}</pre>`
    : `<p class="callout bad">No prompt recorded — agent-drafted prose without its prompt is not auditable.</p>`;
  return (
    `<aside class="provenance">` +
    `<h3>Provenance <span class="chip chip-warn">agent-drafted</span></h3>` +
    `<dl class="prov-facts">${rows}</dl>${prompt}` +
    `<p class="sub">The prompt is the instruction this prose was written to. Judging the words ` +
    `means judging whether they answer it and whether the ARDs support them.</p>` +
    `</aside>`
  );
}

// ---------------------------------------------------------------------------
// 6. Sign-off controls
// ---------------------------------------------------------------------------

// Rendered in the UNCONNECTED state — buttons disabled, with the reason and the
// fallback spelled out. site/review/client.js enables them once a token is
// present. Capability is only ever added by script; the honest read-only page
// is what the build emits.
export function renderSignoff(block, cfg, { state }) {
  const approved = state === 'approved';
  const fallback = fallbackCommand(cfg.repo, {
    decision: 'approve',
    blockId: block.id,
    note: '',
    reviewer: cfg.reviewer || 'jwildfire'
  });
  return (
    `<form class="signoff" data-block="${escapeHtml(block.id)}" data-state="${escapeHtml(state)}">` +
    `<div class="signoff-row">` +
    `<button type="button" class="button" data-decision="approve" disabled` +
    (approved ? ' data-locked="approved"' : '') +
    `>${approved ? 'Approved' : 'Approve'}</button>` +
    `<button type="button" class="button ghost" data-decision="changes" disabled>Request changes</button>` +
    `<span class="signoff-hint" data-role="hint">Connect to sign off — the page is read-only until you do.</span>` +
    `</div>` +
    `<label class="signoff-note"><span>Note <em>— required when requesting changes, optional on approval</em></span>` +
    `<textarea rows="2" maxlength="2000" data-role="note" ` +
    `placeholder="What has to change, and why."></textarea></label>` +
    `<p class="signoff-status" data-role="status" role="status" aria-live="polite"></p>` +
    `<details class="signoff-fallback"><summary>Sign off without connecting</summary>` +
    `<p class="sub">The same decision, dispatched from a terminal. The apply lane cannot tell the ` +
    `difference — it validates the payload, edits only this block's approval fields, re-runs the ` +
    `gates and commits.</p>` +
    `<pre class="cmd"><code>${escapeHtml(fallback)}</code></pre>` +
    `<p class="sub">Or edit the frontmatter directly in ` +
    `<a href="${escapeHtml(`${cfg.repoUrl}/blob/${cfg.branch}/${block.file}`)}">${escapeHtml(
      block.file
    )}</a> and let CI reassemble.</p>` +
    `</details>` +
    `</form>`
  );
}

// ---------------------------------------------------------------------------
// 7. Cards
// ---------------------------------------------------------------------------

const TIER_KIND = { boilerplate: 'muted', parameterized: 'info', generated: 'warn' };
const STATE_KIND = { approved: 'good', in_review: 'info', draft: 'warn', planned: 'muted' };

function stateChip(block, state) {
  if (!block.exists) return chip('not written', 'muted');
  if (state === 'approved') {
    const approval = block.approval || {};
    return chip(
      'approved',
      'good',
      `${approval.by ? `by ${approval.by}` : ''}${approval.at ? ` on ${approval.at}` : ''}`.trim()
    );
  }
  const excluded = block.tier === 'generated';
  return chip(
    state.replace(/_/g, ' '),
    STATE_KIND[state] || 'warn',
    excluded ? 'Excluded from the assembled report until approved' : 'Not yet signed off'
  );
}

export function renderReviewCard(entry, { ards, cfg, xrefs, decisions = [] }) {
  const { block, state } = entry;
  const rows = bindingRows(block, ards);
  const unresolved = rows.filter((row) => !row.resolved).length;
  const history = decisions.filter((decision) => decision.blockId === block.id);
  const prose = block.exists
    ? `<div class="prose review-prose">${renderReviewProse(block, rows, { xrefs })}</div>`
    : empty(`Not written yet — expected at ${block.file}.`);

  const displayLinks = (block.displays || [])
    .map(
      (slug) => `<a class="mono" href="../gallery/${escapeHtml(slug)}.html">${escapeHtml(slug)}</a>`
    )
    .join(' ');

  return (
    `<article class="review-block${entry.needsJudgment ? ' pending' : ''}" id="${escapeHtml(block.id)}" ` +
    `data-block="${escapeHtml(block.id)}" data-tier="${escapeHtml(block.tier || '')}" ` +
    `data-state="${escapeHtml(state)}">` +
    `<header class="rb-head">` +
    `<div class="rb-title">` +
    `<h2><span class="mono">${escapeHtml(block.id)}</span> ${escapeHtml(block.title || '')}</h2>` +
    `<p class="rb-meta">` +
    (block.e3Section ? `<span>ICH E3 §${escapeHtml(block.e3Section)}</span>` : '') +
    `${chip(block.tier || 'boilerplate', TIER_KIND[block.tier] || 'muted')}` +
    `${stateChip(block, state)}` +
    (entry.needsJudgment ? chip('blocking assembly', 'bad', 'Excluded from the report until approved') : '') +
    `</p></div>` +
    `<p class="rb-links">` +
    `<a href="${escapeHtml(`${cfg.repoUrl}/blob/${cfg.branch}/${block.file}`)}">source</a>` +
    (displayLinks ? ` · displays ${displayLinks}` : '') +
    (block.requirements?.length
      ? ` · <a href="../quality/text.html">${block.requirements.map(escapeHtml).join(' ')}</a>`
      : '') +
    `</p>` +
    `</header>` +
    `<div class="rb-body">` +
    `<section class="rb-prose-col"><h3 class="rb-h">Resolved prose</h3>${prose}` +
    `<p class="sub">Underlined values are computed — they come from the ARD row numbered beside ` +
    `them, not from the writer. Everything else is the writer's.</p></section>` +
    renderProvenance(block) +
    `</div>` +
    `<section class="rb-bindings"><h3 class="rb-h">Bindings ` +
    `<span class="sub">${rows.length} address${rows.length === 1 ? '' : 'es'}` +
    (unresolved ? ` · ${unresolved} unresolved` : '') +
    `</span></h3>` +
    renderBindingTable(block, rows) +
    (unresolved
      ? `<p class="callout bad">An unresolved binding fails the build (contracts §6, gate a). ` +
        `This block cannot assemble, approved or not.</p>`
      : '') +
    `</section>` +
    (history.length
      ? `<p class="rb-history sub">Earlier decisions: ${history
          .map(
            (decision) =>
              `${escapeHtml(decision.decision)} ${escapeHtml(
                formatTimestamp(decision.at)
              )} (${escapeHtml(decision.outcome)})`
          )
          .join(' · ')}</p>`
      : '') +
    renderSignoff(block, cfg, { state }) +
    `</article>`
  );
}

// ---------------------------------------------------------------------------
// 8. Ledger
// ---------------------------------------------------------------------------

export function renderLedger(ledger, cfg) {
  const rows = (ledger?.decisions || []).map((entry) =>
    ledgerRowHtml(entry, { blockHref: `#${entry.blockId}` })
  );
  const table =
    `<div class="scroll"><table class="ledger-table" id="ledger-table">` +
    `<thead><tr><th>Block</th><th>Decision</th><th>Reviewer</th><th>When</th><th>Note</th>` +
    `<th>Outcome</th><th>Run</th></tr></thead>` +
    `<tbody id="ledger-body">${rows.join('')}</tbody></table></div>`;

  const emptyState = ledger?.malformed
    ? `<p class="callout warn">${escapeHtml(cfg.ledgerPath)} could not be parsed. The page still ` +
      `renders every block; the history is unavailable until the file is valid JSON.</p>`
    : `<p class="empty">No decision has been recorded yet. The first approval or change request ` +
      `made on this page lands here, with the run that applied it.</p>`;

  return (
    `<section class="panel ledger" id="ledger">` +
    `<h2>Decision ledger</h2>` +
    `<p class="sub">Every approval and change request, newest first, as the apply lane recorded it ` +
    `in <a href="${escapeHtml(`${cfg.repoUrl}/blob/${cfg.branch}/${cfg.ledgerPath}`)}">` +
    `<span class="mono">${escapeHtml(cfg.ledgerPath)}</span></a>. An approval that failed a gate is ` +
    `recorded as <em>failed</em> and committed nothing: an approval that would break the report is ` +
    `not an approval.</p>` +
    (rows.length ? table : emptyState) +
    `</section>`
  );
}

// ---------------------------------------------------------------------------
// 9. The page
// ---------------------------------------------------------------------------

function tile(value, label, sub = '', kind = '') {
  return (
    `<div class="stat${kind ? ` ${kind}` : ''}"><span class="stat-value">${escapeHtml(
      String(value)
    )}</span><span class="stat-label">${escapeHtml(label)}</span>` +
    (sub ? `<span class="stat-sub">${escapeHtml(sub)}</span>` : '') +
    `</div>`
  );
}

function connectBar(cfg) {
  return (
    `<section class="connect" id="connect" data-repo="${escapeHtml(cfg.repo)}">` +
    `<div class="connect-row">` +
    `<span class="connect-state" data-role="connect-state">` +
    `${chip('read-only', 'muted')} not connected</span>` +
    `<button type="button" class="button ghost" data-role="connect-toggle">Connect…</button>` +
    `</div>` +
    `<form class="connect-form" data-role="connect-form" hidden>` +
    `<label><span>Fine-grained personal access token</span>` +
    `<input type="password" autocomplete="off" spellcheck="false" data-role="token" ` +
    `placeholder="github_pat_…"></label>` +
    `<label><span>Reviewer</span><input type="text" autocomplete="off" data-role="reviewer" ` +
    `placeholder="github-handle" value="${escapeHtml(cfg.reviewer || '')}"></label>` +
    `<div class="connect-actions">` +
    `<button type="button" class="button" data-role="connect">Connect</button>` +
    `<button type="button" class="button ghost" data-role="disconnect">Forget token</button>` +
    `</div>` +
    `<p class="sub">Scope it to <span class="mono">${escapeHtml(cfg.repo)}</span> alone, with ` +
    `<strong>Contents: read and write</strong> (dispatch + ledger), <strong>Actions: read</strong> ` +
    `(run status) and <strong>Metadata: read</strong>. It is stored in this browser's ` +
    `<span class="mono">localStorage</span> and sent to ` +
    `<span class="mono">api.github.com</span> and nowhere else — this site has no server to send it to.</p>` +
    `<p class="connect-status sub" data-role="connect-status" role="status" aria-live="polite"></p>` +
    `</form>` +
    `</section>`
  );
}

// `clientSrc` exists because this surface is rendered twice: as the standalone
// /review/ permalink, and as the Text pane of the Demo app (#113), where the
// app's own client.js already owns that filename. The review client is copied
// into a subdirectory there and named here — the alternative is two divergent
// copies of the review surface, which is the thing this parameter prevents.
export function renderReviewPage({
  config = {},
  textBlocks = [],
  ards = {},
  traceIndex = {},
  ledger = { decisions: [] },
  clientSrc = 'client.js'
} = {}) {
  const cfg = reviewConfig(config);
  const queue = buildReviewQueue(textBlocks, ledger.decisions || []);
  const pending = queue.filter((entry) => entry.needsJudgment);
  const rest = queue.filter((entry) => !entry.needsJudgment);
  const approved = queue.filter((entry) => entry.state === 'approved').length;

  // Read outside the assembled document, section cross-references have no page
  // to link to and degrade to readable text; display references stay live.
  const xrefs = {
    sections: {},
    displays: Object.fromEntries(
      Object.entries(traceIndex).map(([slug, entry]) => [slug, { number: null, title: entry.title }])
    )
  };
  const cardOptions = { ards, cfg, xrefs, decisions: ledger.decisions || [] };

  const head =
    `<header class="page-head">` +
    `<p class="eyebrow">Text review</p>` +
    `<h1>Review and sign-off</h1>` +
    `<p class="lede">Agent-drafted prose is held out of the assembled report until a human approves ` +
    `it (design <a href="../docs/docs-design-design.html">D8/D9</a>). This is where that judgment is ` +
    `made: the prose as it will read, the prompt that produced it, and every number resolved back to ` +
    `the ARD row it came from.</p>` +
    `</header>`;

  const stats =
    `<div class="stat-row">` +
    tile(pending.length, 'awaiting judgment', 'generated tier, not approved', pending.length ? 'warn' : '') +
    tile(approved, 'approved', 'assembling into the report') +
    tile(queue.length, 'blocks in the library') +
    tile((ledger.decisions || []).length, 'decisions recorded', 'in the ledger below') +
    `</div>`;

  const how =
    `<p class="callout">A decision leaves this page as a <span class="mono">${escapeHtml(
      cfg.eventType
    )}</span> repository dispatch. The <a href="${escapeHtml(
      `${cfg.repoUrl}/blob/${cfg.branch}/.github/workflows/${cfg.workflow}`
    )}">apply lane</a> edits only the named block's approval fields — never its prose, never another ` +
    `block — then reassembles the report and re-runs every gate. If a gate fails, the decision is ` +
    `recorded as failed and nothing is committed. Approving a block changes what assembles, so the ` +
    `commit that records the approval carries the reassembled document with it.</p>`;

  const pendingSection = pending.length
    ? `<section class="review-group" id="awaiting">` +
      `<h2>Awaiting judgment <span class="rm-count">${pending.length}</span></h2>` +
      `<p class="sub">These blocks are drafted and excluded. Nothing they say is in the report yet.</p>` +
      pending.map((entry) => renderReviewCard(entry, cardOptions)).join('\n') +
      `</section>`
    : `<section class="review-group" id="awaiting"><h2>Awaiting judgment</h2>` +
      `<p class="callout good">Nothing is waiting: every agent-drafted block has been signed off.</p></section>`;

  const restSection = rest.length
    ? `<section class="review-group" id="signed-off">` +
      `<h2>Everything else <span class="rm-count">${rest.length}</span></h2>` +
      `<p class="sub">Approved blocks and human-written tiers. Reviewable at any time — approval is ` +
      `revisitable, and requesting changes on an approved block sends it back.</p>` +
      rest.map((entry) => renderReviewCard(entry, cardOptions)).join('\n') +
      `</section>`
    : '';

  const configJson = JSON.stringify({
    repo: cfg.repo,
    branch: cfg.branch,
    workflow: cfg.workflow,
    ledgerPath: cfg.ledgerPath,
    eventType: cfg.eventType,
    reviewer: cfg.reviewer
  });

  return [
    head,
    stats,
    connectBar(cfg),
    how,
    pendingSection,
    restSection,
    renderLedger(ledger, cfg),
    `<script type="application/json" id="review-config">${configJson.replace(/</g, '\\u003c')}</script>`,
    `<script type="module" src="${escapeHtml(clientSrc)}"></script>`
  ]
    .filter(Boolean)
    .join('\n');
}
