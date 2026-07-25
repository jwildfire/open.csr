// The JS half of the naming-convention guard (contracts §8). Its testthat twin
// lives in the R suite. Requirement traceability rides entirely on the test
// title string, so a title that drifts silently drops its evidence — cheap,
// self-enforcing enforcement is the only thing that keeps the convention from
// rotting as the suite grows.

import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const unitDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

// "<REQ-ID>[, <REQ-ID>]: <description> (#N)" — IDs comma- or slash-separated,
// one or more trailing issue references.
const TITLE = /^[A-Z]{2,4}-[A-Z]+-\d+[A-D]?(?:\s*[,/]\s*[A-Z]{2,4}-[A-Z]+-\d+[A-D]?)*:\s+\S.*\(#\d+\)$/;

// Files exempt from carrying a requirement ID (they may still be listed here
// only with a documented reason). Empty by design.
const EXEMPT = new Set();

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const file = path.join(dir, entry);
    if (statSync(file).isDirectory()) return walk(file);
    return /\.test\.[jm]?js$/.test(entry) ? [file] : [];
  });
}

function titlesIn(source) {
  return [
    ...source.matchAll(/(?:^|[^\w.])(?:test|it)\s*\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)
  ].map((match) => match[2]);
}

const files = walk(unitDir).filter((file) => !EXEMPT.has(path.basename(file)));

describe('test naming convention', () => {
  test('QC-NAME-001: every JS test title carries requirement IDs and an issue reference (#1)', () => {
    const violations = [];
    for (const file of files) {
      for (const title of titlesIn(readFileSync(file, 'utf8'))) {
        if (!TITLE.test(title)) violations.push(`${path.basename(file)}: ${title}`);
      }
    }
    expect(violations, `Titles must read "<REQ-ID>: <description> (#N)":\n${violations.join('\n')}`).toEqual(
      []
    );
  });

  test('QC-NAME-001: the guard actually sees the suite it is meant to police (#1)', () => {
    expect(files.length).toBeGreaterThan(0);
    const titles = files.flatMap((file) => titlesIn(readFileSync(file, 'utf8')));
    expect(titles.length).toBeGreaterThan(20);
  });
});
