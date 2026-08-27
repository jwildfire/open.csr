import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assemble } from '../../scripts/assemble.mjs';
import { ROOT, librarySlugs } from './text-test-helpers.js';

// One assembly for the whole suite; `write: false` keeps docs/assembled/ untouched
// so running the tests never mutates a published artifact.
const doc = assemble({ write: false });
const section = (number) => doc.sections.find((s) => s.number === number);

describe('Assembled CSR document model', () => {
  it('RPT-OUT-001: assemble() emits the documented csr.json shape (#1)', () => {
    expect(doc.schema).toBe('opencsr/csr/v1');
    expect(doc.generated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(doc.study.id).toBe('CDISCPILOT01');
    expect(doc.template).toMatchObject({ id: 'ich-e3' });
    expect(doc.template.sectionCount).toBe(doc.sections.length);
    for (const key of ['sections', 'displayIndex', 'textBlocks', 'buildErrors']) {
      expect(Array.isArray(doc[key]), key).toBe(true);
    }
    expect(doc.provenanceAppendix.section).toBe('16.1.9');
    for (const key of ['structure', 'bindingResolution', 'numericFidelity', 'approval', 'crossReferences']) {
      expect(doc.gates[key], key).toBeDefined();
    }
  });

  it('RPT-OUT-002: the section list is flat, in document order, and every child names a parent that is present (#1)', () => {
    const numbers = doc.sections.map((s) => s.number);
    expect(numbers.slice(0, 3)).toEqual(['1', '2', '3']);
    expect(numbers).toContain('16.4');
    for (const s of doc.sections) {
      if (s.parent) expect(numbers, `parent of ${s.number}`).toContain(s.parent);
    }
  });

  it('RPT-OUT-003: the build has no errors and every gate passes (#1)', () => {
    expect(doc.buildErrors).toEqual([]);
    expect(doc.gates.structure.errors).toEqual([]);
    expect(doc.gates.bindingResolution.errors).toEqual([]);
    expect(doc.gates.crossReferences.errors).toEqual([]);
    expect(doc.gates.numericFidelity.violations).toEqual([]);
    expect(doc.ok).toBe(true);
  });

  it('RPT-ASM-008: in-text displays land in narrative sections and post-text displays only under Section 14 (#1)', () => {
    expect(section('10.1').displays.map((d) => d.slug)).toEqual(['t-disposition']);
    expect(section('12.2.1').displays.map((d) => d.slug)).toEqual(['t-ae-overview']);
    for (const s of doc.sections) {
      for (const d of s.displays) expect(d.variant).toBe('in_text');
      if (s.postText.length) expect(s.number.startsWith('14')).toBe(true);
      for (const d of s.postText) expect(d.variant).toBe('post_text');
    }
    expect(section('14.3.1').postText.map((d) => d.number)).toEqual([
      '14.3.1.1',
      '14.3.1.2',
      '14.3.1.3',
    ]);
  });

  it('RPT-ASM-009: the same display appears in-text and post-text from a single ARD (#1)', () => {
    const inText = section('12.2.2').displays[0];
    const postText = section('14.3.1').postText.find((d) => d.slug === 't-ae-common');
    expect(inText.slug).toBe(postText.slug);
    expect(inText.ardPath).toBe(postText.ardPath);
    expect(doc.displayIndex.find((d) => d.slug === 't-ae-common').variants.sort()).toEqual([
      'in_text',
      'post_text',
    ]);
  });

  it('RPT-ARD-001: every display resolves to a real ARD, and the source is recorded as outputs or fixture (#1)', () => {
    // Derived, not a magic number: the report carries what its assembly names,
    // and a display added to the library and to Section 14 must not need this
    // count edited to stay green.
    expect(doc.displayIndex.length).toBe(new Set(doc.displayIndex.map((d) => d.slug)).size);
    expect(doc.displayIndex.map((d) => d.slug).sort()).toEqual(
      doc.displayIndex.map((d) => d.slug).filter((s) => librarySlugs().includes(s)).sort()
    );
    expect(doc.displayIndex.length).toBeGreaterThanOrEqual(6);
    for (const d of doc.displayIndex) {
      expect(['outputs', 'fixture'], d.slug).toContain(d.ardSource);
      expect(d.ardPath).toMatch(/ard\.json$|\.json$/);
      expect(existsSync(join(ROOT, d.ardPath))).toBe(true);
      expect(d.ard.provenance).toBeTruthy();
    }
  });

  it('RPT-PROV-001: Section 16.1.9 is generated from the ARD provenance envelopes, not authored (#1)', () => {
    const provenance = section('16.1.9').provenance;
    expect(provenance).toBeTruthy();
    expect(provenance.displays.map((p) => p.slug).sort()).toEqual(
      doc.displayIndex.map((d) => d.slug).sort()
    );
    for (const entry of provenance.displays) {
      expect(entry.specHash).toMatch(/^sha256:/);
      expect(entry.displayHash).toMatch(/^sha256:/);
      expect(entry.data.length).toBeGreaterThan(0);
      // The report draws on two packagings of the same study — {pharmaverseadam}
      // for the safety spine, the CDISC pilot's own ADaM package for the domains
      // that one does not carry — so 16.1.9 records which, per dataset. What
      // matters here is that it came out of the ARD envelope rather than prose.
      expect(typeof entry.data[0].source_pkg).toBe('string');
      expect(entry.data[0].source_pkg.length).toBeGreaterThan(0);
      expect(entry.data[0].source_version).toBeTruthy();
      expect(entry.environment.r).toMatch(/^\d+\.\d+/);
    }
    expect(section('16.1.9').populated).toBe(true);
  });

  it('TXT-APPR-005: draft generated blocks are excluded from the assembled report but still reported (#1)', () => {
    const excluded = doc.gates.approval.excluded.map((e) => e.id);
    expect(excluded.length).toBeGreaterThan(0);
    for (const s of doc.sections) {
      for (const block of s.blocks) {
        const isDraftGenerated = block.tier === 'generated' && block.approval.state !== 'approved';
        expect(block.included).toBe(!isDraftGenerated);
        if (!block.included) {
          expect(excluded).toContain(block.id);
          expect(block.exclusionReason).toMatch(/pending human approval/);
        }
      }
    }
    expect(section('13').blocks[0].included).toBe(false);
  });

  it('TXT-TRACE-001: every rendered block carries its resolved bindings back to an ARD row (#1)', () => {
    const block = section('12.2.1').blocks[0];
    expect(block.bindings.length).toBeGreaterThan(10);
    for (const binding of block.bindings) {
      expect(binding.resolved).toBe(true);
      expect(binding.row.analysis).toBe(binding.analysis);
      expect(binding.row.stat_name).toBe(binding.stat_name);
      expect(block.text).toContain(binding.formatted);
    }
    expect(block.text).not.toMatch(/\{\{/);
  });

  it('TXT-XREF-003: every cross-reference in the assembled document resolved (#1)', () => {
    let count = 0;
    for (const s of doc.sections) {
      for (const block of s.blocks) {
        for (const xref of block.crossReferences) {
          expect(xref.resolved, `${block.id} -> ${xref.target}`).toBe(true);
          expect(xref.text).not.toMatch(/UNRESOLVED/);
          count += 1;
        }
      }
    }
    expect(count).toBeGreaterThan(10);
  });

  it('RPT-OUT-004: the full E3 skeleton is present, with unpopulated sections flagged rather than dropped (#1)', () => {
    const populated = doc.sections.filter((s) => s.populated);
    expect(populated.length).toBeGreaterThanOrEqual(15);
    expect(populated.length).toBeLessThan(doc.sections.length);
    expect(section('14.2').populated).toBe(false); // no efficacy data (design D12)
    expect(section('11.4.1').populated).toBe(false);
  });
});

describe('Assembled CSR rendering', () => {
  const html = readFileSync(join(ROOT, 'docs/assembled/csr.html'), 'utf8');

  it('RPT-OUT-005: csr.html is written and contains resolved numbers, never a raw binding (#1)', () => {
    expect(html).toMatch(/<title>CDISCPILOT01/);
    const tokens = html.match(/\{\{(ard|xref):[^}]+\}\}/g) ?? [];
    expect(tokens).toEqual([]);
    expect(html).not.toContain('UNRESOLVED');
    const overview = doc.sections.find((s) => s.number === '12.2.1').blocks[0];
    for (const binding of overview.bindings.slice(0, 5)) {
      expect(html).toContain(binding.formatted);
    }
  });

  it('RPT-OUT-006: csr.html is self-contained — no external host, script or stylesheet (#1)', () => {
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link[^>]+stylesheet/i);
    expect(html).toMatch(/<style>/);
  });

  it('RPT-OUT-007: the rendered document shows the numbering, the gate report and the provenance appendix (#1)', () => {
    expect(html).toContain('Table 14.3.1.2');
    expect(html).toContain('Documentation of Statistical Methods');
    expect(html).toContain('Build gates');
    expect(html).toContain('Excluded from the assembled report');
    expect(html).toMatch(/sha256:[0-9a-f]{8}/);
  });
});
