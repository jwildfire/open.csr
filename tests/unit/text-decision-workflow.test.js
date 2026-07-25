/**
 * The apply workflow as a tested artifact.
 *
 * A workflow file is the one part of this lane that cannot be exercised locally,
 * which is exactly why its guarantees are asserted rather than assumed: it must
 * parse, it must only run for @jwildfire, it must never interpolate
 * reviewer-authored text into a shell command, it must re-run CI's R-independent
 * half before it commits, and it must keep a fallback trigger for the day the
 * browser token has expired.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

import { ROOT } from './text-decision-helpers.js';

const FILE = join(ROOT, '.github/workflows/text-decision.yml');
const source = readFileSync(FILE, 'utf8');
// `on:` is YAML 1.1 truthy, so js-yaml parses the key as boolean true.
const workflow = yaml.load(source);
const triggers = workflow.on ?? workflow[true];
const job = workflow.jobs.apply;
const steps = job.steps;

describe('the text-decision workflow', () => {
  it('QC-SIGN-013: the workflow parses and triggers on the text-decision dispatch (#2)', () => {
    expect(workflow.name).toBe('text-decision');
    expect(triggers.repository_dispatch.types).toEqual(['text-decision']);
    expect(workflow.permissions).toEqual({ contents: 'write' });
    expect(workflow.concurrency['cancel-in-progress']).toBe(false);
  });

  it('QC-SIGN-013: only @jwildfire can apply a decision (#2)', () => {
    expect(job.if).toContain("github.event.sender.login == 'jwildfire'");
    expect(job.if).toContain("github.actor == 'jwildfire'");
    expect(job.if).toContain("github.event_name == 'repository_dispatch'");
  });

  it('QC-SIGN-013: workflow_dispatch is a documented fallback with the same inputs (#2)', () => {
    const inputs = triggers.workflow_dispatch.inputs;
    expect(Object.keys(inputs).sort()).toEqual(['blockId', 'decision', 'note', 'reviewer']);
    expect(inputs.decision.options).toEqual(['approve', 'changes']);
    expect(inputs.decision.required).toBe(true);
    expect(inputs.blockId.required).toBe(true);
    expect(source).toMatch(/documented fallback/i);
  });

  it('QC-SIGN-003: reviewer-authored payload text never reaches a shell command line (#2)', () => {
    for (const step of steps) {
      if (!step.run) continue;
      expect(step.run).not.toMatch(/client_payload/);
      expect(step.run).not.toMatch(/inputs\.note/);
      expect(step.run).not.toMatch(/\$\{\{[^}]*note[^}]*\}\}/i);
    }
    const apply = steps.find((s) => s.id === 'apply');
    expect(apply.env.TEXT_NOTE).toMatch(/client_payload\.note/);
    expect(apply.env.TEXT_BLOCK).toMatch(/client_payload\.blockId/);
    expect(apply.run).toMatch(/apply-text-decision\.mjs/);
  });

  it('QC-SIGN-013: the R-independent CI checks run before anything is committed (#2)', () => {
    const index = (pattern) => steps.findIndex((s) => (s.run ?? '').match(pattern));
    const applyStep = steps.findIndex((s) => s.id === 'apply');
    const vitest = index(/vitest run/);
    const requirements = index(/requirements\.mjs --check/);
    const evidence = index(/evidence\.mjs/);
    const site = index(/site\.mjs/);
    const commit = index(/git commit/);

    for (const step of [vitest, requirements, evidence, site, commit]) expect(step).toBeGreaterThan(-1);
    expect(applyStep).toBeLessThan(vitest);
    for (const step of [vitest, requirements, evidence, site]) expect(step).toBeLessThan(commit);
  });

  it('QC-SIGN-013: the commit names the block and the decision and targets dev (#2)', () => {
    const commit = steps.find((s) => (s.run ?? '').includes('git commit'));
    expect(commit.run).toMatch(/git commit -m "Text decision: \$\{DECISION\} \$\{BLOCK\}/);
    expect(commit.run).toMatch(/git push origin HEAD:dev/);
    expect(commit.run).toMatch(/git add library\/text site\/text-decisions\.json/);
    expect(steps.find((s) => s.uses?.startsWith('actions/checkout')).with.ref).toBe('dev');
  });

  it('QC-SIGN-013: no step other than apply runs when the decision does not land (#2)', () => {
    // Only the reporting step is `if: always()`; every other step after apply is
    // skipped by the default failure semantics, so a reverted decision cannot be
    // committed by a later step.
    const after = steps.slice(steps.findIndex((s) => s.id === 'apply') + 1);
    const alwaysRun = after.filter((s) => String(s.if ?? '').includes('always()'));
    expect(alwaysRun.map((s) => s.name)).toEqual(['Report']);
  });
});
