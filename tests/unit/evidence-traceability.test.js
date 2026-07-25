import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTraceability } from '../../scripts/evidence-lib.mjs';

const repoDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'site',
  'repo'
);
const ard = JSON.parse(readFileSync(path.join(repoDir, 'outputs/t-demo/v002/ard.json'), 'utf8'));
const manifest = JSON.parse(
  readFileSync(path.join(repoDir, 'outputs/t-demo/v002/manifest.json'), 'utf8')
);

describe('the traceability object', () => {
  test('TRC-ARD-001: the chain is assembled from the manifest and the ARD provenance envelope (#1)', () => {
    const trace = buildTraceability({
      manifest,
      ard,
      display: { displayFile: 'library/tfl/t-demo/display.yaml' }
    });
    expect(trace).toMatchObject({
      adamDatasets: ['adae', 'adsl'],
      ardFile: 'outputs/t-demo/v002/ard.json',
      ardHash: 'sha256:manifestsuppliedhash',
      displayFile: 'library/tfl/t-demo/display.yaml',
      specHash: 'sha256:aaaa1111',
      iteration: 'v002',
      sourceCommit: 'abc1234def5678'
    });
  });

  test('TRC-ARD-003: every ADaM dataset in the envelope carries its content hash (#1)', () => {
    const trace = buildTraceability({ manifest, ard });
    expect(trace.adamHashes).toEqual({ adae: 'sha256:cccc3333', adsl: 'sha256:dddd4444' });
  });

  test('TRC-ARD-002: a display with no manifest and no ARD yields nulls, not an exception (#1)', () => {
    const trace = buildTraceability();
    expect(trace).toEqual({
      adamDatasets: [],
      adamHashes: {},
      ardFile: null,
      ardHash: null,
      displayFile: null,
      specHash: null,
      iteration: null,
      sourceCommit: null
    });
  });

  test('TRC-ARD-002: an ARD with an empty provenance envelope still produces a usable object (#1)', () => {
    const trace = buildTraceability({ ard: { rows: [] }, display: { ardFile: 'outputs/x/ard.json' } });
    expect(trace.adamDatasets).toEqual([]);
    expect(trace.ardFile).toBe('outputs/x/ard.json');
    expect(trace.sourceCommit).toBeNull();
  });

  test('TRC-ARD-001: the git commit falls back to the ARD envelope when the manifest omits it (#1)', () => {
    const trace = buildTraceability({ manifest: { version: 'v002' }, ard });
    expect(trace.sourceCommit).toBe('abc1234def5678');
  });
});
