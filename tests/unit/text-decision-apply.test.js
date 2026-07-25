/**
 * The apply lane: what a dispatched decision does to a repository tree.
 *
 * The load-bearing test in this file is the revert: approving a block whose
 * bindings do not resolve must leave the tree exactly as it found it and fail
 * the run. Approval changes what assembles into the report (design D8), so an
 * approval that breaks the report is not an approval — and if that property ever
 * regresses, a single click can publish a CSR with an unresolved number in it.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import matter from 'gray-matter';

import {
  TextDecisionError,
  applyTextDecision,
  checkGates,
  runTextGates,
} from '../../scripts/text-decision-lib.mjs';
import {
  ARD_FIXTURES,
  CLI,
  ROOT,
  blockFile,
  breakTree,
  changedFiles,
  cleanup,
  gateOptions,
  makeRepo,
  readBlock,
  readLedgerFile,
  snapshotLibrary,
} from './text-decision-helpers.js';

afterAll(cleanup);

const apply = (root, payload, extra = {}) =>
  applyTextDecision({ root, payload, ...gateOptions, ...extra });

const approvalOf = (root, id) => matter(readBlock(root, id)).data.approval;

describe('applying a decision', () => {
  it('QC-SIGN-004: approving a draft block writes state, by and at into its frontmatter (#2)', () => {
    const root = makeRepo();
    const result = apply(root, {
      decision: 'approve',
      blockId: 'TXT-FIX-1002',
      reviewer: '@jwildfire',
    });

    expect(result.outcome).toBe('applied');
    expect(approvalOf(root, 'TXT-FIX-1002')).toEqual({
      state: 'approved',
      by: '@jwildfire',
      at: result.entry.at.slice(0, 10),
    });
    expect(result.entry.priorState).toBe('draft');
    expect(result.entry.newState).toBe('approved');
  });

  it('QC-SIGN-005: a decision touches one block file and leaves every other alone (#2)', () => {
    const root = makeRepo();
    const before = snapshotLibrary(root);
    apply(root, { decision: 'approve', blockId: 'TXT-FIX-1002', reviewer: '@jwildfire' });
    expect(changedFiles(before, snapshotLibrary(root))).toEqual(['TXT-FIX-1002.md']);
  });

  it('QC-SIGN-002: a decision naming a block that does not exist is refused loudly (#2)', () => {
    const root = makeRepo();
    const before = snapshotLibrary(root);
    expect(() => apply(root, { decision: 'approve', blockId: 'TXT-NOPE-0001' })).toThrow(
      TextDecisionError
    );
    expect(changedFiles(before, snapshotLibrary(root))).toEqual([]);
    expect(existsSync(join(root, 'site/text-decisions.json'))).toBe(false);
  });

  it('QC-SIGN-003: a block id pointing outside library/text never resolves to a file (#2)', () => {
    const root = makeRepo();
    expect(() =>
      apply(root, { decision: 'approve', blockId: '../../../etc/hosts', reviewer: '@jwildfire' })
    ).toThrow(TextDecisionError);
  });

  it('QC-SIGN-002: a block whose frontmatter does not validate is refused before any edit (#2)', () => {
    const root = makeRepo();
    // A generated block missing its provenance fails validateBlock (contracts §6).
    const file = blockFile(root, 'TXT-FIX-1002');
    const broken = readFileSync(file, 'utf8').replace(/tier: generated/, 'tier: invented');
    writeFileSync(file, broken);
    expect(() => apply(root, { decision: 'approve', blockId: 'TXT-FIX-1002' })).toThrow(
      /does not validate/
    );
  });

  it('QC-SIGN-014: approving an already-approved block re-affirms it and records the prior state (#2)', () => {
    const root = makeRepo();
    const result = apply(root, {
      decision: 'approve',
      blockId: 'TXT-FIX-1004',
      reviewer: '@someone-else',
    });
    expect(result.outcome).toBe('applied');
    expect(result.entry.priorState).toBe('approved');
    expect(approvalOf(root, 'TXT-FIX-1004').by).toBe('@someone-else');
  });
});

describe('change requests', () => {
  it('QC-SIGN-006: a change request on a draft records the note without approving it (#2)', () => {
    const root = makeRepo();
    const before = snapshotLibrary(root);
    const result = apply(root, {
      decision: 'changes',
      blockId: 'TXT-FIX-1002',
      note: 'Soften the causality claim in the second sentence.',
      reviewer: '@jwildfire',
    });

    expect(result.outcome).toBe('recorded');
    expect(changedFiles(before, snapshotLibrary(root))).toEqual([]);
    expect(approvalOf(root, 'TXT-FIX-1002').state).toBe('draft');
    const [entry] = readLedgerFile(root).decisions;
    expect(entry.decision).toBe('changes');
    expect(entry.note).toMatch(/Soften the causality claim/);
    expect(entry.newState).toBe('draft');
  });

  it('QC-SIGN-006: a change request on approved prose revokes the approval (#2)', () => {
    const root = makeRepo();
    const result = apply(root, {
      decision: 'changes',
      blockId: 'TXT-FIX-1004',
      note: 'The serious-AE count needs the denominator beside it.',
      reviewer: '@jwildfire',
    });

    expect(result.outcome).toBe('applied');
    expect(approvalOf(root, 'TXT-FIX-1004').state).toBe('in_review');
    expect(result.entry.priorState).toBe('approved');
  });
});

describe('the gates decide whether a decision lands', () => {
  it('QC-SIGN-012: a draft block defers its gate errors; an included block fails on them (#2)', () => {
    const root = makeRepo();
    const before = runTextGates({ root, ...gateOptions });
    expect(before.ok).toBe(true);
    expect(before.deferred.join(' ')).toMatch(/TXT-FIX-1003.*unresolved binding/);

    // Same prose, now included in the report: the deferred problem is a failure.
    const forced = readBlock(root, 'TXT-FIX-1003').replace(
      /approval: .*/,
      'approval: { state: approved, by: "@jwildfire", at: "2026-07-25" }'
    );
    writeFileSync(blockFile(root, 'TXT-FIX-1003'), forced);
    const after = runTextGates({ root, ...gateOptions });
    expect(after.ok).toBe(false);
    expect(after.failures.join(' ')).toMatch(/TXT-FIX-1003.*unresolved binding/);
  });

  it('QC-SIGN-007: an approval that breaks the gates is reverted and recorded as failed (#2)', () => {
    const root = makeRepo();
    const before = snapshotLibrary(root);
    const result = apply(root, {
      decision: 'approve',
      blockId: 'TXT-FIX-1003',
      reviewer: '@jwildfire',
    });

    expect(result.outcome).toBe('failed');
    expect(result.reverted).toBe(true);
    // The block file is byte-for-byte what it was: nothing to commit.
    expect(changedFiles(before, snapshotLibrary(root))).toEqual([]);
    expect(approvalOf(root, 'TXT-FIX-1003').state).toBe('draft');
    expect(result.gate.failures.join(' ')).toMatch(/unresolved binding/);
  });

  it('QC-SIGN-007: a failed decision is still recorded in the ledger with its reason (#2)', () => {
    const root = makeRepo();
    apply(root, { decision: 'approve', blockId: 'TXT-FIX-1003', reviewer: '@jwildfire' });
    const [entry] = readLedgerFile(root).decisions;
    expect(entry.outcome).toBe('failed');
    expect(entry.newState).toBe('draft');
    expect(entry.detail).toMatch(/reverted/);
  });

  it('QC-SIGN-008: a tree whose gates already fail blocks the decision without editing anything (#2)', () => {
    const root = makeRepo();
    breakTree(root);
    const before = snapshotLibrary(root);
    const result = apply(root, {
      decision: 'approve',
      blockId: 'TXT-FIX-1002',
      reviewer: '@jwildfire',
    });

    expect(result.outcome).toBe('blocked');
    expect(result.reverted).toBe(false);
    expect(changedFiles(before, snapshotLibrary(root))).toEqual([]);
    expect(readLedgerFile(root).decisions[0].detail).toMatch(/already failing/);
  });

  it('QC-SIGN-007: the gate runner is what decides — a failing gate set always reverts (#2)', () => {
    const root = makeRepo();
    const before = snapshotLibrary(root);
    let calls = 0;
    const gateCheck = () => {
      calls += 1;
      // Green before the edit, red after it: the shape of a decision that breaks
      // the report for a reason this lane cannot anticipate (a stricter future
      // gate, a regenerated ARD landing mid-run).
      return calls === 1
        ? { ok: true, failures: [], deferred: [], warnings: [] }
        : { ok: false, failures: ['seeded failure'], deferred: [], warnings: [] };
    };
    const result = apply(root, { decision: 'approve', blockId: 'TXT-FIX-1002' }, { gateCheck });

    expect(result.outcome).toBe('failed');
    expect(changedFiles(before, snapshotLibrary(root))).toEqual([]);
  });
});

