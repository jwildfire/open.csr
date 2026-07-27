// The text-block editor's server side (open.csr #113 increment B).
//
// The Demo app's Text pane has been a status view: where every block stands,
// read-only. This module adds the first editing verb — edit the prose, watch the
// bindings resolve against the committed ARD, watch the numeric-fidelity gate as
// you type, and take away a **diff against version-controlled source**.
//
// What this module does NOT do is as load-bearing as what it does:
//
//   * It renders no approval control. In-app sign-off was built and deferred on
//     2026-07-25 (design §12); the approval gate stays where it is — frontmatter,
//     applied by the pipeline. The editor edits the BODY of a block and preserves
//     its frontmatter byte-for-byte, so an edit made in a browser cannot approve a
//     block, change its tier or widen its digit allowlist.
//   * It posts nowhere. There is no endpoint, no token, no credential, no
//     workflow dispatch. The editor's output is a patch on the clipboard or in the
//     downloads folder, applied by a human with `git apply` in a repository where
//     it can be reviewed. That is design D9 — agents (and now browsers) write
//     source; the pipeline regenerates; humans approve.
//
// Why prose editing is the increment that comes first: it needs no runtime.
// Resolving `{{ard:…}}` is a lookup in JSON the build already publishes, and the
// fidelity gate is string arithmetic, so a browser can be numerically faithful
// with no R, no webR and no server. Editing a *spec* would require re-running the
// pipeline; that regeneration round-trip is an open design question and is
// deliberately not attempted here.
//
// The pane degrades honestly: everything below is rendered `hidden` and revealed
// by site/demo/editor.js. With JavaScript off, the Text pane is exactly the
// read-only status view it was before this module existed.

import { bodyStartLine, splitFrontmatter } from '../site/demo/editor-core.js';
import { escapeHtml } from './site-lib.mjs';

// Fields binding resolution and the binding table actually read. The published
// ARD payload carries these and nothing else: the AE-by-SOC/PT ARD is 3,048 rows
// and 1.2 MB on disk, and half of that is provenance the editor never looks at.
// Rows are NOT filtered — only their columns are — because dropping rows would
// change what "ambiguous binding: N rows match" means, and the browser has to
// count exactly what CI counts.
const ARD_ROW_FIELDS = [
  'analysis',
  'group1',
  'group1_level',
  'group2',
  'group2_level',
  'variable',
  'variable_level',
  'stat_name',
  'stat_label',
  'stat',
  'warning',
  'error'
];

/** The browser-facing form of an ARD: same rows, only the columns resolution reads. */
export function ardPayload(ard = {}) {
  return {
    display: ard.display ?? null,
    created: ard.created ?? null,
    rows: (ard.rows || []).map((row) => {
      const out = {};
      for (const field of ARD_ROW_FIELDS) {
        if (row[field] !== undefined) out[field] = row[field];
      }
      return out;
    })
  };
}

/** Where the editor fetches a display's ARD from, relative to the Demo page. */
export function ardUrl(slug) {
  return `ard/${slug}.json`;
}

/**
 * The frontmatter the browser is given rather than parsing.
 *
 * The editor needs the declared displays (to report an undeclared binding as the
 * build does) and `allow_digits` (to apply the same exemptions), and nothing else.
 * Handing those over as data means no YAML parser ships to the browser and the
 * editor cannot disagree with the build about what the frontmatter says.
 */
export function editorMeta(block) {
  return {
    id: block.id,
    file: block.file,
    tier: block.tier || null,
    displays: block.displays || [],
    allow_digits: block.allowDigits || block.allow_digits || []
  };
}

/** Every display whose ARD the editor may need for a block, in fetch order. */
export function editorDisplays(block, available = []) {
  const declared = (block.displays || []).filter((slug) => available.includes(slug));
  return [...new Set(declared)];
}

function attr(value) {
  return escapeHtml(typeof value === 'string' ? value : JSON.stringify(value));
}

/**
 * The editor for one block, rendered hidden.
 *
 * `source` is the block's committed file content. Only its **body** reaches the
 * browser: the textarea is seeded with the body, and `data-editor-line` says where
 * that body starts in the file so the client can offset its hunks. The frontmatter
 * is not sent at all, which is what makes "an edit cannot change the approval
 * state" structural rather than a rule the UI is trusted to follow.
 *
 * The textarea's server-rendered value doubles as the diff baseline: the DOM keeps
 * `defaultValue` unchanged however much the writer types, so the committed text
 * survives an edit, a revert and a second edit with nothing else to keep in sync.
 */
