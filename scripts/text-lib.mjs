/**
 * text-lib.mjs — the Text Library's node face: block files on disk, ARD files on
 * disk, markdown rendering, and the gates.
 *
 * The gates themselves are NOT here. Binding grammar, ARD resolution, value
 * formatting, token substitution and all three gates of contracts.md §6 live in
 * [`site/demo/text-core.js`](../site/demo/text-core.js), which imports nothing and
 * is loaded unbundled by the browser as well as by node. That split exists so the
 * Demo app's text editor (#113 increment B) can check an edit against the same
 * gate code the build runs — a second implementation in the browser would let an
 * edit pass as you type and fail in CI.
 *
 * This module is the file-system half: `parseBlock` / `loadTextLibrary` /
 * `loadArd` read the repository, `renderMarkdown` needs `marked`. Everything pure
 * is re-exported below, so every existing importer of text-lib keeps working and
 * there is exactly one implementation of each gate in the repository.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';

import { validateBlock } from '../site/demo/text-core.js';

export {
  APPROVAL_STATES,
  QUALIFIER_KEYS,
  TIERS,
  checkApproval,
  checkNumericFidelity,
  formatValue,
  matchRows,
  parseBindingAddress,
  renderBlock,
  resolveBinding,
  resolveXref,
  roundHalfUp,
  runGates,
  tokenRe,
  validateBlock,
} from '../site/demo/text-core.js';

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
// ARD loading
// ---------------------------------------------------------------------------

/** Read an ard.json from disk (contracts.md §5). */
export function loadArd(path) {
  const ard = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(ard.rows)) throw new Error(`${path}: ard.rows must be an array`);
  return ard;
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

/** Markdown -> HTML for assembled prose. Local only; marked adds no network calls. */
export function renderMarkdown(text) {
  return marked.parse(text, { async: false, mangle: false, headerIds: false });
}
