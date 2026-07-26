import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  APPROVAL_STATES,
  TIERS,
  checkApproval,
  loadTextLibrary,
  parseBlock,
  validateBlock,
} from '../../scripts/text-lib.mjs';
import { ROOT, LIBRARY_DIR, BLOCK_FIXTURES } from './text-test-helpers.js';

const library = loadTextLibrary(LIBRARY_DIR);
const blocks = [...library.values()];

describe('Text Library block parsing', () => {
  it('TXT-BLOCK-001: parseBlock splits frontmatter from prose and keeps every declared field (#1)', () => {
    const block = parseBlock(join(BLOCK_FIXTURES, 'good-parameterized.md'));
    expect(block.id).toBe('FIX-GOOD-PARAM');
    expect(block.e3_section).toBe('12.2.1');
    expect(block.tier).toBe('parameterized');
    expect(block.displays).toEqual(['t-ae-overview']);
    expect(block.approval.state).toBe('approved');
    expect(block.requirements).toContain('TXT-NUM-001');
    expect(block.body).toMatch(/^Treatment-emergent/);
    expect(block.body).not.toMatch(/^---/);
    expect(block.errors).toEqual([]);
  });

  it('TXT-BLOCK-002: validateBlock rejects an unknown tier, an unknown approval state and a generated block with no provenance (#1)', () => {
    expect(validateBlock({ ...stub(), tier: 'freeform' })).toContain(
      `tier must be one of ${TIERS.join(' | ')}`
    );
    expect(validateBlock({ ...stub(), approval: { state: 'signed' } })).toContain(
      `approval.state must be one of ${APPROVAL_STATES.join(' | ')}`
    );
    const generated = validateBlock({
      ...stub(),
      tier: 'generated',
      provenance: { model: null, prompt: null },
    });
    expect(generated).toContain('generated tier requires provenance.model');
    expect(generated).toContain('generated tier requires provenance.prompt');
  });

  it('TXT-BLOCK-003: the shipped library loads with unique ids and no structural errors (#1)', () => {
    const files = readdirSync(LIBRARY_DIR).filter((f) => f.endsWith('.md'));
    expect(blocks.length).toBe(files.length);
    expect(blocks.length).toBeGreaterThanOrEqual(8);
    expect(new Set(blocks.map((b) => b.id)).size).toBe(blocks.length);
    for (const block of blocks) expect([block.id, block.errors]).toEqual([block.id, []]);
  });

  it('TXT-BLOCK-004: every library block uses all three reuse tiers and carries requirement ids (#1)', () => {
    const tiers = new Set(blocks.map((b) => b.tier));
    expect([...tiers].sort()).toEqual(['boilerplate', 'generated', 'parameterized']);
    for (const block of blocks) {
      expect(block.requirements.length).toBeGreaterThan(0);
      for (const id of block.requirements) {
        expect(id).toMatch(/^[A-Z]{2,4}-[A-Z]+-\d+[A-D]?$/);
      }
    }
  });

  it('TXT-BLOCK-005: every generated-tier block records the model and prompt that produced it (#1)', () => {
    const generated = blocks.filter((b) => b.tier === 'generated');
    expect(generated.length).toBeGreaterThan(0);
    for (const block of generated) {
      expect(block.provenance.model).toBeTruthy();
      expect(String(block.provenance.prompt).length).toBeGreaterThan(20);
    }
  });

  it('TXT-ETH-001, TXT-DESIGN-001, TXT-DISP-001, TXT-POP-001, TXT-DEMO-001, TXT-EXP-001: the study-conduct narrative sections each ship an approved block (#1)', () => {
    const expected = {
      'TXT-E3-0502': { e3_section: '5.2', tier: 'boilerplate' },
      'TXT-E3-0503': { e3_section: '5.3', tier: 'boilerplate' },
      'TXT-E3-0901': { e3_section: '9.1', tier: 'parameterized' },
      'TXT-E3-0908': { e3_section: '9.8', tier: 'boilerplate' },
      'TXT-E3-1001': { e3_section: '10.1', tier: 'parameterized' },
      'TXT-E3-1101': { e3_section: '11.1', tier: 'parameterized' },
      'TXT-E3-1102': { e3_section: '11.2', tier: 'parameterized' },
      'TXT-E3-1201': { e3_section: '12.1', tier: 'parameterized' },
    };
    for (const [id, shape] of Object.entries(expected)) {
      const block = library.get(id);
      expect(block, id).toBeDefined();
      expect(block.e3_section).toBe(shape.e3_section);
      expect(block.tier).toBe(shape.tier);
      // These tiers are not gated by approval, so a block marked `in_review` in
      // its frontmatter must not fail the build: what holds is that they are
      // reviewed — never left in draft — and still assemble.
      expect(block.approval.state, id).not.toBe('draft');
      expect(checkApproval(block).included, id).toBe(true);
      if (shape.tier === 'parameterized') expect(block.displays.length).toBeGreaterThan(0);
    }
  });

  it('TXT-AE-001, TXT-AE-002, TXT-AE-003, TXT-SAE-001, TXT-CONC-001, TXT-DISC-001: the safety narrative sections ship blocks whose tier matches their evidentiary risk (#1)', () => {
    const expected = {
      'TXT-E3-1221': { e3_section: '12.2.1', tier: 'parameterized' },
      'TXT-E3-1222': { e3_section: '12.2.2', tier: 'generated' },
      'TXT-E3-1224': { e3_section: '12.2.4', tier: 'boilerplate' },
      'TXT-E3-1231': { e3_section: '12.3.1', tier: 'generated' },
      'TXT-E3-1206': { e3_section: '12.6', tier: 'generated' },
      'TXT-E3-1300': { e3_section: '13', tier: 'generated' },
    };
    for (const [id, shape] of Object.entries(expected)) {
      const block = library.get(id);
      expect(block, id).toBeDefined();
      expect(block.e3_section).toBe(shape.e3_section);
      expect(block.tier).toBe(shape.tier);
      // Approval state is now decided in the app (obot.roadmap#115), so the
      // state a block happens to be in is not an invariant. What is invariant is
      // the gate: a generated block is in the report only once it is approved.
      expect(APPROVAL_STATES, id).toContain(block.approval.state);
      expect(checkApproval(block).included, id).toBe(
        shape.tier !== 'generated' || block.approval.state === 'approved'
      );
    }
    // Interpretation and conclusions are generated-tier and therefore human-gated.
    expect(library.get('TXT-E3-1300').tier).toBe('generated');
    expect(library.get('TXT-E3-1221').body).toMatch(/\{\{ard:t-ae-overview:/);
  });

  it('TXT-BLOCK-006: block file names match the block id so the library is addressable from disk (#1)', () => {
    for (const block of blocks) {
      expect(block.file).toBe(join(ROOT, 'library/text', `${block.id}.md`));
    }
  });
});

function stub() {
  return {
    id: 'FIX-STUB',
    e3_section: '1',
    title: 'Stub',
    tier: 'boilerplate',
    displays: [],
    approval: { state: 'approved' },
    provenance: { model: null, prompt: null },
    body: 'text',
  };
}
