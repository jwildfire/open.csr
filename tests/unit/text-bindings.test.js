import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import {
  formatValue,
  matchRows,
  parseBindingAddress,
  parseBlock,
  renderBlock,
  resolveBinding,
  resolveXref,
  roundHalfUp,
} from '../../scripts/text-lib.mjs';
import { BLOCK_FIXTURES, fixtureArds, stubContext } from './text-test-helpers.js';

const ards = fixtureArds();

describe('Binding addresses', () => {
  it('TXT-BIND-001: parseBindingAddress splits display, analysis, statistic and qualifiers (#1)', () => {
    const parsed = parseBindingAddress(
      't-ae-common:by_soc_pt:p;variable=AEDECOD;variable_level=PRURITUS;group=Placebo;scale=100;digits=1'
    );
    expect(parsed.display).toBe('t-ae-common');
    expect(parsed.analysis).toBe('by_soc_pt');
    expect(parsed.statName).toBe('p');
    expect(parsed.qualifiers).toEqual({
      variable: 'AEDECOD',
      variable_level: 'PRURITUS',
      group: 'Placebo',
      scale: '100',
      digits: '1',
    });
  });

  it('TXT-BIND-002: a malformed address or an unknown qualifier is rejected rather than silently ignored (#1)', () => {
    expect(() => parseBindingAddress('t-ae-overview:any_ae')).toThrow(/expected <display>/);
    expect(() => parseBindingAddress('t-ae-overview::n')).toThrow(/empty component/);
    expect(() => parseBindingAddress('t-ae-overview:any_ae:n;arm=Placebo')).toThrow(
      /unknown qualifier "arm"/
    );
    expect(() => parseBindingAddress('t-ae-overview:any_ae:p;digits=two')).toThrow(
      /digits qualifier/
    );
    expect(() => parseBindingAddress('t-ae-overview:any_ae:p;scale=lots')).toThrow(
      /scale qualifier/
    );
  });

  it('TXT-BIND-003: a fully qualified binding resolves to exactly one ARD row (#1)', () => {
    const parsed = parseBindingAddress('t-ae-overview:any_ae:n;group=Total');
    expect(matchRows(parsed, ards.get('t-ae-overview'))).toHaveLength(1);
    const resolved = resolveBinding(parsed, ards);
    expect(resolved.ok).toBe(true);
    expect(resolved.matches).toBe(1);
    expect(resolved.row.analysis).toBe('any_ae');
    expect(resolved.row.group1_level).toBe('Total');
    expect(typeof resolved.value).toBe('number');
  });

  it('TXT-BIND-004: an under-specified binding that matches several rows fails as ambiguous (#1)', () => {
    const resolved = resolveBinding(parseBindingAddress('t-ae-overview:any_ae:n'), ards);
    expect(resolved.ok).toBe(false);
    expect(resolved.matches).toBeGreaterThan(1);
    expect(resolved.error).toMatch(/ambiguous binding: \d+ ARD rows match/);
  });

  it('TXT-BIND-005: a binding no ARD row satisfies fails loudly as orphaned (#1)', () => {
    const resolved = resolveBinding(
      parseBindingAddress('t-ae-overview:disc_ae:n;group=Total'),
      ards
    );
    expect(resolved.ok).toBe(false);
    expect(resolved.matches).toBe(0);
    expect(resolved.error).toMatch(/orphaned binding/);
  });

  it('TXT-BIND-006: a binding to a display with no ARD fails instead of rendering an empty string (#1)', () => {
    const resolved = resolveBinding(parseBindingAddress('t-not-built:any:n'), ards);
    expect(resolved.ok).toBe(false);
    expect(resolved.error).toMatch(/no ARD available for display "t-not-built"/);
  });

  it('TXT-BIND-007: variable, variable_level and group2 qualifiers select within a hierarchical ARD (#1)', () => {
    const soc = resolveBinding(
      parseBindingAddress(
        't-ae-common:by_soc_pt:n;variable=AEBODSYS;variable_level=SKIN AND SUBCUTANEOUS TISSUE DISORDERS;group=Placebo'
      ),
      ards
    );
    const pt = resolveBinding(
      parseBindingAddress(
        't-ae-common:by_soc_pt:n;variable=AEDECOD;variable_level=PRURITUS;group2=SKIN AND SUBCUTANEOUS TISSUE DISORDERS;group=Placebo'
      ),
      ards
    );
    expect(soc.ok).toBe(true);
    expect(pt.ok).toBe(true);
    expect(pt.row.group2_level).toBe('SKIN AND SUBCUTANEOUS TISSUE DISORDERS');
    expect(pt.value).toBeLessThanOrEqual(soc.value);
  });
});

