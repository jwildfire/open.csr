import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadArd } from '../../scripts/text-lib.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const LIBRARY_DIR = join(ROOT, 'library/text');
export const BLOCK_FIXTURES = join(ROOT, 'tests/fixtures/blocks');
export const ARD_FIXTURES = join(ROOT, 'tests/fixtures/ard');
export const SECTIONS_YAML = join(ROOT, 'library/templates/ich-e3/sections.yaml');
export const ASSEMBLY_YAML = join(ROOT, 'library/templates/ich-e3/assembly.yaml');

/**
 * Every display slug the TFL Library holds. Tests that need the universe of
 * valid display references use this rather than the fixture directory: a display
 * is real because the library defines it, not because a JS fixture happens to
 * stand in for its ARD.
 */
/**
 * Fixture ARDs, keyed by display slug. Unit tests always resolve against these —
 * never against `outputs/`, which the R pipeline owns and rewrites — so a gate test
 * fails for the reason it claims rather than because a display was regenerated.
 */
/**
 * Every display slug the TFL Library holds.
 *
 * Distinct from `fixtureArds()` on purpose. A test that asks "does this assembly
 * reference a display that exists?" is asking about the LIBRARY, and answering it
 * from the six fixture ARDs made every display added since those fixtures were
 * written look like a typo. A test that asks "what do the numbers say?" still
 * resolves against the fixtures, which is what keeps it independent of whatever
 * the R pipeline last regenerated.
 */
export function librarySlugs() {
  const dir = join(ROOT, 'library/tfl');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, 'analysis.yaml')))
    .map((e) => e.name)
    .sort();
}

export function fixtureArds() {
  const ards = new Map();
  if (!existsSync(ARD_FIXTURES)) return ards;
  for (const name of readdirSync(ARD_FIXTURES).filter((n) => n.endsWith('.json'))) {
    ards.set(name.replace(/\.json$/, ''), loadArd(join(ARD_FIXTURES, name)));
  }
  return ards;
}

/** A display/section index good enough to resolve cross-references in unit tests. */
export function stubContext() {
  return {
    displayIndex: new Map([
      ['t-ae-overview', { number: '14.3.1.2', type: 'table', title: 'Overview' }],
      ['l-ae-serious', { number: '14.3.2.1', type: 'listing', title: 'SAE listing' }],
    ]),
    sectionIndex: new Map([
      ['12.2.1', { title: 'Brief Summary of Adverse Events' }],
      ['16.1.9', { title: 'Documentation of Statistical Methods' }],
    ]),
  };
}
