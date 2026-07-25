/**
 * text-decision-lib.mjs — the apply lane for text review and sign-off
 * (repo #2, requirement jwildfire/obot.roadmap#115).
 *
 * A reviewer on the static demo site cannot write to the repository, so a
 * decision travels as a `text-decision` repository_dispatch and lands here, in a
 * workflow, as a commit. This module is everything about that landing that is
 * worth testing without a workflow runner: what a decision is allowed to say,
 * what it is allowed to change, what must be re-checked afterwards, and what is
 * written down.
 *
 * THE CONTRACT, in order of importance:
 *
 *   1. AN APPROVAL THAT WOULD BREAK THE REPORT IS NOT AN APPROVAL.
 *      Approving a `generated` block changes what assembles into the CSR
 *      (design D8), so the gates run before the edit and again after it. If the
 *      tree was already broken the decision is `blocked` and nothing is touched;
 *      if the edit broke it, the file is restored byte-for-byte, the decision is
 *      recorded `failed`, and the caller exits non-zero. Nothing is committed in
 *      either case.
 *
 *   2. THE EDIT IS SURGICAL. `approval.state`, `approval.by` and `approval.at`
 *      of exactly one block, rewritten in place in the raw frontmatter text.
 *      Prose is never touched, other frontmatter keys are never touched, key
 *      order and quoting style are preserved, and no other file is opened for
 *      writing. gray-matter is used to VERIFY the result (round-trip equality of
 *      every other key and of the body), never to re-serialize the file — a
 *      re-dump would reorder keys and turn the library's inline flow maps into
 *      block maps, producing a diff nobody asked for.
 *
 *   3. THE PAYLOAD IS UNTRUSTED INPUT. The block id is matched against a
 *      conservative pattern and re-checked after path resolution, the decision
 *      is a two-word vocabulary, and the note is length-capped and stripped of
 *      control characters before it reaches the ledger.
 *
 *   4. EVERY DECISION IS WRITTEN DOWN. `site/text-decisions.json` is append-only
 *      and flat: one record per decision, carrying the block, the decision, the
 *      reviewer, the timestamp, the note, the outcome and the run that applied
 *      it. Refusals that never reached a real block (an unknown id, an invalid
 *      decision) are NOT recorded — the ledger is the history of decisions about
 *      text blocks, not a log of malformed requests.
 *
 * GATE SEVERITY IS INCLUSION-AWARE. A draft block is excluded from assembly, so
 * a problem in its prose cannot reach the report: it is deferred (a warning),
 * per the v0 convention that "draft is a lifecycle state, not a failure"
 * (contracts §10). The same problem in an INCLUDED block is a failure. That
 * distinction is what makes the post-edit gate run meaningful: approval is
 * exactly the act that promotes a block's deferred problems into failures.
 * `scripts/assemble.mjs` is stricter still — it fails on any block's unresolved
 * binding, draft or not — and is run as well whenever it is available, so the
 * lane is never more permissive than CI.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve, sep } from 'node:path';
import matter from 'gray-matter';

import {
  APPROVAL_STATES,
  loadArd,
  loadTextLibrary,
  parseBlock,
  runGates,
} from './text-lib.mjs';
import {
  assignDisplayNumbers,
  loadAssembly,
  loadSections,
  sectionIndex,
} from './template-lib.mjs';

/** The decision vocabulary. Anything else is refused before a file is opened. */
export const DECISIONS = ['approve', 'changes'];

/** Ledger outcomes, in the order the review page should treat as severity. */
export const OUTCOMES = ['applied', 'recorded', 'blocked', 'failed'];

export const LEDGER_SCHEMA = 'opencsr/text-decisions/v1';
export const LEDGER_RELATIVE_PATH = 'site/text-decisions.json';

/** A note is a review comment, not a document. Longer notes are truncated. */
export const MAX_NOTE_LENGTH = 2000;

/**
 * Block ids are file stems under library/text/. The pattern excludes `/`, `\`
 * and `.` runs, so a dispatched id cannot address a file outside the library;
 * the resolved path is re-checked against the directory anyway (belt and braces —
 * the payload is whatever the reviewer's browser sent).
 */
