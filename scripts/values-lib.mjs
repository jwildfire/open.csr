/**
 * values-lib.mjs — the values store: named numbers with provenance, and the gate
 * that keeps them honest (obot.roadmap #129 B).
 *
 * `library/values/values.yaml` declares a value — id, label, and either a binding
 * address into a committed ARD or an arithmetic over other values. The R pipeline
 * resolves those declarations into `outputs/values/values.json`. Nothing here
 * writes: this module READS the generated store, binds `{{value:<id>}}` tokens
 * from prose, and re-derives every value from the committed ARDs so a store that
 * has drifted fails the build.
 *
 * Why re-derive rather than trust the store? Because the store is a generated
 * artifact committed to the repository, and the whole D7 argument — prose may
 * never state a number — collapses if the artifact prose binds to can go stale
 * silently. A value whose ARD row has changed underneath it is exactly a stale
 * inline number wearing a name, and it fails the same way.
 *
 * The derivation vocabulary is closed (`sum`, `difference`, `ratio`, `percent`)
 * precisely so this module can evaluate it without running the pipeline's R.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { parseBindingAddress, resolveBinding, roundHalfUp } from './text-lib.mjs';

export const VALUES_SCHEMA = 'opencsr/values/v1';
export const VALUE_OPS = ['sum', 'difference', 'ratio', 'percent'];

/** `{{value:<id>}}` — the prose token. Ids are kebab-case names, never addresses. */
export const VALUE_RE = /\{\{value:([a-z0-9][a-z0-9-]*)\}\}/g;

/** Read `outputs/values/values.json`. Returns null when the pipeline has never run. */
export function loadValueStore(rootDir, file = path.join('outputs', 'values', 'values.json')) {
  const full = path.isAbsolute(file) ? file : path.join(rootDir, file);
  if (!existsSync(full)) return null;
  const store = JSON.parse(readFileSync(full, 'utf8'));
  if (!Array.isArray(store.values)) {
    throw new Error(`${file}: values must be an array`);
  }
  return store;
}

/** Map id -> value entry, in declaration order. */
export function valueIndex(store) {
  return new Map((store?.values || []).map((entry) => [entry.id, entry]));
}

/** Render a value for prose: `scale` then `digits`, half-up — the R formatter's rule. */
export function formatStoredValue(value, format = {}) {
  const scale = Number(format.scale ?? 1);
  const digits = Number(format.digits ?? 0);
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value ?? '');
  return roundHalfUp(value * scale, digits).toFixed(digits);
}

/** Evaluate a declared derivation over already-resolved inputs. */
export function applyValueOp(op, inputs) {
  switch (op) {
    case 'sum':
      return inputs.reduce((total, x) => total + x, 0);
    case 'difference':
      return inputs[0] - inputs[1];
    case 'ratio':
      return inputs[0] / inputs[1];
    case 'percent':
      return (100 * inputs[0]) / inputs[1];
    default:
      throw new Error(`unknown value operation "${op}"`);
  }
}

/** sha256 of a file's bytes, in the `sha256:<hex>` shape the R pipeline writes. */
export function hashFile(file) {
  return `sha256:${createHash('sha256').update(readFileSync(file)).digest('hex')}`;
}

// Floating point: a proportion round-trips through JSON as a decimal, so an
// exact === would report drift that does not exist. Anything larger than this is
// a real difference, not a representation one.
const TOLERANCE = 1e-9;

/**
 * The values gate: does every value still equal what it claims to come from?
 *
 * Four ways a value fails, all of them the same failure in different clothes —
 * the name no longer stands for the number:
 *   - its address resolves to no ARD row, or to more than one (the ARD moved);
 *   - the ARD row's statistic differs from the stored value (the number moved);
 *   - the ARD it cites is not the ARD in the repository (the iteration moved);
 *   - a derived value no longer equals its own declared arithmetic.
 *
 * @param store    the parsed values.json
 * @param ards     Map<slug, ard> of the committed ARDs the report is built from
 * @param ardHashes optional Map<slug, 'sha256:…'> of those ARD files, enabling
 *                  the iteration check; omitted, that check is skipped rather
 *                  than guessed at
 */
