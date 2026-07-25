// The pure core of the review surface (open.csr #2): what a decision is allowed
// to say, where a credential is allowed to go, which run belongs to a click, and
// how a ledger entry written by the apply lane is read back.
//
// The browser polling loop is deliberately NOT tested here — it is DOM and
// network glue. Everything it decides is a pure function in site/review/core.js,
// and that is what these tests hold.

import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  API_ROOT,
  BLOCK_ID,
  DECISIONS,
  EVENT_TYPE,
  NOTE_MAX,
  assertApiUrl,
  buildDispatchPayload,
  describeRunState,
  dispatchRequest,
  fallbackCommand,
  formatTimestamp,
  ledgerRequest,
  ledgerRowHtml,
  normalizeDecision,
  normalizeLedger,
  outcomePill,
  runRequest,
  runsRequest,
  selectRun,
  userRequest
} from '../../site/review/core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '..', '..');
const REPO = 'jwildfire/open.csr';

describe('the decision payload', () => {
  test('TXT-DISPATCH-001: an approval dispatches the block id, the reviewer and the event type (#2)', () => {
    const payload = buildDispatchPayload({
      decision: 'approve',
      blockId: 'TXT-E3-1206',
      note: '  reads well  ',
      reviewer: '@jwildfire'
    });
    expect(payload.event_type).toBe(EVENT_TYPE);
    expect(payload.event_type).toBe('text-decision');
    expect(payload.client_payload).toEqual({
      decision: 'approve',
      blockId: 'TXT-E3-1206',
      note: 'reads well',
      reviewer: 'jwildfire'
    });
  });

  test('TXT-DISPATCH-001: the payload names a decision only — never an edit, a file or a state (#2)', () => {
    const payload = buildDispatchPayload({ decision: 'approve', blockId: 'TXT-E3-1206' });
    expect(Object.keys(payload.client_payload).sort()).toEqual([
      'blockId',
      'decision',
      'note',
      'reviewer'
    ]);
    expect(JSON.stringify(payload)).not.toMatch(/approval|state|frontmatter|library\/text/);
  });

  test('TXT-DISPATCH-002: requesting changes without a note is refused in the browser (#2)', () => {
    expect(() => buildDispatchPayload({ decision: 'changes', blockId: 'TXT-E3-1231' })).toThrow(
      /note/i
    );
    expect(() =>
      buildDispatchPayload({ decision: 'changes', blockId: 'TXT-E3-1231', note: '   ' })
    ).toThrow(/note/i);
    expect(
      buildDispatchPayload({ decision: 'changes', blockId: 'TXT-E3-1231', note: 'soften §2' })
        .client_payload.note
    ).toBe('soften §2');
  });

  test('TXT-DISPATCH-002: an over-long note is truncated rather than rejected (#2)', () => {
    const note = 'x'.repeat(NOTE_MAX + 500);
    const payload = buildDispatchPayload({ decision: 'changes', blockId: 'TXT-E3-1231', note });
    expect(payload.client_payload.note).toHaveLength(NOTE_MAX);
  });

  test('TXT-DISPATCH-003: an unknown verb is refused, and the vocabulary is two words (#2)', () => {
    expect(DECISIONS).toEqual(['approve', 'changes']);
    expect(() => buildDispatchPayload({ decision: 'merge', blockId: 'TXT-E3-1206' })).toThrow(
      /approve \| changes/
    );
    expect(() => buildDispatchPayload({ decision: '', blockId: 'TXT-E3-1206' })).toThrow();
  });

  test('TXT-DISPATCH-003: a block id that could escape the text library never leaves the page (#2)', () => {
    for (const bad of ['../../etc/passwd', 'TXT-E3-1206/../x', '', 'DSP-AE-001', 'txt-e3-1206.md']) {
      expect(() => buildDispatchPayload({ decision: 'approve', blockId: bad })).toThrow();
    }
    expect(BLOCK_ID.test('TXT-E3-1206')).toBe(true);
    expect(BLOCK_ID.test('TXT-E3-1300')).toBe(true);
  });

  test('TXT-DISPATCH-003: an absent reviewer is null, not an empty string the lane has to guess about (#2)', () => {
    expect(
      buildDispatchPayload({ decision: 'approve', blockId: 'TXT-E3-1206' }).client_payload.reviewer
    ).toBeNull();
  });
});

