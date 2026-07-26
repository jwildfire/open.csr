// The Demo surface: one app, four panes, one selection (open.csr #113 A).
//
// v0 published separate browsing surfaces — a TFL gallery, a CSR reader and a
// text library — each true, none of them the product. This module folds them
// into a single Demo app: Reader · Tables · Text · Templates, sharing a
// selection so that clicking a display in the report opens the table behind it,
// and clicking a bound number opens the ARD row it came from.
//
// The Reader and Tables panes are the EXISTING renderers' output, unmodified.
// Nothing here re-implements them; the app is tab chrome plus a link-interception
// rule (site/demo/core.js). That is what keeps those panes and their standalone
// permalinks from drifting apart — they are the same HTML.
//
// The Text and Templates panes are rendered here rather than absorbed. The Text
// pane is the status view of the prose library (scripts/text-status-lib.mjs) —
// where every block stands, read-only; the standalone /text/ catalogue page is a
// different surface (site-lib.mjs) and remains the per-block permalink. The
// Templates pane renders the E3 document model, which v0 had no surface for.

import { chip, empty, escapeHtml } from './site-lib.mjs';
import { DISPLAY_TYPE_LABELS, assignDisplayNumbers } from './template-lib.mjs';

// Each view's `href` is its standalone permalink. The client upgrades a click
// into an in-place pane switch through the same interception rule the panes
// already use (site/demo/core.js), so with JavaScript off these are four working
// links to four working pages rather than four dead buttons (demo-layout.md §5).
export const APP_TABS = [
  { id: 'reader', label: 'Reader', href: '../reader/index.html' },
  { id: 'tables', label: 'Tables', href: '../gallery/index.html' },
  { id: 'text', label: 'Text', href: '../text/index.html' },
  { id: 'templates', label: 'Templates', href: '../templates/index.html' }
];

// ---------------------------------------------------------------------------
// Tab chrome
// ---------------------------------------------------------------------------

function viewLinks(tabs, active) {
  return tabs
    .map((tab) => {
      const on = tab.id === active;
      return (
        `<a class="app-view${on ? ' current' : ''}" href="${escapeHtml(tab.href || '#')}" ` +
        `id="app-tab-${tab.id}" aria-controls="app-pane-${tab.id}"` +
        `${on ? ' aria-current="page"' : ''} data-app-tab="${tab.id}">` +
        `${escapeHtml(tab.label)}</a>`
      );
    })
    .join('');
}

/**
 * The application strip: the four views, and where you are.
 *
 * The context readout is the one place this shell spends any boldness. A CSR is
 * a document in which everything carries a number and a provenance — section
 * 12.2.1, Table 14.3.1.3, `adae` at cut-off 2014-07-01, iteration v002, ARD
 * sha256:1a2b… — and the claim open.csr makes is that the chain from dataset to
 * sentence is always available. So identity lives in the chrome rather than
 * behind a properties dialog: study, then the assigned number, slug, iteration
 * and short ARD hash of whatever is selected, updated live by the client.
 *
 * Monospace because these are identifiers, not prose.
 *
 * @param {Array<{slug: string, number: string|null, title: string,
 *   version: string|null, ardHash: string|null}>} displays selection metadata
 */
export function renderAppBar({ config = {}, tabs = APP_TABS, active = null, displays = [] } = {}) {
  const study = config.study?.id || '';
  const context = Object.fromEntries(
    displays.map((entry) => [
      entry.slug,
      {
        number: entry.number || null,
        title: entry.title || entry.slug,
        version: entry.version || null,
        hash: entry.ardHash ? String(entry.ardHash).replace(/^sha256:/, '').slice(0, 7) : null
      }
    ])
  );

  return (
    `<div class="app-bar" data-app-bar>` +
    `<nav class="app-views" aria-label="Views">${viewLinks(tabs, active)}</nav>` +
    `<p class="app-context" data-app-context aria-live="polite">` +
    (study ? `<span class="ac-study">${escapeHtml(study)}</span>` : '') +
    `</p>` +
    `<script type="application/json" id="app-context-index">` +
    `${JSON.stringify({ study, displays: context }).replace(/</g, '\\u003c')}</script>` +
    `</div>`
  );
}