describe('Value formatting', () => {
  it('TXT-FMT-001: rounding is half-up, not R half-to-even (#1)', () => {
    expect(roundHalfUp(0.125, 2)).toBe(0.13);
    expect(roundHalfUp(0.135, 2)).toBe(0.14);
    expect(roundHalfUp(2.5, 0)).toBe(3);
    expect(roundHalfUp(3.5, 0)).toBe(4);
    expect(roundHalfUp(-2.5, 0)).toBe(-3);
    expect(roundHalfUp(2.675, 2)).toBe(2.68);
  });

  it('TXT-FMT-002: integers render without a decimal point and digits fixes the decimal places (#1)', () => {
    expect(formatValue(217)).toBe('217');
    expect(formatValue(0, 0)).toBe('0');
    expect(formatValue(85.4321, 1)).toBe('85.4');
    expect(formatValue(85, 2)).toBe('85.00');
    expect(formatValue(null)).toBe('');
    expect(formatValue('RECOVERED')).toBe('RECOVERED');
  });

  it('TXT-FMT-003: the scale qualifier converts the ARD proportion to a percentage for prose (#1)', () => {
    const raw = resolveBinding(parseBindingAddress('t-ae-overview:any_ae:p;group=Total'), ards);
    const scaled = resolveBinding(
      parseBindingAddress('t-ae-overview:any_ae:p;group=Total;scale=100;digits=1'),
      ards
    );
    expect(raw.value).toBeLessThanOrEqual(1);
    expect(scaled.value).toBe(raw.value);
    expect(Number(scaled.formatted)).toBeCloseTo(raw.value * 100, 1);
    expect(scaled.formatted).toMatch(/^\d+\.\d$/);
  });
});

describe('Rendering and cross-references', () => {
  it('TXT-REND-001: renderBlock substitutes every token and records the span each value occupies (#1)', () => {
    const block = parseBlock(join(BLOCK_FIXTURES, 'good-parameterized.md'));
    const rendered = renderBlock(block, ards, stubContext());
    expect(rendered.errors).toEqual([]);
    expect(rendered.text).not.toMatch(/\{\{/);
    expect(rendered.bindings).toHaveLength(3);
    for (const span of rendered.spans) {
      expect(rendered.text.slice(span.start, span.end).length).toBeGreaterThan(0);
    }
    const first = rendered.bindings[0];
    expect(rendered.text.slice(first.start ?? 0)).toBeTruthy();
    expect(rendered.text).toContain(String(first.value));
  });

  it('TXT-REND-002: an unresolved binding leaves a visible marker and is reported as an error (#1)', () => {
    const block = parseBlock(join(BLOCK_FIXTURES, 'bad-orphan-binding.md'));
    const rendered = renderBlock(block, ards, stubContext());
    expect(rendered.text).toContain('[UNRESOLVED BINDING]');
    expect(rendered.errors.join(' ')).toMatch(/orphaned binding/);
    expect(rendered.bindings.every((b) => b.resolved === false)).toBe(true);
  });

  it('TXT-XREF-001: display cross-references render the number assigned at build time (#1)', () => {
    const ctx = stubContext();
    expect(resolveXref('display', 't-ae-overview', ctx)).toEqual({
      ok: true,
      text: 'Table 14.3.1.2',
    });
    expect(resolveXref('display', 'l-ae-serious', ctx).text).toBe('Listing 14.3.2.1');
    expect(resolveXref('section', '12.2.1', ctx).text).toBe('Section 12.2.1');
    expect(resolveXref('section', '16.1.9', ctx).text).toBe('Appendix 16.1.9');
  });

  it('TXT-XREF-002: a cross-reference to an unknown display or section fails the build (#1)', () => {
    const ctx = stubContext();
    const display = resolveXref('display', 't-does-not-exist', ctx);
    const section = resolveXref('section', '99.9', ctx);
    expect(display.ok).toBe(false);
    expect(display.error).toMatch(/unknown display/);
    expect(section.ok).toBe(false);
    expect(section.error).toMatch(/unknown section/);
  });
});
