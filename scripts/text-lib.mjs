/**
 * text-lib.mjs — the Text Library: block parsing, ARD binding resolution, and the
 * three CI gates that make design decision D7 ("text blocks bind numbers, never
 * state them") enforceable rather than aspirational.
 *
 * Gates (contracts.md §6):
 *   (a) BINDING RESOLUTION  every {{ard:...}} resolves to exactly one ARD row.
 *       Zero rows = orphaned binding (a regenerated ARD dropped the statistic);
 *       more than one row = an under-specified address. Both fail the build.
 *   (b) NUMERIC FIDELITY    every digit run in *rendered* prose traces to a
 *       resolved binding or a cross-reference. Exemptions, and only these:
 *       inline/fenced code, markdown link destinations, and the literal strings
 *       listed in the block's `allow_digits` frontmatter.
 *   (c) APPROVAL            `generated`-tier blocks whose approval.state is not
 *       "approved" are excluded from assembly and reported.
 *
 * Extension beyond contracts.md, used by the shipped library and flagged as such:
 *   {{xref:display:<slug>}}   -> "Table 14.3.1.2" (number assigned at build time)
 *   {{xref:section:<number>}} -> "Section 12.2.1" / "Appendix 16.2.1"
 *   {{value:<id>}}            -> a named value from the values store (#129 B)
 * A value binding is an ARD binding that has been given a name and a provenance
 * record once, centrally, instead of being re-addressed in every sentence that
 * needs it. It resolves through the same span-tracking path, so the digits it
 * emits are exempt from gate (b) exactly as an {{ard:…}} substitution is — and
 * the store itself is re-derived from the committed ARDs by values-lib's gate, so
 * naming a number never loosens the check on it.
 * Cross-references exist so prose never types a 14.x number that the assembler
 * owns (design decision D6). They resolve against the template model and the
 * assembler's display index; an unresolvable xref fails the build exactly like an
 * orphaned binding. Their output is binding-derived, so it is exempt from (b).
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';

export const TIERS = ['boilerplate', 'parameterized', 'generated'];
export const APPROVAL_STATES = ['draft', 'in_review', 'approved'];
/**
 * Address qualifiers. `group`/`group2`/`variable`/`variable_level` narrow the ARD
 * row set (contracts.md §5). `digits` and `scale` are presentation only and never
 * change which row is selected: the pipeline emits proportions as `p` in [0,1],
 * so prose that wants a percentage writes `;scale=100;digits=1`. Keeping the
 * scaling explicit in the address means the transformation is visible in the
 * source prose and recorded on the resolved binding in csr.json.
 */
export const QUALIFIER_KEYS = ['group', 'group2', 'variable', 'variable_level', 'digits', 'scale'];

/** Matches every token kind; a fresh instance per call keeps `lastIndex` clean. */
const tokenRe = () => /\{\{(ard|xref|value):[^}]+\}\}/g;

// ---------------------------------------------------------------------------
// Block parsing
// ---------------------------------------------------------------------------

/** Parse one `library/text/<ID>.md` file into a block object. */
export function parseBlock(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const { data, content } = matter(raw);
  const block = {
    id: data.id ?? basename(filePath, extname(filePath)),
    file: filePath,
    e3_section: data.e3_section != null ? String(data.e3_section) : null,
    title: data.title ?? null,
    tier: data.tier ?? null,
    version: data.version ?? 1,
    displays: data.displays ?? [],
    allow_digits: (data.allow_digits ?? []).map(String),
    approval: data.approval ?? { state: 'draft', by: null, at: null },
    provenance: data.provenance ?? { model: null, prompt: null },
    requirements: data.requirements ?? [],
    disclosure: data.disclosure ?? null,
    body: content.trim(),
  };
  block.errors = validateBlock(block);
  return block;
}

/** Structural validation of a block's frontmatter. Returns an array of messages. */
export function validateBlock(block) {
  const errors = [];
  if (!block.id) errors.push('missing id');
  if (!block.e3_section) errors.push('missing e3_section');
  if (!block.title) errors.push('missing title');
  if (!TIERS.includes(block.tier)) errors.push(`tier must be one of ${TIERS.join(' | ')}`);
  if (!Array.isArray(block.displays)) errors.push('displays must be a list');
  if (!block.approval || !APPROVAL_STATES.includes(block.approval.state)) {
    errors.push(`approval.state must be one of ${APPROVAL_STATES.join(' | ')}`);
  }
  if (block.tier === 'generated') {
    if (!block.provenance?.model) errors.push('generated tier requires provenance.model');
    if (!block.provenance?.prompt) errors.push('generated tier requires provenance.prompt');
  }
  if (!block.body) errors.push('empty body');
  return errors;
}

