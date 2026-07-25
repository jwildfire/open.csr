/**
 * The decision ledger — `site/text-decisions.json`.
 *
 * The ledger is the durable half of sign-off: the frontmatter says what the
 * current approval state IS, the ledger says how it got there and what was said
 * along the way. It is append-only on purpose. A change request that lives only
 * in frontmatter would be overwritten by the next decision; here every note the
 * reviewer wrote survives, in order, and the review page renders it as history.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  LEDGER_SCHEMA,
  OUTCOMES,
  TextDecisionError,
  appendDecision,
  applyTextDecision,
  makeEntry,
  readLedger,
} from '../../scripts/text-decision-lib.mjs';
import {
  ROOT,
  cleanup,
  gateOptions,
  ledgerFile,
  makeRepo,
  readLedgerFile,
} from './text-decision-helpers.js';

afterAll(cleanup);

const apply = (root, payload, extra = {}) =>
  applyTextDecision({ root, payload, ...gateOptions, ...extra });

describe('the decision ledger', () => {
  it('QC-SIGN-009: every decision appends one flat record carrying its provenance (#2)', () => {
    const root = makeRepo();
    apply(root, {
      decision: 'approve',
      blockId: 'TXT-FIX-1002',
      reviewer: '@jwildfire',
      runId: '12345',
      runUrl: 'https://github.com/jwildfire/open.csr/actions/runs/12345',
    });

    const ledger = readLedgerFile(root);
    expect(ledger.schema).toBe(LEDGER_SCHEMA);
    expect(ledger.decisions).toHaveLength(1);
    const [entry] = ledger.decisions;
    expect(Object.keys(entry).sort()).toEqual(
      [
        'at',
        'block',
        'decision',
        'detail',
        'newState',
        'note',
        'outcome',
        'priorState',
        'reviewer',
        'runId',
        'runUrl',
        'tier',
      ].sort()
    );
    expect(entry.block).toBe('TXT-FIX-1002');
    expect(entry.decision).toBe('approve');
    expect(entry.reviewer).toBe('@jwildfire');
    expect(entry.outcome).toBe('applied');
    expect(entry.runId).toBe('12345');
    expect(entry.runUrl).toMatch(/actions\/runs\/12345$/);
    expect(Date.parse(entry.at)).not.toBeNaN();
    expect(ledger.updated).toBe(entry.at);
    // Flat: scalars and nulls only, so the review page renders a row per record.
    for (const value of Object.values(entry)) {
      expect(value === null || typeof value !== 'object').toBe(true);
    }
  });

  it('QC-SIGN-009: appending never rewrites, reorders or drops an earlier decision (#2)', () => {
    const root = makeRepo();
    apply(root, {
      decision: 'changes',
      blockId: 'TXT-FIX-1002',
      note: 'First pass: cut the second clause.',
      reviewer: '@jwildfire',
    });
    const first = readLedgerFile(root).decisions[0];

    apply(root, { decision: 'approve', blockId: 'TXT-FIX-1002', reviewer: '@jwildfire' });
    apply(root, { decision: 'approve', blockId: 'TXT-FIX-1005', reviewer: '@jwildfire' });

    const ledger = readLedgerFile(root);
    expect(ledger.decisions).toHaveLength(3);
    expect(ledger.decisions[0]).toEqual(first);
    expect(ledger.decisions.map((d) => d.block)).toEqual([
      'TXT-FIX-1002',
      'TXT-FIX-1002',
      'TXT-FIX-1005',
    ]);
  });

  it('QC-SIGN-009: a decision that did not land is recorded too, with its outcome (#2)', () => {
    const root = makeRepo();
    apply(root, { decision: 'approve', blockId: 'TXT-FIX-1003', reviewer: '@jwildfire' });
    apply(root, { decision: 'approve', blockId: 'TXT-FIX-1002', reviewer: '@jwildfire' });

    const outcomes = readLedgerFile(root).decisions.map((d) => d.outcome);
    expect(outcomes).toEqual(['failed', 'applied']);
    for (const outcome of outcomes) expect(OUTCOMES).toContain(outcome);
  });

  it('QC-SIGN-009: an unknown outcome is refused rather than written to the ledger (#2)', () => {
    expect(() =>
      makeEntry({ block: 'TXT-FIX-1002', decision: 'approve', at: '2026-07-25', outcome: 'merged' })
    ).toThrow(TextDecisionError);
  });

  it('QC-SIGN-009: a corrupt ledger stops the lane instead of being silently replaced (#2)', () => {
    const root = makeRepo();
    const file = ledgerFile(root);
    appendDecision(
      file,
      makeEntry({ block: 'TXT-FIX-1002', decision: 'approve', at: '2026-07-25', outcome: 'applied' })
    );
    expect(readLedger(file).decisions).toHaveLength(1);

    writeFileSync(file, '{ not json');
    expect(() => readLedger(file)).toThrow(/not valid JSON/);
  });

  it('QC-SIGN-015: the committed ledger is an empty ledger of the documented schema (#2)', () => {
    const committed = JSON.parse(readFileSync(join(ROOT, 'site/text-decisions.json'), 'utf8'));
    expect(committed.schema).toBe(LEDGER_SCHEMA);
    expect(Array.isArray(committed.decisions)).toBe(true);
    expect(committed.documentation).toMatch(/append-only/i);
    for (const outcome of OUTCOMES) expect(committed.documentation).toContain(outcome);
  });
});
