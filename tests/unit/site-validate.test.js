import { afterEach, describe, expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  escapeHtml,
  mdInline,
  sanitizeEmbeddedHtml,
  validateNoExternalResources,
  validateSiteLinks
} from '../../scripts/site-lib.mjs';

const created = [];
function tempSite(files) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'opencsr-site-'));
  created.push(dir);
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return dir;
}

afterEach(() => {
  while (created.length) rmSync(created.pop(), { recursive: true, force: true });
});

describe('internal link validation', () => {
  test('QC-SITE-002: a site whose internal links all resolve passes validation (#1)', () => {
    const dir = tempSite({
      'index.html': '<a href="gallery/index.html">g</a><link href="site.css">',
      'site.css': 'body{}',
      'gallery/index.html': '<a href="../index.html">home</a>'
    });
    expect(validateSiteLinks(dir)).toEqual([]);
  });

  test('QC-SITE-002: a broken internal href is reported with its file and target (#1)', () => {
    const dir = tempSite({ 'index.html': '<a href="gallery/missing.html">nope</a>' });
    const errors = validateSiteLinks(dir);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('index.html');
    expect(errors[0]).toContain('gallery/missing.html');
  });

  test('QC-SITE-002: external, fragment, mailto and data targets are not internal links (#1)', () => {
    const dir = tempSite({
      'index.html':
        '<a href="https://github.com/jwildfire/open.csr">gh</a><a href="#top">t</a>' +
        '<a href="mailto:a@b.c">m</a><img src="data:image/svg+xml,%3Csvg/%3E">'
    });
    expect(validateSiteLinks(dir)).toEqual([]);
  });

  test('QC-SITE-002: a query string or fragment on an internal link is stripped before resolving (#1)', () => {
    const dir = tempSite({
      'index.html': '<a href="gallery/index.html#tab">g</a>',
      'gallery/index.html': 'ok'
    });
    expect(validateSiteLinks(dir)).toEqual([]);
  });
});

describe('external resource validation', () => {
  test('QC-SITE-003: outbound anchor links are navigation and do not fail the build (#1)', () => {
    const dir = tempSite({
      'index.html': '<a href="https://github.com/jwildfire/open.csr">source</a>',
      'site.css': ':root{--a:1}'
    });
    expect(validateNoExternalResources(dir)).toEqual([]);
  });

  test('QC-SITE-003: an external script, stylesheet, image or CSS import each fail the build (#1)', () => {
    const dir = tempSite({
      'index.html':
        '<script src="https://cdn.example.com/x.js"></script>' +
        '<link rel="stylesheet" href="https://fonts.example.com/f.css">' +
        '<img src="https://example.com/hero.png">',
      'site.css': "@import url('https://fonts.example.com/f.css');"
    });
    const errors = validateNoExternalResources(dir);
    expect(errors).toHaveLength(4);
    expect(errors.join(' ')).toContain('external script');
    expect(errors.join(' ')).toContain('external stylesheet');
    expect(errors.join(' ')).toContain('external image');
    expect(errors.join(' ')).toContain('external CSS import');
  });

  test('QC-SITE-003: a protocol-relative resource is treated as external (#1)', () => {
    const dir = tempSite({ 'index.html': '<script src="//cdn.example.com/x.js"></script>' });
    expect(validateNoExternalResources(dir)).toHaveLength(1);
  });
});

describe('embedded HTML sanitization', () => {
  const raw =
    '<!doctype html><html><head><link rel="stylesheet" href="https://cdn.example.com/gt.css">' +
    '<style>@import url(https://fonts.example.com/x.css);</style>' +
    '<script>window.gt = 1;</script></head><body>' +
    '<table onclick="alert(1)"><tr><td>69 (81.2%)</td></tr></table></body></html>';

  test('QC-SITE-004: scripts, handlers, external stylesheets and imports are stripped (#1)', () => {
    const clean = sanitizeEmbeddedHtml(raw);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('cdn.example.com');
    expect(clean).not.toContain('fonts.example.com');
  });

  test('QC-SITE-004: the document wrapper is unwrapped and the table content preserved (#1)', () => {
    const clean = sanitizeEmbeddedHtml(raw);
    expect(clean).not.toMatch(/<\/?(html|head|body)/i);
    expect(clean).toContain('69 (81.2%)');
    expect(clean).toContain('<table');
  });

  test('QC-SITE-004: sanitizing an absent fragment yields an empty string, not a crash (#1)', () => {
    expect(sanitizeEmbeddedHtml(null)).toBe('');
    expect(sanitizeEmbeddedHtml(undefined)).toBe('');
  });

  test('QC-SITE-004: text interpolated into a page is HTML-escaped (#1)', () => {
    expect(escapeHtml('<script>&"\'')).toBe('&lt;script&gt;&amp;&quot;&#39;');
  });

  test('QC-SITE-004: matrix-cell markdown renders as code spans with the HTML still escaped (#1)', () => {
    expect(mdInline('`prepare_data()` excludes `ARM == "Screen Failure"`')).toBe(
      '<code>prepare_data()</code> excludes <code>ARM == &quot;Screen Failure&quot;</code>'
    );
    expect(mdInline('**must** not <script>alert(1)</script>')).toBe(
      '<strong>must</strong> not &lt;script&gt;alert(1)&lt;/script&gt;'
    );
  });
});
