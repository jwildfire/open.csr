/**
 * Fixture ARD generator.
 *
 * The R pipeline (`opencsr::build_ard()`) is the production source of
 * `outputs/<slug>/vNNN/ard.json`. These fixtures are stand-ins that mirror the
 * pipeline's schema (contracts.md §5) AND its vocabulary — the same analysis
 * names, statistic names, grouping columns, hierarchical `group2` nesting and
 * listing record keys — so the Text Library, the gates and the assembler can be
 * developed and tested without depending on an R run.
 *
 * Conventions copied from the pipeline, deliberately:
 *   - `p` is a PROPORTION in [0,1] with stat_label "%". Prose scales it with the
 *     binding qualifier `;scale=100;digits=1`.
 *   - Every subject_count analysis emits n, N (the denominator) and p.
 *   - Hierarchical counts: SOC rows carry variable AEBODSYS; PT rows carry
 *     variable AEDECOD plus group2 = AEBODSYS / group2_level = the parent SOC.
 *   - Listings key records with group1 "record" and a zero-padded group1_level.
 *
 * The VALUES are synthetic. They are internally consistent and plausible for
 * CDISCPILOT01 but they are not a pipeline run: every fixture carries
 * `provenance.fixture: true`, and `assemble.mjs` records `ardSource: "fixture"`
 * and shows a banner when it falls back to one.
 *
 * Run:  node tests/fixtures/make-fixtures.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'ard');

const GROUPS = ['Placebo', 'Xanomeline Low Dose', 'Xanomeline High Dose', 'Total'];
const N = { Placebo: 80, 'Xanomeline Low Dose': 90, 'Xanomeline High Dose': 70, Total: 240 };

const STAT_LABELS = { n: 'n', N: 'N', p: '%', mean: 'Mean', sd: 'SD', median: 'Median',
  p25: 'Q1', p75: 'Q3', min: 'Min', max: 'Max' };

function row(o) {
  return {
    analysis: o.analysis,
    group1: o.group1 ?? null,
    group1_level: o.group1_level ?? null,
    group2: o.group2 ?? null,
    group2_level: o.group2_level ?? null,
    variable: o.variable ?? null,
    variable_level: o.variable_level ?? null,
    context: o.context,
    stat_name: o.stat_name,
    stat_label: o.stat_label ?? STAT_LABELS[o.stat_name] ?? o.stat_name,
    stat: o.stat,
    warning: o.warning ?? null,
    error: o.error ?? null,
  };
}

/** n / N / p triple per treatment group, the pipeline's subject_count shape. */
function subjectCount(analysis, variable, counts, { variableLevel = 'Y', context = 'subject_count' } = {}) {
  const rows = [];
  for (const g of GROUPS) {
    const base = { analysis, group1: 'TRT01A', group1_level: g, variable, variable_level: variableLevel, context };
    rows.push(row({ ...base, stat_name: 'n', stat: counts[g] }));
    rows.push(row({ ...base, stat_name: 'N', stat: N[g] }));
    rows.push(row({ ...base, stat_name: 'p', stat: counts[g] / N[g] }));
  }
  return rows;
}

/** One n/N/p triple per level, per group. */
function categorical(analysis, variable, levels) {
  return Object.entries(levels).flatMap(([level, counts]) =>
    subjectCount(analysis, variable, counts, { variableLevel: level, context: 'categorical' })
  );
}

/** N / mean / sd / median / p25 / p75 / min / max per group. */
function continuous(analysis, variable, stats) {
  return GROUPS.flatMap((g) =>
    Object.entries(stats[g]).map(([statName, value]) =>
      row({
        analysis,
        group1: 'TRT01A',
        group1_level: g,
        variable,
        context: 'continuous',
        stat_name: statName,
        stat: value,
      })
    )
  );
}

/** Spread a per-group summary across the four standard statistics. */
const cont = (mean, sd, median, p25, p75, min, max) => (g) => ({
  N: N[g], mean, sd, median, p25, p75, min, max,
});