describe('dry run', () => {
  it('QC-SIGN-010: --dry-run previews the frontmatter change and writes nothing (#2)', () => {
    const root = makeRepo();
    const before = snapshotLibrary(root);
    const result = apply(
      root,
      { decision: 'approve', blockId: 'TXT-FIX-1002', reviewer: '@jwildfire' },
      { dryRun: true }
    );

    expect(result.outcome).toBe('applied');
    expect(result.dryRun).toBe(true);
    expect(result.preview.before).toContain('state: draft');
    expect(result.preview.after).toContain('state: approved');
    expect(changedFiles(before, snapshotLibrary(root))).toEqual([]);
    expect(existsSync(join(root, 'site/text-decisions.json'))).toBe(false);
  });

  it('QC-SIGN-010: the CLI dry-runs against the real text library without touching it (#2)', () => {
    const block = join(ROOT, 'library/text/TXT-E3-1222.md');
    const ledger = join(ROOT, 'site/text-decisions.json');
    const before = readFileSync(block, 'utf8');
    // Byte-identity, not "the ledger is empty": once a real decision has been
    // made through the app the ledger is never empty again, and this test has
    // to keep meaning "the dry run wrote nothing".
    const ledgerBefore = readFileSync(ledger, 'utf8');
    const run = spawnSync(
      process.execPath,
      [CLI, '--decision', 'approve', '--block', 'TXT-E3-1222', '--reviewer', '@jwildfire', '--dry-run'],
      { encoding: 'utf8' }
    );

    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/dry run/i);
    expect(readFileSync(block, 'utf8')).toBe(before);
    expect(readFileSync(ledger, 'utf8')).toBe(ledgerBefore);
  });

  it('QC-SIGN-001: the CLI exits 2 on an invalid decision and 1 when a decision does not land (#2)', () => {
    const root = makeRepo();
    const invalid = spawnSync(
      process.execPath,
      [CLI, '--root', root, '--decision', 'reject', '--block', 'TXT-FIX-1002'],
      { encoding: 'utf8', env: { ...process.env, TEXT_DECISION_ARD_DIRS: ARD_FIXTURES } }
    );
    expect(invalid.status).toBe(2);
    expect(invalid.stderr).toMatch(/decision must be one of/);

    const broken = spawnSync(
      process.execPath,
      [
        CLI,
        '--root',
        root,
        '--decision',
        'approve',
        '--block',
        'TXT-FIX-1003',
        '--reviewer',
        '@jwildfire',
        '--ard-dir',
        ARD_FIXTURES,
      ],
      { encoding: 'utf8' }
    );
    expect(broken.status).toBe(1);
    expect(readBlock(root, 'TXT-FIX-1003')).toContain('state: draft');
  });
});

