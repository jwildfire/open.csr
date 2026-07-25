// Evidence normalizer (open.csr #1). Ported from safety.viz's
// scripts/evidence-lib.mjs with the three changes the research porting guide
// (research/sections/05, §13-14) calls for:
//
//   1. `normalizeTestthat` sits beside `normalizeVitest` — R owns the
//      statistics, JS owns the documents, and both feed ONE evidence stream.
//   2. Records follow contracts §8 (`title` / `passed` / `suite` / `file`)
//      rather than safety.viz's `test` / `status`.
//   3. Each set carries a `traceability` object (data -> ARD -> display ->
//      document) instead of safety.viz's flat `screenshots` array. For a CSR
//      the evidence artifact is the ARD, not a screenshot.
//
// Run provenance (generated / environment / run) lives in dedicated top-level
// keys; `records` is deliberately timestamp-free so it stays a pure function of
// the test run and the freshness guard can ignore provenance entirely.

import { REQUIREMENT_ID_GLOBAL } from './requirements-lib.mjs';

const ISSUE_REF = /\(#(\d+)\)/g;

export function parseTestName(name) {
  const text = String(name || '');
  const requirementIds = [...new Set(text.match(REQUIREMENT_ID_GLOBAL) || [])];
  const issueRefs = [...text.matchAll(ISSUE_REF)].map((m) => Number(m[1]));
  return { requirementIds, issueRefs };
}

// The module universe is the site registry, not code: components (engine, text
// library, templates, framework) plus one module per display slug. Adding a
// display to site/config.json is all it takes for its evidence set, requirement
// extract, and evidence page to appear.
export function moduleRegistry(config) {
  const components = (config.components || []).map((entry) => entry.module);
  const displays = (config.displays || []).map((entry) => entry.module || entry.slug);
  return [...new Set([...components, ...displays])];
}

// Test-file -> module routing.
//
//   tests/unit/<module>/**                      -> <module>   (JS, per-module dir)
//   tests/unit/<module>[-*].test.js             -> <module>   (JS, flat file)
//   tests/testthat/test-<module>[-*].R          -> <module>   (R)
//   pipeline/tests/testthat/test-<module>[-*].R -> <module>
//
// Slug matching is longest-prefix on `-` boundaries, so
// `test-t-ae-overview-ard.R` routes to the `t-ae-overview` display while
// `test-tfl-engine.R` routes to the `tfl-engine` component.
//
// Components whose test files are named by TOPIC rather than by module
// (`test-ard-build.R`, `site-render.test.js`) declare their file stems in
// site/config.json as `testPrefixes`, passed here as `routes`. Routing stays
// data, not code.
//
// Anything unmatched routes to `null`: SHARED SCAFFOLD. Following the
// safety.viz precedent, shared records are duplicated into every module's set,
// so each evidence.json is self-contained and scaffold drift still trips the
// freshness guard.
export function moduleForFile(file, modules, routes = []) {
  const normalized = String(file || '').replaceAll('\\', '/');
  const sorted = [...modules].sort((a, b) => b.length - a.length);

  const dir = normalized.match(/(?:^|\/)tests\/unit\/([^/]+)\//);
  if (dir && modules.includes(dir[1])) return dir[1];

  const jsFile = normalized.match(/(?:^|\/)?([^/]+)\.test\.[jm]?js$/);
  const rFile = normalized.match(/(?:^|\/)?test-([^/]+)\.[Rr]$/);
  const stem = (jsFile && jsFile[1]) || (rFile && rFile[1]) || null;
  if (!stem) return null;

  const bySlug = sorted.find((module) => stem === module || stem.startsWith(`${module}-`));
  if (bySlug) return bySlug;

  // Declared prefixes, longest first so a specific route beats a general one.
  const declared = routes
    .flatMap((route) => (route.testPrefixes || []).map((prefix) => ({ module: route.module, prefix })))
    .filter((route) => modules.includes(route.module))
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find((route) => stem === route.prefix || stem.startsWith(route.prefix));
  return declared ? declared.module : null;
}

// Requirement-prefix routing — the fallback for a test file that covers several
// modules at once (`test-displays.R` holds every display's assertions). A record
// whose requirement IDs are owned by one or more registry entries goes to those
// entries instead of into the shared pool, so a demographics assertion does not
// show up as evidence on the AE table's page. Records whose IDs no entry claims
// (`DSP-ALL-*`, deliberately cross-cutting) stay shared.
export function modulesForRequirements(requirementIds = [], routes = [], modules = []) {
  const owners = new Set();
  for (const id of requirementIds) {
    for (const route of routes) {
      if (!modules.includes(route.module)) continue;
      if ((route.prefixes || []).some((prefix) => id.startsWith(`${prefix}-`))) {
        owners.add(route.module);
      }
    }
  }
  return [...owners];
}

// contracts §8 record shape. `issueRefs` is additive (the naming convention
// carries `(#N)`; surfacing it lets the evidence page link the tracking issue).
export function record(title, suite, passed, file) {
  const { requirementIds, issueRefs } = parseTestName(title);
  return { requirementIds, title, suite, passed: !!passed, file: file || '', issueRefs };
}

/**
 * Make a test-file path repo-relative.
 *
 * Vitest and testthat both report ABSOLUTE paths, so a committed evidence set
 * used to record whichever machine and checkout produced it — regenerating from
 * a git worktree rewrote every record. An evidence artifact is supposed to be a
 * reproducible statement about the repository, so it may not carry anyone's home
 * directory.
 *
 * Falls back to the input when the path is already relative, or lies outside the
 * repository entirely (which would be a bug worth seeing rather than hiding).
 */
export function relativizePath(file, rootDir = null) {
  const raw = String(file || '').replaceAll('\\', '/');
  if (!raw || !rootDir) return raw;
  const root = String(rootDir).replaceAll('\\', '/').replace(/\/+$/, '');
  if (!raw.startsWith('/')) return raw;
  if (raw === root) return '';
  // The worktree case is checked FIRST: a worktree lives under
  // <repo>/.claude/worktrees/<name>/, so it also matches the plain root prefix,
  // and stripping only the root would leave the worktree name in the record —
  // exactly the machine-specific detail this function exists to remove.
  const worktree = raw.match(/\/\.claude\/worktrees\/[^/]+\/(.+)$/);
  if (worktree) return worktree[1];
  if (raw.startsWith(`${root}/`)) return raw.slice(root.length + 1);
  return raw;
}

// Vitest --reporter=json (jest-compatible shape). `name` is the test file.
export function normalizeVitest(json) {
  return (json.testResults || []).flatMap((file) =>
    (file.assertionResults || []).map((assertion) =>
      record(
        assertion.fullName || assertion.title,
        'js-unit',
        assertion.status === 'passed',
        file.name || ''
      )
    )
  );
}

// testthat via qc/run-tests.R (contracts §8): `{ records: [{ file, test,
// status }] }`. Anything that is not an outright pass (fail / error / skip)
// records as not-passed so the evidence page never overstates the run.
export function normalizeTestthat(json) {
  return (json.records || []).map((entry) =>
    record(entry.test, 'r-unit', entry.status === 'pass', entry.file || '')
  );
}

// Human review is evidence a suite cannot produce (research §16). Text blocks
// carry `approval: { state, by, at }` in their frontmatter; each approved block
// becomes a `text-review` record so one evidence page renders automated and
// human sign-off in the same table.
export function normalizeTextReview(blocks = []) {
  return blocks.map((block) => {
    const approval = block.approval || {};
    const approved = approval.state === 'approved';
    const ids = (block.requirements || []).join(', ');
    const title =
      `${ids ? `${ids}: ` : ''}${block.id} ${block.tier || 'text'} block reviewed` +
      `${approval.by ? ` by ${approval.by}` : ''}${approval.at ? ` on ${approval.at}` : ''}` +
      ` (#${block.issue || 1})`;
    const rec = record(title, 'text-review', approved, block.file || '');
    rec.reviewedBy = approval.by || null;
    rec.reviewedAt = approval.at || null;
    if (!rec.requirementIds.length && block.requirements) {
      rec.requirementIds = [...block.requirements];
    }
    return rec;
  });
}

// GitHub Actions run provenance, built from the env GHA injects into every job;
// null for local runs, and consumers feature-detect.
export function buildRun(env = {}) {
  if (!env.GITHUB_RUN_ID) return null;
  const server = env.GITHUB_SERVER_URL || 'https://github.com';
  return {
    id: env.GITHUB_RUN_ID,
    url: env.GITHUB_REPOSITORY
      ? `${server}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
      : null
  };
}

// The traceability object (contracts §8) — the data -> ARD -> display ->
// document chain rendered on the evidence page. Assembled from whatever exists:
// a display's current output manifest and the ARD's own provenance envelope
// (contracts §5). Missing inputs yield nulls, never an exception, because
// evidence sets are produced while displays are still being built.
export function buildTraceability({ manifest = null, ard = null, display = null } = {}) {
  const provenance = (ard && ard.provenance) || {};
  const data = Array.isArray(provenance.data) ? provenance.data : [];
  const adamDatasets = [...new Set(data.map((entry) => entry.dataset).filter(Boolean))].sort();
  const pick = (...values) => values.find((value) => value !== undefined && value !== null) ?? null;
  return {
    adamDatasets,
    adamHashes: Object.fromEntries(data.filter((e) => e.dataset).map((e) => [e.dataset, e.hash])),
    ardFile: pick(manifest && manifest.ardFile, manifest && manifest.ard_file, display?.ardFile),
    ardHash: pick(manifest && manifest.ardHash, manifest && manifest.ard_hash, display?.ardHash),
    displayFile: pick(display?.displayFile, manifest && manifest.displayFile),
    specHash: pick(provenance.spec_hash, manifest && manifest.specHash),
    iteration: pick(manifest && manifest.version, manifest && manifest.iteration, display?.version),
    sourceCommit: pick(
      manifest && manifest.commit,
      manifest && manifest.git_commit,
      provenance.git_commit
    )
  };
}

// Build every module's evidence set from ONE vitest run + ONE testthat run
// (+ the text-review records). Records route to modules by test-file path;
// shared scaffold records are copied into each set. Only modules with at least
// one module-routed record get a set — a display's evidence.json appears the
// moment its first test lands, with zero pipeline edits.
export function buildEvidenceSets({
  modules,
  routes = [],
  vitest = null,
  testthat = null,
  textReview = [],
  traceabilityByModule = {},
  provenance = {},
  rootDir = null
}) {
  // Relativised before routing, not after: `moduleForFile` matches on the file
  // stem, so it is indifferent, and every downstream consumer then sees the same
  // repo-relative path the committed artifact carries.
  const all = [
    ...normalizeVitest(vitest || {}),
    ...normalizeTestthat(testthat || {}),
    ...normalizeTextReview(textReview)
  ].map((rec) => ({ ...rec, file: relativizePath(rec.file, rootDir) }));

  // A whole suite may belong to one component regardless of file path — human
  // review of text blocks is the case that matters (`suite: "text-review"` →
  // the Text Library), declared in the registry rather than hard-coded.
  const suiteOwner = (suite) => {
    const route = routes.find((entry) => (entry.suites || []).includes(suite));
    return route && modules.includes(route.module) ? route.module : null;
  };

  const shared = [];
  const byModule = new Map();
  const add = (module, rec) => {
    if (!byModule.has(module)) byModule.set(module, []);
    byModule.get(module).push(rec);
  };
  for (const rec of all) {
    const module = suiteOwner(rec.suite) || moduleForFile(rec.file, modules, routes);
    if (module) {
      add(module, rec);
      continue;
    }
    const owners = modulesForRequirements(rec.requirementIds, routes, modules);
    if (owners.length) owners.forEach((owner) => add(owner, rec));
    else shared.push(rec);
  }
  // Text-review records name their module by the block's `displays`, not by a
  // path, so route them there too when the block declares one.
  for (const block of textReview) {
    for (const module of block.displays || []) {
      if (!modules.includes(module)) continue;
      if (!byModule.has(module)) byModule.set(module, []);
    }
  }

  const sets = {};
  for (const [module, moduleRecords] of byModule) {
    const records = [...moduleRecords, ...shared].map((rec) => ({ ...rec }));
    records.sort((a, b) => a.suite.localeCompare(b.suite) || a.title.localeCompare(b.title));
    sets[module] = {
      module,
      generated: provenance.generated ?? null,
      records,
      traceability: traceabilityByModule[module] ?? buildTraceability(),
      environment: provenance.environment ?? null,
      run: provenance.run ?? null
    };
  }
  return sets;
}

// Freshness guard: stale when the test set or any pass/fail status differs.
// Provenance (generated / environment / run) and traceability are ignored —
// they change whenever a display is regenerated, which is the R-side snapshot
// test's business, not the guard's. Keeping volatile fields out is what stops
// the guard becoming noise and getting switched off.
export function compareEvidence(committed, fresh) {
  const key = (r) => `${r.suite}|${r.title}`;
  const status = (r) => (r.passed ? 'pass' : 'fail');
  const committedMap = new Map((committed.records || []).map((r) => [key(r), status(r)]));
  const freshMap = new Map((fresh.records || []).map((r) => [key(r), status(r)]));
  const differences = [];
  for (const [k, value] of committedMap) {
    if (!freshMap.has(k)) differences.push(`missing in fresh run: ${k}`);
    else if (freshMap.get(k) !== value)
      differences.push(`status changed: ${k} (${value} → ${freshMap.get(k)})`);
  }
  for (const k of freshMap.keys()) {
    if (!committedMap.has(k)) differences.push(`new test not in committed evidence: ${k}`);
  }
  return { stale: differences.length > 0, differences };
}

// Summary the Quality page and the CLI both render.
export function summarizeEvidence(evidence) {
  const records = (evidence && evidence.records) || [];
  const bySuite = {};
  for (const rec of records) {
    bySuite[rec.suite] = bySuite[rec.suite] || { total: 0, passed: 0 };
    bySuite[rec.suite].total += 1;
    if (rec.passed) bySuite[rec.suite].passed += 1;
  }
  const requirementIds = [...new Set(records.flatMap((rec) => rec.requirementIds || []))].sort();
  // A text block awaiting human approval is pending, not failing (design D8):
  // it blocks assembly but it is not a defect, and conflating the two makes the
  // evidence page cry wolf.
  const notPassed = records.filter((rec) => !rec.passed);
  return {
    total: records.length,
    passed: records.filter((rec) => rec.passed).length,
    failed: notPassed.filter((rec) => rec.suite !== 'text-review').length,
    pending: notPassed.filter((rec) => rec.suite === 'text-review').length,
    bySuite,
    requirementIds
  };
}
