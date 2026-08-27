import { describe, expect, it } from 'vitest';
import {
  CONTENT_TYPES,
  assignDisplayNumbers,
  compareSectionNumbers,
  loadAssembly,
  loadSections,
  parentNumber,
  sectionLevel,
  validateAssembly,
  validateSections,
} from '../../scripts/template-lib.mjs';
import { loadTextLibrary } from '../../scripts/text-lib.mjs';
import {
  ASSEMBLY_YAML,
  LIBRARY_DIR,
  SECTIONS_YAML,
  fixtureArds,
  librarySlugs,
} from './text-test-helpers.js';

const model = loadSections(SECTIONS_YAML);
const assembly = loadAssembly(ASSEMBLY_YAML);
const displaySlugs = [...new Set([...fixtureArds().keys(), ...librarySlugs()])];
const textIds = [...loadTextLibrary(LIBRARY_DIR).keys()];

describe('ICH E3 document model', () => {
  it('RPT-MODEL-001: sections.yaml carries all sixteen top-level ICH E3 sections in order (#1)', () => {
    const top = model.sections.filter((s) => s.level === 1).map((s) => s.number);
    expect(top).toEqual(Array.from({ length: 16 }, (_, i) => String(i + 1)));
    expect(model.byNumber.get('14').title).toMatch(
      /Tables, Figures and Graphs Referred to but not Included in the Text/
    );
    expect(model.byNumber.get('16').title).toBe('Appendices');
  });

  it('RPT-MODEL-002: the Section 14 substructure matches ICH E3, including 14.3.1 to 14.3.4 (#1)', () => {
    for (const [number, fragment] of [
      ['14.1', 'Demographic Data'],
      ['14.2', 'Efficacy Data'],
      ['14.3', 'Safety Data'],
      ['14.3.1', 'Displays of Adverse Events'],
      ['14.3.2', 'Listings of Deaths'],
      ['14.3.3', 'Narratives of Deaths'],
      ['14.3.4', 'Abnormal Laboratory Value Listing'],
    ]) {
      expect(model.byNumber.get(number), `section ${number}`).toBeDefined();
      expect(model.byNumber.get(number).title).toContain(fragment);
    }
    // 14.3.3 is prose sitting inside the TFL block — the Text/TFL library seam.
    expect(model.byNumber.get('14.3.3').content).toEqual(['text']);
  });

  it('RPT-MODEL-003: Section 16 carries 16.1.1 to 16.1.12, 16.2.1 to 16.2.8, 16.3 and 16.4 (#1)', () => {
    for (let i = 1; i <= 12; i += 1) expect(model.byNumber.get(`16.1.${i}`)).toBeDefined();
    for (let i = 1; i <= 8; i += 1) expect(model.byNumber.get(`16.2.${i}`)).toBeDefined();
    expect(model.byNumber.get('16.3.1')).toBeDefined();
    expect(model.byNumber.get('16.3.2')).toBeDefined();
    expect(model.byNumber.get('16.4')).toBeDefined();
  });

  it('RPT-MODEL-004: 16.1.9 is the auto-generated provenance slot (#1)', () => {
    const section = model.byNumber.get('16.1.9');
    expect(section.title).toBe('Documentation of Statistical Methods');
    expect(section.content).toContain('generated_provenance');
    expect(section.slug).toBe('appendix-statistical-methods');
  });

  it('RPT-MODEL-005: section numbers and slugs are unique and every subsection has a defined parent (#1)', () => {
    expect(validateSections(model)).toEqual([]);
    expect(new Set(model.sections.map((s) => s.number)).size).toBe(model.sections.length);
    expect(new Set(model.sections.map((s) => s.slug)).size).toBe(model.sections.length);
    expect(model.sections.length).toBeGreaterThan(100);
  });

  it('RPT-MODEL-006: every content type comes from the closed vocabulary (#1)', () => {
    for (const section of model.sections) {
      for (const content of section.content) expect(CONTENT_TYPES).toContain(content);
    }
    expect(model.byNumber.get('3').content).toEqual([]); // TOC is assembler-generated
  });

  it('RPT-MODEL-007: section level, parent and document ordering derive from the dotted number (#1)', () => {
    expect(sectionLevel('12')).toBe(1);
    expect(sectionLevel('12.3.1.2')).toBe(4);
    expect(parentNumber('12')).toBeNull();
    expect(parentNumber('12.3.1')).toBe('12.3');
    expect(compareSectionNumbers('9.2', '9.10')).toBeLessThan(0);
    expect(compareSectionNumbers('14', '16')).toBeLessThan(0);
    expect(compareSectionNumbers('12.3', '12.3')).toBe(0);
  });
});

