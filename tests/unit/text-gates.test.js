import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import {
  checkApproval,
  checkNumericFidelity,
  loadTextLibrary,
  parseBlock,
  renderBlock,
  runGates,
} from '../../scripts/text-lib.mjs';
import { BLOCK_FIXTURES, LIBRARY_DIR, fixtureArds, stubContext } from './text-test-helpers.js';

const ards = fixtureArds();
const ctx = stubContext();
const fixture = (name) => parseBlock(join(BLOCK_FIXTURES, name));
const gate = (name) => {
  const block = fixture(name);
  return { block, fidelity: checkNumericFidelity(renderBlock(block, ards, ctx), block) };
};

describe('Gate: numeric fidelity', () => {
  it('TXT-NUM-001: prose whose every digit came from a binding passes the gate (#1)', () => {
    const { fidelity } = gate('good-parameterized.md');
    expect(fidelity.violations).toEqual([]);
    expect(fidelity.ok).toBe(true);
  });

  it('TXT-NUM-002: a hand-typed result in prose is caught, with its value and surrounding context (#1)', () => {
    const { fidelity } = gate('bad-typed-number.md');
    expect(fidelity.ok).toBe(false);
    expect(fidelity.violations).toHaveLength(1);
    expect(fidelity.violations[0].value).toBe('42');
    expect(fidelity.violations[0].block).toBe('FIX-BAD-TYPED');
    expect(fidelity.violations[0].context).toContain('42');
  });

  it('TXT-NUM-003, TXT-NUM-004: digits inside inline code and inside a link destination are exempt (#1)', () => {
    const { fidelity } = gate('good-exemptions.md');
    expect(fidelity.violations).toEqual([]);
  });

  it('TXT-NUM-005: allow_digits exempts only the literals it lists, and reports how often each was used (#1)', () => {
    const { fidelity } = gate('good-exemptions.md');
    expect(fidelity.exemptionsUsed).toEqual({ 'ICH E3': 1, '16.1.9': 1 });
    expect(fidelity.unusedAllowDigits).toEqual([]);
  });

  it('TXT-NUM-006: allow_digits does not exempt a digit run it does not literally cover (#1)', () => {
    const block = { ...fixture('bad-typed-number.md'), allow_digits: ['4'] };
    const fidelity = checkNumericFidelity(renderBlock(block, ards, ctx), block);
    expect(fidelity.ok).toBe(false);
    expect(fidelity.violations[0].value).toBe('42');
  });

  it('TXT-NUM-007: the gate reads the RENDERED prose, so a binding that resolves to a digit run is never a violation (#1)', () => {
    const block = fixture('good-parameterized.md');
    const rendered = renderBlock(block, ards, ctx);
    expect(rendered.text).toMatch(/\d/);
    expect(checkNumericFidelity(rendered, block).ok).toBe(true);
    // Same prose, but with the spans withheld: every rendered value now looks typed.
    const unattributed = checkNumericFidelity({ text: rendered.text, spans: [] }, block);
    expect(unattributed.ok).toBe(false);
    expect(unattributed.violations.length).toBe(rendered.bindings.length);
  });

  it('TXT-NUM-008: every block in the shipped Text Library passes the numeric-fidelity gate (#1)', () => {
    const report = runGates([...loadTextLibrary(LIBRARY_DIR).values()], ards, ctx);
    expect(report.numericFidelity.violations).toEqual([]);
  });
});

describe('Gate: approval', () => {
  it('TXT-APPR-001: a draft generated-tier block is excluded from assembly and the reason is reported (#1)', () => {
    const approval = checkApproval(fixture('bad-unapproved-generated.md'));
    expect(approval.included).toBe(false);
    expect(approval.state).toBe('draft');
    expect(approval.reason).toMatch(/pending human approval/);
  });

  it('TXT-APPR-002: an approved generated-tier block is included (#1)', () => {
    const approval = checkApproval(fixture('good-approved-generated.md'));
    expect(approval.included).toBe(true);
    expect(approval.reason).toBeNull();
  });

  it('TXT-APPR-003: the gate applies to the generated tier only; boilerplate is not tier-gated (#1)', () => {
    const boilerplate = { ...fixture('good-exemptions.md'), approval: { state: 'draft' } };
    const approval = checkApproval(boilerplate);
    expect(approval.included).toBe(true);
    expect(approval.warning).toMatch(/not gated by tier/);
  });

  it('TXT-APPR-004: runGates lists every excluded block so the exclusion is visible, not silent (#1)', () => {
    const report = runGates(
      ['bad-unapproved-generated.md', 'good-approved-generated.md'].map(fixture),
      ards,
      ctx
    );
    expect(report.approval.excluded.map((e) => e.id)).toEqual(['FIX-BAD-DRAFT']);
    expect(report.blocks.find((b) => b.id === 'FIX-GOOD-DRAFT').included).toBe(true);
  });
});

describe('Gate: binding resolution across the library', () => {
  it('TXT-BIND-008: runGates reports an orphaned and an ambiguous binding as resolution errors (#1)', () => {
    const report = runGates(
      ['bad-orphan-binding.md', 'bad-ambiguous-binding.md'].map(fixture),
      ards,
      ctx
    );
    expect(report.bindingResolution.ok).toBe(false);
    expect(report.bindingResolution.errors.join('\n')).toMatch(/FIX-BAD-ORPHAN: orphaned binding/);
    expect(report.bindingResolution.errors.join('\n')).toMatch(/FIX-BAD-AMBIGUOUS: ambiguous/);
    expect(report.ok).toBe(false);
  });

  it('TXT-LIB-001: a block that binds a display it does not declare is reported (#1)', () => {
    const report = runGates([fixture('bad-undeclared-display.md')], ards, ctx);
    expect(report.bindingResolution.errors.join('\n')).toMatch(
      /binds undeclared display\(s\) t-ae-overview/
    );
  });

  it('TXT-LIB-002: every binding in the shipped Text Library resolves against the fixture ARDs (#1)', () => {
    const report = runGates([...loadTextLibrary(LIBRARY_DIR).values()], ards, ctx);
    expect(report.bindingResolution.errors).toEqual([]);
    expect(report.structure.errors).toEqual([]);
    const bound = report.blocks.reduce((sum, b) => sum + b.bindings, 0);
    expect(bound).toBeGreaterThan(100);
  });

  it('TXT-LIB-003: full-precision values without a digits qualifier are surfaced as a warning (#1)', () => {
    const block = {
      ...fixture('good-parameterized.md'),
      body: 'Overall {{ard:t-ae-overview:any_ae:p;group=Total;scale=100}} percent.',
    };
    const report = runGates([block], ards, ctx);
    expect(report.warnings.join('\n')).toMatch(/renders .* at full precision/);
  });
});
