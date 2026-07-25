// Evidence pipeline CLI (open.csr #1). Runs the JS suite ONCE with the JSON
// reporter, picks up the R suite's committed results (contracts §8), routes
// every record to its module by test-file path, and (re)builds each
// docs/evidence/<module>/evidence.json.
//
//   node scripts/evidence.mjs            regenerate the evidence sets
//   node scripts/evidence.mjs --check    freshness guard: compare a fresh run's
//                                        titles + pass/fail against every
//                                        committed set; exit 1 on drift
//   node scripts/evidence.mjs --with-r   also run `Rscript qc/run-tests.R`
//                                        before reading its JSON
//   node scripts/evidence.mjs --no-run   skip the vitest run and reuse
//                                        qc/vitest-results.json (CI reuses the
//                                        results from the test step)
//
// Suite-once discipline (research §16): each suite runs at most once per
// invocation and everything else is derived, so R and JS never diverge into two
// "truths". Missing inputs degrade — no testthat results yet simply means the
// evidence sets carry the JS records — because the R pipeline and the site are
// built in parallel.

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from 'node:fs';
import os, { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEvidenceSets, buildRun, buildTraceability, compareEvidence } from './evidence-lib.mjs';
import { loadDisplayOutputs, loadTextBlocks, moduleUniverse } from './site-lib.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidenceRoot = path.join(rootDir, 'docs', 'evidence');
const evidencePathFor = (module) => path.join(evidenceRoot, module, 'evidence.json');
const rel = (p) => path.relative(rootDir, p);

const mode = process.argv.includes('--check') ? 'check' : 'run';
const withR = process.argv.includes('--with-r');
const noRun = process.argv.includes('--no-run');

const config = JSON.parse(readFileSync(path.join(rootDir, 'site', 'config.json'), 'utf8'));
const modules = moduleUniverse(rootDir, config);

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, ...env }
  });
  if (result.error) throw result.error;
  return result.status;
}

function readJson(file, label) {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    console.warn(`⚠ ${label} at ${rel(file)} is not valid JSON (${error.message}) — ignored.`);
    return null;
  }
}

// --- JS suite ---------------------------------------------------------------

const tmp = mkdtempSync(path.join(tmpdir(), 'opencsr-evidence-'));
const vitestOut = noRun ? path.join(rootDir, 'qc', 'vitest-results.json') : path.join(tmp, 'vitest.json');

if (!noRun) {
  console.log('▸ vitest (json reporter)…');
  run('npx', ['vitest', 'run', '--reporter=default', '--reporter=json', `--outputFile=${vitestOut}`]);
}
const vitest = readJson(vitestOut, 'vitest results');
if (!vitest) {
  // With --no-run and no reused report there are no JS records at all, which
  // would make every committed set look stale for the wrong reason. Fail loudly
  // instead of reporting phantom drift.
  console.error(
    `✗ no vitest results at ${rel(vitestOut)}. Run \`npx vitest run --reporter=json ` +
      `--outputFile=qc/vitest-results.json\` first, or drop --no-run.`
  );
  if (noRun) process.exit(1);
}

// --- R suite ----------------------------------------------------------------

const testthatOut = path.join(rootDir, 'qc', 'testthat-results.json');
if (withR) {
  if (existsSync(path.join(rootDir, 'qc', 'run-tests.R'))) {
    console.log('▸ testthat (qc/run-tests.R)…');
    run('Rscript', ['qc/run-tests.R']);
  } else {
    console.warn('⚠ --with-r requested but qc/run-tests.R does not exist yet — skipped.');
  }
}
const testthat = readJson(testthatOut, 'testthat results');
if (!testthat) {
  console.warn(
    `⚠ no testthat results at ${rel(testthatOut)} — run \`npm run test:r\` (or pass --with-r) ` +
      'once the R pipeline exists; evidence sets carry JS records only until then.'
  );
}

// --- Human review evidence --------------------------------------------------

const textBlocks = loadTextBlocks(rootDir, config).filter((block) => block.exists);

// --- Traceability per display ----------------------------------------------

