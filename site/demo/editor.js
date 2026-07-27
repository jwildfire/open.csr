// The text-block editor's DOM wiring (open.csr #113 increment B).
//
// Every rule worth testing is in editor-core.js and text-core.js; this file is
// the browser plumbing that connects a textarea to them. The division is the same
// one client.js draws: logic is unit-tested, wiring is verified in the browser.
//
// The one thing this file does that is not plumbing is fetch: a display's ARD is
// pulled from `ard/<slug>.json` — a build artifact, same origin, no external host
// — the first time a block that binds it is opened. The AE-by-SOC/PT ARD alone is
// 3,048 rows, so loading every ARD into every visit of the Demo page to support a
// feature most visitors will not open would be a poor trade. The editor stays shut
// until asked, then loads exactly what that block needs.
//
// Nothing here writes, posts, stores or approves. The output is a patch, on the
// clipboard or in the downloads folder.

import {
  composePatch,
  evaluateDraft,
  patchFilename,
  previewSegments,
  unifiedDiff
} from './editor-core.js';

const ardCache = new Map();

/** Fetch a display's published ARD once, and remember the answer — including failure. */
async function loadArd(slug) {
  if (ardCache.has(slug)) return ardCache.get(slug);
  const pending = fetch(`ard/${slug}.json`, { cache: 'force-cache' })
    .then((response) => {
      if (!response.ok) throw new Error(`${response.status}`);
      return response.json();
    })
    .catch(() => null);
  ardCache.set(slug, pending);
  return pending;
}

function escape(text) {
  return String(text).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );
}

// The preview is deliberately NOT a markdown renderer. Paragraphs and the marked
// spans are what a writer is checking here — whether the sentence reads right and
// which of its numbers are computed — and shipping a markdown parser to the
// browser to italicise a word would be a dependency the site does not otherwise
// have. The assembled document is where markdown is rendered, by `marked`, in the
// pipeline.
const SEGMENT_CLASS = {
  bound: 'tbe-bound',
  xref: 'tbe-xref',
  violation: 'tbe-violation'
};

function renderPreview(result) {
  const segments = previewSegments(result.text, result.spans, result.violations);
  const paragraphs = [[]];
  for (const segment of segments) {
    const parts = segment.text.split(/\n{2,}/);
    parts.forEach((part, index) => {
      if (index > 0) paragraphs.push([]);
      if (part !== '') paragraphs[paragraphs.length - 1].push({ ...segment, text: part });
    });
  }
  return paragraphs
    .filter((paragraph) => paragraph.length)
    .map(
      (paragraph) =>
        `<p>${paragraph
          .map((segment) => {
            const html = escape(segment.text).replace(/\n/g, ' ');
            const className = SEGMENT_CLASS[segment.kind];
            if (!className) return html;
            const title =
              segment.kind === 'violation'
                ? 'This number did not come from a binding — the numeric-fidelity gate fails it'
                : segment.kind === 'xref'
                  ? 'Cross-reference, resolved at assembly'
                  : 'Computed from the committed ARD';
            return `<span class="${className}" title="${escape(title)}">${html}</span>`;
          })
          .join('')}</p>`
    )
    .join('');
}