describe('the full gate set', () => {
  it('QC-SIGN-012: checkGates reports the assembler as not run when a tree has none (#2)', () => {
    const root = makeRepo();
    const gate = checkGates({ root, ...gateOptions });
    expect(gate.ok).toBe(true);
    expect(gate.assembler.ran).toBe(false);
  });

  it('QC-SIGN-012: an assembler that exits 0 without output is not treated as green (#2)', () => {
    // The real failure this guards: assemble.mjs runs its main block only when
    // `import.meta.url` matches argv[1]. Spawn it through a symlinked path and it
    // imports, does nothing, and exits 0 — a gate that never ran, reporting pass.
    const root = makeRepo();
    mkdirSync(join(root, 'scripts'), { recursive: true });
    writeFileSync(join(root, 'scripts/assemble.mjs'), 'export const silent = true;\n');
    const silent = checkGates({ root, ...gateOptions });
    expect(silent.assembler.ran).toBe(true);
    expect(silent.ok).toBe(false);
    expect(silent.failures.join(' ')).toMatch(/not run/);

    writeFileSync(join(root, 'scripts/assemble.mjs'), 'console.log("assembled");\n');
    expect(checkGates({ root, ...gateOptions }).ok).toBe(true);
  });

  it('QC-SIGN-008: a decision is blocked when the assembler fails before the edit (#2)', () => {
    const root = makeRepo();
    mkdirSync(join(root, 'scripts'), { recursive: true });
    writeFileSync(
      join(root, 'scripts/assemble.mjs'),
      'console.log("  ✗ binding resolution — seeded"); process.exit(1);\n'
    );
    const before = snapshotLibrary(root);
    const result = apply(root, { decision: 'approve', blockId: 'TXT-FIX-1002', reviewer: '@jwildfire' });

    expect(result.outcome).toBe('blocked');
    expect(result.gate.failures.join(' ')).toMatch(/binding resolution — seeded/);
    expect(changedFiles(before, snapshotLibrary(root))).toEqual([]);
  });
});
