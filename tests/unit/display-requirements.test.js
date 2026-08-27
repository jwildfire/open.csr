// A display page lists the requirements that cover THAT display.
//
// It did not. `site/config.json` declares a `prefixes` array per display —
// t-disposition carries ["DSP-DISP"] and has since it was registered — and
// nothing read it. Every gallery page rendered the whole 49-row matrix, so the
// repeated-measures efficacy table listed DSP-AE-001 (adverse events) and
// DSP-VS-003 (vital signs) among its own requirements, and so did every other
// display, identically.
//
// That is worse than an empty field. An empty field says "unknown"; this said
// "covered by 49 requirements" about a display that 5 of them mention.
import { describe, it, expect } from 'vitest';
import { requirementsFor } from '../../scripts/site-lib.mjs';

const MATRIX = {
  'DSP-AE-001': 'an adverse-event requirement',
  'DSP-AE-002': 'another adverse-event requirement',
  'DSP-EFF-001': 'an efficacy requirement',
  'DSP-EFF-002': 'another efficacy requirement',
  'DSP-REF-001': 'the reference-report comparison',
  'DSP-ALL-001': 'a requirement every display carries',
  'TFL-FMT-001': 'an engine requirement',
};

describe('a display page lists its own requirements', () => {
  it('QC-SITE-015: a display page lists only the requirements matching its declared prefixes (#1)', () => {
    expect(Object.keys(requirementsFor(MATRIX, ['DSP-EFF']))).toEqual(['DSP-EFF-001', 'DSP-EFF-002']);
  });

  it('QC-SITE-015: every declared prefix is kept, not just the first (#1)', () => {
    expect(Object.keys(requirementsFor(MATRIX, ['DSP-EFF', 'DSP-REF'])))
      .toEqual(['DSP-EFF-001', 'DSP-EFF-002', 'DSP-REF-001']);
  });

  it('QC-SITE-015: the whole prefix must match, so DSP-AE never catches DSP-AEX (#1)', () => {
    const m = { 'DSP-AE-001': 'a', 'DSP-AEX-001': 'b' };
    expect(Object.keys(requirementsFor(m, ['DSP-AE']))).toEqual(['DSP-AE-001']);
  });

  // The honest degrade. A display with no declared prefixes is a registration
  // gap, and showing it everything is what made the gap invisible in the first
  // place — so it gets nothing and the page can say so.
  it('QC-SITE-015: a display declaring no prefixes lists none rather than all of them (#1)', () => {
    expect(requirementsFor(MATRIX, [])).toEqual({});
    expect(requirementsFor(MATRIX, undefined)).toEqual({});
  });

  it('QC-SITE-015: an empty matrix stays empty (#1)', () => {
    expect(requirementsFor({}, ['DSP-EFF'])).toEqual({});
    expect(requirementsFor(undefined, ['DSP-EFF'])).toEqual({});
  });
});
