import { describe, expect, test } from 'vitest';
import {
  buildEvidenceSets,
  buildRun,
  compareEvidence,
  moduleForFile,
  moduleRegistry,
  modulesForRequirements,
  normalizeTestthat,
  normalizeTextReview,
  normalizeVitest,
  parseTestName,
  summarizeEvidence
} from '../../scripts/evidence-lib.mjs';

const MODULES = ['tfl-engine', 'text', 'templates', 't-ae-overview', 't-demo'];

const vitestJson = {
  testResults: [
    {
      name: '/repo/tests/unit/t-demo/render.test.js',
      assertionResults: [
        { fullName: 'DSP-DEMO-001: age summary matches ADSL (#1)', status: 'passed' },
        { fullName: 'DSP-DEMO-002: sex counts match ADSL (#1)', status: 'failed' }
      ]
    },
    {
      name: '/repo/tests/unit/site-render.test.js',
      assertionResults: [{ fullName: 'QC-SITE-001: the shell substitutes tokens (#1)', status: 'passed' }]
    }
  ]
};

const testthatJson = {
  records: [
    { file: 'test-t-ae-overview-ard.R', test: 'DSP-AE-001: overview counts match ADAE (#1)', status: 'pass' },
    { file: 'test-tfl-engine.R', test: 'TFL-ARD-001: build_ard returns one row per statistic (#1)', status: 'fail' },
    { file: 'test-convention.R', test: 'QC-NAME-001: every test names a requirement (#1)', status: 'skip' }
  ]
};

describe('test-name parsing', () => {
  test('QC-NAME-002: several requirement IDs and several issue refs parse out of one title (#1)', () => {
    const parsed = parseTestName('TFL-ARD-001, TFL-ARD-002B: builds the ARD (#1) (#42)');
    expect(parsed.requirementIds).toEqual(['TFL-ARD-001', 'TFL-ARD-002B']);
    expect(parsed.issueRefs).toEqual([1, 42]);
  });

  test('QC-NAME-002: a scaffold title with no requirement ID still parses its issue ref (#1)', () => {
    expect(parseTestName('the build emits a stylesheet (#1)')).toEqual({
      requirementIds: [],
      issueRefs: [1]
    });
  });
});

