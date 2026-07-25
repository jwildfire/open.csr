// The review surface itself (open.csr #2): what a reviewer is shown, in what
// order, and what the page does when nobody is connected.
//
// Two inputs are used deliberately. The FIXTURE repo gives controlled cases (a
// draft generated block with a deliberately orphaned binding, an approved
// parameterized one). The REAL repo proves the page renders the shipped library
// against the committed ARDs — a review page that only works on fixtures would
// be no evidence at all.

import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTraceIndex, loadDisplays, loadTextBlocks } from '../../scripts/site-lib.mjs';
import {
  bindingRows,
  buildReviewQueue,
  loadDecisions,
  needsJudgment,
  renderBindingTable,
  renderProvenance,
  renderReviewPage,
  renderReviewProse,
  renderSignoff,
  reviewConfig
} from '../../scripts/review-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '..', '..');
const fixtureDir = path.join(here, '..', 'fixtures', 'site', 'repo');

function load(dir) {
  const config = JSON.parse(readFileSync(path.join(dir, 'site', 'config.json'), 'utf8'));
  const displays = loadDisplays(dir, config);
  return {
    config,
    displays,
    textBlocks: loadTextBlocks(dir, config),
    traceIndex: buildTraceIndex(displays),
    ards: Object.fromEntries(
      displays.filter((d) => d.outputs?.current?.ard).map((d) => [d.slug, d.outputs.current.ard])
    )
  };
}

const fixture = load(fixtureDir);
const real = load(rootDir);
const cfg = reviewConfig(real.config);

const page = renderReviewPage({
  config: real.config,
  textBlocks: real.textBlocks,
  ards: real.ards,
  traceIndex: real.traceIndex,
  ledger: loadDecisions(rootDir, cfg)
});

const draftBlock = real.textBlocks.find((block) => block.id === 'TXT-E3-1206');
const approvedBlock = real.textBlocks.find((block) => block.approval?.state === 'approved');

describe('the review queue', () => {
  test('TXT-REVIEW-001: draft generated blocks come first — they are the ones blocking assembly (#2)', () => {
    const queue = buildReviewQueue(real.textBlocks);
    const firstSettled = queue.findIndex((entry) => !entry.needsJudgment);
    const lastPending = queue.map((entry) => entry.needsJudgment).lastIndexOf(true);
    expect(lastPending).toBeLessThan(firstSettled);
    expect(queue.slice(0, firstSettled).every((entry) => entry.block.tier === 'generated')).toBe(true);
  });

  test('TXT-REVIEW-001: within a group, blocks follow ICH E3 section order, not file order (#2)', () => {
    const queue = buildReviewQueue(real.textBlocks).filter((entry) => !entry.needsJudgment);
    const sections = queue.map((entry) => entry.block.e3Section);
    const numeric = sections.map((section) =>
      String(section)
        .split('.')
        .map((part) => Number(part))
    );
    for (let i = 1; i < numeric.length; i += 1) {
      expect(numeric[i][0]).toBeGreaterThanOrEqual(numeric[i - 1][0]);
    }
  });

  test('TXT-REVIEW-001: only unapproved generated blocks need judgment (#2)', () => {
    expect(needsJudgment({ exists: true, tier: 'generated', approval: { state: 'draft' } })).toBe(true);
    expect(needsJudgment({ exists: true, tier: 'generated', approval: { state: 'approved' } })).toBe(
      false
    );
    expect(needsJudgment({ exists: true, tier: 'parameterized', approval: { state: 'draft' } })).toBe(
      false
    );
    expect(needsJudgment({ exists: false, tier: 'generated' })).toBe(false);
  });

  test('TXT-REVIEW-001: the shipped library really does have blocks awaiting review (#2)', () => {
    const pending = buildReviewQueue(real.textBlocks).filter((entry) => entry.needsJudgment);
    expect(pending.length).toBeGreaterThan(0);
    expect(page).toContain('awaiting judgment');
  });
});

