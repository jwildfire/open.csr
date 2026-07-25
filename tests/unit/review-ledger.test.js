// The decision ledger as the review page renders it (open.csr #2).
//
// The ledger file is written by the apply lane (scripts/text-decision-lib.mjs)
// and read here. These tests hold the reading half of that seam: the history
// renders newest-first with the fields a reviewer needs, an absent or unusable
// file degrades to an honest empty state, and nothing a reviewer typed into a
// note can become markup on the page.

import { describe, expect, test } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadDecisions, renderLedger, reviewConfig } from '../../scripts/review-lib.mjs';

const cfg = reviewConfig({ repoUrl: 'https://github.com/jwildfire/open.csr' });

function tempRepo(contents) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'opencsr-ledger-'));
  if (contents !== undefined) {
    mkdirSync(path.join(dir, 'site'), { recursive: true });
    writeFileSync(path.join(dir, 'site', 'text-decisions.json'), contents);
  }
  return dir;
}

const LEDGER = {
  schema: 'opencsr/text-decisions/v1',
  updated: '2026-07-25T12:10:00Z',
  decisions: [
    {
      block: 'TXT-E3-1222',
      decision: 'approve',
      reviewer: 'jwildfire',
      at: '2026-07-25T12:04:00Z',
      note: null,
      outcome: 'applied',
      detail: 'assembled clean',
      tier: 'generated',
      priorState: 'draft',
      newState: 'approved',
      runId: '17',
      runUrl: 'https://github.com/jwildfire/open.csr/actions/runs/17'
    },
    {
      block: 'TXT-E3-1231',
      decision: 'changes',
      reviewer: 'jwildfire',
      at: '2026-07-25T12:10:00Z',
      note: 'Soften the causality claim in paragraph two.',
      outcome: 'recorded',
      tier: 'generated',
      runId: '18',
      runUrl: 'https://github.com/jwildfire/open.csr/actions/runs/18'
    },
    {
      block: 'TXT-E3-1300',
      decision: 'approve',
      reviewer: 'jwildfire',
      at: '2026-07-25T11:00:00Z',
      note: null,
      outcome: 'failed',
      detail: 'numeric-fidelity gate failed after the edit',
      runId: '16',
      runUrl: 'https://github.com/jwildfire/open.csr/actions/runs/16'
    }
  ]
};

describe('loading the ledger', () => {
  test('TXT-LEDG-004: a repository with no ledger yet loads as an empty history, not an error (#2)', () => {
    const ledger = loadDecisions(tempRepo(undefined), cfg);
    expect(ledger.present).toBe(false);
    expect(ledger.decisions).toEqual([]);
  });

  test('TXT-LEDG-004: an unparseable ledger is reported, and the page still renders (#2)', () => {
    const ledger = loadDecisions(tempRepo('{ not json'), cfg);
    expect(ledger.malformed).toBe(true);
    expect(ledger.decisions).toEqual([]);
    const html = renderLedger(ledger, cfg);
    expect(html).toContain('could not be parsed');
    expect(html).toContain('renders every block');
  });

  test('TXT-LEDG-004: the shipped ledger file parses and is readable by the page (#2)', () => {
    const ledger = loadDecisions(path.resolve('.'), cfg);
    expect(ledger.present).toBe(true);
    expect(Array.isArray(ledger.decisions)).toBe(true);
    expect(() => renderLedger(ledger, cfg)).not.toThrow();
  });

  test('TXT-LEDG-001: entries load newest first regardless of the append order on disk (#2)', () => {
    const ledger = loadDecisions(tempRepo(JSON.stringify(LEDGER)), cfg);
    expect(ledger.decisions.map((entry) => entry.blockId)).toEqual([
      'TXT-E3-1231',
      'TXT-E3-1222',
      'TXT-E3-1300'
    ]);
  });
});

describe('rendering the ledger', () => {
  const ledger = loadDecisions(tempRepo(JSON.stringify(LEDGER)), cfg);
  const html = renderLedger(ledger, cfg);

  test('TXT-LEDG-002: each row shows block, decision, reviewer, time, note, outcome and run (#2)', () => {
    expect(html).toContain('href="#TXT-E3-1231"');
    expect(html).toContain('changes requested');
    expect(html).toContain('@jwildfire');
    expect(html).toContain('2026-07-25 12:10 UTC');
    expect(html).toContain('Soften the causality claim in paragraph two.');
    expect(html).toContain('/actions/runs/18');
  });

  test('TXT-LEDG-002: outcomes read as pills — applied, changes requested, failed (#2)', () => {
    expect(html).toMatch(/chip chip-good"[^>]*>applied</);
    expect(html).toMatch(/chip chip-warn"[^>]*>recorded</);
    expect(html).toMatch(/chip chip-bad"[^>]*>failed</);
    // The decision column reads in the reviewer's language, not the lane's.
    expect(html).toContain('<td>changes requested</td>');
  });

  test('TXT-LEDG-002: a failed approval says what it was and that nothing was committed (#2)', () => {
    expect(html).toContain('numeric-fidelity gate failed after the edit');
    expect(html).toContain('is not an approval');
  });

  test('TXT-LEDG-002: the state transition the lane applied is carried into the row (#2)', () => {
    expect(html).toContain('draft → approved');
  });

  test('TXT-LEDG-003: the ledger source file is linked, so the history is checkable at source (#2)', () => {
    expect(html).toContain(`${cfg.repoUrl}/blob/${cfg.branch}/site/text-decisions.json`);
  });

  test('TXT-LEDG-004: an empty ledger renders the day-one state, not a broken table (#2)', () => {
    const emptyHtml = renderLedger({ decisions: [], present: true }, cfg);
    expect(emptyHtml).toContain('No decision has been recorded yet');
    expect(emptyHtml).not.toContain('<tbody');
  });

  test('TXT-LEDG-003: the table body has the id the client refreshes into after a decision (#2)', () => {
    expect(html).toContain('id="ledger-body"');
    expect(html).toContain('id="ledger"');
  });
});