export function renderBlockEditor(block, { source = '', displays = [] } = {}) {
  if (!block?.exists) return '';
  const meta = editorMeta(block);
  const id = String(block.id);
  const field = `tbe-source-${id.toLowerCase()}`;
  const split = splitFrontmatter(source);
  const startLine = bodyStartLine(source);

  return (
    `<section class="tb-edit" data-editor="${attr(id)}" data-editor-file="${attr(block.file)}" ` +
    `data-editor-meta="${attr(meta)}" data-editor-ards="${attr(displays.join(' '))}" ` +
    `data-editor-line="${startLine}" hidden>` +
    `<div class="tbe-bar">` +
    `<h3 class="rb-h">Edit the prose</h3>` +
    `<p class="sub">Bindings resolve against the committed ARD as you type, and the ` +
    `numeric-fidelity gate runs on every keystroke. The result is a patch — the editor ` +
    `writes nothing.</p>` +
    `<button type="button" class="tbe-toggle" data-editor-toggle aria-expanded="false" ` +
    `aria-controls="${attr(`tbe-panel-${id.toLowerCase()}`)}">Edit</button>` +
    `</div>` +
    `<div class="tbe-panel" id="${attr(`tbe-panel-${id.toLowerCase()}`)}" data-editor-panel hidden>` +
    `<div class="tbe-grid">` +
    `<div class="tbe-pane">` +
    `<label class="tbe-label" for="${attr(field)}">Block source ` +
    `<span class="sub">${escapeHtml(block.file)} — frontmatter is not editable here</span></label>` +
    `<textarea class="tbe-source" id="${attr(field)}" data-editor-source spellcheck="true" ` +
    `rows="18">${escapeHtml(split.body)}</textarea>` +
    `</div>` +
    `<div class="tbe-pane">` +
    `<h4 class="tbe-label">As it will read</h4>` +
    `<div class="prose tbe-preview" data-editor-preview></div>` +
    `<p class="sub">Marked values are computed from the ARD. A number the gate cannot ` +
    `account for is marked as a failure where it appears.</p>` +
    `</div>` +
    `</div>` +
    `<div class="tbe-gate" data-editor-gate role="status" aria-live="polite"></div>` +
    `<div class="tbe-review" data-editor-review hidden>` +
    `<h4 class="tbe-label">Review the change</h4>` +
    `<div class="tbe-diff" data-editor-diff></div>` +
    `<div class="tbe-actions">` +
    `<button type="button" class="tbe-action" data-editor-copy>Copy patch</button>` +
    `<button type="button" class="tbe-action" data-editor-download>Download patch</button>` +
    `<button type="button" class="tbe-action tbe-quiet" data-editor-revert>Revert to committed</button>` +
    `<span class="tbe-status" data-editor-status></span>` +
    `</div>` +
    `<p class="sub">Apply it in a clone with <code>git apply &lt;file&gt;</code>, commit it, and ` +
    `let the pipeline regenerate. Nothing is written from the browser: an edit becomes a ` +
    `reviewable source change or it does not happen (design D9).</p>` +
    `</div>` +
    `</div>` +
    `</section>`
  );
}

/**
 * The cross-reference indices the editor resolves `{{xref:…}}` against.
 *
 * Without these the editor is *stricter* than the build — every `{{xref:section:12}}`
 * in the shipped library reports as unresolved and a writer is told the gates fail
 * on prose that CI is perfectly happy with. Being stricter than CI is as
 * disqualifying as being more permissive: either way the editor is not telling the
 * truth about what will happen when the patch is applied.
 *
 * Display numbers come from the assembled document, where they were assigned;
 * sections come from the E3 model. Both are small — sixteen sections and six
 * displays — so they ride in the page rather than being fetched.
 */
export function editorContext({ template = null, displays = [], csr = null } = {}) {
  const numbers = new Map(
    (csr?.json?.displayIndex || []).map((entry) => [entry.slug, entry.number])
  );
  return {
    displayIndex: Object.fromEntries(
      displays.map((display) => [
        display.slug,
        {
          number: numbers.get(display.slug) || null,
          type: display.type || 'table',
          title: display.title || display.slug
        }
      ])
    ),
    sectionIndex: Object.fromEntries(
      (template?.sections?.sections || []).map((section) => [
        String(section.number),
        { title: section.title || '' }
      ])
    )
  };
}

/**
 * The pane-level patch bar: one patch for everything edited in this visit.
 *
 * A writer who fixed three sentences wants one reviewable change, not three
 * downloads. The bar renders hidden and the client shows it the moment any block
 * differs from its committed source — so a page with nothing edited on it looks
 * exactly as it did before the editor existed.
 */
export function renderEditorBar({ context = null } = {}) {
  return (
    `<div class="tbe-all" data-editor-all ` +
    (context ? `data-editor-context="${attr(context)}" ` : '') +
    `hidden>` +
    `<span class="tbe-all-label" data-editor-all-status></span>` +
    `<button type="button" class="tbe-action" data-editor-all-download>` +
    `Download one patch for every change</button>` +
    `</div>`
  );
}

/**
 * The one-paragraph explanation the pane carries above the blocks once editing is
 * available. It replaces nothing: the status view's own "approval is data, not a
 * button" note still stands, and this says what the new control is *for*.
 */
export function editorIntro() {
  return (
    `<p class="callout">The prose is <strong>editable here</strong>. Open a block's editor and ` +
    `every binding resolves live against the committed ARD while the numeric-fidelity gate ` +
    `checks each keystroke — the same gate code the build runs, not a second implementation of ` +
    `it. What comes out is a <strong>patch against the block's source file</strong>, to apply in ` +
    `a clone and commit. The browser writes nothing and approves nothing: tier, approval state ` +
    `and the digit allowlist are frontmatter, and the editor leaves them exactly as it found ` +
    `them.</p>`
  );
}
