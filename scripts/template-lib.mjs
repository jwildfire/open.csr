/**
 * template-lib.mjs — the Report Template Library: loading and validating the
 * machine-readable ICH E3 document model (`sections.yaml`) and a per-CSR
 * configuration (`assembly.yaml`), and assigning Section 14 display numbers.
 *
 * Design decision D6: display identity is the SLUG; the 14.x number is derived at
 * build time from `post_text` order. Renumbering a CSR is therefore a one-line
 * diff in assembly.yaml, never a refactor across specs, prose and tests.
 */
import { readFileSync, existsSync } from 'node:fs';
import yaml from 'js-yaml';

export const CONTENT_TYPES = ['text', 'in_text_display', 'post_text_index', 'generated_provenance'];
export const DISPLAY_TYPE_LABELS = { table: 'Table', listing: 'Listing', figure: 'Figure' };

/** Level of a dotted section number: "12" -> 1, "12.2.1" -> 3. */
export function sectionLevel(number) {
  return String(number).split('.').length;
}

/** Parent number of a dotted section number, or null for a top-level section. */
export function parentNumber(number) {
  const parts = String(number).split('.');
  return parts.length === 1 ? null : parts.slice(0, -1).join('.');
}

/** Numeric sort key so "9.10" sorts after "9.2" and "14" before "16". */
export function sectionSortKey(number) {
  return String(number)
    .split('.')
    .map((p) => Number(p));
}