export function checkValueStore(store, ards, ardHashes = null) {
  const violations = [];
  const resolved = new Map();

  if (!store) {
    return { ok: true, checked: 0, violations, skipped: 'no values store' };
  }
  if (store.schema !== VALUES_SCHEMA) {
    violations.push({
      id: null,
      kind: 'schema',
      message: `values store declares schema "${store.schema}"; expected ${VALUES_SCHEMA}`
    });
    return { ok: false, checked: 0, violations };
  }

  for (const entry of store.values) {
    if (entry.kind === 'derived') {
      const inputs = entry.derivation?.inputs || [];
      const missing = inputs.filter((id) => !resolved.has(id));
      if (missing.length) {
        violations.push({
          id: entry.id,
          kind: 'derivation',
          message: `derives from ${missing.join(', ')}, which is not defined before it`
        });
        continue;
      }
      let recomputed;
      try {
        recomputed = applyValueOp(entry.derivation.op, inputs.map((id) => resolved.get(id)));
      } catch (err) {
        violations.push({ id: entry.id, kind: 'derivation', message: err.message });
        continue;
      }
      if (Math.abs(recomputed - Number(entry.value)) > TOLERANCE) {
        violations.push({
          id: entry.id,
          kind: 'stale',
          message:
            `derived value is ${entry.value} but ${entry.derivation.op} of ` +
            `${inputs.join(', ')} is ${recomputed}`
        });
      }
      resolved.set(entry.id, Number(entry.value));
      continue;
    }

    const address = entry.source?.address;
    if (!address) {
      violations.push({ id: entry.id, kind: 'declaration', message: 'no source address' });
      continue;
    }
    let match;
    try {
      match = resolveBinding(parseBindingAddress(address), ards);
    } catch (err) {
      violations.push({ id: entry.id, kind: 'address', message: err.message });
      continue;
    }
    if (!match.ok) {
      violations.push({ id: entry.id, kind: 'orphaned', message: match.error });
      continue;
    }
    const live = Array.isArray(match.value) ? NaN : Number(match.value);
    if (!(Math.abs(live - Number(entry.value)) <= TOLERANCE)) {
      violations.push({
        id: entry.id,
        kind: 'stale',
        message: `stored value ${entry.value} but ${address} now resolves to ${match.value}`
      });
    }
    const expected = formatStoredValue(Number(entry.value), entry.format || {});
    if (entry.formatted !== expected) {
      violations.push({
        id: entry.id,
        kind: 'formatting',
        message: `formatted as "${entry.formatted}" but the declared format renders "${expected}"`
      });
    }
    if (ardHashes) {
      const committed = ardHashes.get?.(entry.source.display) ?? ardHashes[entry.source.display];
      if (committed && entry.source.ard_hash && committed !== entry.source.ard_hash) {
        violations.push({
          id: entry.id,
          kind: 'iteration',
          message:
            `cites ${entry.source.ard_file} (${entry.source.ard_hash.slice(0, 14)}…) but the ` +
            `committed ARD for ${entry.source.display} hashes ${committed.slice(0, 14)}… — ` +
            'regenerate the values store'
        });
      }
    }
    resolved.set(entry.id, Number(entry.value));
  }

  return { ok: violations.length === 0, checked: store.values.length, violations };
}

/**
 * Which blocks bind which values — the reverse index the Values surface shows,
 * so a value can say where it is used before anyone changes it.
 */
export function valueUsage(blocks = []) {
  const usage = new Map();
  for (const block of blocks) {
    for (const match of String(block.body ?? '').matchAll(VALUE_RE)) {
      const id = match[1];
      if (!usage.has(id)) usage.set(id, []);
      if (!usage.get(id).includes(block.id)) usage.get(id).push(block.id);
    }
  }
  return usage;
}