describe('Assembly configuration', () => {
  it('RPT-ASM-001: every slot targets a section that exists and accepts the content it is given (#1)', () => {
    expect(validateAssembly(assembly, model, { textIds, displaySlugs })).toEqual([]);
  });

  it('RPT-ASM-002: every text block named by a slot exists in the Text Library (#1)', () => {
    for (const slot of assembly.slots) {
      for (const id of slot.text) expect(textIds).toContain(id);
    }
    expect(assembly.slots.length).toBeGreaterThanOrEqual(10);
  });

  it('RPT-ASM-003: 14.x numbers are assigned from post_text order, not written in the source (#1)', () => {
    const { numbers, errors } = assignDisplayNumbers(assembly, model);
    expect(errors).toEqual([]);
    expect(numbers.get('t-disposition')).toMatchObject({ number: '14.1.1', section: '14.1' });
    expect(numbers.get('t-demographics').number).toBe('14.1.2');
    expect(numbers.get('t-ae-overview').number).toBe('14.3.1.2');
    expect(numbers.get('l-ae-serious').number).toBe('14.3.2.1');
    // Numbers are derived: reordering the slot renumbers without touching a slug.
    const reordered = {
      ...assembly,
      postText: [{ section: '14.1', displays: ['t-demographics', 't-disposition'] }],
    };
    expect(assignDisplayNumbers(reordered, model).numbers.get('t-demographics').number).toBe(
      '14.1.1'
    );
  });

  it('RPT-ASM-004: an assigned display number that would collide with a section number fails the build (#1)', () => {
    const colliding = { ...assembly, postText: [{ section: '14.3', displays: ['t-exposure'] }] };
    const { errors } = assignDisplayNumbers(colliding, model);
    expect(errors.join('\n')).toMatch(/collides with document-model section 14\.3\.1/);
  });

  it('RPT-ASM-005: a display may not occupy two post-text positions, and positions may not repeat (#1)', () => {
    const duplicated = {
      ...assembly,
      postText: [
        { section: '14.1', displays: ['t-disposition'] },
        { section: '14.3.1', displays: ['t-disposition'] },
      ],
    };
    expect(assignDisplayNumbers(duplicated, model).errors.join('\n')).toMatch(
      /t-disposition is assigned more than one post-text position/
    );
  });

  it('RPT-ASM-006: a slot pointing at an unknown section, an unknown block or the wrong content type is rejected (#1)', () => {
    const broken = {
      ...assembly,
      slots: [
        { section: '99.9', text: [], displays: [] },
        { section: '5.2', text: ['TXT-DOES-NOT-EXIST'], displays: [] },
        { section: '13', text: [], displays: ['t-ae-overview'] },
      ],
    };
    const errors = validateAssembly(broken, model, { textIds, displaySlugs }).join('\n');
    expect(errors).toMatch(/section 99\.9 is not in the document model/);
    expect(errors).toMatch(/TXT-DOES-NOT-EXIST is not in the Text Library/);
    expect(errors).toMatch(/slot 13: section does not accept an in-text display/);
  });

  it('RPT-ASM-007: the assembly claims only sections the demonstration populates, and declares its scope (#1)', () => {
    expect(assembly.study.id).toBe('CDISCPILOT01');
    expect(assembly.study.cutoff).toBe('2014-07-01');
    // Section 14.2 is populated: the study's own ADaM package supplies the
    // efficacy domains the pharmaverse re-derivation does not carry. Section
    // 14.3.4 is not, and is still declared rather than dropped, which is the
    // property this test exists to hold.
    expect(assembly.postText.map((p) => p.section)).toContain('14.2');
    expect(assembly.postText.map((p) => p.section)).not.toContain('14.3.4');
    expect(assembly.provenanceSection).toBe('16.1.9');
  });
});