function renderGate(result, { ardsMissing = [] } = {}) {
  const problems = [
    ...result.errors.map((message) => ({ kind: 'error', message })),
    ...result.xrefErrors.map((message) => ({ kind: 'error', message })),
    ...result.violations.map((violation) => ({
      kind: 'error',
      message: `numeric fidelity: “${violation.value}” in prose came from no binding — ${violation.context}`
    })),
    ...result.warnings.map((message) => ({ kind: 'warn', message }))
  ];

  const resolved = result.bindings.filter((binding) => binding.resolved).length;
  const summary = result.ok
    ? `<span class="tbe-verdict good">Gates pass</span>`
    : `<span class="tbe-verdict bad">Gates fail</span>`;
  const counts =
    `<span class="tbe-count">${resolved}/${result.bindings.length} bindings resolved</span>` +
    `<span class="tbe-count">${result.violations.length} fidelity violation` +
    `${result.violations.length === 1 ? '' : 's'}</span>`;

  const missing = ardsMissing.length
    ? `<li class="warn">ARD not loaded for ${escape(ardsMissing.join(', '))} — bindings to it ` +
      `cannot be checked in the browser. The build still checks them.</li>`
    : '';

  const list = problems.length
    ? `<ul class="tbe-problems">${problems
        .map((problem) => `<li class="${problem.kind}">${escape(problem.message)}</li>`)
        .join('')}${missing}</ul>`
    : missing
      ? `<ul class="tbe-problems">${missing}</ul>`
      : `<p class="sub">Every number in this prose came from the ARD.</p>`;

  return `<div class="tbe-verdict-row">${summary}${counts}</div>${list}`;
}

function renderDiff(patch) {
  if (!patch) {
    return `<p class="sub">No change yet — the prose matches the committed source.</p>`;
  }
  const rows = patch
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const kind = line.startsWith('+++') || line.startsWith('---')
        ? 'file'
        : line.startsWith('@@')
          ? 'hunk'
          : line.startsWith('+')
            ? 'add'
            : line.startsWith('-')
              ? 'remove'
              : line.startsWith('\\')
                ? 'note'
                : 'context';
      return `<div class="tbe-diff-line ${kind}">${escape(line)}</div>`;
    })
    .join('');
  return `<div class="tbe-diff-body">${rows}</div>`;
}