function envelope(display, datasets) {
  return {
    schema: 'opencsr/ard/v1',
    display,
    created: '2026-07-25T00:00:00Z',
    provenance: {
      fixture: true,
      note: 'Synthetic fixture ARD — pipeline vocabulary, synthetic values. Not a pipeline run.',
      spec_hash: `sha256:fixture-${display}-analysis`,
      display_hash: `sha256:fixture-${display}-display`,
      data: datasets,
      environment: {
        r: '4.3.3',
        os: 'fixture',
        packages: { cards: '0.6.1', cardx: '0.2.5', gtsummary: '2.3.0' },
      },
      git_commit: null,
    },
  };
}

const ds = (dataset, n_row) => ({
  dataset,
  hash: `sha256:fixture-${dataset}`,
  n_row,
  source_pkg: 'pharmaverseadam',
  source_version: '1.1.0',
});

// ---------------------------------------------------------------- t-disposition
const disposition = {
  ...envelope('t-disposition', [ds('adsl', 254)]),
  rows: [
    ...subjectCount('randomised', 'RANDFL', N),
    ...subjectCount('treated', 'SAFFL', N),
    ...subjectCount('completed', 'COMPLFL', {
      Placebo: 56, 'Xanomeline Low Dose': 27, 'Xanomeline High Dose': 28, Total: 111 }),
    ...subjectCount('discontinued', 'DISCFL', {
      Placebo: 24, 'Xanomeline Low Dose': 63, 'Xanomeline High Dose': 42, Total: 129 }),
    ...subjectCount('disc_death', 'DISCREAS', {
      Placebo: 2, 'Xanomeline Low Dose': 1, 'Xanomeline High Dose': 0, Total: 3 }),
    ...subjectCount('disc_other', 'DISCREAS', {
      Placebo: 22, 'Xanomeline Low Dose': 62, 'Xanomeline High Dose': 42, Total: 126 }),
    ...subjectCount('died', 'DTHFL', {
      Placebo: 2, 'Xanomeline Low Dose': 1, 'Xanomeline High Dose': 0, Total: 3 }),
  ],
};

// -------------------------------------------------------------- t-demographics
const AGE = {
  Placebo: cont(75.0, 8.5, 76, 70, 81, 52, 89)('Placebo'),
  'Xanomeline Low Dose': cont(76.0, 8.1, 78, 71, 82, 51, 88)('Xanomeline Low Dose'),
  'Xanomeline High Dose': cont(74.0, 7.9, 75, 69, 80, 56, 88)('Xanomeline High Dose'),
  Total: cont(75.0, 8.2, 77, 70, 81, 51, 89)('Total'),
};
const bl = (mean, sd, median, p25, p75, min, max) =>
  Object.fromEntries(GROUPS.map((g) => [g, cont(mean, sd, median, p25, p75, min, max)(g)]));

const demographics = {
  ...envelope('t-demographics', [ds('adsl', 254)]),
  rows: [
    ...continuous('age', 'AGE', AGE),
    ...categorical('agegr', 'AGEGR1', {
      '18-64': { Placebo: 10, 'Xanomeline Low Dose': 12, 'Xanomeline High Dose': 8, Total: 30 },
      '>64': { Placebo: 70, 'Xanomeline Low Dose': 78, 'Xanomeline High Dose': 62, Total: 210 },
    }),
    ...categorical('sex', 'SEX', {
      F: { Placebo: 50, 'Xanomeline Low Dose': 52, 'Xanomeline High Dose': 34, Total: 136 },
      M: { Placebo: 30, 'Xanomeline Low Dose': 38, 'Xanomeline High Dose': 36, Total: 104 },
    }),
    ...categorical('race', 'RACE', {
      WHITE: { Placebo: 72, 'Xanomeline Low Dose': 84, 'Xanomeline High Dose': 60, Total: 216 },
      'BLACK OR AFRICAN AMERICAN': {
        Placebo: 7, 'Xanomeline Low Dose': 5, 'Xanomeline High Dose': 9, Total: 21 },
      'AMERICAN INDIAN OR ALASKA NATIVE': {
        Placebo: 1, 'Xanomeline Low Dose': 1, 'Xanomeline High Dose': 1, Total: 3 },
    }),
    ...categorical('ethnic', 'ETHNIC', {
      'HISPANIC OR LATINO': {
        Placebo: 3, 'Xanomeline Low Dose': 3, 'Xanomeline High Dose': 2, Total: 8 },
      'NOT HISPANIC OR LATINO': {
        Placebo: 77, 'Xanomeline Low Dose': 87, 'Xanomeline High Dose': 68, Total: 232 },
    }),
    ...continuous('baseline', 'BLWT', bl(74.2, 15.1, 73.0, 63.5, 84.0, 45.0, 116.0)),
    ...continuous('baseline', 'BLHT', bl(163.5, 10.2, 163.0, 156.0, 171.0, 137.0, 190.0)),
    ...continuous('baseline', 'BLBMI', bl(27.6, 4.9, 27.2, 24.1, 30.6, 17.0, 44.0)),
  ],
};

