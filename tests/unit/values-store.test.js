// The values store and its gate (obot.roadmap #129 B).
//
// The R pipeline builds `outputs/values/values.json` from `library/values/values.yaml`.
// This suite is the other half of that contract: prose binds a value by NAME, and
// the build re-derives every value from the committed ARDs so that naming a number
// never weakens the check on it. A stale value has to fail exactly the way a typed
// number does.
//
// Fixture ARDs, never `outputs/` — the R pipeline owns that directory and rewrites
// it, so a gate test here must fail for its own reason. The one exception is the
// committed-store test at the bottom, which is deliberately about the repository.

import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import {
  VALUES_SCHEMA,
  applyValueOp,
  checkValueStore,
  formatStoredValue,
  hashFile,
  loadValueStore,
  valueIndex,
  valueUsage
} from '../../scripts/values-lib.mjs';
import { parseBlock, renderBlock, checkNumericFidelity, runGates } from '../../scripts/text-lib.mjs';
import { ROOT, fixtureArds, stubContext } from './text-test-helpers.js';

const ards = fixtureArds();

// A store built by hand against the fixture ARDs: two ARD-sourced values and one
// derived from them. Written out rather than generated so the expectations below
// are independent of the builder that produces the real one.
function fixtureStore() {
  return {
    schema: VALUES_SCHEMA,
    study: 'CDISCPILOT01',
    created: '2026-07-26T00:00:00Z',
    values: [
      {
        id: 'ae-any-n-placebo',
        label: 'Subjects with any AE (Placebo)',
        kind: 'ard',
        value: statOf('t-ae-overview', 'any_ae', 'n', 'Placebo'),
        formatted: String(statOf('t-ae-overview', 'any_ae', 'n', 'Placebo')),
        format: { scale: 1, digits: 0 },
        source: {
          address: 't-ae-overview:any_ae:n;group=Placebo',
          display: 't-ae-overview',
          analysis: 'any_ae',
          iteration: 'v001',
          ard_file: 'outputs/t-ae-overview/v001/ard.json',
          ard_hash: 'sha256:fixture'
        }
      },
      {
        id: 'ae-any-n-high',
        label: 'Subjects with any AE (High Dose)',
        kind: 'ard',
        value: statOf('t-ae-overview', 'any_ae', 'n', 'Xanomeline High Dose'),
        formatted: String(statOf('t-ae-overview', 'any_ae', 'n', 'Xanomeline High Dose')),
        format: { scale: 1, digits: 0 },
        source: {
          address: 't-ae-overview:any_ae:n;group=Xanomeline High Dose',
          display: 't-ae-overview',
          analysis: 'any_ae',
          iteration: 'v001',
          ard_file: 'outputs/t-ae-overview/v001/ard.json',
          ard_hash: 'sha256:fixture'
        }
      },
      {
        id: 'ae-excess',
        label: 'Additional subjects with an AE, high dose versus placebo',
        kind: 'derived',
        value:
          statOf('t-ae-overview', 'any_ae', 'n', 'Xanomeline High Dose') -
          statOf('t-ae-overview', 'any_ae', 'n', 'Placebo'),
        formatted: String(
          statOf('t-ae-overview', 'any_ae', 'n', 'Xanomeline High Dose') -
            statOf('t-ae-overview', 'any_ae', 'n', 'Placebo')
        ),
        format: { scale: 1, digits: 0 },
        derivation: { op: 'difference', inputs: ['ae-any-n-high', 'ae-any-n-placebo'] }
      }
    ]
  };
}

function statOf(slug, analysis, statName, group) {
  const row = ards
    .get(slug)
    .rows.find(
      (r) => r.analysis === analysis && r.stat_name === statName && r.group1_level === group
    );
  return row.stat;
}