describe('suite normalization', () => {
  test('QC-EVID-001: vitest output normalizes into contracts §8 records (#1)', () => {
    const records = normalizeVitest(vitestJson);
    expect(records).toHaveLength(3);
    expect(records[0]).toEqual({
      requirementIds: ['DSP-DEMO-001'],
      title: 'DSP-DEMO-001: age summary matches ADSL (#1)',
      suite: 'js-unit',
      passed: true,
      file: '/repo/tests/unit/t-demo/render.test.js',
      issueRefs: [1]
    });
    expect(records[1].passed).toBe(false);
  });

  test('QC-EVID-002: testthat results normalize into the same shape with suite r-unit (#1)', () => {
    const records = normalizeTestthat(testthatJson);
    expect(records[0]).toMatchObject({
      suite: 'r-unit',
      passed: true,
      requirementIds: ['DSP-AE-001'],
      file: 'test-t-ae-overview-ard.R'
    });
  });

  test('QC-EVID-003: any testthat status other than pass records as not passed (#1)', () => {
    const records = normalizeTestthat(testthatJson);
    expect(records.map((r) => r.passed)).toEqual([true, false, false]);
  });

  test('QC-EVID-001: missing or empty reporter output normalizes to no records (#1)', () => {
    expect(normalizeVitest({})).toEqual([]);
    expect(normalizeTestthat({})).toEqual([]);
    expect(normalizeTestthat({ records: [] })).toEqual([]);
  });

  test('QC-EVID-004: an approved text block becomes a passing text-review record (#1)', () => {
    const [record] = normalizeTextReview([
      {
        id: 'TXT-E3-1202',
        tier: 'parameterized',
        file: 'library/text/TXT-E3-1202.md',
        requirements: ['TXT-AE-001'],
        approval: { state: 'approved', by: '@jwildfire', at: '2026-07-25' },
        issue: 1
      }
    ]);
    expect(record.suite).toBe('text-review');
    expect(record.passed).toBe(true);
    expect(record.reviewedBy).toBe('@jwildfire');
    expect(record.reviewedAt).toBe('2026-07-25');
    expect(record.requirementIds).toContain('TXT-AE-001');
    expect(record.title).toMatch(/\(#1\)$/);
  });

  test('QC-EVID-004: an unapproved generated block records as not passed (#1)', () => {
    const [record] = normalizeTextReview([
      { id: 'TXT-E3-9999', tier: 'generated', approval: { state: 'draft' }, requirements: [] }
    ]);
    expect(record.passed).toBe(false);
    expect(record.reviewedBy).toBeNull();
  });
});

describe('module routing', () => {
  test('QC-ROUTE-001: a JS test under tests/unit/<module>/ routes to that module (#1)', () => {
    expect(moduleForFile('/repo/tests/unit/t-demo/render.test.js', MODULES)).toBe('t-demo');
  });

  test('QC-ROUTE-001: a flat tests/unit/<module>-<topic>.test.js routes to that module (#1)', () => {
    expect(moduleForFile('tests/unit/t-ae-overview-ard.test.js', MODULES)).toBe('t-ae-overview');
    expect(moduleForFile('tests/unit/text.test.js', MODULES)).toBe('text');
  });

  test('QC-ROUTE-002: an R test file routes by longest-prefix match on the registry (#1)', () => {
    expect(moduleForFile('pipeline/tests/testthat/test-t-ae-overview-ard.R', MODULES)).toBe(
      't-ae-overview'
    );
    expect(moduleForFile('tests/testthat/test-tfl-engine.R', MODULES)).toBe('tfl-engine');
    expect(moduleForFile('test-templates-assembly.R', MODULES)).toBe('templates');
  });

  test('QC-ROUTE-003: an unroutable test file is shared scaffold (#1)', () => {
    expect(moduleForFile('tests/unit/site-render.test.js', MODULES)).toBeNull();
    expect(moduleForFile('tests/testthat/test-convention.R', MODULES)).toBeNull();
    expect(moduleForFile('', MODULES)).toBeNull();
  });

  test('QC-ROUTE-005: a component may declare the topic-named test stems it owns (#1)', () => {
    const modules = [...MODULES, 'traceability'];
    const routes = [
      { module: 'tfl-engine', testPrefixes: ['ard-build', 'data-prep'] },
      { module: 'traceability', testPrefixes: ['site-binding'] },
      { module: 'templates', testPrefixes: ['site-'] }
    ];
    expect(moduleForFile('pipeline/tests/testthat/test-ard-build.R', modules, routes)).toBe(
      'tfl-engine'
    );
    // Longest declared prefix wins over the general one.
    expect(moduleForFile('tests/unit/site-binding.test.js', modules, routes)).toBe('traceability');
    expect(moduleForFile('tests/unit/site-render.test.js', modules, routes)).toBe('templates');
    expect(moduleForFile('tests/testthat/test-unknown.R', modules, routes)).toBeNull();
    // A route naming an unregistered module is ignored, not obeyed.
    expect(
      moduleForFile('tests/unit/site-binding.test.js', MODULES, [
        { module: 'not-registered', testPrefixes: ['site-binding'] }
      ])
    ).toBeNull();
  });

  test('QC-ROUTE-005: a slug match always beats a declared prefix (#1)', () => {
    const routes = [{ module: 'templates', testPrefixes: ['t-'] }];
    expect(moduleForFile('tests/testthat/test-t-demo-ard.R', MODULES, routes)).toBe('t-demo');
  });

  test('QC-ROUTE-007: requirement-ID prefixes claim a record no test file could route (#1)', () => {
    const routes = [
      { module: 't-demo', prefixes: ['DSP-DEMO'] },
      { module: 't-ae-overview', prefixes: ['DSP-AE'] },
      { module: 'tfl-engine', prefixes: ['TFL'] }
    ];
    expect(modulesForRequirements(['DSP-DEMO-001'], routes, MODULES)).toEqual(['t-demo']);
    expect(modulesForRequirements(['TFL-ARD-001', 'DSP-AE-004'], routes, MODULES).sort()).toEqual([
      't-ae-overview',
      'tfl-engine'
    ]);
    // Cross-cutting IDs no entry claims stay shared, as does an unregistered owner.
    expect(modulesForRequirements(['DSP-ALL-001'], routes, MODULES)).toEqual([]);
    expect(modulesForRequirements(['DSP-DEMO-001'], routes, ['text'])).toEqual([]);
    expect(modulesForRequirements([], routes, MODULES)).toEqual([]);
  });

  test('QC-ROUTE-007: a prefix-claimed record lands only in its owners, not in every set (#1)', () => {
    const routed = buildEvidenceSets({
      modules: MODULES,
      routes: [
        { module: 't-demo', prefixes: ['DSP-DEMO'] },
        { module: 't-ae-overview', prefixes: ['DSP-AE'] }
      ],
      testthat: {
        records: [
          { file: 'test-displays.R', test: 'DSP-DEMO-001: demographics (#1)', status: 'pass' },
          { file: 'test-displays.R', test: 'DSP-ALL-001: every display renders (#1)', status: 'pass' }
        ]
      }
    });
    // The claimed record routes to its owner, and the cross-cutting one is
    // shared into that set alongside it.
    expect(routed['t-demo'].records.map((rec) => rec.title)).toEqual([
      'DSP-ALL-001: every display renders (#1)',
      'DSP-DEMO-001: demographics (#1)'
    ]);
    // A module with no record of its own still gets no set — shared records
    // alone never conjure one.
    expect(routed['t-ae-overview']).toBeUndefined();
  });

  test('QC-ROUTE-004: the module universe is the site registry, not code (#1)', () => {
    const registry = moduleRegistry({
      components: [{ module: 'tfl-engine' }, { module: 'text' }],
      displays: [{ slug: 't-demo' }, { module: 't-ae-overview', slug: 't-ae-overview' }]
    });
    expect(registry).toEqual(['tfl-engine', 'text', 't-demo', 't-ae-overview']);
    expect(moduleRegistry({})).toEqual([]);
  });
});

describe('evidence set assembly', () => {
  const sets = buildEvidenceSets({
    modules: MODULES,
    vitest: vitestJson,
    testthat: testthatJson,
    provenance: { generated: '2026-07-25T00:00:00Z', environment: { node: 'v24' }, run: null }
  });

  test('QC-ROUTE-003: shared scaffold records are duplicated into every module set (#1)', () => {
    expect(Object.keys(sets).sort()).toEqual(['t-ae-overview', 't-demo', 'tfl-engine']);
    for (const set of Object.values(sets)) {
      expect(set.records.some((r) => r.title.startsWith('QC-SITE-001'))).toBe(true);
      expect(set.records.some((r) => r.title.startsWith('QC-NAME-001'))).toBe(true);
    }
    // ...and module-routed records do NOT leak between modules.
    expect(sets['tfl-engine'].records.some((r) => r.title.startsWith('DSP-AE-001'))).toBe(false);
  });

  test('QC-EVID-001: records are sorted by suite then title, and provenance is quarantined (#1)', () => {
    const set = sets['t-demo'];
    const keys = set.records.map((r) => `${r.suite}|${r.title}`);
    expect([...keys].sort()).toEqual(keys);
    expect(set.generated).toBe('2026-07-25T00:00:00Z');
    expect(set.environment).toEqual({ node: 'v24' });
    expect(set.traceability).toBeTruthy();
  });

  test('QC-EVID-001: a module with no records at all gets no evidence set (#1)', () => {
    expect(sets.text).toBeUndefined();
    expect(sets.templates).toBeUndefined();
  });

  test('QC-ROUTE-006: a registry-owned suite routes to its component whatever the file path (#1)', () => {
    const routed = buildEvidenceSets({
      modules: MODULES,
      routes: [{ module: 'text', suites: ['text-review'] }],
      textReview: [
        {
          id: 'TXT-E3-1221',
          tier: 'parameterized',
          file: 'library/text/TXT-E3-1221.md',
          requirements: ['TXT-AE-001'],
          approval: { state: 'approved', by: '@jwildfire', at: '2026-07-25' }
        }
      ]
    });
    expect(Object.keys(routed)).toEqual(['text']);
    expect(routed.text.records[0].suite).toBe('text-review');
  });

  test('QC-EVID-005: an unapproved block is recorded as pending, distinguishable from a failure (#1)', () => {
    const routed = buildEvidenceSets({
      modules: MODULES,
      routes: [{ module: 'text', suites: ['text-review'] }],
      vitest: vitestJson,
      textReview: [{ id: 'TXT-E3-1206', tier: 'generated', approval: { state: 'draft' } }]
    });
    const notPassed = Object.values(routed).flatMap((set) => set.records.filter((r) => !r.passed));
    expect(notPassed.filter((r) => r.suite === 'text-review')).toHaveLength(1);
    expect(notPassed.filter((r) => r.suite !== 'text-review').length).toBeGreaterThan(0);
  });
});

describe('evidence freshness guard', () => {
  const committed = {
    generated: '2026-01-01T00:00:00Z',
    environment: { node: 'v20' },
    traceability: { ardHash: 'sha256:old' },
    records: [
      { suite: 'js-unit', title: 'A: one (#1)', passed: true },
      { suite: 'r-unit', title: 'B: two (#1)', passed: true }
    ]
  };

  test('QC-DRIFT-002: provenance and traceability differences alone are not drift (#1)', () => {
    const fresh = {
      generated: '2026-07-25T00:00:00Z',
      environment: { node: 'v24' },
      traceability: { ardHash: 'sha256:new' },
      records: committed.records
    };
    expect(compareEvidence(committed, fresh)).toEqual({ stale: false, differences: [] });
  });

  test('QC-DRIFT-002: a missing test, a new test and a status change are all drift (#1)', () => {
    const fresh = {
      records: [
        { suite: 'js-unit', title: 'A: one (#1)', passed: false },
        { suite: 'js-unit', title: 'C: three (#1)', passed: true }
      ]
    };
    const { stale, differences } = compareEvidence(committed, fresh);
    expect(stale).toBe(true);
    expect(differences).toContain('missing in fresh run: r-unit|B: two (#1)');
    expect(differences).toContain('status changed: js-unit|A: one (#1) (pass → fail)');
    expect(differences).toContain('new test not in committed evidence: js-unit|C: three (#1)');
  });
});

describe('evidence summary and run provenance', () => {
  test('QC-EVID-001: the summary counts records by suite and collects requirement IDs (#1)', () => {
    const summary = summarizeEvidence({
      records: [
        { suite: 'js-unit', passed: true, requirementIds: ['QC-SITE-001'] },
        { suite: 'r-unit', passed: false, requirementIds: ['TFL-ARD-001', 'QC-SITE-001'] }
      ]
    });
    expect(summary).toMatchObject({ total: 2, passed: 1, failed: 1 });
    expect(summary.bySuite).toEqual({
      'js-unit': { total: 1, passed: 1 },
      'r-unit': { total: 1, passed: 0 }
    });
    expect(summary.requirementIds).toEqual(['QC-SITE-001', 'TFL-ARD-001']);
  });

  test('QC-EVID-001: run provenance is null locally and built from the Actions env in CI (#1)', () => {
    expect(buildRun({})).toBeNull();
    expect(buildRun({ GITHUB_RUN_ID: '99', GITHUB_REPOSITORY: 'jwildfire/open.csr' })).toEqual({
      id: '99',
      url: 'https://github.com/jwildfire/open.csr/actions/runs/99'
    });
  });
});