export function compareSectionNumbers(a, b) {
  const ka = sectionSortKey(a);
  const kb = sectionSortKey(b);
  for (let i = 0; i < Math.max(ka.length, kb.length); i += 1) {
    const va = ka[i] ?? -1;
    const vb = kb[i] ?? -1;
    if (va !== vb) return va - vb;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// sections.yaml
// ---------------------------------------------------------------------------

/** Load the E3 document model. Returns { model, sections, byNumber, bySlug }. */
export function loadSections(path) {
  const doc = yaml.load(readFileSync(path, 'utf8'));
  const sections = (doc.sections ?? []).map((s) => ({
    number: String(s.number),
    title: s.title,
    slug: s.slug,
    content: s.content ?? [],
    note: s.note ?? null,
    level: sectionLevel(s.number),
    parent: parentNumber(s.number),
  }));
  const byNumber = new Map(sections.map((s) => [s.number, s]));
  const bySlug = new Map(sections.map((s) => [s.slug, s]));
  return { model: doc.model ?? {}, sections, byNumber, bySlug, path };
}

/** Structural validation of the document model. Returns an array of messages. */
export function validateSections(model) {
  const errors = [];
  const seenNumbers = new Set();
  const seenSlugs = new Set();
  for (const s of model.sections) {
    if (!s.number) errors.push('section with no number');
    if (!s.title) errors.push(`section ${s.number}: missing title`);
    if (!s.slug) errors.push(`section ${s.number}: missing slug`);
    if (seenNumbers.has(s.number)) errors.push(`duplicate section number ${s.number}`);
    if (seenSlugs.has(s.slug)) errors.push(`duplicate section slug ${s.slug}`);
    seenNumbers.add(s.number);
    seenSlugs.add(s.slug);
    if (!/^\d+(\.\d+)*$/.test(s.number)) errors.push(`section ${s.number}: malformed number`);
    for (const c of s.content) {
      if (!CONTENT_TYPES.includes(c)) {
        errors.push(`section ${s.number}: unknown content type "${c}"`);
      }
    }
  }
  for (const s of model.sections) {
    if (s.parent && !model.byNumber.has(s.parent)) {
      errors.push(`section ${s.number}: parent ${s.parent} is not defined`);
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// assembly.yaml
// ---------------------------------------------------------------------------

/** Load a per-CSR assembly configuration. */
export function loadAssembly(path) {
  const doc = yaml.load(readFileSync(path, 'utf8'));
  return {
    template: doc.template ?? 'ich-e3',
    study: doc.study ?? {},
    provenanceSection: doc.provenance_section ?? '16.1.9',
    slots: (doc.slots ?? []).map((s) => ({
      section: String(s.section),
      text: s.text ?? [],
      displays: s.displays ?? [],
    })),
    postText: (doc.post_text ?? []).map((s) => ({
      section: String(s.section),
      displays: s.displays ?? [],
    })),
    path,
  };
}

/**
 * Assign Section 14 numbers from `post_text` order (D6).
 * Returns { numbers: Map<slug, {number, section, position}>, errors }.
 * A number that collides with a section number in the model is a build failure:
 * "Table 14.3.1" alongside a section "14.3.1" would make every cross-reference in
 * the document ambiguous.
 */
export function assignDisplayNumbers(assembly, sectionModel) {
  const numbers = new Map();
  const errors = [];
  const used = new Set();
  for (const entry of assembly.postText) {
    if (!sectionModel.byNumber.has(entry.section)) {
      errors.push(`post_text: section ${entry.section} is not in the document model`);
    }
    entry.displays.forEach((slug, i) => {
      const number = `${entry.section}.${i + 1}`;
      if (numbers.has(slug)) {
        errors.push(`display ${slug} is assigned more than one post-text position`);
      }
      if (sectionModel.byNumber.has(number)) {
        errors.push(
          `assigned display number ${number} (${slug}) collides with document-model section ${number}`
        );
      }
      if (used.has(number)) errors.push(`duplicate assigned display number ${number}`);
      used.add(number);
      numbers.set(slug, { number, section: entry.section, position: i + 1 });
    });
  }
  return { numbers, errors };
}

/** Cross-validate the assembly configuration against the model and the libraries. */
export function validateAssembly(assembly, sectionModel, { textIds = [], displaySlugs = [] } = {}) {
  const errors = [];
  const seenSections = new Set();
  for (const slot of assembly.slots) {
    const section = sectionModel.byNumber.get(slot.section);
    if (!section) {
      errors.push(`slot: section ${slot.section} is not in the document model`);
      continue;
    }
    if (seenSections.has(slot.section)) errors.push(`slot: section ${slot.section} declared twice`);
    seenSections.add(slot.section);
    if (slot.text.length && !section.content.includes('text')) {
      errors.push(`slot ${slot.section}: section does not accept text content`);
    }
    if (slot.displays.length && !section.content.includes('in_text_display')) {
      errors.push(`slot ${slot.section}: section does not accept an in-text display`);
    }
    for (const id of slot.text) {
      if (textIds.length && !textIds.includes(id)) {
        errors.push(`slot ${slot.section}: text block ${id} is not in the Text Library`);
      }
    }
    for (const slug of slot.displays) {
      if (displaySlugs.length && !displaySlugs.includes(slug)) {
        errors.push(`slot ${slot.section}: display ${slug} has no ARD`);
      }
    }
  }
  for (const entry of assembly.postText) {
    const section = sectionModel.byNumber.get(entry.section);
    if (!section) continue;
    if (!section.content.includes('post_text_index')) {
      errors.push(`post_text ${entry.section}: section is not a post-text index`);
    }
    for (const slug of entry.displays) {
      if (displaySlugs.length && !displaySlugs.includes(slug)) {
        errors.push(`post_text ${entry.section}: display ${slug} has no ARD`);
      }
    }
  }
  if (!sectionModel.byNumber.has(assembly.provenanceSection)) {
    errors.push(`provenance_section ${assembly.provenanceSection} is not in the document model`);
  } else if (
    !sectionModel.byNumber.get(assembly.provenanceSection).content.includes('generated_provenance')
  ) {
    errors.push(
      `provenance_section ${assembly.provenanceSection} does not accept generated_provenance content`
    );
  }
  return errors;
}

/** Section-number -> {title, slug} index, for cross-reference resolution. */
export function sectionIndex(sectionModel) {
  return new Map(sectionModel.sections.map((s) => [s.number, { title: s.title, slug: s.slug }]));
}

/** Read `library/tfl/<slug>/display.yaml` when the TFL Library has one. */
export function loadDisplaySpec(dir, slug) {
  const path = `${dir}/${slug}/display.yaml`;
  if (!existsSync(path)) return null;
  try {
    return yaml.load(readFileSync(path, 'utf8')) ?? null;
  } catch {
    return null;
  }
}