describe('the values store', () => {
  it('TXT-VAL-001: a store whose values match their ARD rows passes the gate (#1)', () => {
    const report = checkValueStore(fixtureStore(), ards);
    expect(report.violations).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.checked).toBe(3);
  });

  it('TXT-VAL-001: a value that no longer matches its ARD row fails like a stale number (#1)', () => {
    const store = fixtureStore();
    store.values[0].value += 1;
    store.values[0].formatted = String(store.values[0].value);
    const report = checkValueStore(store, ards);
    expect(report.ok).toBe(false);
    expect(report.violations[0]).toMatchObject({ id: 'ae-any-n-placebo', kind: 'stale' });
    expect(report.violations[0].message).toMatch(/now resolves to/);
  });

  it('TXT-VAL-002: an orphaned or ambiguous address is reported, not silently dropped (#1)', () => {
    const store = fixtureStore();
    store.values[0].source.address = 't-ae-overview:no_such_analysis:n;group=Placebo';
    expect(checkValueStore(store, ards).violations[0]).toMatchObject({
      id: 'ae-any-n-placebo',
      kind: 'orphaned'
    });

    const ambiguous = fixtureStore();
    ambiguous.values[0].source.address = 't-ae-overview:any_ae:n';
    const report = checkValueStore(ambiguous, ards);
    expect(report.ok).toBe(false);
    expect(report.violations[0].message).toMatch(/ambiguous binding/);
  });

  it('TXT-VAL-002: a value citing a display with no ARD in the build is reported (#1)', () => {
    const store = fixtureStore();
    store.values[0].source.address = 't-not-built:any:n';
    expect(checkValueStore(store, ards).violations[0].kind).toBe('orphaned');
  });

  it('TXT-VAL-003: a derived value is recomputed from its inputs, and drift fails (#1)', () => {
    expect(applyValueOp('sum', [1, 2, 3])).toBe(6);
    expect(applyValueOp('difference', [10, 4])).toBe(6);
    expect(applyValueOp('ratio', [3, 4])).toBe(0.75);
    expect(applyValueOp('percent', [3, 4])).toBe(75);
    expect(() => applyValueOp('logarithm', [1, 2])).toThrow(/unknown value operation/);

    const store = fixtureStore();
    store.values[2].value = 999;
    const report = checkValueStore(store, ards);
    expect(report.violations[0]).toMatchObject({ id: 'ae-excess', kind: 'stale' });
  });

  it('TXT-VAL-003: a derivation naming a value defined after it is reported (#1)', () => {
    const store = fixtureStore();
    store.values = [store.values[2], store.values[0], store.values[1]];
    expect(checkValueStore(store, ards).violations[0]).toMatchObject({
      id: 'ae-excess',
      kind: 'derivation'
    });
  });

  it('TXT-VAL-004: presentation is checked too — a mis-formatted value fails (#1)', () => {
    expect(formatStoredValue(0.433, { scale: 100, digits: 1 })).toBe('43.3');
    expect(formatStoredValue(0.4335, { scale: 100, digits: 1 })).toBe('43.4'); // half-up, not half-even
    expect(formatStoredValue(69, { digits: 0 })).toBe('69');

    const store = fixtureStore();
    store.values[0].formatted = '69.0';
    const report = checkValueStore(store, ards);
    expect(report.violations[0].kind).toBe('formatting');
  });

  it('TXT-VAL-005: a value citing an ARD the repository no longer holds is reported (#1)', () => {
    const store = fixtureStore();
    const hashes = new Map([['t-ae-overview', 'sha256:something-else']]);
    const report = checkValueStore(store, ards, hashes);
    expect(report.ok).toBe(false);
    expect(report.violations.every((v) => v.kind === 'iteration')).toBe(true);
    expect(report.violations[0].message).toMatch(/regenerate the values store/);

    // The same store passes once the cited hash is the committed one.
    const matching = new Map([['t-ae-overview', 'sha256:fixture']]);
    expect(checkValueStore(store, ards, matching).ok).toBe(true);
  });

  it('TXT-VAL-005: a store with the wrong schema is refused outright (#1)', () => {
    const store = fixtureStore();
    store.schema = 'opencsr/values/v0';
    const report = checkValueStore(store, ards);
    expect(report.ok).toBe(false);
    expect(report.violations[0].kind).toBe('schema');
  });

  it('TXT-VAL-005: no store at all is not a failure — it is a repository without values (#1)', () => {
    const report = checkValueStore(null, ards);
    expect(report.ok).toBe(true);
    expect(report.skipped).toBe('no values store');
  });
});