/** Load every block in a directory, keyed by id. Throws on duplicate ids. */
export function loadTextLibrary(dir) {
  if (!existsSync(dir)) return new Map();
  const blocks = new Map();
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (!statSync(full).isFile() || extname(name) !== '.md') continue;
    const block = parseBlock(full);
    if (blocks.has(block.id)) throw new Error(`duplicate text block id: ${block.id}`);
    blocks.set(block.id, block);
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// ARD loading + binding resolution
// ---------------------------------------------------------------------------

/** Read an ard.json from disk (contracts.md §5). */
export function loadArd(path) {
  const ard = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(ard.rows)) throw new Error(`${path}: ard.rows must be an array`);
  return ard;
}

/**
 * Parse a binding address: `<display>:<analysis>:<stat_name>[;key=value]...`
 * Throws on anything malformed — a bad address is a build failure, not a warning.
 */
export function parseBindingAddress(address) {
  const parts = String(address).split(';');
  const head = parts[0].split(':');
  if (head.length !== 3) {
    throw new Error(
      `invalid binding address "${address}": expected <display>:<analysis>:<stat_name>`
    );
  }
  const [display, analysis, statName] = head.map((s) => s.trim());
  if (!display || !analysis || !statName) {
    throw new Error(`invalid binding address "${address}": empty component`);
  }
  const qualifiers = {};
  for (const part of parts.slice(1)) {
    if (!part.trim()) continue;
    const eq = part.indexOf('=');
    if (eq < 1) throw new Error(`invalid qualifier "${part}" in binding "${address}"`);
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!QUALIFIER_KEYS.includes(key)) {
      throw new Error(
        `unknown qualifier "${key}" in binding "${address}" (allowed: ${QUALIFIER_KEYS.join(', ')})`
      );
    }
    qualifiers[key] = value;
  }
  if (qualifiers.digits !== undefined && !/^\d+$/.test(qualifiers.digits)) {
    throw new Error(`digits qualifier must be a non-negative integer in "${address}"`);
  }
  if (qualifiers.scale !== undefined && !Number.isFinite(Number(qualifiers.scale))) {
    throw new Error(`scale qualifier must be a number in "${address}"`);
  }
  return { address: String(address), display, analysis, statName, qualifiers };
}

/** Rows in `ard` matching a parsed binding address. */
export function matchRows(parsed, ard) {
  const q = parsed.qualifiers;
  return ard.rows.filter((row) => {
    if (row.analysis !== parsed.analysis) return false;
    if (row.stat_name !== parsed.statName) return false;
    if (q.group !== undefined && String(row.group1_level) !== q.group) return false;
    if (q.group2 !== undefined && String(row.group2_level) !== q.group2) return false;
    if (q.variable !== undefined && String(row.variable) !== q.variable) return false;
    if (q.variable_level !== undefined && String(row.variable_level) !== q.variable_level) {
      return false;
    }
    return true;
  });
}

/**
 * Resolve one binding against a map of display slug -> ard.
 * Returns { ok, value, row, formatted, error }. Never throws for data problems:
 * the caller collects them so a build reports every failure at once.
 */
export function resolveBinding(parsed, ards) {
  const ard = ards.get?.(parsed.display) ?? ards[parsed.display];
  if (!ard) {
    return { ok: false, error: `no ARD available for display "${parsed.display}"`, matches: 0 };
  }
  const rows = matchRows(parsed, ard);
  if (rows.length === 0) {
    return {
      ok: false,
      error: `orphaned binding: no ARD row matches "${parsed.address}"`,
      matches: 0,
    };
  }
  if (rows.length > 1) {
    return {
      ok: false,
      error: `ambiguous binding: ${rows.length} ARD rows match "${parsed.address}"`,
      matches: rows.length,
    };
  }
  const row = rows[0];
  const digits = parsed.qualifiers.digits === undefined ? null : Number(parsed.qualifiers.digits);
  const scale = parsed.qualifiers.scale === undefined ? null : Number(parsed.qualifiers.scale);
  const displayValue =
    scale !== null && typeof row.stat === 'number' ? row.stat * scale : row.stat;
  return {
    ok: true,
    matches: 1,
    row,
    value: row.stat,
    displayValue,
    formatted: formatValue(displayValue, digits),
    warning: row.warning ?? null,
    error: row.error ?? null,
  };
}

