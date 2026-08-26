/**
 * editor-core.js — the pure core of the Demo app's text-block editor
 * (open.csr #113 increment B).
 *
 * The Demo app's first *editing* verb. A writer edits a block's prose in the
 * browser; every keystroke is evaluated against the committed ARDs by exactly the
 * code the build runs (`text-core.js`, imported below, not reimplemented); and the
 * output is a **unified diff against version-controlled source** — never a written
 * file, never a dispatched workflow, never a recorded approval.
 *
 * That last part is design D9 and it is the whole reason this is safe to ship as a
 * browser feature: the editor's product is a patch. Applying it is `git apply` by a
 * human, in a repository, under review, and the pipeline regenerates from the
 * committed source afterwards. Nothing here writes anything anywhere.
 *
 * Why text first: prose editing needs no runtime. Resolving `{{ard:…}}` is a
 * lookup in a JSON file the build already publishes, and the numeric-fidelity gate
 * is string arithmetic — so the browser can be *numerically faithful* with no R,
 * no webR and no server. A spec edit would need the pipeline to re-run; that is a
 * different (and open) design question.
 *
 * Like text-core.js, this file imports nothing but its sibling: it is loaded raw
 * by the browser and by vitest, with no build step between them.
 */

import { checkNumericFidelity, renderBlock } from './text-core.js';

// ---------------------------------------------------------------------------
// Frontmatter: the part the editor must not touch
// ---------------------------------------------------------------------------

// A block's frontmatter carries its tier, its approval state and its digit
// allowlist. Those are the levers the gates pull, so the editor edits the body
// and preserves the frontmatter as an opaque string — an edit in the browser
// cannot approve a block or widen what it is allowed to say.
const FRONTMATTER_RE = /^(---\r?\n[\s\S]*?\r?\n---)(\r?\n?)([\s\S]*)$/;

/**
 * Split a block file into its frontmatter (including the `---` fences) and its
 * body. A file with no frontmatter is all body — the editor still works on it,
 * it simply has nothing to preserve.
 */
export function splitFrontmatter(source) {
  const text = String(source ?? '');
  const match = text.match(FRONTMATTER_RE);
  if (!match) return { hasFrontmatter: false, frontmatter: '', separator: '', body: text };
  return {
    hasFrontmatter: true,
    frontmatter: match[1],
    separator: match[2],
    body: match[3]
  };
}

/** Put an edited body back into a block file, frontmatter untouched. */
export function applyBodyToSource(source, body) {
  const split = splitFrontmatter(source);
  if (!split.hasFrontmatter) return String(body ?? '');
  return `${split.frontmatter}${split.separator}${String(body ?? '')}`;
}

/**
 * The 1-based line of the file at which the body begins.
 *
 * The editor diffs the **body against the body** and offsets the resulting hunks
 * by this number, which is what makes "the frontmatter is preserved" a property of
 * the patch rather than a promise about the UI: a hunk that starts after the
 * closing `---` cannot express a change to anything before it. The browser is
 * never sent the frontmatter at all.
 */
export function bodyStartLine(source) {
  const split = splitFrontmatter(source);
  if (!split.hasFrontmatter) return 1;
  const consumed = `${split.frontmatter}${split.separator}`;
  return consumed.split('\n').length;
}

// ---------------------------------------------------------------------------
// Live evaluation — the build's gates, over a draft
// ---------------------------------------------------------------------------

/**
 * Evaluate a draft body exactly as the build would.
 *
 * `meta` is the block's frontmatter as the build read it — id, tier, declared
 * displays, `allow_digits` — supplied by the server so the browser never has to
 * parse YAML. The body is the draft. Everything else is `text-core.js`.
 *
 * The undeclared-display check is the one rule that lives in `runGates` rather
 * than in `renderBlock`, and it is repeated here deliberately: without it the
 * editor could show a green gate for a body that fails the build. The editor must
 * never be more permissive than CI.
 *
 * @param {object} options
 * @param {{id: string, displays?: string[], allow_digits?: string[]}} options.meta
 * @param {string} options.body      the draft prose
 * @param {object|Map} options.ards  display slug -> ard.json
 * @param {object} [options.context] xref indices; absent means xrefs report
 */
