import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assemble } from '../../scripts/assemble.mjs';
import {
  armLabels,
  checkAssemblyStudy,
  checkTreatmentConsistency,
  loadStudyModel,
} from '../../scripts/study-lib.mjs';
import { ROOT } from './text-test-helpers.js';

const model = loadStudyModel(ROOT);

// A synthetic ARD carrying only what the gate reads.
const ard = (population, sourcePkg = 'phuse-org/phuse-scripts:data/adam') => ({
  provenance: { population, data: [{ dataset: 'adsl', source_pkg: sourcePkg }] },
  rows: [],
});
const good = (set = 'safety') => ({ analysis_set: set, group: 'TRT01A', n: { ...model.analysis_sets[set].subjects } });

describe('Study model', () => {
  it('STD-MODEL-001: library/study.yaml loads with three arms in print order and every analysis set counted per arm (#59)', () => {
    expect(model.id).toBe('CDISCPILOT01');
    expect(armLabels(model)).toEqual(['Placebo', 'Xanomeline Low Dose', 'Xanomeline High Dose']);
    for (const [name, set] of Object.entries(model.analysis_sets)) {
      expect(Object.keys(set.subjects).sort(), name).toEqual(armLabels(model).slice().sort());
      expect('flag' in set, name).toBe(true);
    }
    expect(model.source.default).toBe('phuse');
  });

  it('STD-MODEL-002: every assembly that declares treatment groups declares the model\'s arms, in the model\'s order (#59)', () => {
    const tplDir = join(ROOT, 'library', 'templates');
    for (const id of ['ich-e3', 'e3-synopsis', 'display-package', 'e3-abbreviated']) {
      const path = join(tplDir, id, 'assembly.yaml');
      if (!existsSync(path)) continue;
      const study = /treatment_groups:\s*\[([^\]]*)\]/.exec(readFileSync(path, 'utf8'));
      if (!study) continue;
      const declared = study[1].split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
      expect(checkAssemblyStudy(model, { treatment_groups: declared }), id).toEqual([]);
    }
    expect(checkAssemblyStudy(model, { treatment_groups: ['Placebo', 'Xanomeline High Dose', 'Xanomeline Low Dose'] })).toHaveLength(1);
    expect(checkAssemblyStudy(model, { id: 'OTHER' })[0]).toMatch(/study\.id/);
  });
});

describe('Gate: treatment consistency', () => {
  it('STD-GATE-001: a display whose arm counts differ from the study model fails the gate, and the error names the display, the arm and both numbers (#59)', () => {
    const ards = new Map([
      ['t-demographics', ard({ analysis_set: 'safety', group: 'TRT01A', n: { Placebo: 86, 'Xanomeline Low Dose': 96, 'Xanomeline High Dose': 72 } }, 'pharmaverseadam')],
      ['t-populations', ard(good('all'))],
    ]);
    const gate = checkTreatmentConsistency(model, ards);
    expect(gate.ok).toBe(false);
    expect(gate.errors.some((e) => /t-demographics: Xanomeline Low Dose has 96 subjects .* says 84/.test(e))).toBe(true);
    expect(gate.errors.some((e) => /t-demographics: Xanomeline High Dose has 72 subjects .* says 84/.test(e))).toBe(true);
    expect(gate.lanes['t-demographics']).toEqual(['pharmaverseadam']);
    expect(gate.checked).toContain('t-populations');
  });

  it('STD-GATE-002: two displays reporting the same analysis set with different counts in one document is an error naming both, even when one of them matches the model (#59)', () => {
    const skewed = { ...good('safety'), n: { Placebo: 86, 'Xanomeline Low Dose': 96, 'Xanomeline High Dose': 72 } };
    const gate = checkTreatmentConsistency(model, new Map([['t-a', ard(good())], ['t-b', ard(skewed)]]));
    expect(gate.ok).toBe(false);
    const both = gate.errors.find((e) => e.startsWith('the safety set is reported with 2 different arm counts'));
    expect(both).toBeDefined();
    expect(both).toContain('t-a');
    expect(both).toContain('t-b');
  });

  it('STD-GATE-003: a display with no population record is a named warning, never a silent pass; one with no arm grouping is warned and not counted as checked (#59)', () => {
    const gate = checkTreatmentConsistency(
      model,
      new Map([
        ['t-old', { provenance: { data: [] }, rows: [] }],
        ['l-listing', ard({ analysis_set: 'safety', group: null, n: null, total: 254 })],
        ['t-ok', ard(good())],
      ])
    );
    expect(gate.ok).toBe(true);
    expect(gate.checked).toEqual(['t-ok']);
    expect(gate.warnings.some((w) => w.startsWith('t-old:') && /NOT gated/.test(w))).toBe(true);
    expect(gate.warnings.some((w) => w.startsWith('l-listing:') && /not gated by arm/.test(w))).toBe(true);
  });

  it('STD-GATE-004: an analysis set the model does not declare is an error, not a skipped check (#59)', () => {
    const gate = checkTreatmentConsistency(model, new Map([['t-x', ard({ analysis_set: 'nosuchset', group: 'TRT01A', n: { Placebo: 1 } })]]));
    expect(gate.ok).toBe(false);
    expect(gate.errors[0]).toMatch(/nosuchset/);
  });

  it('STD-GATE-005: the committed report assembles green on the gate, every placed display is gated by arm, and none of them read the alternate lane (#60)', () => {
    const doc = assemble({ write: false });
    const gate = doc.gates.treatmentConsistency;
    expect(gate, 'gate present on the document').toBeDefined();
    expect(gate.errors).toEqual([]);
    expect(gate.ok).toBe(true);
    const placed = doc.displayIndex.map((d) => d.slug);
    const listings = placed.filter((s) => s.startsWith('l-'));
    for (const slug of placed) {
      if (listings.includes(slug)) continue;
      expect(gate.checked, slug).toContain(slug);
    }
    for (const slug of placed) {
      expect(gate.lanes[slug], slug).toEqual(['phuse-org/phuse-scripts:data/adam']);
    }
    expect(gate.warnings.filter((w) => /NOT gated/.test(w))).toEqual([]);
  });
});
