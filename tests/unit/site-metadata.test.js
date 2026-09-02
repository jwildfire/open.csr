// The Metadata section: what was declared (open.csr #77, R2 of the sidebar refactor).
//
// Six pages read from the files that declare things — the study model, the
// template objects, the display and value specifications, text frontmatter,
// the iteration manifests and the requirement matrices — so the tests check
// the reading against the fixture repository and the rendering for the ids and
// links the rest of the app addresses.
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  METADATA_PAGES,
  customFromOf,
  loadMetadata,
  metadataNavItems,
  renderMetadataPage,
  renderMetadataPane
} from '../../scripts/metadata-lib.mjs';
import { loadDisplays, loadDocuments, loadTextBlocks } from '../../scripts/site-lib.mjs';
import { APP_TABS, STUDY_TABS, buildNavTree, renderSidebar } from '../../scripts/app-lib.mjs';
import { TAB_IDS, isTab, resolveAppLink } from '../../site/demo/core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.join(here, '..', 'fixtures', 'site', 'repo');
const config = JSON.parse(readFileSync(path.join(repoDir, 'site', 'config.json'), 'utf8'));
const displays = loadDisplays(repoDir, config);
const textBlocks = loadTextBlocks(repoDir, config);
const documents = loadDocuments(repoDir, config);
const meta = loadMetadata(repoDir, { config, displays, textBlocks, documents });

describe('the study model', () => {
  test('QC-META-001: the study page states the arms in print order, the columns that carry an arm label, and every analysis set with its flag and subjects per arm (#77)', () => {
    expect(meta.study.id).toBe('CDISCPILOT01');
    expect(meta.study.arms.map((arm) => arm.label)).toEqual(['Placebo', 'Xanomeline Low Dose', 'Xanomeline High Dose']);
    const html = renderMetadataPage('study', { meta, config, root: '../' });
    expect(html).toContain('<h1>Study</h1>');
    expect(html).toContain('<dt class="mono">TRT01P</dt>');
    expect(html).toContain('TRT01A');
    expect(html).toContain('<td class="mono">efficacy</td>');
    expect(html).toContain('EFFFL');
    // 79 + 81 + 74 subjects in the efficacy set, totalled by the page.
    expect(html).toMatch(/<td class="num">79<\/td><td class="num">81<\/td><td class="num">74<\/td><td class="num">234<\/td>/);
    expect(html).toContain('href="../data/index.html"');
    // An object-valued source renders as its label and alternates, never as JSON.
    const objectSource = { ...meta, study: { ...meta.study, source: { default: 'phuse', default_label: 'the pilot package', alternates: ['pharmaverseadam'] } } };
    const withObject = renderMetadataPage('study', { meta: objectSource, config, root: '../' });
    expect(withObject).toContain('the pilot package');
    expect(withObject).toContain('alternate: pharmaverseadam');
    expect(withObject).not.toContain('default_label');
  });

  test('QC-META-001: a repository without a study model renders the empty state and says so in the warnings (#77)', () => {
    const none = loadMetadata(path.join(here, '..', 'fixtures', 'nowhere'), { config });
    expect(none.study).toBeNull();
    expect(none.warnings.some((w) => w.includes('library/study.yaml'))).toBe(true);
    expect(renderMetadataPane({ meta: none, config })).toContain('No study model');
  });
});

describe('specifications and their history', () => {
  test('QC-META-002: every display is listed with its two specification files and every iteration with the actor, request and hashes its manifest recorded (#77)', () => {
    const spec = meta.specs.find((entry) => entry.slug === 't-demo');
    expect(spec.analysisFile).toBe('library/tfl/t-demo/analysis.yaml');
    expect(spec.displayFile).toBe('library/tfl/t-demo/display.yaml');
    expect(spec.iterations.map((it) => it.version)).toEqual(['v001', 'v002']);
    const v2 = spec.iterations[1];
    expect(v2.actor).toBe('@jwildfire');
    expect(v2.request).toBe('Add a percentage column to the high-dose arm.');
    expect(v2.spec_hash).toBe('sha256:aaaa1111');
    expect(v2.ard_hash).toBe('sha256:manifestsuppliedhash');
    const html = renderMetadataPage('specs', { meta, config, root: '../' });
    expect(html).toContain('id="spec-t-demo"');
    expect(html).toContain('href="../gallery/t-demo.html"');
    expect(html).toContain('Add a percentage column');
    expect(html).toContain('aaaa111');
  });

  test('QC-META-002: shared custom code is stated from the borrowing side and the owning side (#77)', () => {
    expect(customFromOf('id: t-sae\ncustom_from: t-ae-incidence\n')).toBe('t-ae-incidence');
    expect(customFromOf('id: t-x\n')).toBeNull();
    const shared = loadMetadata(repoDir, {
      config,
      displays: [
        { ...displays[0], slug: 't-owner', outputs: { ...displays[0].outputs, specs: { analysis: { file: 'a', text: 'id: t-owner' }, display: null, custom: { file: 'c', text: '' } } } },
        { ...displays[0], slug: 't-borrower', outputs: { ...displays[0].outputs, specs: { analysis: { file: 'b', text: 'id: t-borrower\ncustom_from: t-owner' }, display: null, custom: null } } }
      ]
    });
    expect(shared.specs.find((s) => s.slug === 't-borrower').customFrom).toBe('t-owner');
    expect(shared.specs.find((s) => s.slug === 't-owner').sharedWith).toEqual(['t-borrower']);
    const html = renderMetadataPage('specs', { meta: shared, config });
    expect(html).toContain('borrows <a class="mono" href="#spec-t-owner">t-owner</a>');
    expect(html).toContain('custom code shared with <a class="mono" href="#spec-t-borrower">t-borrower</a>');
  });

  test('QC-META-002: value declarations are read from the source file and link to the store (#77)', () => {
    expect(meta.values.map((value) => [value.id, value.kind])).toEqual([
      ['randomised-n', 'source'],
      ['ae-any-n-xanomeline', 'derived']
    ]);
    const html = renderMetadataPage('specs', { meta, config, root: '../' });
    expect(html).toContain('href="../values/index.html#randomised-n"');
    expect(html).toContain('sum(randomised-n, randomised-n)');
  });
});

