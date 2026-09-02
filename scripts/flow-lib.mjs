// The flow diagram every element carries (open.csr #83, R7 of the sidebar refactor).
//
// Three lanes — the inputs used, the function called, the outputs generated —
// rendered as inline HTML with the connectors in the stylesheet, because the
// site forbids an external resource and a diagram library would be one. Every
// box is a link when it can be, and every name is the code's or the record's:
// the callers pass what the ARD envelope, the manifest, the registry and the
// assembled document already say, and this module only lays it out.

import { escapeHtml } from './site-lib.mjs';

const LANES = [
  { key: 'inputs', label: 'Inputs', empty: 'no inputs recorded' },
  { key: 'steps', label: 'Function', empty: 'no function recorded' },
  { key: 'outputs', label: 'Outputs', empty: 'no outputs recorded' }
];

function box(entry) {
  const label = escapeHtml(entry.label || '');
  const inner = entry.href
    ? `<a class="flow-label" href="${escapeHtml(entry.href)}">${label}</a>`
    : `<span class="flow-label">${label}</span>`;
  const sub = entry.sub ? `<span class="flow-sub">${escapeHtml(entry.sub)}</span>` : '';
  const kind = entry.kind ? ` flow-${escapeHtml(entry.kind)}` : '';
  return `<li class="flow-box${kind}">${inner}${sub}</li>`;
}

/**
 * @param {object} flow
 * @param {string} [flow.label] the accessible name of the diagram
 * @param {Array<{label:string, sub?:string, href?:string, kind?:string}>} flow.inputs
 * @param {Array<{label:string, sub?:string, href?:string, kind?:string}>} flow.steps
 * @param {Array<{label:string, sub?:string, href?:string, kind?:string}>} flow.outputs
 * @param {boolean} [flow.compact] a smaller variant for a table row or a card
 */
export function renderFlow({ label = 'How this was made', inputs = [], steps = [], outputs = [], compact = false } = {}) {
  const lists = { inputs, steps, outputs };
  const lanes = LANES.map((lane, index) => {
    const entries = Array.isArray(lists[lane.key]) ? lists[lane.key] : [];
    const items = entries.length
      ? entries.map(box).join('')
      : `<li class="flow-box flow-empty"><span class="flow-label">${escapeHtml(lane.empty)}</span></li>`;
    const arrow = index ? `<div class="flow-arrow" aria-hidden="true"></div>` : '';
    return (
      arrow +
      `<div class="flow-lane flow-${lane.key}">` +
      `<div class="flow-lane-label">${escapeHtml(lane.label)}</div>` +
      `<ul class="flow-boxes">${items}</ul>` +
      `</div>`
    );
  });
  return (
    `<div class="flow${compact ? ' flow-compact' : ''}" role="group" aria-label="${escapeHtml(label)}">` +
    lanes.join('') +
    `</div>`
  );
}

/** A repository link for a file on the site's source branch, or null. */
export function repoBlob(config, file) {
  if (!config?.repoUrl || !file) return null;
  return `${String(config.repoUrl).replace(/\/$/, '')}/blob/${config.sourceBranch || 'main'}/${file}`;
}

/** A hash's short form for a box's sub-line. */
export function shortHash(value) {
  return String(value || '')
    .replace(/^sha256:/, '')
    .slice(0, 7);
}
