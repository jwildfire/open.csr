/**
 * Two more template objects, both expressed as RESTRICTIONS of the full ICH E3
 * document model: the post-text display package and the abbreviated clinical
 * study report (#34).
 *
 * The claim behind adding two rather than one is that the framework takes
 * templates, rather than having two of something. These tests are what makes that
 * checkable rather than asserted:
 *
 *   - both models are strict subsets of `ich-e3` — number, title, slug and content
 *     declaration identical, section by section;
 *   - neither introduces a sentence of prose, and the abbreviated report's
 *     assembly names only blocks the full report already assembles;
 *   - no file under `scripts/` names either template id, so the assembler, the
 *     loader and the site build discovered them or they are not generic.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { assemble, listTemplates } from '../../scripts/assemble.mjs';
import {
  loadAssembly,
  loadSections,
  validateSections,
  listDisplaySlugs,
  unassembledDisplays,
} from '../../scripts/template-lib.mjs';

const ROOT = new URL('../..', import.meta.url).pathname;
const model = (id) => loadSections(join(ROOT, `library/templates/${id}/sections.yaml`));
const assemblyOf = (id) => loadAssembly(join(ROOT, `library/templates/${id}/assembly.yaml`));

const full = model('ich-e3');
const pkg = model('display-package');
const abbreviated = model('e3-abbreviated');
const pkgAssembly = assemblyOf('display-package');
const abbreviatedAssembly = assemblyOf('e3-abbreviated');
const fullAssembly = assemblyOf('ich-e3');

/** Every section of `subset` is a section of the full model, unchanged. */
function restrictionDrift(subset) {
  const drift = [];
  for (const s of subset.sections) {
    const parent = full.byNumber.get(s.number);
    if (!parent) {
      drift.push(`${s.number}: not a section of ich-e3`);
      continue;
    }
    if (parent.title !== s.title) drift.push(`${s.number}: title differs`);
    if (parent.slug !== s.slug) drift.push(`${s.number}: slug differs`);
    if (parent.content.join(',') !== s.content.join(',')) drift.push(`${s.number}: content differs`);
  }
  return drift;
}

const numbersOf = (doc) => Object.fromEntries(doc.displayIndex.map((d) => [d.slug, d.number]));

/**
 * The numbers two documents assign to the displays they BOTH carry.
 *
 * D6's claim is that a display's number follows from the structure the document
 * declares, so two documents declaring the same structure agree display by
 * display. It is not a claim that two documents carry the same displays: a
 * restriction legitimately carries fewer. Comparing the whole map would turn
 * "the abbreviated report drops a section" into a numbering failure, which is a
 * different thing and already covered by the restriction-drift check.
 */
const sharedNumbers = (a, b) => {
  const other = numbersOf(b);
  const mine = numbersOf(a);
  const shared = Object.keys(mine).filter((slug) => slug in other);
  expect(shared.length).toBeGreaterThan(0);
  return [
    Object.fromEntries(shared.map((s) => [s, mine[s]])),
    Object.fromEntries(shared.map((s) => [s, other[s]])),
  ];
};
const textIdsOf = (assembly) => assembly.slots.flatMap((s) => s.text);