/**
 * Half-up rounding. R rounds half-to-even; SAS and every CSR convention round
 * half-up, and the difference is a known R-vs-SAS discrepancy, so the rounding
 * used in prose is explicit here rather than inherited from the runtime.
 */
export function roundHalfUp(x, digits = 0) {
  if (typeof x !== 'number' || !Number.isFinite(x)) return x;
  const factor = 10 ** digits;
  // toFixed(9) first so 2.675*100 = 267.49999999999997 does not round down.
  const scaled = Number((Math.abs(x) * factor).toFixed(9));
  const rounded = Math.floor(scaled + 0.5) / factor;
  return (x < 0 ? -1 : 1) * rounded;
}

/** Render a resolved statistic for prose. */
export function formatValue(value, digits = null) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map((v) => formatValue(v, digits)).join(', ');
  if (typeof value !== 'number') return String(value);
  if (digits !== null) return roundHalfUp(value, digits).toFixed(digits);
  if (Number.isInteger(value)) return String(value);
  return String(value);
}

/** More than this many decimals in prose without a `digits` qualifier is a smell. */
const PRECISION_WARN_DECIMALS = 3;

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Substitute every {{ard:...}} and {{xref:...}} token in a block body, recording
 * the character range each substituted value occupies. Those ranges are what the
 * numeric-fidelity gate treats as legitimate sources of digits.
 *
 * @param block   parsed block
 * @param ards    Map<slug, ard>
 * @param context { displayIndex: Map<slug,{number,type,title}>,
 *                  sectionIndex: Map<number,{title}> } — optional; when absent,
 *                  xrefs resolve to a stable placeholder and are reported.
 */
export function renderBlock(block, ards, context = {}) {
  const body = block.body;
  const spans = [];
  const bindings = [];
  const xrefs = [];
  const values = [];
  const errors = [];
  const xrefErrors = [];
  const valueErrors = [];
  const warnings = [];
  const valueIndex = context.values ?? null;

  let out = '';
  let cursor = 0;
  for (const match of body.matchAll(tokenRe())) {
    out += body.slice(cursor, match.index);
    const start = out.length;
    let text;
    if (match[1] === 'ard') {
      const inner = match[0].slice('{{ard:'.length, -2);
      let parsed = null;
      let resolved = null;
      try {
        parsed = parseBindingAddress(inner);
        resolved = resolveBinding(parsed, ards);
      } catch (err) {
        resolved = { ok: false, error: err.message, matches: null };
      }
      if (resolved.ok) {
        text = resolved.formatted;
        if (
          parsed.qualifiers.digits === undefined &&
          typeof resolved.displayValue === 'number' &&
          !Number.isInteger(resolved.displayValue) &&
          decimalsOf(resolved.displayValue) > PRECISION_WARN_DECIMALS
        ) {
          warnings.push(
            `${block.id}: binding "${parsed.address}" renders ${text} at full precision; ` +
              'add a digits qualifier'
          );
        }
        if (resolved.warning) {
          warnings.push(`${block.id}: ARD warning on "${parsed.address}": ${resolved.warning}`);
        }
        if (resolved.error) {
          errors.push(`${block.id}: ARD error on "${parsed.address}": ${resolved.error}`);
        }
      } else {
        text = `[UNRESOLVED BINDING]`;
        errors.push(`${block.id}: ${resolved.error}`);
      }
      bindings.push({
        address: inner,
        display: parsed?.display ?? null,
        analysis: parsed?.analysis ?? null,
        stat_name: parsed?.statName ?? null,
        qualifiers: parsed?.qualifiers ?? {},
        resolved: resolved.ok,
        value: resolved.ok ? resolved.value : null,
        displayValue: resolved.ok ? resolved.displayValue : null,
        formatted: text,
        row: resolved.ok ? resolved.row : null,
        error: resolved.ok ? null : resolved.error,
        start,
      });
    } else if (match[1] === 'value') {
      const id = match[0].slice('{{value:'.length, -2).trim();
      const entry = valueIndex?.get?.(id) ?? valueIndex?.[id] ?? null;
      if (entry) {
        text = entry.formatted ?? String(entry.value ?? '');
      } else {
        text = `[UNRESOLVED VALUE ${id}]`;
        valueErrors.push(
          `${block.id}: unknown value "${id}"` +
            (valueIndex ? ' — declare it in library/values/values.yaml and regenerate' : ' — no values store loaded')
        );
      }
      values.push({
        id,
        resolved: !!entry,
        value: entry ? entry.value : null,
        formatted: text,
        kind: entry?.kind ?? null,
        address: entry?.source?.address ?? null,
        start
      });
    } else {
      const kind = match[1] === 'xref' ? match[0].slice('{{xref:'.length, -2) : null;
      const [refType, refTarget] = splitOnce(kind, ':');
      const ref = resolveXref(refType, refTarget, context);
      text = ref.text;
      if (!ref.ok) xrefErrors.push(`${block.id}: ${ref.error}`);
      xrefs.push({ type: refType, target: refTarget, resolved: ref.ok, text, start });
    }
    out += text;
    spans.push({ start, end: out.length, kind: match[1] });
    cursor = match.index + match[0].length;
  }
  out += body.slice(cursor);

  return { text: out, spans, bindings, xrefs, values, errors, xrefErrors, valueErrors, warnings };
}