export const BLOCK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*$/;

/** Errors that are the caller's fault carry a `code` so the CLI can exit 2. */
export class TextDecisionError extends Error {
  constructor(message, code = 'invalid') {
    super(message);
    this.name = 'TextDecisionError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Payload validation
// ---------------------------------------------------------------------------

// Everything unprintable except tab and newline: a dispatched note is rendered
// on a web page and stored in JSON, and neither wants control bytes.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Collapse a payload string to something safe to store and render. */
export function cleanText(value, { max = MAX_NOTE_LENGTH } = {}) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(CONTROL_CHARS, '').replace(/\r\n?/g, '\n').trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Validate and normalize `{ decision, blockId, note, reviewer, runId, runUrl }`.
 * Throws TextDecisionError on anything outside the contract — loudly, and before
 * any file is read or written.
 */
export function parsePayload(raw = {}) {
  const decision = cleanText(raw.decision, { max: 32 })?.toLowerCase() ?? null;
  if (!DECISIONS.includes(decision)) {
    throw new TextDecisionError(
      `decision must be one of ${DECISIONS.join(' | ')} — got ${JSON.stringify(raw.decision ?? null)}`,
      'invalid-decision'
    );
  }
  const blockId = cleanText(raw.blockId ?? raw.block, { max: 128 });
  if (!blockId) throw new TextDecisionError('no block id in the decision', 'missing-block');
  if (!BLOCK_ID_PATTERN.test(blockId)) {
    throw new TextDecisionError(
      `block id ${JSON.stringify(blockId)} is not a text-block id (expected a library/text file stem)`,
      'invalid-block-id'
    );
  }
  const note = cleanText(raw.note);
  if (decision === 'changes' && !note) {
    throw new TextDecisionError(
      'a change request must carry a note saying what needs to change',
      'missing-note'
    );
  }
  const reviewer = cleanText(raw.reviewer, { max: 64 }) ?? null;
  return {
    decision,
    blockId,
    note,
    reviewer,
    runId: cleanText(raw.runId, { max: 64 }),
    runUrl: cleanText(raw.runUrl, { max: 300 }),
  };
}

/** Resolve a block id to its file, refusing anything outside `textDir`. */
export function blockPath(textDir, blockId) {
  const dir = resolve(textDir);
  const file = resolve(dir, `${blockId}.md`);
  if (file !== join(dir, `${blockId}.md`) || !file.startsWith(dir + sep)) {
    throw new TextDecisionError(`block id ${JSON.stringify(blockId)} escapes the text library`, 'invalid-block-id');
  }
  return file;
}

// ---------------------------------------------------------------------------
// Frontmatter surgery
// ---------------------------------------------------------------------------

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/;

/**
 * Split a block file into `{ frontmatter, rest, eol }`; throws when there is
 * none. `eol` is whatever followed the closing `---`, so the file is rebuilt
 * with the line endings it arrived with.
 */
export function splitFrontmatter(raw) {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match) throw new TextDecisionError('block file has no YAML frontmatter', 'malformed-block');
  return {
    frontmatter: match[1],
    rest: raw.slice(match[0].length),
    eol: match[2],
    newline: match[0].includes('\r\n') ? '\r\n' : '\n',
  };
}

/**
 * Render a scalar the way the shipped library renders it: bare for null and for
 * plain identifier-like words (`approved`), double-quoted otherwise (`"@jwildfire"`,
 * `"2026-07-25"` — a bare date would parse as a YAML timestamp, not a string).
 */
export function formatScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  const text = String(value);
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(text) ? text : JSON.stringify(text);
}

const APPROVAL_KEYS = ['state', 'by', 'at'];

/**
 * Rewrite the `approval` mapping of a block file in place, preserving every
 * other byte. Handles both styles the library uses:
 *
 *   approval: { state: draft, by: null, at: null }      inline flow map
 *   approval:                                            block map
 *     state: draft
 *
 * Returns the new file text. Throws if the edit changed anything it should not
 * have — the verification is part of the function, not of its caller.
 */
