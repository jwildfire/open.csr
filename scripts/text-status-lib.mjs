// The text status view — the Demo app's Text pane (open.csr #2/#113).
//
// Text blocks in the `generated` tier are drafted by an agent and excluded from
// the assembled report until a human approval lands in the block's frontmatter
// (design D8/D9). Approval is a source edit applied by the pipeline gate; this
// module renders the READ-ONLY view of where every block stands.
//
// What that view shows, and therefore what this renders:
//
//   the prose AS IT WILL READ, with every computed value marked and linked to
//   the ARD row it came from; the tier and approval state; which blocks are
//   currently blocking assembly; for agent-drafted blocks the model, the full
//   prompt and the generation date, near the top rather than in a footnote; and
//   every binding resolved into a table so a number can be checked without
//   opening another page.
//
// There is no action here. In-app sign-off was built and deferred on
// 2026-07-25 (design §12): review workflow belongs to the study-level GitHub
// configuration repos, not to a point solution inside one report. The surface
// is a status view, and the markup carries no control that pretends otherwise.

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

// ---------------------------------------------------------------------------
// 1. Configuration
// ---------------------------------------------------------------------------

const DEFAULTS = { repo: 'jwildfire/open.csr', branch: 'main' };

// Where a block's source lives, so every card can link the file a reader would
// edit. Derived from `repoUrl` so a fork does not have to restate it.
export function sourceConfig(config = {}) {
  const fromUrl = String(config.repoUrl || '').match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/);
  const repo = (fromUrl && fromUrl[1]) || DEFAULTS.repo;
  return {
    repo,
    branch: config.sourceBranch || DEFAULTS.branch,
    repoUrl: config.repoUrl || `https://github.com/${repo}`
  };
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
// view opens on what is holding the report up, not on the settled blocks.
export function buildReviewQueue(textBlocks = []) {
  return [...textBlocks]
    .map((block) => ({
      block,
      needsJudgment: needsJudgment(block),
      state: approvalState(block)
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
// 6. Cards
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
    excluded ? 'Excluded from the assembled report until approved' : 'Not approved in the block source'
  );
}

export function renderReviewCard(entry, { ards, cfg, xrefs }) {
  const { block, state } = entry;
  const rows = bindingRows(block, ards);
  const unresolved = rows.filter((row) => !row.resolved).length;
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
    `</article>`
  );
}

// ---------------------------------------------------------------------------
// 7. The view
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

// The Text pane of the Demo app: the state of every prose block, and nothing a
// visitor can act on. Approval lives in the block's frontmatter and is applied
// by the assembly gate, so the honest surface is a status view — no controls,
// no placeholders for controls.
export function renderTextStatus({ config = {}, textBlocks = [], ards = {}, traceIndex = {} } = {}) {
  const cfg = sourceConfig(config);
  const queue = buildReviewQueue(textBlocks);
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
  const cardOptions = { ards, cfg, xrefs };

  const head =
    `<header class="page-head">` +
    `<p class="eyebrow">Text Library</p>` +
    `<h2>Prose blocks and their status</h2>` +
    `<p class="lede">Every block of the report's prose, as it will read: each computed value ` +
    `resolved from the committed ARD and linked to the row it came from, each agent-drafted block ` +
    `shown with the model and the prompt that produced it. Blocks in the ` +
    `<strong>generated</strong> tier are drafts until a human approval is recorded in the block's ` +
    `own frontmatter; until then the assembler leaves them out of the report ` +
    `(design <a href="../docs/docs-design-design.html">D8/D9</a>).</p>` +
    `</header>`;

  const stats =
    `<div class="stat-row">` +
    tile(pending.length, 'blocking assembly', 'generated tier, not approved', pending.length ? 'warn' : '') +
    tile(approved, 'approved', 'assembling into the report') +
    tile(queue.length, 'blocks in the library') +
    `</div>`;

  const how =
    `<p class="callout">Approval is <strong>data, not a button</strong>: ` +
    `<span class="mono">approval.state</span> in the block's frontmatter, edited in the repository ` +
    `and applied by the pipeline. The assembler re-reads it on every build, excludes any ` +
    `generated-tier block that is not <span class="mono">approved</span>, and records the exclusion ` +
    `in the gate report — so what this view shows and what the report contains cannot disagree.</p>`;

  const pendingSection = pending.length
    ? `<section class="review-group" id="awaiting">` +
      `<h2>Blocking assembly <span class="rm-count">${pending.length}</span></h2>` +
      `<p class="sub">Agent-drafted and not yet approved. Nothing these blocks say is in the ` +
      `report.</p>` +
      pending.map((entry) => renderReviewCard(entry, cardOptions)).join('\n') +
      `</section>`
    : `<section class="review-group" id="awaiting"><h2>Blocking assembly</h2>` +
      `<p class="callout good">Nothing is held back: every agent-drafted block is approved in its ` +
      `source.</p></section>`;

  const restSection = rest.length
    ? `<section class="review-group" id="assembling">` +
      `<h2>In the report <span class="rm-count">${rest.length}</span></h2>` +
      `<p class="sub">Approved generated blocks and the human-written tiers, which assemble ` +
      `whatever their approval state because their content is not model-authored.</p>` +
      rest.map((entry) => renderReviewCard(entry, cardOptions)).join('\n') +
      `</section>`
    : '';

  return [head, stats, how, pendingSection, restSection].filter(Boolean).join('\n');
}
