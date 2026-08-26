/**
 * The Report Template Library is plural: `library/templates/<id>/` holds a
 * document model and a per-report assembly, and nothing in the loader or the
 * assembler is specific to ICH E3.
 *
 * These tests exist because the library held exactly one instance until #28, so
 * "generic" was a claim about the code rather than a property anything checked.
 * The load-bearing one is the last: the synopsis and the full clinical study
 * report are assembled from the same value store, so they cannot quote the same
 * quantity differently.
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { assemble, listTemplates, templatePaths } from '../../scripts/assemble.mjs';
import { loadAssembly, loadSections, assignDisplayNumbers, validateSections } from '../../scripts/template-lib.mjs';

const ROOT = new URL('../..', import.meta.url).pathname;
const synopsis = loadSections(join(ROOT, 'library/templates/e3-synopsis/sections.yaml'));
const synopsisAssembly = loadAssembly(join(ROOT, 'library/templates/e3-synopsis/assembly.yaml'));

describe('Report Template Library — plural', () => {
  it('RPT-LIB-001: the library holds more than one template object, discovered from disk (#28)', () => {
    const ids = listTemplates();
    expect(ids).toContain('ich-e3');
    expect(ids).toContain('e3-synopsis');
    expect(ids.length).toBeGreaterThan(1);
  });

  it('RPT-LIB-002: a template id resolves to its own model, assembly and output basename (#28)', () => {
    expect(templatePaths('ich-e3').basename).toBe('csr');
    expect(templatePaths('e3-synopsis').basename).toBe('e3-synopsis');
    expect(templatePaths('e3-synopsis').sections).toMatch(/library\/templates\/e3-synopsis\/sections\.yaml$/);
  });

  it('RPT-LIB-003: an unknown template id fails loudly rather than falling back to the default (#28)', () => {
    expect(() => assemble({ write: false, template: 'no-such-template' })).toThrow(/unknown template/);
  });

  it('RPT-LIB-004: gates judge the assembled document, and an ungated library block is reported (#28)', () => {
    const doc = assemble({ write: false, template: 'e3-synopsis' });
    // An E3 block cross-references Section 16.2.1, which a synopsis has not got.
    // Gating it against the synopsis model would be a false failure...
    expect(doc.gates.crossReferences.ok).toBe(true);
    // ...but it must still be visible that it was not judged by this build.
    expect(doc.gates.warnings.some((w) => /TXT-E3-1300.*not assembled into e3-synopsis/.test(w))).toBe(true);
  });
});

describe('ICH E3 Annex I synopsis document model', () => {
  it('RPT-SYN-001: sections.yaml is a structurally valid document model (#28)', () => {
    expect(validateSections(synopsis)).toEqual([]);
    expect(synopsis.model.id).toBe('e3-synopsis');
  });

  it('RPT-SYN-002: the model carries E3 Annex I fields 1 to 12 in E3 order (#28)', () => {
    const top = synopsis.sections.filter((s) => s.level === 1).map((s) => s.number);
    expect(top.slice(0, 12)).toEqual(Array.from({ length: 12 }, (_, i) => String(i + 1)));
    expect(synopsis.byNumber.get('4').title).toBe('Number of Patients (Planned and Analysed)');
    expect(synopsis.byNumber.get('11.3').title).toBe('Conclusion');
  });

  it('RPT-SYN-003: the provenance appendix is declared on the synopsis model, not borrowed from E3 16.1.9 (#28)', () => {
    expect(synopsisAssembly.provenanceSection).toBe('14');
    expect(synopsis.byNumber.get('14').content).toContain('generated_provenance');
    expect(synopsis.byNumber.has('16.1.9')).toBe(false);
  });

  it('RPT-SYN-004: efficacy fields are declared and left unpopulated, not omitted (D12) (#28)', () => {
    expect(synopsis.byNumber.get('9.1').content).toContain('text');
    expect(synopsis.byNumber.get('11.1').content).toContain('text');
    const claimed = synopsisAssembly.slots.map((s) => s.section);
    expect(claimed).not.toContain('9.1');
    expect(claimed).not.toContain('11.1');
    const doc = assemble({ write: false, template: 'e3-synopsis' });
    for (const number of ['9.1', '11.1']) {
      expect(doc.sections.find((s) => s.number === number).populated).toBe(false);
    }
  });

  it('RPT-SYN-005: the synopsis assembles green against CDISCPILOT01 (#28)', () => {
    const doc = assemble({ write: false, template: 'e3-synopsis' });
    expect(doc.study.id).toBe('CDISCPILOT01');
    expect(doc.ok).toBe(true);
    expect(doc.buildErrors).toEqual([]);
    expect(doc.sections.filter((s) => s.populated).length).toBeGreaterThanOrEqual(20);
  });
});

describe('Two documents, one library', () => {
  it('RPT-SYN-006: the same display carries a different number in each document, from one spec (#28)', () => {
    const csr = assemble({ write: false, template: 'ich-e3' });
    const syn = assemble({ write: false, template: 'e3-synopsis' });
    const numberOf = (doc, slug) => doc.displayIndex.find((d) => d.slug === slug).number;
    expect(numberOf(csr, 't-disposition')).toBe('14.1.1');
    expect(numberOf(syn, 't-disposition')).toBe('13.1');
    expect(numberOf(csr, 'l-ae-serious')).toBe('14.3.2.1');
    expect(numberOf(syn, 'l-ae-serious')).toBe('13.6');
  });

  it('RPT-SYN-007: both documents resolve every named value to the same number (#28)', () => {
    const csr = assemble({ write: false, template: 'ich-e3' });
    const syn = assemble({ write: false, template: 'e3-synopsis' });
    expect(csr.values.values.length).toBeGreaterThan(0);
    const asMap = (doc) => new Map(doc.values.values.map((v) => [v.id, v.source ?? v.derived ?? null]));
    expect([...asMap(syn).keys()].sort()).toEqual([...asMap(csr).keys()].sort());
    expect(csr.gates.values.ok).toBe(true);
    expect(syn.gates.values.ok).toBe(true);
    expect(syn.gates.values.checked).toBe(csr.gates.values.checked);
  });
});

describe('Synopsis content', () => {
  it('TXT-SYN-001: the synopsis quotes the study through named values and invents nothing (#28)', () => {
    const syn = assemble({ write: false, template: 'e3-synopsis' });
    const ids = syn.textBlocks.filter((b) => b.id.startsWith('TXT-SYN-')).map((b) => b.id);
    expect(ids.length).toBe(18);

    // Every number in the prose is bound, never typed: the fidelity gate is the
    // check, and it is the same gate the full report passes.
    expect(syn.gates.numericFidelity.ok).toBe(true);
    expect(syn.gates.bindingResolution.ok).toBe(true);

    // Fields the ADaM extract cannot supply are stated as absent, not invented.
    const text = (number) =>
      (syn.sections.find((s) => s.number === number)?.blocks ?? [])
        .map((b) => b.html ?? b.text ?? '')
        .join(' ');
    expect(text('4')).toMatch(/planned sample size is not\s+carried/i);
    expect(text('1.5')).toMatch(/are not carried in the ADaM\s+extract/i);
    expect(text('11.3')).toMatch(/No clinical conclusion is drawn/i);

    // Nothing has been signed off, and the build says so rather than implying it has.
    for (const b of syn.textBlocks.filter((x) => x.id.startsWith('TXT-SYN-'))) {
      expect(b.approval.state).toBe('draft');
    }
  });
});