function attach(section, context) {
  const meta = JSON.parse(section.getAttribute('data-editor-meta') || '{}');
  const file = section.getAttribute('data-editor-file') || meta.file || '';
  const startLine = Number(section.getAttribute('data-editor-line') || 1);
  const slugs = (section.getAttribute('data-editor-ards') || '').split(/\s+/).filter(Boolean);

  const toggle = section.querySelector('[data-editor-toggle]');
  const panel = section.querySelector('[data-editor-panel]');
  const source = section.querySelector('[data-editor-source]');
  const preview = section.querySelector('[data-editor-preview]');
  const gate = section.querySelector('[data-editor-gate]');
  const review = section.querySelector('[data-editor-review]');
  const diff = section.querySelector('[data-editor-diff]');
  const status = section.querySelector('[data-editor-status]');
  if (!toggle || !panel || !source || !preview || !gate) return;

  // The server-rendered value. The DOM keeps it whatever the writer types, so it
  // is the diff baseline and the revert target with nothing to keep in sync.
  const committed = source.defaultValue;
  const ards = {};
  let missing = [];
  let loaded = false;

  function evaluateNow() {
    const body = source.value;
    const result = evaluateDraft({ meta, body, ards, context });
    preview.innerHTML = renderPreview(result);
    gate.innerHTML = renderGate(result, { ardsMissing: missing });
    section.classList.toggle('gates-fail', !result.ok);

    const patch = unifiedDiff(file, committed, body, { startLine });
    diff.innerHTML = renderDiff(patch);
    review.hidden = false;
    const changed = Boolean(patch);
    for (const button of section.querySelectorAll('[data-editor-copy],[data-editor-download]')) {
      button.disabled = !changed;
    }
    section.querySelector('[data-editor-revert]').disabled = !changed;
    if (!changed && status) status.textContent = '';
    section.dataset.editorChanged = changed ? 'true' : 'false';
    return { result, patch, body };
  }

  function say(message) {
    if (!status) return;
    status.textContent = message;
  }

  async function open() {
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    toggle.textContent = 'Close editor';
    if (!loaded) {
      loaded = true;
      gate.innerHTML = `<p class="sub">Loading the ARDs this block binds…</p>`;
      const results = await Promise.all(slugs.map((slug) => loadArd(slug)));
      missing = slugs.filter((slug, index) => !results[index]);
      slugs.forEach((slug, index) => {
        if (results[index]) ards[slug] = results[index];
      });
    }
    evaluateNow();
    source.focus({ preventScroll: true });
  }

  function close() {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = 'Edit';
  }

  toggle.addEventListener('click', () => {
    if (panel.hidden) open();
    else close();
  });

  source.addEventListener('input', () => {
    evaluateNow();
    say('');
  });

  section.querySelector('[data-editor-revert]')?.addEventListener('click', () => {
    source.value = committed;
    // Dispatched rather than handled directly so that "the text changed" has ONE
    // code path whoever changed it — the block re-evaluates and the pane-level
    // patch bar refreshes off the same event. Reverting used to notify the bar on
    // its own, and a bar that is one revert out of date is worse than no bar.
    source.dispatchEvent(new Event('input', { bubbles: true }));
    say('Reverted to the committed source.');
  });

  section.querySelector('[data-editor-copy]')?.addEventListener('click', async () => {
    const { patch } = evaluateNow();
    if (!patch) return;
    try {
      await navigator.clipboard.writeText(patch);
      say('Patch copied — apply it with git apply.');
    } catch {
      // Clipboard permission is a browser decision, not an error worth hiding:
      // select the diff so the writer can copy it by hand.
      const range = document.createRange();
      range.selectNodeContents(diff);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      say('Clipboard unavailable — the patch is selected, copy it with ⌘C / Ctrl-C.');
    }
  });

  section.querySelector('[data-editor-download]')?.addEventListener('click', () => {
    const { patch } = evaluateNow();
    if (!patch) return;
    const blob = new Blob([patch], { type: 'text/x-patch' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = patchFilename([file]);
    link.click();
    URL.revokeObjectURL(url);
    say(`Saved ${link.download}.`);
  });

  section.hidden = false;
}

/**
 * Wire every editor on the page and expose a whole-pane patch.
 *
 * A writer who fixed three sentences wants one patch, not three: `composePatch`
 * concatenates a file section per changed block, and the pane-level control below
 * appears only once something has actually changed.
 */
export function initEditors(root = document) {
  const sections = [...root.querySelectorAll('[data-editor]')];
  if (!sections.length) return;

  const all = root.querySelector('[data-editor-all]');
  // The xref indices are per-page, not per-block: the display numbers assigned at
  // assembly and the E3 section model. Without them the editor would report every
  // {{xref:…}} in the shipped library as unresolved and claim the gates fail on
  // prose that CI accepts — stricter than the build is as dishonest as looser.
  let context = {};
  try {
    context = JSON.parse(all?.getAttribute('data-editor-context') || '{}');
  } catch {
    context = {};
  }

  for (const section of sections) attach(section, context);

  if (!all) return;
  const button = all.querySelector('[data-editor-all-download]');
  const label = all.querySelector('[data-editor-all-status]');

  function edits() {
    return sections
      .map((section) => {
        const source = section.querySelector('[data-editor-source]');
        return {
          file: section.getAttribute('data-editor-file'),
          before: source.defaultValue,
          after: source.value,
          startLine: Number(section.getAttribute('data-editor-line') || 1)
        };
      })
      .filter((edit) => edit.before !== edit.after);
  }

  function refresh() {
    const composed = composePatch(edits());
    all.hidden = composed.empty;
    if (composed.empty) return;
    label.textContent =
      `${composed.files.length} block${composed.files.length === 1 ? '' : 's'} changed · ` +
      `+${composed.added} −${composed.removed}`;
  }

  root.addEventListener('input', (event) => {
    if (event.target.matches('[data-editor-source]')) refresh();
  });

  button?.addEventListener('click', () => {
    const composed = composePatch(edits());
    if (composed.empty) return;
    const blob = new Blob([composed.patch], { type: 'text/x-patch' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = patchFilename(composed.files);
    link.click();
    URL.revokeObjectURL(url);
  });

  refresh();
}