const traceabilityByModule = {};
for (const display of config.displays || []) {
  const module = display.module || display.slug;
  const outputs = loadDisplayOutputs(rootDir, display.slug);
  traceabilityByModule[module] = buildTraceability({
    manifest: outputs.current ? outputs.current.manifest : null,
    ard: outputs.current ? outputs.current.ard : null,
    display: {
      ardFile: outputs.current ? outputs.current.ardFile : null,
      ardHash: outputs.current ? outputs.current.ardHash : null,
      displayFile: outputs.displayFile,
      version: outputs.current ? outputs.current.version : null
    }
  });
}

// --- Build ------------------------------------------------------------------

const provenance = {
  generated: new Date().toISOString(),
  environment: {
    os: `${os.platform()} ${os.release()}`,
    node: process.version,
    vitest: readJson(path.join(rootDir, 'node_modules', 'vitest', 'package.json'), 'vitest')?.version ?? null,
    ...((testthat && testthat.environment) || {})
  },
  run: buildRun(process.env)
};

const sets = buildEvidenceSets({
  modules,
  routes: [...(config.components || []), ...(config.displays || [])],
  vitest,
  testthat,
  textReview: textBlocks,
  traceabilityByModule,
  provenance
});

const committedModules = existsSync(evidenceRoot)
  ? readdirSync(evidenceRoot).filter((entry) => existsSync(evidencePathFor(entry)))
  : [];
const allModules = [...new Set([...Object.keys(sets), ...committedModules])].sort();

if (mode === 'check') {
  let stale = false;
  for (const module of allModules) {
    const evidencePath = evidencePathFor(module);
    if (!sets[module]) {
      stale = true;
      console.error(`✗ ${rel(evidencePath)} is committed but the fresh run produced no records.`);
      continue;
    }
    if (!existsSync(evidencePath)) {
      stale = true;
      console.error(`✗ ${rel(evidencePath)} is missing — run npm run evidence and commit.`);
      continue;
    }
    const committed = JSON.parse(readFileSync(evidencePath, 'utf8'));
    const { stale: moduleStale, differences } = compareEvidence(committed, sets[module]);
    if (moduleStale) {
      stale = true;
      console.error(`✗ ${rel(evidencePath)} is stale — run npm run evidence and commit:`);
      differences.forEach((d) => console.error(`  - ${d}`));
    } else {
      console.log(`✓ ${rel(evidencePath)} fresh: ${sets[module].records.length} records match.`);
    }
  }
  if (stale) process.exit(1);
} else {
  for (const module of Object.keys(sets).sort()) {
    const evidencePath = evidencePathFor(module);
    mkdirSync(path.dirname(evidencePath), { recursive: true });
    writeFileSync(evidencePath, JSON.stringify(sets[module], null, 2) + '\n');
    console.log(`✓ Wrote ${rel(evidencePath)} — ${sets[module].records.length} records`);
  }
  for (const module of committedModules.filter((entry) => !sets[entry])) {
    console.warn(
      `⚠ ${rel(evidencePathFor(module))} is committed but the fresh run produced no records ` +
        'for it — remove it (with approval) or restore its tests.'
    );
  }
  // Shared scaffold records appear in every set; count distinct records once.
  const distinct = new Map();
  for (const set of Object.values(sets)) {
    for (const rec of set.records) distinct.set(`${rec.suite}|${rec.title}`, rec);
  }
  const failures = [...distinct.values()].filter((rec) => !rec.passed && rec.suite !== 'text-review');
  // A generated-tier block awaiting human approval is a normal lifecycle state
  // (design D8), not a test failure — it is reported, and it blocks assembly,
  // but it does not fail the evidence run.
  const pending = [...distinct.values()].filter((rec) => !rec.passed && rec.suite === 'text-review');
  if (pending.length) {
    console.log(`· ${pending.length} text block(s) awaiting human approval:`);
    pending.forEach((rec) => console.log(`  - ${rec.title}`));
  }
  console.log(failures.length ? `✗ ${failures.length} FAILING tests` : '✓ All tests passing');
  if (failures.length) process.exit(1);
}
