#!/usr/bin/env node
/**
 * apply-text-decision.mjs — apply one text review decision to the repository
 * (repo #2, requirement jwildfire/obot.roadmap#115).
 *
 *   node scripts/apply-text-decision.mjs --decision approve --block TXT-E3-1222
 *   node scripts/apply-text-decision.mjs --decision changes --block TXT-E3-1231 \
 *       --note "Soften the causality claim in the second paragraph."
 *   node scripts/apply-text-decision.mjs --decision approve --block TXT-E3-1222 --dry-run
 *
 * The reviewer clicks on the demo site; the site dispatches a `text-decision`
 * repository_dispatch; `.github/workflows/text-decision.yml` runs this script and
 * commits what it changed. Everything that decides whether the change is SAFE
 * lives in scripts/text-decision-lib.mjs and is unit-tested there; this file is
 * the boundary: flags and environment in, a report and an exit code out.
 *
 * Flags (each also readable from the environment, because the workflow must not
 * interpolate a reviewer-authored note into a shell command line):
 *
 *   --decision   TEXT_DECISION    approve | changes
 *   --block      TEXT_BLOCK       text-block id, e.g. TXT-E3-1222
 *   --note       TEXT_NOTE        change-request note (required for `changes`)
 *   --reviewer   TEXT_REVIEWER    GitHub login of the reviewer
 *   --run-id     GITHUB_RUN_ID    the Actions run applying the decision
 *   --run-url    TEXT_RUN_URL     link to that run (derived when absent)
 *   --report     path             write a markdown report (job summary / comment)
 *   --root       path             repository root (defaults to this checkout)
 *   --ard-dir    path             extra ARD search directory (repeatable;
 *                                 TEXT_DECISION_ARD_DIRS takes a colon-separated list)
 *   --dry-run                     report only; write nothing, run no assembler
 *
 * Exit codes: 0 applied or recorded · 1 the decision did not land (failed or
 * blocked — the tree is unchanged and MUST NOT be committed) · 2 the request was
 * invalid and never reached a block.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyTextDecision, TextDecisionError } from './text-decision-lib.mjs';

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function parseArgs(argv) {
  const args = argv.slice(2);
  const has = (name) => args.includes(`--${name}`);
  const val = (name) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? null : (args[i + 1] ?? null);
  };
  const env = process.env;
  const runId = val('run-id') ?? env.GITHUB_RUN_ID ?? null;
  const repo = env.GITHUB_REPOSITORY ?? 'jwildfire/open.csr';
  // Extra ARD search paths, for a tree whose displays have not been regenerated
  // (and for the fixture trees the unit suites build).
  const ardDirs = [
    ...args.flatMap((arg, i) => (arg === '--ard-dir' && args[i + 1] ? [args[i + 1]] : [])),
    ...(env.TEXT_DECISION_ARD_DIRS ?? '').split(':').filter(Boolean),
  ];
  return {
    root: resolve(val('root') ?? env.TEXT_DECISION_ROOT ?? HERE),
    dryRun: has('dry-run'),
    report: val('report'),
    ardDirs,
    payload: {
      decision: val('decision') ?? env.TEXT_DECISION ?? null,
      blockId: val('block') ?? env.TEXT_BLOCK ?? null,
      note: val('note') ?? env.TEXT_NOTE ?? null,
      reviewer: val('reviewer') ?? env.TEXT_REVIEWER ?? null,
      runId,
      runUrl:
        val('run-url') ??
        env.TEXT_RUN_URL ??
        (runId ? `https://github.com/${repo}/actions/runs/${runId}` : null),
    },
  };
}

const HEADLINE = {
  applied: '✅ Applied',
  recorded: '📝 Recorded',
  failed: '⛔ Not applied — the gates failed and the edit was reverted',
  blocked: '⛔ Not applied — the gates were already failing',
};

/** Markdown for the job summary and (later) the review page's run link. */
export function renderReport(result) {
  const { entry, gate, dryRun } = result;
  const lines = [];
  lines.push(`## Text decision — \`${entry.block}\`${dryRun ? ' (dry run)' : ''}`, '');
  lines.push(`**${HEADLINE[result.outcome]}**`, '');
  lines.push(`| | |`, `| --- | --- |`);
  lines.push(`| Block | \`${entry.block}\` (${entry.tier ?? 'unknown tier'}) |`);
  lines.push(`| Decision | ${entry.decision} |`);
  lines.push(`| Reviewer | ${entry.reviewer ?? '—'} |`);
  lines.push(`| Approval | ${entry.priorState} → ${entry.newState} |`);
  lines.push(`| Outcome | \`${entry.outcome}\` |`);
  if (entry.runUrl) lines.push(`| Run | ${entry.runUrl} |`);
  lines.push('');
  if (entry.note) lines.push(`> ${entry.note.split('\n').join('\n> ')}`, '');
  if (entry.detail) lines.push(entry.detail, '');
  if (gate?.failures?.length) {
    lines.push('### Gate failures', '', ...gate.failures.map((f) => `- ${f}`), '');
  }
  if (gate?.deferred?.length) {
    lines.push(
      '### Deferred (blocks excluded from assembly — reported, not failed)',
      '',
      ...gate.deferred.map((d) => `- ${d}`),
      ''
    );
  }
  if (result.preview) {
    lines.push('### Frontmatter change', '', '```diff', `- ${result.preview.before}`, `+ ${result.preview.after}`, '```', '');
  }
  if (result.changed?.length) {
    lines.push(`Changed: ${result.changed.map((c) => `\`${c}\``).join(', ')}`, '');
  }
  lines.push(
    '---',
    'Applied by `scripts/apply-text-decision.mjs` for [requirement #115](https://github.com/jwildfire/obot.roadmap/issues/115). ' +
      'An approval re-runs the assembler and the full gate set before anything is committed; a decision that breaks the report is reverted, not merged.'
  );
  return lines.join('\n');
}

async function main() {
  const options = parseArgs(process.argv);
  let result;
  try {
    result = applyTextDecision(options);
  } catch (error) {
    if (error instanceof TextDecisionError) {
      console.error(`apply-text-decision: refused (${error.code}) — ${error.message}`);
      process.exitCode = 2;
      return;
    }
    throw error;
  }

  const md = renderReport(result);
  if (options.report) writeFileSync(options.report, `${md}\n`);
  console.log(md);

  process.exitCode = result.outcome === 'applied' || result.outcome === 'recorded' ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