// ------------------------------------------------------------------ t-exposure
const exposure = {
  ...envelope('t-exposure', [ds('adsl', 254), ds('adex', 1131)]),
  rows: [
    ...continuous('duration', 'AVAL', {
      Placebo: cont(145.0, 62.0, 180, 100, 190, 0, 210)('Placebo'),
      'Xanomeline Low Dose': cont(85.0, 70.0, 62, 26, 150, 0, 212)('Xanomeline Low Dose'),
      'Xanomeline High Dose': cont(110.0, 65.0, 95, 50, 175, 15, 200)('Xanomeline High Dose'),
      Total: cont(113.0, 71.0, 130, 45, 185, 0, 212)('Total'),
    }),
    ...continuous('total_dose', 'AVAL', bl(6100.0, 4200.0, 5400.0, 2400.0, 9600.0, 0.0, 16800.0)),
    ...continuous('avg_daily_dose', 'AVAL', bl(58.0, 22.0, 54.0, 40.0, 78.0, 0.0, 81.0)),
    ...continuous('dose_intensity', 'AVAL', bl(88.4, 16.2, 95.0, 82.0, 100.0, 12.0, 100.0)),
    ...subjectCount('dur_any', 'EXPCAT', {
      Placebo: 79, 'Xanomeline Low Dose': 89, 'Xanomeline High Dose': 70, Total: 238 }),
    ...subjectCount('dur_30', 'EXPCAT', {
      Placebo: 72, 'Xanomeline Low Dose': 61, 'Xanomeline High Dose': 65, Total: 198 }),
    ...subjectCount('dur_90', 'EXPCAT', {
      Placebo: 62, 'Xanomeline Low Dose': 38, 'Xanomeline High Dose': 37, Total: 137 }),
    ...subjectCount('dur_180', 'EXPCAT', {
      Placebo: 51, 'Xanomeline Low Dose': 24, 'Xanomeline High Dose': 25, Total: 100 }),
  ],
};

// --------------------------------------------------------------- t-ae-overview
const aeOverview = {
  ...envelope('t-ae-overview', [ds('adsl', 254), ds('adae', 1191)]),
  rows: [
    ...GROUPS.map((g) =>
      row({
        analysis: 'n_events',
        group1: 'TRT01A',
        group1_level: g,
        variable: 'AENUM',
        context: 'event_count',
        stat_name: 'n',
        stat: { Placebo: 270, 'Xanomeline Low Dose': 410, 'Xanomeline High Dose': 400, Total: 1080 }[g],
      })
    ),
    ...subjectCount('any_ae', 'AEFL', {
      Placebo: 60, 'Xanomeline Low Dose': 79, 'Xanomeline High Dose': 66, Total: 205 }),
    ...subjectCount('serious_ae', 'AESERFL', {
      Placebo: 0, 'Xanomeline Low Dose': 2, 'Xanomeline High Dose': 1, Total: 3 }),
    ...subjectCount('fatal_ae', 'AEFATFL', {
      Placebo: 2, 'Xanomeline Low Dose': 1, 'Xanomeline High Dose': 0, Total: 3 }),
    ...subjectCount('related_ae', 'AERELFL', {
      Placebo: 40, 'Xanomeline Low Dose': 72, 'Xanomeline High Dose': 62, Total: 174 }),
    ...subjectCount('sev_mild', 'AESEVFL', {
      Placebo: 54, 'Xanomeline Low Dose': 60, 'Xanomeline High Dose': 62, Total: 176 }),
    ...subjectCount('sev_moderate', 'AESEVFL', {
      Placebo: 23, 'Xanomeline Low Dose': 54, 'Xanomeline High Dose': 44, Total: 121 }),
    ...subjectCount('sev_severe', 'AESEVFL', {
      Placebo: 5, 'Xanomeline Low Dose': 15, 'Xanomeline High Dose': 8, Total: 28 }),
  ],
};

