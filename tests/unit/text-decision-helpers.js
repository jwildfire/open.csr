/**
 * Shared scaffolding for the text-decision (sign-off apply lane) suites.
 *
 * Every test runs against a THROWAWAY repository root: the fixture text library
 * is copied into a fresh temp directory and the decision is applied there. The
 * real `library/text/` is never opened for writing by a test — an approval is a
 * source edit, and a test suite that can approve real prose is a test suite that
 * can ship it.
 */
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const FIXTURE_LIBRARY = join(ROOT, 'tests/fixtures/text-decision/library/text');
export const ARD_FIXTURES = join(ROOT, 'tests/fixtures/ard');
export const CLI = join(ROOT, 'scripts/apply-text-decision.mjs');

const temps = [];

/** A temp repository root carrying a copy of the fixture text library. */
export function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'opencsr-text-decision-'));
  cpSync(FIXTURE_LIBRARY, join(root, 'library/text'), { recursive: true });
  temps.push(root);
  return root;
}

/** Remove every temp root this module created. */
export function cleanup() {
  while (temps.length) rmSync(temps.pop(), { recursive: true, force: true });
}

/** Options every call shares: fixture ARDs, no assembler in a fixture tree. */
export const gateOptions = { ardDirs: [ARD_FIXTURES] };

export const blockFile = (root, id) => join(root, 'library/text', `${id}.md`);
export const readBlock = (root, id) => readFileSync(blockFile(root, id), 'utf8');
export const writeBlock = (root, id, text) => writeFileSync(blockFile(root, id), text);
export const ledgerFile = (root) => join(root, 'site/text-decisions.json');
export const readLedgerFile = (root) => JSON.parse(readFileSync(ledgerFile(root), 'utf8'));

/** Snapshot every block file, so a test can prove nothing else moved. */
export function snapshotLibrary(root) {
  const dir = join(root, 'library/text');
  const snapshot = new Map();
  for (const name of readdirSync(dir)) snapshot.set(name, readFileSync(join(dir, name), 'utf8'));
  return snapshot;
}

/** File names whose contents differ between two snapshots. */
export function changedFiles(before, after) {
  const names = new Set([...before.keys(), ...after.keys()]);
  return [...names].filter((n) => before.get(n) !== after.get(n)).sort();
}

/** An approved block with an orphaned binding: a tree that fails its gates. */
export function breakTree(root) {
  writeBlock(
    root,
    'TXT-FIX-9999',
    [
      '---',
      'id: TXT-FIX-9999',
      'e3_section: "12.1"',
      'title: "Already broken"',
      'tier: parameterized',
      'displays: [t-ae-overview]',
      'approval: { state: approved, by: "@jwildfire", at: "2026-07-20" }',
      '---',
      '',
      'Reported by {{ard:t-ae-overview:any_ae:n;group=No Such Group}} patients.',
      '',
    ].join('\n')
  );
}