describe('where a credential may go', () => {
  test('TXT-DISPATCH-004: every request the page can build is an api.github.com request (#2)', () => {
    const requests = [
      dispatchRequest(REPO, { event_type: EVENT_TYPE }, 'tok'),
      runsRequest(REPO, 'tok'),
      runRequest(REPO, 42, 'tok'),
      ledgerRequest(REPO, 'tok', { path: 'site/text-decisions.json', ref: 'dev' }),
      userRequest('tok')
    ];
    for (const request of requests) {
      expect(request.url.startsWith(`${API_ROOT}/`)).toBe(true);
      expect(request.headers.Authorization).toBe('Bearer tok');
    }
  });

  test('TXT-DISPATCH-004: the guard refuses any other host outright (#2)', () => {
    expect(() => assertApiUrl('https://api.github.com.evil.test/repos')).toThrow(/refusing/);
    expect(() => assertApiUrl('http://localhost:8080/collect')).toThrow(/refusing/);
    expect(() => assertApiUrl('')).toThrow(/refusing/);
    expect(assertApiUrl(`${API_ROOT}/user`)).toBe(`${API_ROOT}/user`);
  });

  test('TXT-DISPATCH-004: no source file in the review surface names a host other than the API (#2)', () => {
    const core = readFileSync(path.join(rootDir, 'site', 'review', 'core.js'), 'utf8');
    const client = readFileSync(path.join(rootDir, 'site', 'review', 'client.js'), 'utf8');
    const codeOnly = (source) =>
      source
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join('\n');
    const hosts = [...codeOnly(core).matchAll(/https?:\/\/[^'"`\s)]+/g)].map((m) => m[0]);
    expect(hosts).toEqual(['https://api.github.com']);
    expect([...codeOnly(client).matchAll(/https?:\/\//g)]).toEqual([]);
  });

  test('TXT-DISPATCH-004: an unauthenticated request carries no Authorization header at all (#2)', () => {
    expect(runsRequest(REPO, null).headers.Authorization).toBeUndefined();
  });

  test('TXT-DISPATCH-007: the ledger is re-read through the contents API at the review branch (#2)', () => {
    const request = ledgerRequest(REPO, 'tok', { path: 'site/text-decisions.json', ref: 'dev' });
    expect(request.url).toBe(`${API_ROOT}/repos/${REPO}/contents/site/text-decisions.json?ref=dev`);
    expect(request.headers.Accept).toContain('raw');
    // Not the deployed copy: the CDN caches it, and would show a ledger without
    // the decision just made.
    expect(request.url).not.toContain('github.io');
  });
});

describe('locating the run a click produced', () => {
  const runs = [
    { id: 1, path: '.github/workflows/text-decision.yml', created_at: '2026-07-25T10:00:00Z', status: 'completed', conclusion: 'success' },
    { id: 2, path: '.github/workflows/ci.yml', created_at: '2026-07-25T12:00:05Z', status: 'in_progress' },
    { id: 3, path: '.github/workflows/text-decision.yml', created_at: '2026-07-25T12:00:03Z', status: 'queued' }
  ];

  test('TXT-DISPATCH-005: the run is matched by workflow and by having started after the dispatch (#2)', () => {
    const run = selectRun(runs, {
      since: '2026-07-25T12:00:00Z',
      workflow: 'text-decision.yml',
      skewMs: 0
    });
    expect(run.id).toBe(3);
  });

  test('TXT-DISPATCH-005: a run that predates the click is never adopted (#2)', () => {
    const older = runs.filter((run) => run.id === 1);
    expect(
      selectRun(older, { since: '2026-07-25T12:00:00Z', workflow: 'text-decision.yml', skewMs: 0 })
    ).toBeNull();
  });

  test('TXT-DISPATCH-005: another workflow running at the same moment is not mistaken for this one (#2)', () => {
    const run = selectRun(runs, { since: '2026-07-25T12:00:00Z', workflow: 'text-decision.yml' });
    expect(run.path).toContain('text-decision.yml');
  });

  test('TXT-DISPATCH-005: the API envelope is accepted as well as a bare array (#2)', () => {
    const run = selectRun({ workflow_runs: runs }, { workflow: 'text-decision.yml' });
    expect(run.id).toBe(3);
  });

  test('TXT-DISPATCH-006: queued, running and completed runs each describe themselves for the reviewer (#2)', () => {
    expect(describeRunState(null).state).toBe('unknown');
    expect(describeRunState({ status: 'queued' })).toMatchObject({ state: 'queued', kind: 'info' });
    expect(describeRunState({ status: 'in_progress' })).toMatchObject({ state: 'running' });
    expect(describeRunState({ status: 'completed', conclusion: 'success' })).toMatchObject({
      state: 'done',
      label: 'applied',
      kind: 'good'
    });
    expect(describeRunState({ status: 'completed', conclusion: 'failure' })).toMatchObject({
      state: 'done',
      kind: 'bad'
    });
    expect(describeRunState({ status: 'completed', conclusion: 'timed_out' }).label).toBe('timed out');
  });

  test('TXT-DISPATCH-006: the run link is carried through so the reviewer can leave the page for the log (#2)', () => {
    const described = describeRunState({
      status: 'completed',
      conclusion: 'success',
      html_url: 'https://github.com/jwildfire/open.csr/actions/runs/9'
    });
    expect(described.url).toContain('/actions/runs/9');
  });
});

describe('the fallback for a reviewer who cannot connect', () => {
  test('TXT-REVIEW-007: the fallback command carries the same validated payload as the button (#2)', () => {
    const command = fallbackCommand(REPO, {
      decision: 'approve',
      blockId: 'TXT-E3-1206',
      reviewer: 'jwildfire'
    });
    expect(command).toContain(`gh api repos/${REPO}/dispatches`);
    expect(command).toContain('event_type=text-decision');
    expect(command).toContain('client_payload[blockId]=TXT-E3-1206');
    expect(() => fallbackCommand(REPO, { decision: 'changes', blockId: 'TXT-E3-1206' })).toThrow(
      /note/
    );
  });
});

describe('reading the ledger back', () => {
  test('TXT-LEDG-003: the shape the apply lane actually writes is read without loss (#2)', () => {
    const entry = normalizeDecision({
      block: 'TXT-E3-1222',
      decision: 'approve',
      reviewer: 'jwildfire',
      at: '2026-07-25T12:04:00Z',
      note: null,
      outcome: 'applied',
      detail: 'gates green',
      tier: 'generated',
      priorState: 'draft',
      newState: 'approved',
      runId: '17',
      runUrl: 'https://github.com/jwildfire/open.csr/actions/runs/17'
    });
    expect(entry).toMatchObject({
      blockId: 'TXT-E3-1222',
      decision: 'approve',
      by: 'jwildfire',
      outcome: 'applied',
      runId: '17',
      tier: 'generated'
    });
    expect(entry.detail).toContain('draft → approved');
  });

  test('TXT-LEDG-003: an unknown outcome degrades to a neutral pill instead of throwing (#2)', () => {
    expect(outcomePill('applied')).toMatchObject({ kind: 'good' });
    expect(outcomePill('failed')).toMatchObject({ kind: 'bad' });
    expect(outcomePill('recorded')).toMatchObject({ kind: 'warn' });
    expect(outcomePill('rejected').label).toBe('changes requested');
    expect(outcomePill('something-new')).toMatchObject({ label: 'something-new', kind: 'info' });
  });

  test('TXT-LEDG-001: decisions are ordered newest first whatever order the file is in (#2)', () => {
    const ledger = normalizeLedger({
      decisions: [
        { block: 'A-1', decision: 'approve', at: '2026-07-20T09:00:00Z', outcome: 'applied' },
        { block: 'B-2', decision: 'changes', at: '2026-07-25T09:00:00Z', outcome: 'recorded' },
        { block: 'C-3', decision: 'approve', at: '2026-07-22T09:00:00Z', outcome: 'failed' }
      ]
    });
    expect(ledger.decisions.map((entry) => entry.blockId)).toEqual(['B-2', 'C-3', 'A-1']);
  });

  test('TXT-LEDG-004: junk in the ledger is dropped, not rendered, and never throws (#2)', () => {
    expect(normalizeLedger(null).decisions).toEqual([]);
    expect(normalizeLedger({}).decisions).toEqual([]);
    expect(normalizeLedger({ decisions: 'nope' }).decisions).toEqual([]);
    expect(normalizeLedger({ decisions: [null, 7, {}, { block: 'ok' }] }).decisions).toHaveLength(1);
    expect(normalizeLedger([{ block: 'bare-array' }]).decisions).toHaveLength(1);
  });

  test('TXT-LEDG-002: a ledger row carries block, decision, reviewer, time, note, outcome and run (#2)', () => {
    const html = ledgerRowHtml(
      {
        block: 'TXT-E3-1231',
        decision: 'changes',
        reviewer: 'jwildfire',
        at: '2026-07-25T12:04:00Z',
        note: 'Soften the causality claim.',
        outcome: 'recorded',
        runId: 17,
        runUrl: 'https://github.com/jwildfire/open.csr/actions/runs/17'
      },
      { blockHref: '#TXT-E3-1231' }
    );
    expect(html).toContain('href="#TXT-E3-1231"');
    expect(html).toContain('changes requested');
    expect(html).toContain('@jwildfire');
    expect(html).toContain('2026-07-25 12:04 UTC');
    expect(html).toContain('Soften the causality claim.');
    expect(html).toContain('/actions/runs/17');
    expect(html).toContain('data-outcome="recorded"');
  });

  test('TXT-LEDG-002: a note is escaped, so a reviewer cannot inject markup into the ledger (#2)', () => {
    const html = ledgerRowHtml({
      block: 'TXT-E3-1231',
      decision: 'changes',
      note: '<img src=x onerror="alert(1)">',
      outcome: 'recorded'
    });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  test('TXT-LEDG-002: a decision with no run yet renders a row rather than a broken link (#2)', () => {
    const html = ledgerRowHtml({ block: 'TXT-E3-1231', decision: 'approve', outcome: 'pending' });
    expect(html).toContain('pending');
    expect(html).not.toContain('href="null"');
    expect(formatTimestamp(null)).toBe('—');
    expect(formatTimestamp('not a date')).toBe('not a date');
  });
});