/**
 * Compose the Demo app page.
 *
 * Every pane is server-rendered and present in the HTML; the client only hides
 * the ones that are not current. With JavaScript off the first pane is visible
 * and the rest are reachable by their standalone URLs, so the page degrades to
 * something honest rather than to a blank shell.
 *
 * @param {object} options
 * @param {Array<{id: string, html: string}>} options.panes rendered pane content, in tab order
 */
export function renderAppPage({ config = {}, panes = [], tabs = APP_TABS, active = null } = {}) {
  const byId = new Map(panes.map((pane) => [pane.id, pane.html]));
  const shown = tabs.filter((tab) => byId.has(tab.id));
  const current = active && shown.some((tab) => tab.id === active) ? active : shown[0]?.id || null;

  // No page title and no lede: the demo page is not a page about the
  // application, it is the application, and content starts at the top of the
  // pane (demo-layout.md §1, §5). The views and the context live in the app bar
  // above `<main>`, rendered by renderAppBar.
  const body = shown
    .map((tab) => {
      const on = tab.id === current;
      return (
        `<section class="app-pane${on ? ' current' : ''}" role="tabpanel" ` +
        `id="app-pane-${tab.id}" aria-labelledby="app-tab-${tab.id}" ` +
        `data-app-pane="${tab.id}"${on ? '' : ' hidden'}>` +
        byId.get(tab.id) +
        `</section>`
      );
    })
    .join('\n');

  return (
    `<div class="app" data-app>` +
    body +
    `</div>\n` +
    `<script type="module" src="client.js"></script>`
  );
}

// ---------------------------------------------------------------------------
// Tables pane — the gallery and the six display pages, one at a time
// ---------------------------------------------------------------------------

/**
 * Wrap the existing per-display pages into a switchable pane with a picker.
 *
 * `renderDisplayPage` already returns a fragment, so the pane is a picker plus
 * those fragments — no display rendering is duplicated here. The pane is what
 * makes "click a display in the Reader" land somewhere.
 *
 * @param {Array<{slug: string, title: string, html: string, regulatoryId?: string,
 *   type?: string, status?: string, number?: string|null}>} entries
 */
export function renderTablesPane({ entries = [], selected = null } = {}) {
  if (!entries.length) {
    return (
      `<div class="app-tables">` +
      empty('No displays are registered yet — the gallery fills in as the pipeline generates them.') +
      `</div>`
    );
  }
  const current = entries.some((entry) => entry.slug === selected) ? selected : entries[0].slug;

  const picker = entries
    .map((entry) => {
      const on = entry.slug === current;
      return (
        `<button type="button" class="app-display-option${on ? ' current' : ''}" ` +
        `aria-pressed="${on ? 'true' : 'false'}" data-app-select-display="${escapeHtml(entry.slug)}">` +
        `<span class="ado-number">${escapeHtml(entry.number || entry.regulatoryId || entry.type || '')}</span>` +
        `<span class="ado-title">${escapeHtml(entry.title)}</span>` +
        `<span class="ado-slug mono">${escapeHtml(entry.slug)}</span>` +
        `</button>`
      );
    })
    .join('');

  const panels = entries
    .map(
      (entry) =>
        `<div class="app-display-panel" data-app-display-panel="${escapeHtml(entry.slug)}"` +
        `${entry.slug === current ? '' : ' hidden'}>${entry.html}</div>`
    )
    .join('\n');

  return (
    `<div class="app-tables">` +
    `<nav class="app-display-picker" aria-label="Displays">${picker}</nav>` +
    `<div class="app-display-stage">${panels}</div>` +
    `</div>`
  );
}