// ----------------------------------------------------------------- t-ae-common
const SOC = {
  'GENERAL DISORDERS AND ADMINISTRATION SITE CONDITIONS': {
    counts: { Placebo: 20, 'Xanomeline Low Dose': 48, 'Xanomeline High Dose': 34, Total: 102 },
    pts: {
      'APPLICATION SITE PRURITUS': { Placebo: 6, 'Xanomeline Low Dose': 22, 'Xanomeline High Dose': 20, Total: 48 },
      'APPLICATION SITE ERYTHEMA': { Placebo: 3, 'Xanomeline Low Dose': 12, 'Xanomeline High Dose': 13, Total: 28 },
      'APPLICATION SITE IRRITATION': { Placebo: 3, 'Xanomeline Low Dose': 9, 'Xanomeline High Dose': 9, Total: 21 },
    },
  },
  'SKIN AND SUBCUTANEOUS TISSUE DISORDERS': {
    counts: { Placebo: 19, 'Xanomeline Low Dose': 37, 'Xanomeline High Dose': 37, Total: 93 },
    pts: {
      PRURITUS: { Placebo: 8, 'Xanomeline Low Dose': 20, 'Xanomeline High Dose': 24, Total: 52 },
      ERYTHEMA: { Placebo: 8, 'Xanomeline Low Dose': 13, 'Xanomeline High Dose': 13, Total: 34 },
      RASH: { Placebo: 5, 'Xanomeline Low Dose': 12, 'Xanomeline High Dose': 8, Total: 25 },
    },
  },
  'NERVOUS SYSTEM DISORDERS': {
    counts: { Placebo: 8, 'Xanomeline Low Dose': 21, 'Xanomeline High Dose': 22, Total: 51 },
    pts: {
      DIZZINESS: { Placebo: 2, 'Xanomeline Low Dose': 9, 'Xanomeline High Dose': 10, Total: 21 },
      HEADACHE: { Placebo: 4, 'Xanomeline Low Dose': 6, 'Xanomeline High Dose': 6, Total: 16 },
    },
  },
  'GASTROINTESTINAL DISORDERS': {
    counts: { Placebo: 16, 'Xanomeline Low Dose': 14, 'Xanomeline High Dose': 18, Total: 48 },
    pts: {
      DIARRHOEA: { Placebo: 9, 'Xanomeline Low Dose': 5, 'Xanomeline High Dose': 3, Total: 17 },
      NAUSEA: { Placebo: 5, 'Xanomeline Low Dose': 4, 'Xanomeline High Dose': 5, Total: 14 },
    },
  },
};

const aeCommonRows = [];
// Column header counts: subjects per treatment group, as the pipeline emits them.
for (const g of GROUPS.filter((x) => x !== 'Total')) {
  for (const [statName, stat] of [['n', N[g]], ['N', N.Total], ['p', N[g] / N.Total]]) {
    aeCommonRows.push(
      row({ analysis: 'by_soc_pt', variable: 'TRT01A', variable_level: g, context: 'categorical', stat_name: statName, stat })
    );
  }
}
for (const [soc, { counts, pts }] of Object.entries(SOC)) {
  aeCommonRows.push(
    ...subjectCount('by_soc_pt', 'AEBODSYS', counts, { variableLevel: soc, context: 'hierarchical' })
  );
  for (const [pt, ptCounts] of Object.entries(pts)) {
    aeCommonRows.push(
      ...subjectCount('by_soc_pt', 'AEDECOD', ptCounts, {
        variableLevel: pt,
        context: 'hierarchical',
      }).map((r) => ({ ...r, group2: 'AEBODSYS', group2_level: soc }))
    );
  }
}
const aeCommon = { ...envelope('t-ae-common', [ds('adsl', 254), ds('adae', 1191)]), rows: aeCommonRows };