describe('resolved prose', () => {
  const rows = bindingRows(draftBlock, real.ards);
  const prose = renderReviewProse(draftBlock, rows, { xrefs: null });

  test('TXT-REVIEW-002: every binding is replaced by its real value from the committed ARD (#2)', () => {
    expect(prose).not.toMatch(/\{\{ard:/);
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.every((row) => row.resolved)).toBe(true);
    // The high-dose "any AE" percentage, resolved from outputs/t-ae-overview.
    const anyAe = rows.find((row) => row.address.includes('any_ae:p') && row.address.includes('High'));
    expect(Number(anyAe.value)).toBeGreaterThan(0);
    expect(prose).toContain(`>${anyAe.value}<`);
  });

  test('TXT-REVIEW-002: computed values are marked and linked to the binding row they came from (#2)', () => {
    const first = rows[0];
    expect(prose).toContain(`class="bound" href="#bind-txt-e3-1206-1"`);
    expect(prose).toContain(`<sup class="bound-ref">1</sup>`);
    expect(prose).toContain(`title="${first.address}"`);
  });

  test('TXT-REVIEW-002: the writer’s own words are left untouched around the values (#2)', () => {
    expect(prose).toContain('transdermal therapeutic system');
    expect(prose).toMatch(/<p>/);
  });

  test('TXT-REVIEW-002: an unresolved binding shows a marker, never a number (#2)', () => {
    const orphan = fixture.textBlocks.find((block) => block.id === 'TXT-E3-9999');
    const orphanRows = bindingRows(orphan, fixture.ards);
    const html = renderReviewProse(orphan, orphanRows, { xrefs: null });
    expect(orphanRows.every((row) => !row.resolved)).toBe(true);
    expect(html).toContain('⟨unresolved⟩');
    expect(html).toMatch(/class="bound unresolved"/);
    expect(html.replace(/TXT-E3-9999|bind-txt-e3-9999-\d+/g, '')).not.toMatch(/>\s*\d[\d.]*\s*</);
  });

  test('TXT-REVIEW-002: a cross-reference degrades to readable text outside the assembled document (#2)', () => {
    const withXref = real.textBlocks.find((block) => /\{\{xref:section:/.test(block.body || ''));
    const html = renderReviewProse(withXref, bindingRows(withXref, real.ards), {
      xrefs: { sections: {}, displays: {} }
    });
    expect(html).not.toMatch(/\{\{xref:/);
    expect(html).toMatch(/Section \d/);
  });
});

describe('provenance', () => {
  test('TXT-REVIEW-003: a generated block shows its model, generation date and the full prompt (#2)', () => {
    const html = renderProvenance(draftBlock);
    expect(html).toContain('agent-drafted');
    expect(html).toContain(draftBlock.provenance.model);
    expect(html).toContain(draftBlock.provenance.generated_at);
    // The WHOLE prompt, not a truncation: this is the audit record.
    const promptWords = draftBlock.provenance.prompt.trim().split(/\s+/);
    expect(html).toContain(promptWords.slice(0, 6).join(' '));
    expect(html).toContain(promptWords.slice(-6).join(' '));
  });

  test('TXT-REVIEW-003: provenance sits beside the prose, not below the fold (#2)', () => {
    const card = page.slice(page.indexOf('id="TXT-E3-1206"'));
    const proseAt = card.indexOf('Resolved prose');
    const provenanceAt = card.indexOf('class="provenance"');
    const bindingsAt = card.indexOf('rb-bindings');
    expect(provenanceAt).toBeGreaterThan(proseAt);
    expect(provenanceAt).toBeLessThan(bindingsAt);
  });

  test('TXT-REVIEW-003: a human-written block says so rather than showing an empty provenance box (#2)', () => {
    const html = renderProvenance(approvedBlock);
    expect(html).toContain('Not model-authored');
    expect(html).toContain(approvedBlock.tier);
    expect(html).not.toContain('agent-drafted');
  });

  test('TXT-REVIEW-003: a generated block with no recorded prompt is called out as unauditable (#2)', () => {
    const html = renderProvenance({
      tier: 'generated',
      provenance: { model: 'some-model', prompt: null }
    });
    expect(html).toMatch(/callout bad/);
    expect(html).toContain('not auditable');
  });
});

describe('the binding table', () => {
  const rows = bindingRows(draftBlock, real.ards);

  test('TXT-REVIEW-004: one row per address, carrying the ARD row it selects and the value (#2)', () => {
    const html = renderBindingTable(draftBlock, rows);
    const row = rows.find((entry) => Object.keys(entry.qualifiers).length);
    expect(html).toContain(row.address);
    expect(html).toContain(row.analysis);
    expect(html).toContain(row.statName);
    expect(html).toContain(`id="bind-txt-e3-1206-${row.index}"`);
    expect(html).toContain(row.value);
  });

  test('TXT-REVIEW-004: the table value is the value the sentence shows, scale and digits included (#2)', () => {
    const scaled = rows.find((row) => row.scale !== null && row.digits !== null);
    expect(scaled).toBeTruthy();
    expect(Number(scaled.value)).toBeCloseTo(
      Number(scaled.raw) * Number(scaled.scale),
      Number(scaled.digits)
    );
    expect(scaled.value.split('.')[1]).toHaveLength(Number(scaled.digits));
    const prose = renderReviewProse(draftBlock, rows, { xrefs: null });
    expect(prose).toContain(`>${scaled.value}<`);
  });

  test('TXT-REVIEW-004: the ARD row is described by its group and level, not just its index (#2)', () => {
    const grouped = rows.find((row) => row.qualifiers.group);
    expect(grouped.rowLabel).toContain(grouped.qualifiers.group);
    expect(renderBindingTable(draftBlock, rows)).toContain(grouped.rowLabel);
  });

  test('TXT-REVIEW-004: a repeated address is one row, counted, not duplicated (#2)', () => {
    const repeated = bindingRows(
      { id: 'TXT-E3-TEST', body: 'a {{ard:t-demo:any_ae:n;group=Placebo}} and {{ard:t-demo:any_ae:n;group=Placebo}}' },
      fixture.ards
    );
    expect(repeated).toHaveLength(1);
    expect(repeated[0].uses).toBe(2);
    expect(renderBindingTable({ id: 'x' }, repeated)).toContain('used 2×');
  });

  test('TXT-REVIEW-004: an unresolved binding is shown with the reason, in place of a value (#2)', () => {
    const orphan = fixture.textBlocks.find((block) => block.id === 'TXT-E3-9999');
    const orphanRows = bindingRows(orphan, fixture.ards);
    const html = renderBindingTable(orphan, orphanRows);
    expect(html).toContain('unresolved-row');
    expect(html).toContain(orphanRows[0].reason);
    expect(html).toContain('chip-bad');
  });

  test('TXT-REVIEW-004: a block with no bindings says so instead of rendering an empty table (#2)', () => {
    expect(renderBindingTable({ id: 'x' }, [])).toContain('No bindings');
  });
});

describe('reading the page unconnected', () => {
  test('TXT-REVIEW-007: every sign-off button is disabled and says why (#2)', () => {
    const buttons = [...page.matchAll(/<button type="button" class="button[^"]*" data-decision[^>]*>/g)];
    expect(buttons.length).toBeGreaterThanOrEqual(real.textBlocks.length * 2 - 2);
    expect(buttons.every((match) => match[0].includes('disabled'))).toBe(true);
    expect(page).toContain('Connect to sign off — the page is read-only until you do.');
  });

  test('TXT-REVIEW-007: connecting is explained in full — scope, storage and destination (#2)', () => {
    expect(page).toContain('Fine-grained personal access token');
    expect(page).toContain('Contents: read and write');
    expect(page).toContain('Actions: read');
    expect(page).toContain('localStorage');
    expect(page).toContain('api.github.com');
  });

  test('TXT-REVIEW-007: each block offers the documented fallback: the same dispatch from a terminal (#2)', () => {
    expect(page).toContain('Sign off without connecting');
    expect(page).toContain('gh api repos/jwildfire/open.csr/dispatches');
    expect(page).toContain('client_payload[blockId]=TXT-E3-1206');
  });

  test('TXT-REVIEW-007: the whole surface is readable read-only — prose, provenance and bindings (#2)', () => {
    for (const block of real.textBlocks.filter((entry) => entry.exists)) {
      expect(page).toContain(`id="${block.id}"`);
    }
    expect(page).toContain('Provenance');
    expect(page).toContain('binding-table');
    expect(page).toContain('Decision ledger');
  });

  test('TXT-REVIEW-007: an already-approved block locks approval but still accepts a change request (#2)', () => {
    const html = renderSignoff(approvedBlock, cfg, { state: 'approved' });
    expect(html).toContain('data-locked="approved"');
    expect(html).toContain('Request changes');
  });
});

describe('the block header', () => {
  test('TXT-REVIEW-006: tier, approval state and E3 section are on every card (#2)', () => {
    const card = page.slice(page.indexOf('id="TXT-E3-1206"'), page.indexOf('id="TXT-E3-1206"') + 4000);
    expect(card).toContain('ICH E3 §12.6');
    expect(card).toContain('>generated<');
    expect(card).toContain('>draft<');
    expect(card).toContain('blocking assembly');
  });

  test('TXT-REVIEW-005: the card links the block source and every display it binds (#2)', () => {
    const card = page.slice(page.indexOf('id="TXT-E3-1206"'), page.indexOf('id="TXT-E3-1206"') + 4000);
    expect(card).toContain(`${cfg.repoUrl}/blob/${cfg.branch}/library/text/TXT-E3-1206.md`);
    for (const slug of draftBlock.displays) {
      expect(card).toContain(`../gallery/${slug}.html`);
    }
  });

  test('TXT-REVIEW-005: every binding row links the display detail page it reads from (#2)', () => {
    const html = renderBindingTable(draftBlock, bindingRows(draftBlock, real.ards));
    expect(html).toContain('../gallery/t-ae-overview.html');
  });
});

describe('the page as built', () => {
  test('TXT-REVIEW-008: the page carries its config as data and loads one relative module (#2)', () => {
    expect(page).toContain('<script type="application/json" id="review-config">');
    expect(page).toContain('<script type="module" src="client.js">');
    const config = JSON.parse(page.match(/id="review-config">([^<]*)</)[1]);
    expect(config).toMatchObject({
      repo: 'jwildfire/open.csr',
      eventType: 'text-decision',
      ledgerPath: 'site/text-decisions.json'
    });
  });

  test('TXT-REVIEW-008: no external resource is referenced anywhere on the page (#2)', () => {
    expect(page).not.toMatch(/<script[^>]+src=["']https?:/i);
    expect(page).not.toMatch(/<link[^>]+href=["']https?:/i);
    expect(page).not.toMatch(/<img[^>]+src=["']https?:/i);
  });

  test('TXT-REVIEW-008: registry defaults are derived from repoUrl when review config is absent (#2)', () => {
    const derived = reviewConfig({ repoUrl: 'https://github.com/someone/open.csr' });
    expect(derived.repo).toBe('someone/open.csr');
    expect(derived.branch).toBe('dev');
    expect(derived.eventType).toBe('text-decision');
  });

  test('TXT-REVIEW-008: the fixture repo — no review config, no ledger — still renders a full page (#2)', () => {
    const html = renderReviewPage({
      config: fixture.config,
      textBlocks: fixture.textBlocks,
      ards: fixture.ards,
      traceIndex: fixture.traceIndex,
      ledger: loadDecisions(fixtureDir, reviewConfig(fixture.config))
    });
    expect(html).toContain('Review and sign-off');
    expect(html).toContain('TXT-E3-9999');
    expect(html).toContain('No decision has been recorded yet');
    expect(html).not.toMatch(/\{\{/);
  });
});