export function setApproval(raw, approval) {
  const before = matter(raw);
  const { frontmatter, rest, eol, newline } = splitFrontmatter(raw);
  const lines = frontmatter.split(/\r?\n/);
  const index = lines.findIndex((line) => /^approval\s*:/.test(line));

  const merged = { ...(before.data.approval ?? {}) };
  for (const key of APPROVAL_KEYS) {
    if (approval[key] !== undefined) merged[key] = approval[key];
  }

  if (index === -1) {
    // No approval key at all: append one in the library's inline style.
    lines.push(renderFlowApproval(merged));
  } else {
    const value = lines[index].replace(/^approval\s*:/, '').trim();
    if (value.startsWith('{')) {
      if (!value.endsWith('}')) {
        throw new TextDecisionError(
          'approval is a multi-line flow mapping — refusing to edit it blind',
          'malformed-block'
        );
      }
      lines[index] = renderFlowApproval(merged, keyOrder(value));
    } else if (value === '') {
      applyBlockMap(lines, index, merged);
    } else {
      throw new TextDecisionError(
        `approval must be a mapping, found ${JSON.stringify(value)}`,
        'malformed-block'
      );
    }
  }

  const rebuilt = `---${newline}${lines.join(newline)}${newline}---${eol}${rest}`;
  verifyEdit(raw, rebuilt, merged);
  return rebuilt;
}

/** Key order of an existing inline flow map, so extra keys keep their place. */
function keyOrder(flow) {
  const inner = flow.slice(1, -1);
  return inner
    .split(',')
    .map((part) => part.split(':')[0]?.trim())
    .filter(Boolean);
}

function renderFlowApproval(approval, order = []) {
  const keys = [...order.filter((k) => k in approval), ...Object.keys(approval).filter((k) => !order.includes(k))];
  const ordered = keys.length ? keys : APPROVAL_KEYS;
  const body = ordered.map((key) => `${key}: ${formatScalar(approval[key] ?? null)}`).join(', ');
  return `approval: { ${body} }`;
}

/** Update (or insert) the child keys of a block-style `approval:` mapping. */
function applyBlockMap(lines, index, approval) {
  const childIndent = detectChildIndent(lines, index);
  const seen = new Set();
  let last = index;
  for (let i = index + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '') {
      last = i;
      continue;
    }
    const indent = line.match(/^\s*/)[0];
    if (indent.length <= (lines[index].match(/^\s*/)[0] ?? '').length) break;
    const key = line.trim().split(':')[0];
    if (key in approval) {
      lines[i] = `${indent}${key}: ${formatScalar(approval[key])}`;
      seen.add(key);
    }
    last = i;
  }
  const missing = Object.keys(approval).filter((k) => !seen.has(k));
  if (missing.length) {
    lines.splice(last + 1, 0, ...missing.map((k) => `${childIndent}${k}: ${formatScalar(approval[k])}`));
  }
}

function detectChildIndent(lines, index) {
  const parentIndent = lines[index].match(/^\s*/)[0];
  for (let i = index + 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '') continue;
    const indent = lines[i].match(/^\s*/)[0];
    if (indent.length > parentIndent.length) return indent;
    break;
  }
  return `${parentIndent}  `;
}

/**
 * The safety net for rule 2: the body and every frontmatter key except
 * `approval` must be identical after the edit, and `approval` must be exactly
 * what was asked for. Anything else means the surgery slipped and the file must
 * not be written.
 */
