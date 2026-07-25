import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildRequirementSet,
  compareRequirements,
  extractIdsFromTestSource,
  mapHeader,
  parseRequirementMatrix,
  resolveRequirementCoverage,
  splitRow
} from '../../scripts/requirements-lib.mjs';

const fixtureDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'site'
);
const matrix = readFileSync(path.join(fixtureDir, 'matrix.md'), 'utf8');

describe('requirement matrix extraction', () => {
  test('QC-MATRIX-001: only rows whose ID cell is exactly a requirement ID are extracted (#1)', () => {
    const rows = parseRequirementMatrix(matrix);
    const ids = rows.map((row) => row.id);
    expect(ids).toEqual(['FIX-AREA-001', 'FIX-AREA-002A', 'FIX-AREA-002B', 'FIX-AREA-004']);
    expect(ids).not.toContain('not-an-id');
    expect(rows[0].text).toBe('The engine computes something useful.');
  });

  test('QC-MATRIX-002: table columns are located by header name, not by position (#1)', () => {
    const columns = mapHeader(['Status', 'ID', 'Requirement', 'Area']);
    expect(columns).toEqual({ status: 0, id: 1, text: 2, area: 3 });

    const reordered = [
      '| Status | ID | Requirement |',
      '| --- | --- | --- |',
      '| draft | FIX-AREA-007 | Reordered columns still resolve. |'
    ].join('\n');
    expect(parseRequirementMatrix(reordered)).toEqual([
      {
        id: 'FIX-AREA-007',
        area: '',
        text: 'Reordered columns still resolve.',
        source: '',
        evidence: '',
        link: '',
        status: 'draft'
      }
    ]);
  });

  test('QC-MATRIX-002: a header row without an ID and Requirement pair is not adopted (#1)', () => {
    expect(mapHeader(['Package', 'Version'])).toBeNull();
  });

  test('QC-MATRIX-003: requirement text containing an escaped pipe survives intact (#1)', () => {
    expect(splitRow('| a | b \\| c | d |')).toEqual(['a', 'b | c', 'd']);
    const split = parseRequirementMatrix(matrix).find((row) => row.id === 'FIX-AREA-002A');
    expect(split.text).toContain('literal pipe | inside');
  });

  test('QC-MATRIX-004: other tables and prose mentioning an ID contribute nothing (#1)', () => {
    const rows = parseRequirementMatrix(matrix);
    expect(rows.map((row) => row.id)).not.toContain('FIX-AREA-003');
    expect(rows.some((row) => row.text.includes('cards'))).toBe(false);
  });

  test('QC-MATRIX-005: the extract is deterministic and carries no timestamp (#1)', () => {
    const first = buildRequirementSet({ component: 'fixture', matrix: 'matrix.md', markdown: matrix });
    const second = buildRequirementSet({ component: 'fixture', matrix: 'matrix.md', markdown: matrix });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.stringify(first)).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(Object.keys(first.requirements)).toHaveLength(4);
    expect(first.component).toBe('fixture');
  });

  test('QC-MATRIX-005: an empty or malformed document extracts to nothing rather than throwing (#1)', () => {
    expect(parseRequirementMatrix('')).toEqual([]);
    expect(parseRequirementMatrix(null)).toEqual([]);
    expect(parseRequirementMatrix('| just | one | row |')).toEqual([]);
  });
});

describe('requirement drift guard', () => {
  const committed = { requirements: { 'FIX-AREA-001': 'original', 'FIX-AREA-002A': 'kept' } };

  test('QC-DRIFT-001: added, removed and changed requirement text are all reported (#1)', () => {
    const fresh = { requirements: { 'FIX-AREA-002A': 'kept', 'FIX-AREA-004': 'new' } };
    const { stale, differences } = compareRequirements(committed, fresh);
    expect(stale).toBe(true);
    expect(differences).toContain('removed: FIX-AREA-001');
    expect(differences).toContain('added: FIX-AREA-004');

    const changed = compareRequirements(committed, {
      requirements: { 'FIX-AREA-001': 'edited', 'FIX-AREA-002A': 'kept' }
    });
    expect(changed.differences).toEqual(['text changed: FIX-AREA-001']);
  });

  test('QC-DRIFT-001: an identical extract is not stale (#1)', () => {
    expect(compareRequirements(committed, committed)).toEqual({ stale: false, differences: [] });
  });
});

describe('requirement IDs referenced by tests', () => {
  const source = readFileSync(path.join(fixtureDir, 'sample-tests.txt'), 'utf8');

  test('QC-NAME-002: requirement IDs are read from test titles only, not comments or strings (#1)', () => {
    const ids = extractIdsFromTestSource(source);
    expect(ids).toEqual(['FIX-AREA-001', 'FIX-AREA-002A', 'FIX-AREA-002B', 'FIX-AREA-004']);
    expect(ids).not.toContain('FIX-AREA-999');
    expect(ids).not.toContain('FIX-AREA-998');
  });
});

describe('unresolved requirement IDs — the safety.viz blind spot', () => {
  const requirements = { 'FIX-AREA-001': 'a', 'FIX-AREA-002A': 'b', 'FIX-AREA-004': 'd' };

  test('QC-UNRES-001: an ID referenced by a test but defined in no matrix is reported (#1)', () => {
    const report = resolveRequirementCoverage({
      requirements,
      referenced: ['FIX-AREA-001', 'FIX-AREA-002'],
      known: new Set(Object.keys(requirements))
    });
    expect(report.unresolved).toEqual(['FIX-AREA-002']);
    expect(report.covered).toEqual(['FIX-AREA-001']);
  });

  test('QC-UNRES-002: reviewed requirements no test references are reported as uncovered (#1)', () => {
    const report = resolveRequirementCoverage({
      requirements,
      referenced: ['FIX-AREA-001'],
      known: new Set(Object.keys(requirements))
    });
    expect(report.uncovered).toEqual(['FIX-AREA-002A', 'FIX-AREA-004']);
    expect(report.coverage).toBeCloseTo(1 / 3, 5);
    expect(report.defined).toBe(3);
  });

  test('QC-UNRES-003: an ID defined in a sibling matrix resolves rather than raising an alarm (#1)', () => {
    const report = resolveRequirementCoverage({
      requirements,
      referenced: ['FIX-AREA-001', 'TRC-BIND-001'],
      known: new Set([...Object.keys(requirements), 'TRC-BIND-001'])
    });
    expect(report.unresolved).toEqual([]);
    expect(report.elsewhere).toEqual(['TRC-BIND-001']);
  });

  test('QC-UNRES-001: nothing referenced and nothing defined produces an empty, non-throwing report (#1)', () => {
    const report = resolveRequirementCoverage({});
    expect(report).toMatchObject({ defined: 0, referenced: 0, coverage: 0 });
    expect(report.unresolved).toEqual([]);
  });
});