// ---------------------------------------------------------------------------
// Templates pane — the ICH E3 model, rendered for the first time
// ---------------------------------------------------------------------------

function sectionFill(section, slotsBySection, postBySection) {
  const slot = slotsBySection.get(section.number);
  const post = postBySection.get(section.number);
  const blocks = slot?.text || [];
  const displays = [...(slot?.displays || []), ...(post?.displays || [])];
  return { blocks, displays, populated: !!(blocks.length || displays.length) };
}

/**
 * The template model as data: what an E3 CSR is, what this report puts in it,
 * and which 14.x number each display was assigned.
 *
 * Numbers are **derived**, never read from this pane's own markup and never
 * authored (D6). `assignDisplayNumbers` in template-lib is the tested function
 * the assembler uses, so the pane and the document cannot disagree — and the
 * pane still renders correctly before the report has ever been assembled.
 *
 * @param {object} options
 * @param {{sections: object, assembly: object, dir: string}} options.template
 *   the loaded model — `sections` from `loadSections`, `assembly` from `loadAssembly`
 */
export function renderTemplatesPane({ config = {}, template = null, displays = [] } = {}) {
  const model = template?.sections;
  const assembly = template?.assembly;
  if (!model?.sections?.length) {
    return empty(
      'library/templates/ich-e3/sections.yaml is not in the repository yet — the template model ' +
        'renders once the E3 skeleton is committed.'
    );
  }

  const sections = model.sections;
  const slotsBySection = new Map((assembly?.slots || []).map((slot) => [String(slot.section), slot]));
  const postBySection = new Map((assembly?.postText || []).map((slot) => [String(slot.section), slot]));
  const assigned = assembly ? assignDisplayNumbers(assembly, model) : { numbers: new Map(), errors: [] };
  const typeBySlug = new Map(displays.map((display) => [display.slug, display.type]));
  const numbers = new Map(
    [...assigned.numbers].map(([slug, entry]) => [
      slug,
      { ...entry, label: DISPLAY_TYPE_LABELS[typeBySlug.get(slug)] || 'Display' }
    ])
  );
  const titles = new Map(displays.map((display) => [display.slug, display.title]));

  const filled = sections.filter(
    (section) => sectionFill(section, slotsBySection, postBySection).populated
  );

  const head =
    `<header class="page-head">` +
    `<p class="eyebrow">Report Template Library</p>` +
    `<h2>ICH E3 as data</h2>` +
    `<p class="lede">E3 has been unrevised since 1995 and no machine-readable model of it existed ` +
    `publicly; ICH M11 did this for protocols in November 2025. ` +
    `<span class="mono">sections.yaml</span> encodes the ${sections.length}-entry skeleton — number, ` +
    `title, slug and content model. <span class="mono">assembly.yaml</span> says what <em>this</em> ` +
    `report puts in it. Display numbers appear in neither: the assembler derives 14.x positions from ` +
    `assembly order, so reordering the report is a one-line diff and a display's identity never ` +
    `changes (design D6).</p>` +
    `</header>`;

  const stats =
    `<div class="stat-row">` +
    statTile(sections.length, 'E3 sections modelled', 'the full 16-section skeleton') +
    statTile(filled.length, 'populated in this demo', 'every other section renders as a marked gap') +
    statTile(numbers.size, 'displays numbered', 'assigned at assembly, not authored') +
    statTile(
      (assembly?.slots || []).length,
      'assembly slots configured',
      'text blocks and in-text displays'
    ) +
    `</div>`;

  const numbering = numbers.size
    ? `<section class="app-block"><h3>Assigned numbering</h3>` +
      `<p class="sub">Derived from <span class="mono">assembly.yaml</span> ` +
      `<span class="mono">post_text</span> order at build time. The slug is what the specs, the ARDs ` +
      `and the bindings all refer to — reorder the report and every number here moves while no ` +
      `spec, ARD or sentence changes at all.</p>` +
      `<div class="scroll"><table class="data"><thead><tr><th>Number</th><th>Display</th>` +
      `<th>Slug</th><th>Section</th></tr></thead><tbody>` +
      [...numbers]
        .map(
          ([slug, entry]) =>
            `<tr><td class="mono">${escapeHtml(`${entry.label} ${entry.number}`.trim())}</td>` +
            `<td><a href="../gallery/${escapeHtml(slug)}.html">` +
            `${escapeHtml(titles.get(slug) || slug)}</a></td>` +
            `<td class="mono">${escapeHtml(slug)}</td>` +
            `<td class="mono">${escapeHtml(entry.section || '')}</td></tr>`
        )
        .join('') +
      `</tbody></table></div></section>`
    : '';

  const rows = sections
    .map((section) => {
      const fill = sectionFill(section, slotsBySection, postBySection);
      const content = (section.content || []).length
        ? (section.content || []).map((kind) => chip(kind.replace(/_/g, ' '), 'neutral')).join(' ')
        : `<span class="muted">—</span>`;
      const blocks = fill.blocks.length
        ? fill.blocks
            .map(
              (id) =>
                `<a class="mono" href="../text/index.html#${escapeHtml(id)}">${escapeHtml(id)}</a>`
            )
            .join(' ')
        : '';
      const displayLinks = fill.displays.length
        ? fill.displays
            .map((slug) => {
              const number = numbers.get(slug);
              const label = number ? `${number.label} ${number.number}`.trim() : slug;
              return (
                `<a href="../gallery/${escapeHtml(slug)}.html" title="${escapeHtml(
                  titles.get(slug) || slug
                )}">${escapeHtml(label)}</a>`
              );
            })
            .join(' ')
        : '';
      const state = fill.populated
        ? chip('populated', 'good')
        : chip('not in this demo', 'neutral', 'The section is modelled but this report does not fill it');
      return (
        `<tr class="${fill.populated ? 'is-populated' : 'is-gap'}">` +
        `<td class="mono">${escapeHtml(section.number || '')}</td>` +
        `<td>${escapeHtml(section.title || '')}</td>` +
        `<td>${content}</td>` +
        `<td>${blocks || `<span class="muted">—</span>`}</td>` +
        `<td>${displayLinks || `<span class="muted">—</span>`}</td>` +
        `<td>${state}</td>` +
        `</tr>`
      );
    })
    .join('');

  const skeleton =
    `<section class="app-block"><h3>The E3 skeleton</h3>` +
    `<p class="sub">All ${sections.length} modelled sections, and what this report puts in each. ` +
    `Sections marked <em>not in this demo</em> still assemble, as headings that say so — the ` +
    `skeleton stays visible rather than being trimmed to what happens to be built.</p>` +
    `<div class="scroll"><table class="data e3-table"><thead><tr>` +
    `<th>§</th><th>Title</th><th>Content model</th><th>Text</th><th>Displays</th><th>State</th>` +
    `</tr></thead><tbody>${rows}</tbody></table></div></section>`;

  const provenance = assembly?.provenanceSection
    ? `<p class="callout">Section ` +
      `<span class="mono">${escapeHtml(String(assembly.provenanceSection))}</span> is generated, ` +
      `not written: package versions, ARD hashes, data manifests and session info are emitted ` +
      `mechanically. E3 reserved that slot in 1995 and open.csr fills it from the build.</p>`
    : '';

  return [head, stats, provenance, numbering, skeleton].filter(Boolean).join('\n');
}

// The site's stat tile. text-status-lib keeps a private copy of the same markup;
// duplicating four lines is better than either module importing the other's
// internals, but the CLASSES must stay identical or the pane stops matching the
// rest of the site.
function statTile(value, label, sub = '') {
  return (
    `<div class="stat"><span class="stat-value">${escapeHtml(String(value))}</span>` +
    `<span class="stat-label">${escapeHtml(label)}</span>` +
    (sub ? `<span class="stat-sub">${escapeHtml(sub)}</span>` : '') +
    `</div>`
  );
}