describe('Post-text display package', () => {
  it('RPT-PKG-001: the model is a strict restriction of the full ICH E3 model (#34)', () => {
    expect(validateSections(pkg)).toEqual([]);
    expect(restrictionDrift(pkg)).toEqual([]);
    expect(pkg.model.id).toBe('display-package');
    expect(pkg.sections.length).toBeLessThan(full.sections.length);
  });

  it('RPT-PKG-002: the package carries no prose at all, and the build says so (#34)', () => {
    expect(pkgAssembly.slots).toEqual([]);
    const doc = assemble({ write: false, template: 'display-package' });
    expect(doc.textBlocks).toEqual([]);
    for (const section of doc.sections) expect(section.blocks).toEqual([]);
    // Every block in the shared Text Library is reported as ungated by this
    // build, so "not gated" can never pass for "gated and clean" (RPT-LIB-004).
    const ungated = doc.gates.warnings.filter((w) => /not assembled into display-package/.test(w));
    expect(ungated.length).toBeGreaterThan(30);
  });

  it('RPT-PKG-003: every display carries the same number as in the full report (#34)', () => {
    const doc = assemble({ write: false, template: 'display-package' });
    const csr = assemble({ write: false, template: 'ich-e3' });
    expect(numbersOf(doc)).toEqual(numbersOf(csr));
    expect(numbersOf(doc)['t-disposition']).toBe('14.1.1');
    expect(numbersOf(doc)['l-ae-serious']).toBe('14.3.2.1');
    // Same numbers because the same structure was declared — not because either
    // file writes a number down. No assigned number appears in either assembly's
    // configuration (comments, which explain the property, are not configuration).
    for (const id of ['display-package', 'ich-e3']) {
      const source = readFileSync(join(ROOT, `library/templates/${id}/assembly.yaml`), 'utf8')
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('#'))
        .join('\n');
      for (const number of Object.values(numbersOf(doc))) {
        expect(source.includes(number), `${id} does not write ${number} down`).toBe(false);
      }
    }
  });

  it('RPT-PKG-004: provenance lands in E3’s own 16.1.9, with nothing invented (#34)', () => {
    expect(pkgAssembly.provenanceSection).toBe('16.1.9');
    const doc = assemble({ write: false, template: 'display-package' });
    const appendix = doc.sections.find((s) => s.number === '16.1.9');
    expect(appendix.provenance).toBeTruthy();
    expect(appendix.populated).toBe(true);
    // The synopsis had to declare a section of its own; a display package does not.
    expect(pkg.byNumber.has('16.1.9')).toBe(true);
  });

  it('RPT-PKG-005: empty display slots are declared and unpopulated, not dropped (#34)', () => {
    const doc = assemble({ write: false, template: 'display-package' });
    for (const number of ['14.2', '14.3.4']) {
      const section = doc.sections.find((s) => s.number === number);
      expect(section, `section ${number} is declared`).toBeTruthy();
      expect(section.populated).toBe(false);
    }
    // 14.3.3 is narrative, and a display package carries none — omitted, not empty.
    expect(pkg.byNumber.has('14.3.3')).toBe(false);
  });

  it('RPT-PKG-006: the package assembles green against CDISCPILOT01 (#34)', () => {
    const doc = assemble({ write: false, template: 'display-package' });
    expect(doc.study.id).toBe('CDISCPILOT01');
    expect(doc.ok).toBe(true);
    expect(doc.buildErrors).toEqual([]);
    expect(doc.displayIndex.length).toBe(listDisplaySlugs(join(ROOT, 'library/tfl')).length);
  });
});

describe('Abbreviated clinical study report', () => {
  it('RPT-ABR-001: the model is a strict restriction of the full ICH E3 model (#34)', () => {
    expect(validateSections(abbreviated)).toEqual([]);
    expect(restrictionDrift(abbreviated)).toEqual([]);
    expect(abbreviated.model.id).toBe('e3-abbreviated');
    expect(abbreviated.sections.length).toBe(75);
    expect(full.sections.length).toBeGreaterThanOrEqual(119);
    expect(abbreviated.sections.length).toBeLessThan(full.sections.length);
  });

  it('RPT-ABR-002: the efficacy-analysis apparatus is absent, the analysis sets remain (#34)', () => {
    const dropped = full.sections
      .filter((s) => s.number === '11.4' || s.number.startsWith('11.4.'))
      .map((s) => s.number);
    expect(dropped.length).toBe(16);
    for (const number of [...dropped, '9.2', '9.5.2', '9.5.3', '9.5.4']) {
      expect(abbreviated.byNumber.has(number), `${number} is dropped`).toBe(false);
    }
    for (const number of ['11', '11.1', '11.2', '12', '12.6', '13']) {
      expect(abbreviated.byNumber.has(number), `${number} is kept`).toBe(true);
    }
  });

  it('RPT-ABR-003: it introduces no new prose (#34)', () => {
    const reused = textIdsOf(abbreviatedAssembly);
    const already = new Set(textIdsOf(fullAssembly));
    expect(reused.length).toBeGreaterThan(0);
    for (const id of reused) expect(already.has(id), `${id} is already in the full report`).toBe(true);
    // And nothing in the Text Library was written for this document: every block
    // belongs to the report's own family or the synopsis's.
    const blocks = readdirSync(join(ROOT, 'library/text')).filter((f) => f.endsWith('.md'));
    for (const file of blocks) expect(file).toMatch(/^TXT-(E3|SYN)-/);
  });

  it('RPT-ABR-004: the reused prose resolves every cross-reference against this model (#34)', () => {
    const doc = assemble({ write: false, template: 'e3-abbreviated' });
    const xrefs = doc.sections.flatMap((s) => s.blocks.flatMap((b) => b.crossReferences ?? []));
    expect(xrefs.length).toBeGreaterThan(10);
    expect(xrefs.filter((x) => !x.resolved)).toEqual([]);
    expect(doc.gates.crossReferences.ok).toBe(true);
    // The sections those references point at are retained on purpose.
    for (const number of ['16.2.1', '16.2.3', '16.2.4', '16.2.7', '16.1.9', '14.2', '12.3.2']) {
      expect(abbreviated.byNumber.has(number), `${number} is a cross-reference target`).toBe(true);
    }
  });

  it('RPT-ABR-005: it assembles green and says the same things as the full report (#34)', () => {
    const doc = assemble({ write: false, template: 'e3-abbreviated' });
    const csr = assemble({ write: false, template: 'ich-e3' });
    expect(doc.ok).toBe(true);
    expect(doc.buildErrors).toEqual([]);
    const [mine, theirs] = sharedNumbers(doc, csr);
    expect(mine).toEqual(theirs);
    // The abbreviated model declares neither Section 12.4 nor Section 12.5, so it
    // carries neither the laboratory nor the vital signs post-text displays. What
    // it does carry, it carries under the report's own numbers.
    const populated = (d) => d.sections.filter((s) => s.populated).map((s) => s.number).sort();
    expect(populated(doc).every((n) => populated(csr).includes(n))).toBe(true);
    // Same content, fewer headings around it — which is the whole difference.
    expect(doc.sections.length).toBeLessThan(csr.sections.length);
  });
});