function splitOnce(s, sep) {
  const i = s.indexOf(sep);
  return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)];
}

function decimalsOf(x) {
  const s = String(x);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

/** Resolve a cross-reference against the display index / section index. */
export function resolveXref(refType, target, context = {}) {
  if (refType === 'display') {
    const entry = context.displayIndex?.get?.(target) ?? context.displayIndex?.[target];
    if (!entry) {
      return { ok: false, text: `[UNRESOLVED DISPLAY ${target}]`, error: `unknown display "${target}"` };
    }
    const label = { table: 'Table', listing: 'Listing', figure: 'Figure' }[entry.type] ?? 'Display';
    return { ok: true, text: `${label} ${entry.number}` };
  }
  if (refType === 'section') {
    const entry = context.sectionIndex?.get?.(target) ?? context.sectionIndex?.[target];
    if (!entry) {
      return { ok: false, text: `[UNRESOLVED SECTION ${target}]`, error: `unknown section "${target}"` };
    }
    const label = String(target).startsWith('16') ? 'Appendix' : 'Section';
    return { ok: true, text: `${label} ${target}` };
  }
  return { ok: false, text: `[UNRESOLVED XREF]`, error: `unknown xref type "${refType}"` };
}

// ---------------------------------------------------------------------------
// Gate (b): numeric fidelity
// ---------------------------------------------------------------------------

/**
 * Every digit run in the rendered text must be covered by a substituted span or
 * an explicit exemption. Returns { ok, violations, exemptionsUsed, unusedAllowDigits }.
 */
export function checkNumericFidelity(rendered, block = {}) {
  const text = rendered.text;
  const mask = new Uint8Array(text.length); // 1 = digits here are accounted for

  const cover = (start, end) => {
    for (let i = Math.max(0, start); i < Math.min(text.length, end); i += 1) mask[i] = 1;
  };

  // 1. Substituted binding / cross-reference values.
  for (const span of rendered.spans ?? []) cover(span.start, span.end);

  // 2. Fenced and inline code.
  for (const m of text.matchAll(/```[\s\S]*?```/g)) cover(m.index, m.index + m[0].length);
  for (const m of text.matchAll(/`[^`\n]*`/g)) cover(m.index, m.index + m[0].length);

  // 3. Markdown link destinations and autolinks (the link TEXT is still checked —
  //    exempting it would be an easy way to smuggle a typed number into prose).
  for (const m of text.matchAll(/\]\([^)]*\)/g)) cover(m.index, m.index + m[0].length);
  for (const m of text.matchAll(/<[a-zA-Z][a-zA-Z0-9+.-]*:[^>\s]*>/g)) {
    cover(m.index, m.index + m[0].length);
  }

  // 4. Explicitly allowed literals from frontmatter.
  const exemptionsUsed = {};
  for (const literal of block.allow_digits ?? []) {
    if (!literal) continue;
    let from = 0;
    let count = 0;
    for (;;) {
      const at = text.indexOf(literal, from);
      if (at < 0) break;
      cover(at, at + literal.length);
      from = at + Math.max(1, literal.length);
      count += 1;
    }
    if (count > 0) exemptionsUsed[literal] = count;
  }

  const violations = [];
  for (const m of text.matchAll(/\d[\d.,]*/g)) {
    const start = m.index;
    const end = start + m[0].length;
    let uncovered = false;
    for (let i = start; i < end; i += 1) {
      if (/\d/.test(text[i]) && !mask[i]) {
        uncovered = true;
        break;
      }
    }
    if (uncovered) {
      violations.push({
        block: block.id ?? null,
        value: m[0],
        index: start,
        context: excerpt(text, start, end),
      });
    }
  }

  const unusedAllowDigits = (block.allow_digits ?? []).filter((l) => !exemptionsUsed[l]);
  return { ok: violations.length === 0, violations, exemptionsUsed, unusedAllowDigits };
}

function excerpt(text, start, end, pad = 40) {
  const from = Math.max(0, start - pad);
  const to = Math.min(text.length, end + pad);
  return `${from > 0 ? '…' : ''}${text.slice(from, to).replace(/\s+/g, ' ')}${
    to < text.length ? '…' : ''
  }`;
}

// ---------------------------------------------------------------------------
// Gate (c): approval
// ---------------------------------------------------------------------------

/** Generated-tier blocks are excluded from assembly until a human approves them. */
export function checkApproval(block) {
  const state = block.approval?.state ?? 'draft';
  if (block.tier === 'generated' && state !== 'approved') {
    return {
      included: false,
      state,
      reason: `generated-tier block is ${state}; excluded from assembly pending human approval`,
    };
  }
  if (state !== 'approved') {
    return {
      included: true,
      state,
      reason: null,
      warning: `${block.tier} block is ${state} but is not gated by tier`,
    };
  }
  return { included: true, state, reason: null };
}

// ---------------------------------------------------------------------------
// Whole-library gate run
// ---------------------------------------------------------------------------

/**
 * Run all three gates over a set of blocks.
 * Returns a report object embedded verbatim in csr.json under `gates`.
 */
export function runGates(blocks, ards, context = {}) {
  const perBlock = [];
  const structural = [];
  const resolutionErrors = [];
  const crossReferenceErrors = [];
  const valueBindingErrors = [];
  const fidelityViolations = [];
  const excluded = [];
  const warnings = [];

  for (const block of blocks) {
    if (block.errors?.length) {
      structural.push(...block.errors.map((e) => `${block.id}: ${e}`));
    }
    const rendered = renderBlock(block, ards, context);
    const fidelity = checkNumericFidelity(rendered, block);
    const approval = checkApproval(block);

    resolutionErrors.push(...rendered.errors);
    crossReferenceErrors.push(...rendered.xrefErrors);
    valueBindingErrors.push(...(rendered.valueErrors ?? []));
    warnings.push(...rendered.warnings);
    if (approval.warning) warnings.push(`${block.id}: ${approval.warning}`);
    fidelityViolations.push(...fidelity.violations);
    if (!approval.included) excluded.push({ id: block.id, reason: approval.reason });

    // A block may only bind displays it declares (keeps `displays:` honest — the
    // assembler and the site use it to build the traceability graph).
    const undeclared = [
      ...new Set(
        rendered.bindings
          .filter((b) => b.display && !(block.displays ?? []).includes(b.display))
          .map((b) => b.display)
      ),
    ];
    if (undeclared.length) {
      resolutionErrors.push(
        `${block.id}: binds undeclared display(s) ${undeclared.join(', ')} — add them to frontmatter displays`
      );
    }

    perBlock.push({
      id: block.id,
      tier: block.tier,
      e3_section: block.e3_section,
      approval: block.approval,
      included: approval.included,
      exclusionReason: approval.reason,
      bindings: rendered.bindings.length,
      unresolvedBindings: rendered.bindings.filter((b) => !b.resolved).length,
      crossReferences: rendered.xrefs.length,
      unresolvedCrossReferences: rendered.xrefs.filter((x) => !x.resolved).length,
      valueBindings: rendered.values.length,
      unresolvedValueBindings: rendered.values.filter((v) => !v.resolved).length,
      numericFidelity: fidelity.ok,
      violations: fidelity.violations,
      exemptionsUsed: fidelity.exemptionsUsed,
      unusedAllowDigits: fidelity.unusedAllowDigits,
      undeclaredDisplays: undeclared,
    });
  }

  return {
    structure: { ok: structural.length === 0, errors: structural },
    bindingResolution: { ok: resolutionErrors.length === 0, errors: resolutionErrors },
    crossReferences: { ok: crossReferenceErrors.length === 0, errors: crossReferenceErrors },
    valueBindings: { ok: valueBindingErrors.length === 0, errors: valueBindingErrors },
    numericFidelity: { ok: fidelityViolations.length === 0, violations: fidelityViolations },
    approval: { ok: true, excluded },
    warnings,
    blocks: perBlock,
    ok:
      structural.length === 0 &&
      resolutionErrors.length === 0 &&
      crossReferenceErrors.length === 0 &&
      valueBindingErrors.length === 0 &&
      fidelityViolations.length === 0,
  };
}

/** Markdown -> HTML for assembled prose. Local only; marked adds no network calls. */
export function renderMarkdown(text) {
  return marked.parse(text, { async: false, mangle: false, headerIds: false });
}