function verifyEdit(rawBefore, rawAfter, expectedApproval) {
  const before = matter(rawBefore);
  const after = matter(rawAfter);
  if (before.content !== after.content) {
    throw new TextDecisionError('the approval edit changed the block prose — refusing to write', 'unsafe-edit');
  }
  const keysBefore = Object.keys(before.data);
  const keysAfter = Object.keys(after.data);
  if (keysBefore.join('|') !== keysAfter.join('|') && !(keysAfter.length === keysBefore.length + 1 && keysAfter.includes('approval'))) {
    throw new TextDecisionError(
      `the approval edit changed the frontmatter keys (${keysBefore.join(', ')} -> ${keysAfter.join(', ')})`,
      'unsafe-edit'
    );
  }
  for (const key of keysBefore) {
    if (key === 'approval') continue;
    if (JSON.stringify(before.data[key]) !== JSON.stringify(after.data[key])) {
      throw new TextDecisionError(`the approval edit changed frontmatter key "${key}" — refusing to write`, 'unsafe-edit');
    }
  }
  for (const [key, value] of Object.entries(expectedApproval)) {
    const got = after.data.approval?.[key] ?? null;
    const want = value ?? null;
    if (String(got) !== String(want)) {
      throw new TextDecisionError(
        `approval.${key} did not round-trip (wrote ${JSON.stringify(want)}, read ${JSON.stringify(got)})`,
        'unsafe-edit'
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

/** Locate the ARD for a display: pipeline outputs first, fixtures as fallback. */
export function findArd(slug, { root, ardDirs = [] } = {}) {
  const outputs = join(root, 'outputs', slug);
  if (existsSync(outputs)) {
    const pointer = join(outputs, 'current.json');
    if (existsSync(pointer)) {
      let doc = null;
      try {
        doc = JSON.parse(readFileSync(pointer, 'utf8'));
      } catch {
        doc = null;
      }
      const candidates = typeof doc === 'string' ? [doc] : [];
      if (doc && typeof doc === 'object') {
        for (const key of ['ard', 'ard_file', 'ardFile', 'path', 'version', 'iteration', 'current']) {
          if (typeof doc[key] === 'string') candidates.push(doc[key]);
        }
      }
      for (const candidate of candidates) {
        for (const p of [
          resolve(root, candidate),
          resolve(outputs, candidate),
          resolve(root, candidate, 'ard.json'),
          resolve(outputs, candidate, 'ard.json'),
        ]) {
          if (existsSync(p) && p.endsWith('.json') && statSync(p).isFile()) return p;
        }
      }
    }
    const versions = readdirSync(outputs)
      .filter((n) => /^v\d+$/.test(n))
      .sort()
      .reverse();
    for (const v of versions) {
      const p = join(outputs, v, 'ard.json');
      if (existsSync(p)) return p;
    }
  }
  for (const dir of [...ardDirs, join(root, 'tests/fixtures/ard')]) {
    const p = join(dir, `${slug}.json`);
    if (existsSync(p)) return p;
  }
  return null;
}

/** Display/section index for cross-reference resolution, when the model exists. */
function gateContext(root) {
  const sectionsPath = join(root, 'library/templates/ich-e3/sections.yaml');
  const assemblyPath = join(root, 'library/templates/ich-e3/assembly.yaml');
  if (!existsSync(sectionsPath) || !existsSync(assemblyPath)) {
    return { displayIndex: new Map(), sectionIndex: new Map() };
  }
  const model = loadSections(sectionsPath);
  const assembly = loadAssembly(assemblyPath);
  const { numbers } = assignDisplayNumbers(assembly, model);
  const displayIndex = new Map();
  for (const [slug, assigned] of numbers) {
    displayIndex.set(slug, {
      number: assigned.number,
      type: slug.startsWith('l-') ? 'listing' : slug.startsWith('f-') ? 'figure' : 'table',
      title: slug,
    });
  }
  return { displayIndex, sectionIndex: sectionIndex(model) };
}

/**
 * Run the text gates over a repository tree, partitioned by whether the block
 * carrying the problem currently reaches the report.
 *
 * Returns { ok, failures, deferred, structural, warnings, blocks }.
 */
export function runTextGates({ root, ardDirs = [] } = {}) {
  const textDir = join(root, 'library/text');
  const library = loadTextLibrary(textDir);
  const blocks = [...library.values()];

  const referenced = new Set();
  for (const block of blocks) for (const slug of block.displays ?? []) referenced.add(slug);

  const ards = new Map();
  const missing = [];
  for (const slug of referenced) {
    const path = findArd(slug, { root, ardDirs });
    if (!path) {
      missing.push(slug);
      continue;
    }
    ards.set(slug, loadArd(path));
  }

  const gates = runGates(blocks, ards, gateContext(root));

  const structural = [];
  for (const block of blocks) {
    for (const error of block.errors ?? []) structural.push(`${block.id}: ${error}`);
  }
  for (const slug of missing) structural.push(`no ARD available for display ${slug}`);

  const failures = [];
  const deferred = [];
  for (const entry of gates.blocks) {
    const problems = [];
    if (entry.unresolvedBindings > 0) {
      problems.push(`${entry.unresolvedBindings} unresolved binding(s)`);
    }
    if (entry.unresolvedCrossReferences > 0) {
      problems.push(`${entry.unresolvedCrossReferences} unresolved cross-reference(s)`);
    }
    if (!entry.numericFidelity) {
      problems.push(
        `${entry.violations.length} numeric-fidelity violation(s): ${entry.violations
          .map((v) => `"${v.value}"`)
          .join(', ')}`
      );
    }
    if (entry.undeclaredDisplays?.length) {
      problems.push(`binds undeclared display(s) ${entry.undeclaredDisplays.join(', ')}`);
    }
    if (!problems.length) continue;
    const message = `${entry.id}: ${problems.join('; ')}`;
    // Inclusion decides severity: an excluded draft cannot reach the report.
    (entry.included ? failures : deferred).push(message);
  }

  return {
    ok: failures.length === 0 && structural.length === 0,
    failures,
    deferred,
    structural,
    warnings: gates.warnings ?? [],
    blocks: gates.blocks,
  };
}

/**
 * Run `scripts/assemble.mjs` in `root`, when that tree has one.
 *
 * The script path is realpath-resolved before it is spawned: assemble.mjs guards
 * its entry point with `import.meta.url === file://${process.argv[1]}`, and
 * node resolves import.meta.url through symlinks while argv[1] is passed through
 * verbatim. Spawning a symlinked path (a checkout under macOS `/tmp`, a linked
 * worktree) would import the module, skip its main block, exit 0 — and report a
 * green gate for an assembler that never ran. An assembler that prints nothing
 * is therefore treated as not having run at all, which is the same defence from
 * the other side.
 */
export function runAssembler({ root, timeout = 120000 } = {}) {
  const script = join(root, 'scripts/assemble.mjs');
  if (!existsSync(script)) return { ran: false, ok: true, status: 0, output: '' };
  const result = spawnSync(process.execPath, [realpathSync(script)], {
    cwd: root,
    encoding: 'utf8',
    timeout,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (result.error) {
    return { ran: true, ok: false, status: result.status ?? -1, output: String(result.error.message) };
  }
  if (result.status === 0 && !output) {
    return {
      ran: true,
      ok: false,
      status: 0,
      output: 'the assembler exited 0 without producing any output — treating it as not run',
    };
  }
  return { ran: true, ok: result.status === 0, status: result.status, output };
}

/**
 * The full gate set: the inclusion-aware text gates plus the assembler, which is
 * what CI runs. `assemble: false` keeps a dry run read-only (the assembler
 * writes docs/assembled/).
 */
export function checkGates({ root, ardDirs = [], assemble = true } = {}) {
  const text = runTextGates({ root, ardDirs });
  const assembler = assemble ? runAssembler({ root }) : { ran: false, ok: true, status: 0, output: '' };
  const failures = [...text.structural, ...text.failures];
  if (assembler.ran && !assembler.ok) {
    failures.push(`assembler exited ${assembler.status}: ${assemblerComplaints(assembler.output)}`);
  }
  return {
    ok: failures.length === 0,
    failures,
    deferred: text.deferred,
    warnings: text.warnings,
    assembler,
    blocks: text.blocks,
  };
}

/**
 * What the assembler actually complained about. Its output is mostly ticks, and
 * the tail of a successful-looking log is the least useful thing to put in front
 * of a reviewer whose approval was refused — so the failed gate lines are pulled
 * out by their markers, with the tail as a last resort.
 */
function assemblerComplaints(output) {
  const lines = String(output ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const bad = lines.filter(
    (l) =>
      l.startsWith('\u2717') ||
      l.startsWith('!') ||
      /orphan|unresolved|ambiguous|violation|invalid|error|fail/i.test(l)
  );
  return (bad.length ? bad : lines.slice(-4)).slice(0, 6).join(' | ');
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

export const emptyLedger = () => ({
  schema: LEDGER_SCHEMA,
  documentation:
    'Append-only record of text review decisions. One flat entry per decision; ' +
    'outcomes: applied (source changed, gates green) | recorded (change request ' +
    'noted, no source change) | failed (gates broke, the edit was reverted, ' +
    'nothing committed) | blocked (the gates were already failing, so nothing ' +
    'was touched). Written by scripts/apply-text-decision.mjs.',
  updated: null,
  decisions: [],
});

export function readLedger(file) {
  if (!existsSync(file)) return emptyLedger();
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new TextDecisionError(`${file} is not valid JSON (${error.message})`, 'malformed-ledger');
  }
  const ledger = { ...emptyLedger(), ...parsed };
  if (!Array.isArray(ledger.decisions)) {
    throw new TextDecisionError(`${file}: decisions must be an array`, 'malformed-ledger');
  }
  return ledger;
}

/** One ledger record. Flat by design: the review page renders it as a row. */
export function makeEntry({
  block,
  decision,
  reviewer,
  at,
  note = null,
  outcome,
  detail = null,
  tier = null,
  priorState = null,
  newState = null,
  runId = null,
  runUrl = null,
}) {
  if (!OUTCOMES.includes(outcome)) {
    throw new TextDecisionError(`unknown outcome "${outcome}"`, 'invalid');
  }
  return {
    block,
    decision,
    reviewer: reviewer ?? null,
    at,
    note: note ?? null,
    outcome,
    detail: detail ? String(detail).slice(0, 500) : null,
    tier,
    priorState,
    newState,
    runId,
    runUrl,
  };
}

/** Append one entry. Existing entries are never rewritten, reordered or dropped. */
export function appendDecision(file, entry) {
  const ledger = readLedger(file);
  const decisions = [...ledger.decisions, entry];
  const next = { ...ledger, updated: entry.at, decisions };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

/**
 * Apply one decision to a repository tree.
 *
 * @param {object} options
 * @param {string} options.root       repository root
 * @param {object} options.payload    raw `{ decision, blockId, note, reviewer, runId, runUrl }`
 * @param {boolean} options.dryRun    report what would happen; write nothing
 * @param {string[]} options.ardDirs  extra directories to resolve ARDs from
 * @param {Function} options.gateCheck  injectable gate runner (tests, mainly)
 * @returns {object} { outcome, entry, gate, changed, reverted, block }
 */
export function applyTextDecision({
  root,
  payload,
  dryRun = false,
  ardDirs = [],
  now = new Date(),
  gateCheck = checkGates,
} = {}) {
  const { decision, blockId, note, reviewer, runId, runUrl } = parsePayload(payload);
  const at = now instanceof Date ? now.toISOString() : String(now);
  const textDir = join(root, 'library/text');
  const file = blockPath(textDir, blockId);

  if (!existsSync(file)) {
    throw new TextDecisionError(`no text block "${blockId}" in library/text`, 'unknown-block');
  }
  const block = parseBlock(file);
  if (block.id !== blockId) {
    throw new TextDecisionError(
      `${blockId}.md declares id "${block.id}" — the library is inconsistent, refusing to edit it`,
      'malformed-block'
    );
  }
  if (block.errors?.length) {
    throw new TextDecisionError(
      `block ${blockId} does not validate (${block.errors.join('; ')}) — fix the block before deciding on it`,
      'malformed-block'
    );
  }

  const priorState = block.approval?.state ?? 'draft';
  const ledgerFile = join(root, LEDGER_RELATIVE_PATH);
  const original = readFileSync(file, 'utf8');

  // What this decision does to the source, if anything.
  //   approve                     -> approved
  //   changes on an approved block-> in_review (leaving it approved would keep
  //                                  prose the reviewer just challenged in the
  //                                  report until someone remembered to fix it)
  //   changes on a draft block    -> no source change; the note is the record
  let newState = priorState;
  if (decision === 'approve') newState = 'approved';
  else if (priorState === 'approved') newState = 'in_review';
  if (!APPROVAL_STATES.includes(newState)) {
    throw new TextDecisionError(`refusing to write approval state "${newState}"`, 'invalid');
  }
  const editsSource = decision === 'approve' || newState !== priorState;

  const record = (outcome, detail) =>
    makeEntry({
      block: blockId,
      decision,
      reviewer,
      at,
      note,
      outcome,
      detail,
      tier: block.tier,
      priorState,
      newState: outcome === 'applied' || outcome === 'recorded' ? newState : priorState,
      runId,
      runUrl,
    });

  // --- a change request that touches nothing needs no gate run --------------
  if (!editsSource) {
    const entry = record('recorded', `change request recorded against ${blockId} (${priorState}); source unchanged`);
    if (!dryRun) appendDecision(ledgerFile, entry);
    return { outcome: 'recorded', entry, gate: null, changed: dryRun ? [] : [LEDGER_RELATIVE_PATH], reverted: false, block, dryRun };
  }

  // --- 1. baseline: is the tree green BEFORE this decision? -----------------
  const baseline = gateCheck({ root, ardDirs, assemble: !dryRun });
  if (!baseline.ok) {
    const detail =
      `the gates were already failing before this decision — nothing was changed: ${baseline.failures.join('; ')}`;
    const entry = record('blocked', detail);
    if (!dryRun) appendDecision(ledgerFile, entry);
    return { outcome: 'blocked', entry, gate: baseline, changed: [], reverted: false, block, dryRun };
  }

  // --- 2. the edit ----------------------------------------------------------
  const edited = setApproval(original, {
    state: newState,
    by: reviewer,
    at: at.slice(0, 10),
  });

  if (dryRun) {
    const entry = record('applied', `dry run: ${priorState} -> ${newState}`);
    return {
      outcome: 'applied',
      entry,
      gate: baseline,
      changed: [],
      reverted: false,
      block,
      dryRun: true,
      preview: { before: approvalLine(original), after: approvalLine(edited) },
    };
  }

  writeFileSync(file, edited);

  // --- 3. re-run the gates; an approval that breaks the report is not one ---
  const after = gateCheck({ root, ardDirs, assemble: true });
  if (!after.ok) {
    writeFileSync(file, original);
    // Restore the generated outputs the failed run rewrote, so the tree the
    // workflow refuses to commit is exactly the tree it started from. If even
    // that fails the working tree is in a state no one asked for, and the ledger
    // has to say so rather than imply a clean revert.
    const restored = gateCheck({ root, ardDirs, assemble: true });
    const detail =
      `reverted: the decision broke the gates: ${after.failures.join('; ')}` +
      (restored.ok ? '' : ' — WARNING: re-running the assembler after the revert also failed');
    const entry = record('failed', detail);
    appendDecision(ledgerFile, entry);
    return { outcome: 'failed', entry, gate: after, changed: [LEDGER_RELATIVE_PATH], reverted: true, block, dryRun };
  }

  const entry = record('applied', `${priorState} -> ${newState}`);
  appendDecision(ledgerFile, entry);
  return {
    outcome: 'applied',
    entry,
    gate: after,
    changed: [`library/text/${blockId}.md`, LEDGER_RELATIVE_PATH, 'docs/assembled/'],
    reverted: false,
    block,
    dryRun,
  };
}

/** The `approval:` line of a block file, for dry-run reporting. */
export function approvalLine(raw) {
  const { frontmatter } = splitFrontmatter(raw);
  const lines = frontmatter.split('\n');
  const index = lines.findIndex((line) => /^approval\s*:/.test(line));
  if (index === -1) return null;
  const value = lines[index].replace(/^approval\s*:/, '').trim();
  if (value.startsWith('{')) return lines[index];
  const collected = [lines[index]];
  for (let i = index + 1; i < lines.length; i += 1) {
    if (/^\s+\S/.test(lines[i])) collected.push(lines[i]);
    else break;
  }
  return collected.join('\n');
}
