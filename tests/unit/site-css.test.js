// The stylesheet has to parse, and a test has to say so (open.csr #16).
//
// CSS fails silently. A single missing `}` does not throw, does not warn and does
// not break the page in an obvious way: the browser's parser swallows the rest of
// the rule, keeps swallowing until it finds something it can resynchronise on, and
// every declaration after that point simply never applies. The page still renders
// — just wrongly, from a stylesheet that is a prefix of the one in the repository.
//
// That is exactly what happened on 2026-07-27: a merge resolution dropped the
// closing brace of `.tbe-all-label`, and the ~50 rules after it — the sidebar's
// disclosure controls, `.sr-only`, the dimmed empty sections — were dead on `dev`.
// The screen-reader-only label rendered as visible text in the navigation tree,
// which is what a visitor noticed. Nothing else in the build could have caught it:
// the site builder validates links and external resources, not CSS structure.
//
// So this suite is deliberately dumb and structural. It does not check that a rule
// is *correct*; it checks that every rule in the file is a rule the browser will
// still be reading by the time it gets there.

import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '..', '..');
const cssPath = path.join(rootDir, 'site', 'site.css');
const css = readFileSync(cssPath, 'utf8');

/**
 * Walk the stylesheet the way a parser does: comments and strings are opaque,
 * everything else counts. Returns the depth trace so a failure can say *where*.
 */
function scanBraces(source) {
  let depth = 0;
  let line = 1;
  let underflowAt = null;
  const opens = [];
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '\n') line += 1;
    if (char === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      const skipped = source.slice(i, end < 0 ? source.length : end + 2);
      line += (skipped.match(/\n/g) || []).length;
      i = end < 0 ? source.length : end + 1;
      continue;
    }
    if (char === '"' || char === "'") {
      let j = i + 1;
      while (j < source.length && source[j] !== char) {
        if (source[j] === '\\') j += 1;
        j += 1;
      }
      i = j;
      continue;
    }
    if (char === '{') {
      depth += 1;
      opens.push(line);
    } else if (char === '}') {
      depth -= 1;
      opens.pop();
      if (depth < 0 && underflowAt === null) underflowAt = line;
    }
  }
  return { depth, underflowAt, unclosedAt: opens };
}

describe('the stylesheet parses', () => {
  test('QC-SITE-008: every block in site.css is closed, so no rule is silently dropped (#16)', () => {
    const { depth, underflowAt, unclosedAt } = scanBraces(css);
    expect(
      underflowAt,
      `site.css closes a block that was never opened, at line ${underflowAt}`
    ).toBeNull();
    expect(
      depth,
      depth > 0
        ? `site.css leaves ${depth} block(s) unclosed — first at line ${unclosedAt[0]}. ` +
          'Every rule after it is dead in the browser.'
        : 'site.css is balanced'
    ).toBe(0);
  });

  test('QC-SITE-008: the last rule in the file is as reachable as the first (#16)', () => {
    // A prefix-only stylesheet is the failure mode this suite exists for, and it
    // shows up as rules near the END of the file having no effect. Assert on the
    // real symptoms of the 2026-07-27 regression: the selectors that were dead.
    const scan = scanBraces(css);
    expect(scan.depth).toBe(0);
    for (const selector of ['.sr-only', '.rdr-draft-note', '.nav-section.is-empty']) {
      expect(css, `${selector} must be present`).toContain(selector);
      const before = css.slice(0, css.indexOf(selector));
      // Everything before a rule must itself be balanced, or the browser never
      // reaches that rule.
      expect(scanBraces(before).depth, `${selector} sits inside an unclosed block`).toBe(0);
    }
  });

  test('QC-SITE-008: declarations live inside a block, never between two of them (#16)', () => {
    // The other half of the same accident: a property that ends up outside a rule
    // is not applied to anything, and is not an error either.
    const stray = [];
    let depth = 0;
    const lines = css.split('\n');
    let inComment = false;
    lines.forEach((raw, index) => {
      let line = raw;
      if (inComment) {
        const end = line.indexOf('*/');
        if (end < 0) return;
        line = line.slice(end + 2);
        inComment = false;
      }
      line = line.replace(/\/\*.*?\*\//g, '');
      const start = line.indexOf('/*');
      if (start >= 0) {
        inComment = true;
        line = line.slice(0, start);
      }
      const trimmed = line.trim();
      if (depth === 0 && /^[a-z-]+\s*:\s*[^;{]+;$/i.test(trimmed) && !trimmed.startsWith('@')) {
        stray.push(`${index + 1}: ${trimmed}`);
      }
      depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    });
    expect(stray, `declarations outside any rule:\n${stray.join('\n')}`).toEqual([]);
  });
});

// The explorer's one state, asserted in the stylesheet (open.csr #40).
//
// The rule that decides whether a document's contents are visible is CSS, not
// JavaScript: a section list is shown when it sits next to the current document
// and hidden otherwise. That is the whole of the state now, so it is worth a
// test that the second half of the old pair really left rather than being
// commented out or overridden further down.
describe('a document\'s contents follow the selection and nothing else', () => {
  test('QC-SITE-012: the current document reveals its contents, and only the current one (#40)', () => {
    expect(css).toMatch(/\.nav-sections\s*\{[^}]*display:\s*none/);
    expect(css).toMatch(/\.nav-item\[data-current\]\s*\+\s*\.nav-sections\s*\{[^}]*display:\s*block/);
  });

  test('QC-SITE-012: no rule survives that could hide the open document\'s contents (#40)', () => {
    // A per-node collapse class, or a disclosure control to set it, would be the
    // second state again — this time invisible in the markup tests, which is why
    // the stylesheet gets its own assertion.
    expect(css).not.toContain('nav-twisty');
    expect(css).not.toContain('is-collapsed');
    // The group-level caret is a different control and stays.
    expect(css).toMatch(/\.nav-group\.open\s+\.nav-caret/);
  });
});