export function evaluateDraft({ meta = {}, body = '', ards = {}, context = {} } = {}) {
  const block = {
    id: meta.id || 'draft',
    body: String(body ?? ''),
    displays: meta.displays || [],
    allow_digits: meta.allow_digits || meta.allowDigits || []
  };

  const rendered = renderBlock(block, ards, context);
  const fidelity = checkNumericFidelity(rendered, block);

  const undeclaredDisplays = [
    ...new Set(
      rendered.bindings
        .filter((binding) => binding.display && !block.displays.includes(binding.display))
        .map((binding) => binding.display)
    )
  ];

  const errors = [...rendered.errors];
  if (undeclaredDisplays.length) {
    errors.push(
      `${block.id}: binds undeclared display(s) ${undeclaredDisplays.join(', ')} — add them to frontmatter displays`
    );
  }

  return {
    text: rendered.text,
    spans: rendered.spans,
    bindings: rendered.bindings,
    xrefs: rendered.xrefs,
    errors,
    xrefErrors: rendered.xrefErrors,
    warnings: rendered.warnings,
    violations: fidelity.violations,
    exemptionsUsed: fidelity.exemptionsUsed,
    unusedAllowDigits: fidelity.unusedAllowDigits,
    undeclaredDisplays,
    numericFidelity: fidelity.ok,
    ok: errors.length === 0 && rendered.xrefErrors.length === 0 && fidelity.ok
  };
}

/**
 * Cut the rendered text into segments for the live preview: the writer's own
 * words, the values the pipeline computed, and the digit runs the fidelity gate
 * is rejecting.
 *
 * Marking these *in place* is the point of the preview. A writer needs to see
 * which words in the sentence are theirs and which arrived from the ARD, and a
 * violation is far easier to fix underlined in the sentence than described in a
 * list below it. `checkNumericFidelity` already reports the index of every
 * offending run, and `renderBlock` already reports the span of every substituted
 * value, so this is a merge of two things the gates hand over — not a third
 * opinion about what counts as a number.
 *
 * A violation wins over a binding span where they overlap; they should never
 * overlap (a covered digit is not a violation), and if they somehow do, the
 * writer should see the failure rather than the reassurance.
 *
 * @returns {Array<{kind: 'text'|'bound'|'xref'|'violation', text: string}>}
 */
export function previewSegments(text, spans = [], violations = []) {
  const source = String(text ?? '');
  const marks = [
    ...spans.map((span) => ({
      start: span.start,
      end: span.end,
      kind: span.kind === 'xref' ? 'xref' : 'bound'
    })),
    ...violations.map((violation) => ({
      start: violation.index,
      end: violation.index + String(violation.value).length,
      kind: 'violation'
    }))
  ]
    .filter((mark) => mark.end > mark.start)
    .sort((a, b) => a.start - b.start || (a.kind === 'violation' ? -1 : 1));

  const segments = [];
  let cursor = 0;
  for (const mark of marks) {
    if (mark.start < cursor) continue;
    if (mark.start > cursor) segments.push({ kind: 'text', text: source.slice(cursor, mark.start) });
    segments.push({ kind: mark.kind, text: source.slice(mark.start, mark.end) });
    cursor = mark.end;
  }
  if (cursor < source.length) segments.push({ kind: 'text', text: source.slice(cursor) });
  return segments.filter((segment) => segment.text !== '');
}

// ---------------------------------------------------------------------------
// Diffing — the editor's actual output
// ---------------------------------------------------------------------------

/**
 * Split text into lines, remembering whether the last one had a newline. Git
 * cares about that distinction and so must a patch that git has to apply.
 */