// --------------------------------------------------------------- l-ae-serious
const SAE_COLUMNS = ['USUBJID', 'TRT01A', 'AGE', 'SEX', 'AEBODSYS', 'AEDECOD', 'AESEV', 'AEREL', 'ASTDY', 'AENDY', 'AEOUT'];
const SAE_RECORDS = [
  ['01-701-1015', 'Placebo', '63', 'F', 'CARDIAC DISORDERS', 'MYOCARDIAL INFARCTION', 'SEVERE', 'N', '42', '46', 'RECOVERED'],
  ['01-703-1119', 'Xanomeline Low Dose', '79', 'M', 'NERVOUS SYSTEM DISORDERS', 'SYNCOPE', 'SEVERE', 'Y', '17', '18', 'RECOVERED'],
  ['01-704-1164', 'Xanomeline High Dose', '81', 'F', 'INFECTIONS AND INFESTATIONS', 'PNEUMONIA', 'SEVERE', 'N', '96', '104', 'RECOVERED'],
];
const saeRows = SAE_RECORDS.flatMap((rec, i) =>
  SAE_COLUMNS.map((col, j) =>
    row({
      analysis: 'sae_records',
      group1: 'record',
      group1_level: String(i + 1).padStart(4, '0'),
      variable: col,
      context: 'listing',
      stat_name: 'value',
      stat_label: col,
      stat: rec[j],
    })
  )
);
const aeSerious = { ...envelope('l-ae-serious', [ds('adsl', 254), ds('adae', 1191)]), rows: saeRows };

// ------------------------------- t-vitals / t-vitals-change / t-weight / t-conmeds
// The vital signs, weight and concomitant-medication group. Two things about
// these displays differ from the six above and the fixtures carry both, because
// a fixture that quietly normalised them would let a gate pass on a shape the
// pipeline never produces: they group by TRT01P rather than TRT01A, and they
// declare no pooled Total column.
const ARMS = ['Placebo', 'Xanomeline Low Dose', 'Xanomeline High Dose'];

/** N / mean / sd / median / p25 / p75 / min / max per arm, grouped by TRT01P. */
function armContinuous(analysis, variable, base) {
  return ARMS.flatMap((g, k) =>
    Object.entries({
      N: N[g] - k, mean: base.mean + k, sd: base.sd, median: base.median,
      p25: base.median - 6, p75: base.median + 6, min: base.min, max: base.max,
    }).map(([statName, value]) =>
      row({ analysis, group1: 'TRT01P', group1_level: g, variable,
        context: 'continuous', stat_name: statName, stat: value })
    )
  );
}

/** n / N / p per arm, grouped by TRT01P. */
function armCount(analysis, variable, counts, opts = {}) {
  const { variableLevel = 'Y', context = 'subject_count', group2, group2Level } = opts;
  return ARMS.flatMap((g) => {
    const base = { analysis, group1: 'TRT01P', group1_level: g, variable,
      variable_level: variableLevel, context,
      group2: group2 ?? null, group2_level: group2Level ?? null };
    return [
      row({ ...base, stat_name: 'n', stat: counts[g] }),
      row({ ...base, stat_name: 'N', stat: N[g] }),
      row({ ...base, stat_name: 'p', stat: counts[g] / N[g] }),
    ];
  });
}

const POPULATION = armCount('population', 'POPFL', {
  Placebo: N.Placebo, 'Xanomeline Low Dose': N['Xanomeline Low Dose'],
  'Xanomeline High Dose': N['Xanomeline High Dose'],
});

const MEASURES = [['sbp', 138, 17, 136, 90, 190], ['dbp', 76, 10, 76, 40, 110],
  ['pulse', 71, 10, 70, 47, 134]];
const POSITIONS = ['lying', 'stand1', 'stand3'];

function vitalsRows(variable, visits, shift) {
  const rows = [...POPULATION];
  for (const [m, mean, sd, median, min, max] of MEASURES) {
    for (const p of POSITIONS) {
      for (const v of visits) {
        rows.push(...armContinuous(`${m}_${p}_${v}`, variable,
          { mean: mean + shift, sd, median: median + shift, min: min + shift, max: max + shift }));
      }
    }
  }
  return rows;
}

