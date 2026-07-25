// Requirement-matrix extractor (open.csr #1). Ported from safety.viz's
// scripts/requirements-lib.mjs, with two open.csr changes:
//
//   1. Matrices live IN this repo (quality/requirements/*.md) rather than in a
//      sibling agent repo, so the CLI needs no checkout step.
//   2. Parsing is header-aware. safety.viz reads column 0 (ID) and column 2
//      (Requirement) positionally; open.csr matrices are authored by several
//      agents, so when a header row is present the columns are located by name
//      and the positional rule is only the fallback.
//
// The pure functions live here; scripts/requirements.mjs wires them to the
// filesystem, the freshness guard, and the unresolved-ID report.

// `<PREFIX>-<AREA>-<NNN><suffix?>` — 2-4 uppercase letters, an area code, a
// zero-padded number, and an optional A-D split suffix. Anchored form gates the
// ID column (so header/separator rows are skipped structurally); the global
// form scans free text (test titles, coverage cells).
export const REQUIREMENT_ID = /^[A-Z]{2,4}-[A-Z]+-\d+[A-D]?$/;
export const REQUIREMENT_ID_GLOBAL = /[A-Z]{2,4}-[A-Z]+-\d+[A-D]?/g;

const SEPARATOR_ROW = /^\|[\s\-:|]+\|$/;

// Split a Markdown table row into trimmed cells. A `\|` escaped pipe renders as
// a literal `|`, so split only on pipes NOT preceded by a backslash, then strip
// the backslash from any escaped pipe left inside a cell.
export function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replace(/\\\|/g, '|').trim());
}

const COLUMN_ALIASES = {
  id: ['id', 'req id', 'requirement id'],
  area: ['area', 'component', 'topic'],
  text: ['requirement', 'description', 'requirement text'],
  source: ['source', 'origin'],
  evidence: ['evidence type', 'evidence', 'test tier'],
  link: ['test/evidence link', 'test link', 'test', 'evidence link'],
  status: ['status'],
  review: ['ai review', 'review'],
  notes: ['notes', 'comment', 'comments']
};

// Map a header row's cells onto our logical column names. Returns null when the
// row does not look like a requirement-table header (no ID + Requirement pair),
// which keeps unrelated tables in the same document from being parsed.
export function mapHeader(cells) {
  const normalized = cells.map((cell) => cell.toLowerCase().replace(/[*_`]/g, '').trim());
  const columns = {};
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    const index = normalized.findIndex((cell) => aliases.includes(cell));
    if (index >= 0) columns[key] = index;
  }
  if (columns.id === undefined || columns.text === undefined) return null;
  return columns;
}

// Positional fallback matching the safety.viz matrices: ID | Area | Requirement.
const POSITIONAL = { id: 0, area: 1, text: 2, source: 3, evidence: 4, link: 5, status: 6 };

// Parse every requirement table in a matrix document into ordered rows. Only
// rows whose ID cell is exactly a requirement ID contribute, so headers,
// separators, prose, and unrelated tables are ignored without hard-coding the
// table's position in the document.
export function parseRequirementMatrix(markdown) {
  const lines = String(markdown || '').split('\n');
  const rows = [];
  const seen = new Set();
  let columns = POSITIONAL;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) return;
    if (SEPARATOR_ROW.test(trimmed)) return;

    const cells = splitRow(trimmed);
    const next = (lines[index + 1] || '').trim();
    if (SEPARATOR_ROW.test(next)) {
      // This row is a table header: adopt its column map for the rows below it.
      columns = mapHeader(cells) || POSITIONAL;
      return;
    }

    const at = (key) => (columns[key] === undefined ? '' : cells[columns[key]] || '');
    const id = at('id');
    const text = at('text');
    if (!REQUIREMENT_ID.test(id) || !text || seen.has(id)) return;
    seen.add(id);
    rows.push({
      id,
      area: at('area'),
      text,
      source: at('source'),
      evidence: at('evidence'),
      link: at('link'),
      status: at('status')
    });
  });

  return rows;
}

// Vendored extract shape: component + matrix provenance around the reviewed
// rows. Deliberately timestamp-free, so the committed file is a pure function
// of the matrix content and the freshness guard is a content comparison.
// `requirements` is the `{ id: text }` map the evidence pages resolve against;
// `rows` carries the remaining reviewed columns for the Quality page.
export function buildRequirementSet({ component, matrix, markdown }) {
  const rows = parseRequirementMatrix(markdown);
  const requirements = {};
  for (const row of rows) requirements[row.id] = row.text;
  return { component, matrix, requirements, rows };
}

// Freshness guard: stale when any requirement ID is added, removed, or its text
// changed. Component/matrix provenance is ignored — only the reviewed text
// matters downstream.
export function compareRequirements(committed, fresh) {
  const c = (committed && committed.requirements) || {};
  const f = (fresh && fresh.requirements) || {};
  const differences = [];
  for (const id of Object.keys(c)) {
    if (!(id in f)) differences.push(`removed: ${id}`);
    else if (c[id] !== f[id]) differences.push(`text changed: ${id}`);
  }
  for (const id of Object.keys(f)) {
    if (!(id in c)) differences.push(`added: ${id}`);
  }
  return { stale: differences.length > 0, differences };
}

// Pull requirement IDs out of test source. Only IDs that appear inside a test
// TITLE count — `test('TFL-ARD-001: …')`, `it("…")`, `test_that("…")` — so an
// ID mentioned in a comment or an assertion string is not mistaken for
// traceability. This is what lets the unresolved-ID report run before any
// evidence.json exists.
export function extractIdsFromTestSource(source) {
  const ids = new Set();
  const titles = String(source || '').matchAll(
    /(?:^|[^\w.])(?:test|it|test_that)\s*\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g
  );
  for (const [, , title] of titles) {
    for (const id of title.match(REQUIREMENT_ID_GLOBAL) || []) ids.add(id);
  }
  return [...ids].sort();
}

// The improvement safety.viz lacks (research §16): exact-match ID resolution is
// unforgiving and degrades SILENTLY — a matrix row split into `-001A`/`-001B`
// after tests cite `-001` simply renders as an ID with no text, and nobody
// notices. This reports both directions of the mismatch:
//
//   unresolved — an ID a test claims to evidence that no matrix defines
//                (typo, renamed requirement, or a split that broke the link)
//   uncovered  — a reviewed requirement no test references
//
// `known` is the union of every ID across all matrices, so an ID defined in a
// sibling component's matrix counts as resolved rather than unresolved.
export function resolveRequirementCoverage({ requirements = {}, referenced = [], known = null }) {
  const defined = new Set(Object.keys(requirements));
  const universe = known ? new Set(known) : defined;
  const referencedIds = [...new Set(referenced)].sort();
  const unresolved = referencedIds.filter((id) => !universe.has(id));
  const covered = referencedIds.filter((id) => defined.has(id));
  const uncovered = [...defined].filter((id) => !referencedIds.includes(id)).sort();
  const elsewhere = referencedIds.filter((id) => !defined.has(id) && universe.has(id));
  return {
    defined: defined.size,
    referenced: referencedIds.length,
    covered,
    uncovered,
    unresolved,
    elsewhere,
    coverage: defined.size ? covered.length / defined.size : 0
  };
}
