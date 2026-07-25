import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatStat,
  parseBinding,
  renderBoundProse,
  renderXrefs,
  resolveBinding
} from '../../scripts/site-lib.mjs';

const repoDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'site',
  'repo'
);
const ard = JSON.parse(readFileSync(path.join(repoDir, 'outputs/t-demo/v002/ard.json'), 'utf8'));
const ards = { 't-demo': ard };

describe('binding addresses', () => {
  test('TRC-BIND-001: an address parses into display, analysis, statistic and qualifiers (#1)', () => {
    expect(parseBinding('t-demo:any_ae:n;group=Xanomeline High Dose;variable_level=Y')).toEqual({
      address: 't-demo:any_ae:n;group=Xanomeline High Dose;variable_level=Y',
      display: 't-demo',
      analysis: 'any_ae',
      statName: 'n',
      filters: { group: 'Xanomeline High Dose', variable_level: 'Y' }
    });
  });

  test('TRC-BIND-001: an address with no qualifiers parses with an empty filter set (#1)', () => {
    expect(parseBinding('t-demo:age:mean').filters).toEqual({});
    expect(parseBinding('').display).toBe('');
  });
});

describe('binding resolution', () => {
  test('TRC-BIND-002: a binding matching exactly one ARD row resolves to its value (#1)', () => {
    const resolved = resolveBinding('t-demo:any_ae:n;group=Xanomeline High Dose', ards);
    expect(resolved.resolved).toBe(true);
    expect(resolved.value).toBe(79);
    expect(resolved.row.stat_label).toBe('n');
  });

  test('TRC-BIND-002: a binding matching several ARD rows is unresolved with a reason (#1)', () => {
    const resolved = resolveBinding('t-demo:any_ae:n', ards);
    expect(resolved.resolved).toBe(false);
    expect(resolved.matches).toBe(2);
    expect(resolved.reason).toMatch(/must be exactly 1/);
  });

  test('TRC-BIND-002: a binding matching no ARD row is unresolved (#1)', () => {
    expect(resolveBinding('t-demo:any_ae:median;group=Placebo', ards).reason).toBe(
      'no ARD row matches'
    );
  });

  test('TRC-BIND-002: a binding naming a display with no generated ARD is unresolved (#1)', () => {
    const resolved = resolveBinding('t-missing:any_ae:n', ards);
    expect(resolved.resolved).toBe(false);
    expect(resolved.reason).toBe('no ARD for display "t-missing"');
  });
});

describe('bound prose', () => {
  test('TRC-BIND-004: a resolved binding renders as a clickable element carrying its address (#1)', () => {
    const html = renderBoundProse({
      markdown: 'Overall, {{ard:t-demo:any_ae:n;group=Placebo}} subjects reported an event.',
      ards
    });
    expect(html).toContain('data-trace="binding"');
    expect(html).toContain('data-display="t-demo"');
    expect(html).toContain('data-analysis="any_ae"');
    expect(html).toContain('data-stat="n"');
    expect(html).toContain('>69<');
    expect(html).not.toContain('unresolved');
  });

  test('TRC-BIND-003: an unresolved binding renders a marked placeholder, never a number (#1)', () => {
    const html = renderBoundProse({
      markdown: 'The median was {{ard:t-demo:any_ae:median;group=Placebo}}.',
      ards
    });
    expect(html).toContain('class="binding unresolved"');
    expect(html).toContain('⟨unresolved⟩');
    expect(html).toContain('data-reason="no ARD row matches"');
    expect(html).not.toMatch(/>\d+</);
  });

  test('TRC-DOC-002: markers left in the assembled document are resolved at render time (#1)', () => {
    const html = renderBoundProse({
      html: '<p>Placebo: {{ard:t-demo:any_ae:p;group=Placebo}}%</p>',
      ards
    });
    expect(html).toContain('>81.2<');
  });

  test('TRC-DOC-002: a value the assembler already resolved is used even without an ARD (#1)', () => {
    const html = renderBoundProse({
      markdown: 'Total {{ard:t-other:any_ae:n}} subjects.',
      bindings: [{ address: 't-other:any_ae:n', value: 148 }],
      ards
    });
    expect(html).toContain('>148<');
    expect(html).not.toContain('unresolved');
  });

  test('TRC-BIND-004: statistics format for display without losing list values (#1)', () => {
    expect(formatStat(69)).toBe('69');
    expect(formatStat(81.2)).toBe('81.2');
    expect(formatStat(['a', 'b'])).toBe('a, b');
    expect(formatStat(null)).toBe('—');
  });

  test('TRC-BIND-004: scale and digits qualifiers turn a stored proportion into a percentage (#1)', () => {
    expect(formatStat(0.4331, { scale: 100, digits: 1 })).toBe('43.3');
    expect(formatStat(1, { scale: 100, digits: 1 })).toBe('100.0');
    // The ARD keeps the proportion; only the presentation changes.
    const html = renderBoundProse({
      markdown: '{{ard:t-demo:any_ae:p;group=Placebo;scale=1;digits=2}}',
      ards
    });
    expect(html).toContain('>81.20<');
  });
});

describe('cross-references', () => {
  const xrefs = {
    sections: { '12.2.1': { slug: 'ae-brief-summary', title: 'Brief Summary of Adverse Events' } },
    displays: { 't-demo': { number: 'Table 14.3.1.1', title: 'Demo display' } }
  };

  test('TRC-DOC-003: a section reference becomes an in-page link (#1)', () => {
    expect(renderXrefs('see {{xref:section:12.2.1}}.', xrefs)).toContain(
      '<a class="xref" href="#ae-brief-summary">Section 12.2.1</a>'
    );
  });

  test('TRC-DOC-003: a display reference becomes a trace handle with its assigned number (#1)', () => {
    const html = renderXrefs('see {{xref:display:t-demo}}.', xrefs);
    expect(html).toContain('data-trace="display"');
    expect(html).toContain('data-display="t-demo"');
    expect(html).toContain('Table 14.3.1.1');
  });

  test('TRC-DOC-003: an unresolved reference degrades to text and never leaks the marker (#1)', () => {
    const html = renderXrefs('see {{xref:section:16.1.3}} and {{xref:display:t-gone}}.', xrefs);
    expect(html).toContain('Section 16.1.3');
    expect(html).toContain('t-gone');
    expect(html).not.toContain('{{xref');
  });

  test('TRC-DOC-003: prose rendering resolves bindings and cross-references together (#1)', () => {
    const html = renderBoundProse({
      markdown: 'Of {{ard:t-demo:any_ae:n;group=Placebo}} subjects; see {{xref:section:12.2.1}}.',
      ards,
      xrefs
    });
    expect(html).toContain('>69<');
    expect(html).toContain('href="#ae-brief-summary"');
  });
});