const vitals = {
  ...envelope('t-vitals', [ds('adsl', 254), ds('advs', 65032)]),
  rows: vitalsRows('AVAL', ['bl', 'wk24', 'eot'], 0),
};

const vitalsChange = {
  ...envelope('t-vitals-change', [ds('adsl', 254), ds('advs', 65032)]),
  rows: vitalsRows('CHGBL', ['wk24', 'eot'], -136),
};

const weight = {
  ...envelope('t-weight', [ds('adsl', 254), ds('advs', 65032)]),
  rows: [
    ...POPULATION,
    ...['bl', 'wk24', 'eot'].flatMap((v) =>
      armContinuous(`wt_${v}`, 'AVAL', { mean: 63, sd: 12.8, median: 61, min: 34, max: 108 })),
    ...['wk24', 'eot'].flatMap((v) =>
      armContinuous(`chg_${v}`, 'CHGBL', { mean: 0.1, sd: 2.3, median: 0, min: -14.5, max: 33.3 })),
  ],
};

const CM_CLASSES = {
  UNCODED: { counts: { Placebo: 74, 'Xanomeline Low Dose': 70, 'Xanomeline High Dose': 77 },
    terms: { UNCODED: { Placebo: 74, 'Xanomeline Low Dose': 70, 'Xanomeline High Dose': 77 } } },
  'NERVOUS SYSTEM': { counts: { Placebo: 23, 'Xanomeline Low Dose': 14, 'Xanomeline High Dose': 8 },
    terms: {
      'ACETYLSALICYLIC ACID': { Placebo: 21, 'Xanomeline Low Dose': 11, 'Xanomeline High Dose': 6 },
      'DONEPEZIL HYDROCHLORIDE': { Placebo: 1, 'Xanomeline Low Dose': 2, 'Xanomeline High Dose': 2 },
    } },
  'CARDIOVASCULAR SYSTEM': { counts: { Placebo: 12, 'Xanomeline Low Dose': 12, 'Xanomeline High Dose': 7 },
    terms: { AMLODIPINE: { Placebo: 8, 'Xanomeline Low Dose': 1, 'Xanomeline High Dose': 2 } } },
};

const conmedRows = [
  ...armCount('any_conmed', 'CMFL', {
    Placebo: 77, 'Xanomeline Low Dose': 74, 'Xanomeline High Dose': 78 }),
];
// The by-variable summary {cards} stacks alongside a hierarchical count.
for (const g of ARMS) {
  for (const [statName, stat] of [['n', N[g]], ['N', N.Total], ['p', N[g] / N.Total]]) {
    conmedRows.push(row({ analysis: 'by_class_term', variable: 'TRT01P', variable_level: g,
      context: 'categorical', stat_name: statName, stat }));
  }
}
for (const [cls, { counts, terms }] of Object.entries(CM_CLASSES)) {
  conmedRows.push(...armCount('by_class_term', 'CMCLAS', counts,
    { variableLevel: cls, context: 'hierarchical' }));
  for (const [term, termCounts] of Object.entries(terms)) {
    conmedRows.push(...armCount('by_class_term', 'CMDECOD', termCounts,
      { variableLevel: term, context: 'hierarchical', group2: 'CMCLAS', group2Level: cls }));
  }
}
const conmeds = { ...envelope('t-conmeds', [ds('adsl', 254), ds('adcm', 7510)]), rows: conmedRows };

const FIXTURES = {
  't-disposition': disposition,
  't-demographics': demographics,
  't-exposure': exposure,
  't-ae-overview': aeOverview,
  't-ae-common': aeCommon,
  'l-ae-serious': aeSerious,
  't-vitals': vitals,
  't-vitals-change': vitalsChange,
  't-weight': weight,
  't-conmeds': conmeds,
};

export function buildFixtures() {
  return FIXTURES;
}

mkdirSync(OUT, { recursive: true });
for (const [slug, ard] of Object.entries(FIXTURES)) {
  writeFileSync(join(OUT, `${slug}.json`), `${JSON.stringify(ard, null, 2)}\n`);
}
console.log(`wrote ${Object.keys(FIXTURES).length} fixture ARDs to ${OUT}`);