describe('approvals, environments, models and requirements', () => {
  test('QC-META-003: every text block is listed with its tier, version, approval state, approver, date and drafting model (#77)', () => {
    const block = meta.approvals.find((entry) => entry.id === 'TXT-E3-1202');
    expect(block).toBeDefined();
    expect(['approved', 'draft']).toContain(block.state);
    const html = renderMetadataPage('approvals', { meta, config, root: '../' });
    expect(html).toContain('href="../text/index.html#TXT-E3-1202"');
    expect(html).toContain('text blocks');
    expect(html).toMatch(/<td>parameterized/);
  });

  test('QC-META-004: environments are deduplicated across every iteration, each listing the iterations built in it (#77)', () => {
    expect(meta.environments.length).toBeGreaterThan(0);
    const all = meta.environments.flatMap((env) => env.iterations.map((it) => `${it.slug} ${it.version}`));
    expect(all).toContain('t-demo v002');
    const html = renderMetadataPage('environments', { meta, config, root: '../' });
    expect(html).toContain('id="environment-1"');
    expect(html).toContain('href="../gallery/t-demo.html"');
  });

  test('QC-META-004: document models are the template objects on disk, with the documents assembled from each, and an empty library says so (#77)', () => {
    expect(meta.models).toEqual([]);
    expect(renderMetadataPage('models', { meta, config })).toContain('No template objects');
    const rootDir = path.resolve(here, '..', '..');
    const real = loadMetadata(rootDir, { config: {}, displays: [], textBlocks: [], documents: [] });
    expect(real.models.map((model) => model.id)).toEqual(['display-package', 'e3-abbreviated', 'e3-synopsis', 'ich-e3']);
    expect(real.models.find((model) => model.id === 'ich-e3').sections).toBeGreaterThan(100);
  });

  test('QC-META-004: the requirements page lists every matrix with its row count and a route to its evidence (#77)', () => {
    const rootDir = path.resolve(here, '..', '..');
    const rootConfig = JSON.parse(readFileSync(path.join(rootDir, 'site', 'config.json'), 'utf8'));
    const real = loadMetadata(rootDir, { config: rootConfig, displays: [], textBlocks: [], documents: [] });
    const quality = real.matrices.find((matrix) => matrix.file === 'quality.md');
    expect(quality.module).toBe('quality');
    expect(quality.rows).toBeGreaterThan(50);
    const html = renderMetadataPage('requirements', { meta: real, config: rootConfig, root: '../' });
    expect(html).toContain('href="../quality/quality.html"');
    expect(html).toContain(`${rootConfig.matrixBaseUrl}/quality.md`);
  });
});

describe('the pane, the explorer and the deep links', () => {
  test('QC-META-005: the pane carries every section by id, and Metadata is a view of the study after Data with one explorer item per page (#77)', () => {
    const pane = renderMetadataPane({ meta, config, root: '../' });
    for (const page of METADATA_PAGES) expect(pane).toContain(`id="section-${page.id}"`);
    expect(TAB_IDS).toContain('metadata');
    expect(isTab('metadata')).toBe(true);
    expect(STUDY_TABS.map((tab) => tab.id)).toEqual(['data', 'metadata', 'text', 'pipeline', 'displays', 'values', 'documents']);
    expect(APP_TABS.find((tab) => tab.id === 'metadata').href).toBe('../metadata/index.html');
    const items = metadataNavItems(meta);
    expect(items.map((item) => item.id)).toEqual(METADATA_PAGES.map((page) => page.id));
    expect(items.find((item) => item.id === 'study').number).toBe('CDISCPILOT01');
    const tree = buildNavTree({ config, displays, metadata: items });
    expect(tree.groups.map((group) => group.id)).toEqual(['documents', 'displays', 'text', 'values', 'data', 'metadata', 'pipeline']);
    const html = renderSidebar({ tree, active: 'metadata', selected: { focus: 'section-study' } });
    expect(html).toContain('data-nav-group-root="metadata"');
    expect(html).toContain('data-nav-group="metadata" data-nav-item="approvals"');
  });

  test('QC-META-005: a metadata page permalink is absorbed into the Metadata view with that section in focus (#77)', () => {
    expect(resolveAppLink('../metadata/study.html')).toEqual({ tab: 'metadata', focus: 'section-study' });
    expect(resolveAppLink('../metadata/specs.html#spec-t-demo')).toEqual({ tab: 'metadata', focus: 'spec-t-demo' });
    expect(resolveAppLink('../metadata/index.html')).toEqual({ tab: 'metadata', focus: null });
    expect(resolveAppLink('../templates/index.html')).toEqual({ tab: 'templates', focus: null });
  });
});