describe('binding a value from prose', () => {
  const values = valueIndex(fixtureStore());
  const block = {
    id: 'TXT-FIX-0001',
    tier: 'parameterized',
    displays: ['t-ae-overview'],
    allow_digits: [],
    approval: { state: 'approved' },
    body:
      'Adverse events were reported by {{value:ae-any-n-high}} subjects in the high-dose ' +
      'group, {{value:ae-excess}} more than in the placebo group.'
  };

  it('TXT-VAL-006: a {{value:id}} token renders the stored value and is span-tracked (#1)', () => {
    const rendered = renderBlock(block, ards, { ...stubContext(), values });
    expect(rendered.text).toContain(`${statOf('t-ae-overview', 'any_ae', 'n', 'Xanomeline High Dose')} subjects`);
    expect(rendered.values).toHaveLength(2);
    expect(rendered.values[0]).toMatchObject({ id: 'ae-any-n-high', resolved: true, kind: 'ard' });
    expect(rendered.valueErrors).toEqual([]);
    // Span-tracked means the numeric-fidelity gate accepts the digits it emitted:
    // a named number is still a bound number.
    expect(checkNumericFidelity(rendered, block).ok).toBe(true);
  });

  it('TXT-VAL-006: an unknown value id fails the build rather than rendering blank (#1)', () => {
    const bad = { ...block, body: 'Exactly {{value:no-such-value}} subjects.' };
    const rendered = renderBlock(bad, ards, { ...stubContext(), values });
    expect(rendered.text).toContain('[UNRESOLVED VALUE no-such-value]');
    expect(rendered.valueErrors[0]).toMatch(/unknown value "no-such-value"/);

    const gates = runGates([{ ...bad, errors: [] }], ards, { ...stubContext(), values });
    expect(gates.valueBindings.ok).toBe(false);
    expect(gates.ok).toBe(false);
  });

  it('TXT-VAL-006: value bindings are counted per block alongside ARD bindings (#1)', () => {
    const gates = runGates([{ ...block, errors: [] }], ards, { ...stubContext(), values });
    expect(gates.blocks[0]).toMatchObject({ valueBindings: 2, unresolvedValueBindings: 0 });
    expect(gates.valueBindings.ok).toBe(true);
  });

  it('TXT-VAL-007: the store knows which blocks bind each value (#1)', () => {
    const usage = valueUsage([block, { id: 'TXT-FIX-0002', body: 'None here.' }]);
    expect(usage.get('ae-any-n-high')).toEqual(['TXT-FIX-0001']);
    expect(usage.has('ae-any-n-placebo')).toBe(false);
  });
});

describe('the committed store', () => {
  const store = loadValueStore(ROOT);

  it('TXT-VAL-008: the repository ships a values store in the agreed schema (#1)', () => {
    expect(store).not.toBeNull();
    expect(store.schema).toBe(VALUES_SCHEMA);
    expect(store.values.length).toBeGreaterThan(5);
    for (const value of store.values) {
      expect(value.id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
      expect(value.label).toBeTruthy();
      expect(['ard', 'derived']).toContain(value.kind);
      expect(typeof value.value).toBe('number');
    }
  });

  it('TXT-VAL-008: every committed value cites an ARD file that exists, with a matching hash (#1)', () => {
    for (const value of store.values.filter((v) => v.kind === 'ard')) {
      expect(value.source.ard_file).toMatch(/^outputs\/.+\/ard\.json$/);
      expect(hashFile(join(ROOT, value.source.ard_file))).toBe(value.source.ard_hash);
    }
  });
});