function toLines(text) {
  const raw = String(text ?? '');
  if (raw === '') return { lines: [], newlineAtEof: true };
  const newlineAtEof = raw.endsWith('\n');
  const lines = raw.split('\n');
  if (newlineAtEof) lines.pop();
  return { lines: lines.map((line) => line.replace(/\r$/, '')), newlineAtEof };
}

/**
 * Longest-common-subsequence line diff.
 *
 * Returns a flat script of `{kind: 'context'|'remove'|'add', text, a, b}` in file
 * order, where `a` and `b` are 1-based line numbers in the before/after files (or
 * null on the side the line is absent from). A flat script rather than a hunk list
 * because both the patch writer and the on-screen review view read it, and they
 * must be reading the same thing.
 *
 * The classic dynamic-programming table is O(n·m); a text block is tens of lines,
 * so the simple correct algorithm is the right one. A common prefix and suffix are
 * trimmed first, which is what keeps a one-word edit in a long block cheap.
 */
export function diffLines(before, after) {
  const beforeLines = toLines(before);
  const afterLines = toLines(after);
  const a = beforeLines.lines;
  const b = afterLines.lines;

  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail += 1;
  }

  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);

  // lcs[i][j] = length of the longest common subsequence of midA[i:] and midB[j:]
  const lcs = Array.from({ length: midA.length + 1 }, () => new Uint32Array(midB.length + 1));
  for (let i = midA.length - 1; i >= 0; i -= 1) {
    for (let j = midB.length - 1; j >= 0; j -= 1) {
      lcs[i][j] =
        midA[i] === midB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const script = [];
  let ai = 0;
  let bi = 0;
  const push = (kind, text) => {
    script.push({
      kind,
      text,
      a: kind === 'add' ? null : ai + 1,
      b: kind === 'remove' ? null : bi + 1
    });
    if (kind !== 'add') ai += 1;
    if (kind !== 'remove') bi += 1;
  };

  for (let i = 0; i < head; i += 1) push('context', a[ai]);

  let i = 0;
  let j = 0;
  while (i < midA.length && j < midB.length) {
    if (midA[i] === midB[j]) {
      push('context', midA[i]);
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push('remove', midA[i]);
      i += 1;
    } else {
      push('add', midB[j]);
      j += 1;
    }
  }
  while (i < midA.length) {
    push('remove', midA[i]);
    i += 1;
  }
  while (j < midB.length) {
    push('add', midB[j]);
    j += 1;
  }

  for (let k = 0; k < tail; k += 1) push('context', a[ai]);

  // Adding or removing the file's final newline changes no LINE, so the script
  // above sees nothing while the two texts genuinely differ — and an empty script
  // means an empty patch, which would tell the writer "no change yet" about an
  // edit they really made. Git models this as the last line being rewritten, with
  // the "\ No newline at end of file" marker on whichever side lacks it. Do the
  // same.
  const lastEntry = script[script.length - 1];
  if (beforeLines.newlineAtEof !== afterLines.newlineAtEof && lastEntry?.kind === 'context') {
    script.pop();
    script.push({ kind: 'remove', text: lastEntry.text, a: lastEntry.a, b: null });
    script.push({ kind: 'add', text: lastEntry.text, a: null, b: lastEntry.b });
  }

  return script;
}

const CONTEXT_LINES = 3;

/** Group a diff script into hunks with `CONTEXT_LINES` of context on each side. */
export function toHunks(script, contextLines = CONTEXT_LINES) {
  const changed = script
    .map((entry, index) => (entry.kind === 'context' ? -1 : index))
    .filter((index) => index >= 0);
  if (!changed.length) return [];

  const ranges = [];
  for (const index of changed) {
    const from = Math.max(0, index - contextLines);
    const to = Math.min(script.length - 1, index + contextLines);
    const last = ranges[ranges.length - 1];
    // Adjacent ranges are merged rather than emitted separately — two edits three
    // lines apart are one hunk, exactly as `git diff` reports them.
    if (last && from <= last.to + 1) last.to = Math.max(last.to, to);
    else ranges.push({ from, to });
  }

  return ranges.map(({ from, to }) => {
    const entries = script.slice(from, to + 1);
    const firstA = entries.find((entry) => entry.a !== null);
    const firstB = entries.find((entry) => entry.b !== null);
    const countA = entries.filter((entry) => entry.kind !== 'add').length;
    const countB = entries.filter((entry) => entry.kind !== 'remove').length;
    return {
      startA: countA ? (firstA?.a ?? 1) : 0,
      countA,
      startB: countB ? (firstB?.b ?? 1) : 0,
      countB,
      entries
    };
  });
}

const SIGIL = { context: ' ', remove: '-', add: '+' };
const NO_NEWLINE = '\\ No newline at end of file';

/**
 * A unified diff of one file, in the form `git apply` accepts.
 *
 * Returns the empty string when nothing changed — the editor uses that as its
 * "there is nothing to review" signal, so the emptiness has to be exact rather
 * than a header with no hunks.
 */
export function unifiedDiff(
  file,
  before,
  after,
  { contextLines = CONTEXT_LINES, startLine = 1 } = {}
) {
  if (String(before ?? '') === String(after ?? '')) return '';
  const script = diffLines(before, after);
  const hunks = toHunks(script, contextLines);
  if (!hunks.length) return '';

  const beforeEof = toLines(before).newlineAtEof;
  const afterEof = toLines(after).newlineAtEof;
  const lastA = script.filter((entry) => entry.kind !== 'add').length;
  const lastB = script.filter((entry) => entry.kind !== 'remove').length;
  // `before`/`after` may be a region of the file (the body of a text block) rather
  // than the whole of it; the hunk headers are shifted to the region's position so
  // the patch still applies to the real file.
  const offset = Math.max(0, Number(startLine) - 1);

  const lines = [`--- a/${file}`, `+++ b/${file}`];
  for (const hunk of hunks) {
    lines.push(
      `@@ -${hunk.startA + offset},${hunk.countA} +${hunk.startB + offset},${hunk.countB} @@`
    );
    for (const entry of hunk.entries) {
      lines.push(`${SIGIL[entry.kind]}${entry.text}`);
      // "\ No newline at end of file" belongs after the last line of whichever
      // side lacks it, or the patch will not apply cleanly.
      const endsA = entry.kind !== 'add' && entry.a === lastA && !beforeEof;
      const endsB = entry.kind !== 'remove' && entry.b === lastB && !afterEof;
      if (endsA || endsB) lines.push(NO_NEWLINE);
    }
  }
  return `${lines.join('\n')}\n`;
}

/**
 * One patch over several blocks: a file section per changed block, unchanged
 * blocks omitted entirely.
 *
 * This is what the editor hands the writer — the artifact that turns a browsing
 * session into a reviewable source change. The counts come back with it because
 * "+3 −1 across 2 files" is the honest one-line summary of what is about to be
 * applied.
 *
 * @param {Array<{file: string, before: string, after: string, startLine?: number}>} edits
 */
export function composePatch(edits = [], { contextLines = CONTEXT_LINES } = {}) {
  const sections = [];
  const files = [];
  let added = 0;
  let removed = 0;

  for (const edit of edits) {
    const patch = unifiedDiff(edit.file, edit.before, edit.after, {
      contextLines,
      startLine: edit.startLine ?? 1
    });
    if (!patch) continue;
    files.push(edit.file);
    sections.push(patch);
    for (const entry of diffLines(edit.before, edit.after)) {
      if (entry.kind === 'add') added += 1;
      if (entry.kind === 'remove') removed += 1;
    }
  }

  return { patch: sections.join(''), files, added, removed, empty: sections.length === 0 };
}

/** A stable filename for a downloaded patch — no clock, so a redownload overwrites. */
export function patchFilename(files = []) {
  if (files.length === 1) {
    const base = String(files[0]).split('/').pop().replace(/\.md$/, '');
    return `${base}.patch`;
  }
  return 'text-blocks.patch';
}
