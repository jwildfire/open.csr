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
 * Fixture ARDs, keyed by display slug. Unit tests always resolve against these —
 * never against `outputs/`, which the R pipeline owns and rewrites — so a gate test
 * fails for the reason it claims rather than because a display was regenerated.
 */
export function fixtureArds() {
  const ards = new Map();
  if (!existsSync(ARD_FIXTURES)) return ards;
  for (const name of readdirSync(ARD_FIXTURES).filter((n) => n.endsWith('.json'))) {
    ards.set(name.replace(/\.json$/, ''), loadArd(join(ARD_FIXTURES, name)));
  }
  return ards;
}

/**
 * Every display slug the TFL Library defines.
 *
 * Distinct from `fixtureArds()` on purpose. A fixture ARD answers "what numbers
 * shall this test resolve against"; the library answers "which displays exist".
 * Assembly validation is asking the second question — a slot naming a display
 * the library does not hold is a broken assembly — and answering it from the
 * fixture corpus would make every new display look like a configuration error.
 */
export function librarySlugs() {
  const dir = join(ROOT, 'library/tfl');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((slug) => existsSync(join(dir, slug, 'display.yaml')));
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