describe('Four documents, one library', () => {
  it('RPT-LIB-005: every template object in the library assembles green against the same study (#34)', () => {
    const ids = listTemplates();
    expect(ids).toEqual(['display-package', 'e3-abbreviated', 'e3-synopsis', 'ich-e3']);
    for (const id of ids) {
      const doc = assemble({ write: false, template: id });
      expect(doc.ok, `${id} assembles green`).toBe(true);
      expect(doc.study.id, `${id} is the same study`).toBe('CDISCPILOT01');
      expect(doc.gates.values.ok, `${id} re-derives its values`).toBe(true);
    }
  });

  it('RPT-LIB-008: every display the TFL Library holds is carried by a template object (#45)', () => {
    const library = listDisplaySlugs(join(ROOT, 'library/tfl'));
    expect(library.length).toBeGreaterThan(0);

    const carried = new Set();
    for (const id of listTemplates()) {
      for (const slug of assemble({ write: false, template: id }).gates.displayCoverage.carried) {
        carried.add(slug);
      }
    }
    // A display specified, given an ARD and then wired into nothing reaches no
    // reader at all. It is the display analogue of an unassembled text block,
    // except that nothing reported it until #45: the assembler only ever looked
    // at library/tfl/ for slugs a template already named.
    expect(unassembledDisplays(library, carried)).toEqual([]);
  });

  it('RPT-LIB-009: each document reports the library displays it does not carry (#45)', () => {
    for (const id of listTemplates()) {
      const { displayCoverage } = assemble({ write: false, template: id }).gates;
      expect(displayCoverage.library, `${id} sees the whole TFL Library`).toEqual(
        listDisplaySlugs(join(ROOT, 'library/tfl'))
      );
      // Carrying a subset is legitimate — a synopsis need not reproduce every
      // table in the report — so this is an accounting, not a failure. What it
      // may never be is silent.
      for (const slug of displayCoverage.notCarried) {
        expect(
          assemble({ write: false, template: id }).gates.warnings.some((w) =>
            w.startsWith(`${slug}: in the TFL Library but not carried by ${id}`)
          ),
          `${id} names ${slug}`
        ).toBe(true);
      }
    }
  });

  it('RPT-LIB-010: the coverage check reports an uncarried display rather than passing it (#45)', () => {
    // The green result above is only worth something if the same comparison goes
    // red on the case it exists for. Run it on inputs that disagree.
    const library = ['t-demographics', 't-eff-adas-wk24', 't-disposition'];
    expect(unassembledDisplays(library, new Set(['t-demographics', 't-disposition']))).toEqual([
      't-eff-adas-wk24',
    ]);
    expect(unassembledDisplays(library, new Set(library))).toEqual([]);
    expect(unassembledDisplays(library, [])).toEqual([
      't-demographics',
      't-disposition',
      't-eff-adas-wk24',
    ]);
    // A directory under library/tfl/ with no specification in it is not a display.
    expect(listDisplaySlugs(join(ROOT, 'library/text'))).toEqual([]);
  });

  it('RPT-LIB-006: a new template object costs no change in scripts/ (#34)', () => {
    const sources = readdirSync(join(ROOT, 'scripts'))
      .filter((f) => f.endsWith('.mjs'))
      .map((f) => ({ file: f, body: readFileSync(join(ROOT, 'scripts', f), 'utf8') }));
    for (const id of ['display-package', 'e3-abbreviated']) {
      const named = sources.filter((s) => s.body.includes(id)).map((s) => s.file);
      expect(named, `${id} is discovered from disk, not named in code`).toEqual([]);
    }
  });

  it('RPT-LIB-007: all four documents resolve the same named values to the same numbers (#34)', () => {
    const docs = listTemplates().map((id) => ({ id, doc: assemble({ write: false, template: id }) }));
    const reference = new Map(docs[0].doc.values.values.map((v) => [v.id, v.formatted ?? v.value ?? null]));
    expect(reference.size).toBeGreaterThan(0);
    for (const { id, doc } of docs) {
      const seen = new Map(doc.values.values.map((v) => [v.id, v.formatted ?? v.value ?? null]));
      expect([...seen.keys()].sort(), `${id} carries the same value ids`).toEqual([...reference.keys()].sort());
      for (const [key, value] of reference) {
        expect(seen.get(key), `${id} agrees on ${key}`).toEqual(value);
      }
    }
  });
});
