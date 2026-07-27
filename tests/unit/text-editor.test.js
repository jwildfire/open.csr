// The text-block editor's pure core (open.csr #113 increment B).
//
// The editor is the first *editing* verb in the Demo app: prose is edited in the
// browser, bindings resolve live against the committed ARD, the numeric-fidelity
// gate runs as you type, and the output is a diff against version-controlled
// source (design D9) — never a written file.
//
// What these tests are really protecting is the equivalence between the browser
// and CI. site/demo/text-core.js is the single implementation of the gates;
// editor-core.js drives it over a draft body. A test that passes here must mean
// the same edit passes `npx vitest run` after the patch is applied, or the
// editor is lying to the writer.

import { describe, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applyBodyToSource,
  bodyStartLine,
  composePatch,
  diffLines,
  evaluateDraft,
  previewSegments,
  splitFrontmatter,
  unifiedDiff
} from '../../site/demo/editor-core.js';
import { loadArd, parseBlock } from '../../scripts/text-lib.mjs';
import { loadDisplays, loadTextBlocks } from '../../scripts/site-lib.mjs';
import { renderTextStatus } from '../../scripts/text-status-lib.mjs';
import {
  ardPayload,
  editorContext,
  editorDisplays,
  editorIntro,
  renderBlockEditor,
  renderEditorBar
} from '../../scripts/text-editor-lib.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const ards = {
  't-ae-overview': loadArd(path.join(rootDir, 'tests', 'fixtures', 'ard', 't-ae-overview.json')),
  't-disposition': loadArd(path.join(rootDir, 'tests', 'fixtures', 'ard', 't-disposition.json'))
};

const SOURCE = [
  '---',
  'id: TXT-E3-1201',
  'e3_section: "12.1"',
  'title: "Extent of Exposure"',
  'tier: parameterized',
  'displays: [t-ae-overview]',
  'allow_digits: ["ICH E3"]',
  'approval: { state: approved }',
  '---',
  '',
  'Any adverse event was reported in',
  '{{ard:t-ae-overview:any_ae:n;group=Total}} patients.',
  ''
].join('\n');

/** The frontmatter fields the editor is given by the build, not re-parsed in the browser. */
const META = {
  id: 'TXT-E3-1201',
  tier: 'parameterized',
  displays: ['t-ae-overview'],
  allow_digits: ['ICH E3'],
  file: 'library/text/TXT-E3-1201.md'
};

function evaluate(body, meta = META) {
  return evaluateDraft({ meta, body, ards });
}

// ---------------------------------------------------------------------------
// Frontmatter is not the editor's business
// ---------------------------------------------------------------------------

describe('the edited region', () => {
  test('TXT-EDIT-001: the editor splits a block into its frontmatter and its body (#113)', () => {
    const split = splitFrontmatter(SOURCE);
    expect(split.hasFrontmatter).toBe(true);
    expect(split.frontmatter).toContain('tier: parameterized');
    expect(split.frontmatter).not.toContain('Any adverse event');
    expect(split.body.trim().startsWith('Any adverse event')).toBe(true);
  });

  test('TXT-EDIT-001: a body edit rewrites the body and leaves the frontmatter byte-for-byte (#113)', () => {
    const edited = applyBodyToSource(SOURCE, 'Rewritten prose entirely.\n');
    const before = splitFrontmatter(SOURCE);
    const after = splitFrontmatter(edited);
    expect(after.frontmatter).toBe(before.frontmatter);
    expect(after.body.trim()).toBe('Rewritten prose entirely.');
    // Tier, approval state and the digit allowlist are frontmatter: an edit in
    // the browser must not be able to approve a block or widen its allowlist.
    expect(edited).toContain('approval: { state: approved }');
    expect(edited).toContain('allow_digits: ["ICH E3"]');
  });

  test('TXT-EDIT-001: a file with no frontmatter is all body, and round-trips unchanged (#113)', () => {
    const bare = 'Just prose, no frontmatter.\n';
    const split = splitFrontmatter(bare);
    expect(split.hasFrontmatter).toBe(false);
    expect(split.frontmatter).toBe('');
    expect(applyBodyToSource(bare, split.body)).toBe(bare);
  });
});

// ---------------------------------------------------------------------------
// Live evaluation: the same gates the build runs
// ---------------------------------------------------------------------------

describe('live binding resolution', () => {
  test('TXT-EDIT-002: a draft body resolves its bindings against the committed ARD (#113)', () => {
    const result = evaluate('Any event: {{ard:t-ae-overview:any_ae:n;group=Total}} patients.');
    expect(result.ok).toBe(true);
    expect(result.bindings).toHaveLength(1);
    expect(result.bindings[0].resolved).toBe(true);
    expect(result.text).toMatch(/Any event: \d+ patients\./);
    expect(result.errors).toEqual([]);
  });

  test('TXT-EDIT-002: an orphaned binding reports the build message verbatim (#113)', () => {
    const result = evaluate('{{ard:t-ae-overview:any_ae:nope}} patients.');
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('orphaned binding');
    expect(result.errors.join('\n')).toContain('t-ae-overview:any_ae:nope');
  });

  test('TXT-EDIT-002: an ambiguous address reports its match count rather than taking a row (#113)', () => {
    const result = evaluate('{{ard:t-ae-overview:any_ae:n}} patients.');
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/ambiguous binding: \d+ ARD rows/);
  });

  test('TXT-EDIT-002: a malformed address is reported, not thrown, so typing never breaks the editor (#113)', () => {
    const result = evaluate('{{ard:not-an-address}} patients.');
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('invalid binding address');
  });

  test('TXT-EDIT-004: an unresolved binding previews as a marker, never as a number (#113)', () => {
    const result = evaluate('{{ard:t-ae-overview:any_ae:missing}} patients.');
    expect(result.text).toContain('[UNRESOLVED BINDING]');
    expect(result.text).not.toMatch(/\d/);
  });

  test('TXT-EDIT-005: binding a display the block does not declare is reported as the build reports it (#113)', () => {
    const result = evaluate('{{ard:t-disposition:randomised:n;group=Total}} patients.');
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('undeclared display');
    expect(result.undeclaredDisplays).toEqual(['t-disposition']);
  });

  test('TXT-EDIT-005: declaring the display in the block clears the report (#113)', () => {
    const result = evaluate('{{ard:t-disposition:randomised:n;group=Total}} patients.', {
      ...META,
      displays: ['t-ae-overview', 't-disposition']
    });
    expect(result.undeclaredDisplays).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe('the numeric-fidelity gate, as you type', () => {
  test('TXT-EDIT-003: a hand-typed result is a violation carrying its value and context (#113)', () => {
    const result = evaluate('Any adverse event was reported in 121 patients.');
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].value).toBe('121');
    expect(result.violations[0].context).toContain('Any adverse event');
  });

  test('TXT-EDIT-003: replacing the typed number with a resolving binding clears the gate (#113)', () => {
    const bad = evaluate('Any adverse event was reported in 121 patients.');
    const good = evaluate(
      'Any adverse event was reported in {{ard:t-ae-overview:any_ae:n;group=Total}} patients.'
    );
    expect(bad.violations).toHaveLength(1);
    expect(good.violations).toEqual([]);
    expect(good.ok).toBe(true);
  });

  test('TXT-EDIT-003: an allow_digits literal from the frontmatter still exempts as it does in CI (#113)', () => {
    const result = evaluate('Reported in accordance with ICH E3.');
    expect(result.ok).toBe(true);
    expect(result.exemptionsUsed['ICH E3']).toBe(1);
  });

  test('TXT-EDIT-003: the gate reads the rendered prose, so a substituted value is not a violation (#113)', () => {
    const result = evaluate('{{ard:t-ae-overview:any_ae:n;group=Total}} patients.');
    expect(result.text).toMatch(/^\d+ patients\.$/);
    expect(result.violations).toEqual([]);
  });

  test('TXT-EDIT-011: full-precision output is a warning the writer can see, not a failure (#113)', () => {
    const result = evaluate('{{ard:t-ae-overview:any_ae:p;group=Total}} of patients.');
    expect(result.ok).toBe(true);
    expect(result.warnings.join('\n')).toContain('add a digits qualifier');
  });
});

describe('the live preview', () => {
  test('TXT-EDIT-012: computed values are marked in place, the writer’s words are not (#113)', () => {
    const result = evaluate('Any event: {{ard:t-ae-overview:any_ae:n;group=Total}} patients.');
    const segments = previewSegments(result.text, result.spans, result.violations);
    expect(segments.map((segment) => segment.kind)).toEqual(['text', 'bound', 'text']);
    expect(segments[0].text).toBe('Any event: ');
    expect(segments[1].text).toMatch(/^\d+$/);
    expect(segments[2].text).toBe(' patients.');
  });

  test('TXT-EDIT-012: a fidelity violation is marked in the sentence, not just listed (#113)', () => {
    const result = evaluate('Reported in 121 patients.');
    const segments = previewSegments(result.text, result.spans, result.violations);
    const flagged = segments.filter((segment) => segment.kind === 'violation');
    expect(flagged.map((segment) => segment.text)).toEqual(['121']);
  });

  test('TXT-EDIT-012: segmenting is lossless — the preview says exactly what the gate read (#113)', () => {
    const result = evaluate(
      'In {{ard:t-ae-overview:any_ae:n;group=Total}} of patients, 12 events and ICH E3.'
    );
    const segments = previewSegments(result.text, result.spans, result.violations);
    expect(segments.map((segment) => segment.text).join('')).toBe(result.text);
  });
});

// ---------------------------------------------------------------------------
// The output: a diff against version-controlled source
// ---------------------------------------------------------------------------

describe('line diffing', () => {
  test('TXT-EDIT-007: identical text produces no changed lines at all (#113)', () => {
    const diff = diffLines('a\nb\nc\n', 'a\nb\nc\n');
    expect(diff.every((entry) => entry.kind === 'context')).toBe(true);
  });

  test('TXT-EDIT-007: a changed line reads as one removal and one addition (#113)', () => {
    const diff = diffLines('a\nb\nc\n', 'a\nB\nc\n');
    expect(diff.filter((entry) => entry.kind === 'remove').map((entry) => entry.text)).toEqual(['b']);
    expect(diff.filter((entry) => entry.kind === 'add').map((entry) => entry.text)).toEqual(['B']);
  });

  test('TXT-EDIT-007: unchanged lines around an insertion stay context, not churn (#113)', () => {
    const diff = diffLines('a\nb\nc\n', 'a\nnew\nb\nc\n');
    expect(diff.filter((entry) => entry.kind === 'add').map((entry) => entry.text)).toEqual(['new']);
    expect(diff.filter((entry) => entry.kind === 'remove')).toEqual([]);
    expect(diff.filter((entry) => entry.kind === 'context')).toHaveLength(3);
  });
});

describe('the patch', () => {
  const edited = applyBodyToSource(
    SOURCE,
    '\nAny adverse event was reported in\n{{ard:t-ae-overview:any_ae:n;group=Placebo}} patients.\n'
  );

  test('TXT-EDIT-006: an edit produces a unified diff with git headers and hunks (#113)', () => {
    const patch = unifiedDiff(META.file, SOURCE, edited);
    expect(patch).toContain('--- a/library/text/TXT-E3-1201.md');
    expect(patch).toContain('+++ b/library/text/TXT-E3-1201.md');
    expect(patch).toMatch(/^@@ -\d+,\d+ \+\d+,\d+ @@$/m);
    expect(patch).toContain('-{{ard:t-ae-overview:any_ae:n;group=Total}} patients.');
    expect(patch).toContain('+{{ard:t-ae-overview:any_ae:n;group=Placebo}} patients.');
  });

  test('TXT-EDIT-006: the diff carries three lines of context on each side of a hunk (#113)', () => {
    const a = Array.from({ length: 20 }, (_, i) => `line ${String.fromCharCode(97 + i)}`).join('\n');
    const b = a.replace('line k', 'line K');
    const patch = unifiedDiff('f.md', `${a}\n`, `${b}\n`);
    const hunk = patch.slice(patch.indexOf('@@'));
    expect(hunk.split('\n').filter((line) => line.startsWith(' '))).toHaveLength(6);
    expect(patch).toMatch(/@@ -8,7 \+8,7 @@/);
  });

  test('TXT-EDIT-007: an unchanged body produces no patch at all (#113)', () => {
    expect(unifiedDiff(META.file, SOURCE, SOURCE)).toBe('');
  });

  test('TXT-EDIT-007: the patch reports how many lines it adds and removes (#113)', () => {
    const composed = composePatch([{ file: META.file, before: SOURCE, after: edited }]);
    expect(composed.added).toBe(1);
    expect(composed.removed).toBe(1);
    expect(composed.files).toEqual([META.file]);
  });

  test('TXT-EDIT-008: a patch over several blocks is one file section per changed block (#113)', () => {
    const other = applyBodyToSource(SOURCE, 'Different prose.\n');
    const composed = composePatch([
      { file: 'library/text/TXT-E3-1201.md', before: SOURCE, after: edited },
      { file: 'library/text/TXT-E3-1202.md', before: SOURCE, after: other },
      { file: 'library/text/TXT-E3-1203.md', before: SOURCE, after: SOURCE }
    ]);
    expect(composed.files).toEqual([
      'library/text/TXT-E3-1201.md',
      'library/text/TXT-E3-1202.md'
    ]);
    expect(composed.patch.match(/^--- a\//gm)).toHaveLength(2);
    expect(composed.patch).not.toContain('TXT-E3-1203');
  });

  test('TXT-EDIT-008: the patch names the block’s real repository path (#113)', () => {
    const block = parseBlock(path.join(rootDir, 'library', 'text', 'TXT-E3-1101.md'));
    expect(block.file.endsWith('library/text/TXT-E3-1101.md')).toBe(true);
    const composed = composePatch([
      { file: 'library/text/TXT-E3-1101.md', before: SOURCE, after: edited }
    ]);
    expect(composed.patch).toContain('a/library/text/TXT-E3-1101.md');
  });

  test('TXT-EDIT-001: the patch diffs the body region and offsets its hunks past the frontmatter (#113)', () => {
    // The browser is sent the body, never the frontmatter, and the hunk header is
    // shifted to where the body sits in the file. A hunk that begins after the
    // closing `---` cannot express a change to a line before it — "frontmatter is
    // preserved" is a property of the patch, not a promise about the UI.
    const split = splitFrontmatter(SOURCE);
    const start = bodyStartLine(SOURCE);
    expect(start).toBe(10);
    const patch = unifiedDiff(META.file, split.body, 'Rewritten.\n', { startLine: start });
    const header = patch.match(/@@ -(\d+),/);
    expect(Number(header[1])).toBeGreaterThanOrEqual(start);
    expect(patch).not.toContain('tier: parameterized');
    expect(patch).not.toContain('approval:');
  });

  test('TXT-EDIT-006: the patch is one git apply accepts against the real file (#113)', () => {
    // The claim the editor makes to a writer is "take this to a clone and apply
    // it". That claim is worth nothing unless git agrees, so this asks git.
    const file = 'library/text/TXT-E3-1101.md';
    const source = readFileSync(path.join(rootDir, file), 'utf8');
    const split = splitFrontmatter(source);
    const draft = split.body.replace('The safety analysis set', 'The safety population');
    expect(draft).not.toBe(split.body);

    const patch = unifiedDiff(file, split.body, draft, { startLine: bodyStartLine(source) });
    const dir = mkdtempSync(path.join(tmpdir(), 'open-csr-patch-'));
    try {
      mkdirSync(path.join(dir, 'library', 'text'), { recursive: true });
      writeFileSync(path.join(dir, file), source);
      writeFileSync(path.join(dir, 'change.patch'), patch);
      execFileSync('git', ['init', '--quiet'], { cwd: dir });
      execFileSync('git', ['apply', '--check', 'change.patch'], { cwd: dir });
      execFileSync('git', ['apply', 'change.patch'], { cwd: dir });
      const applied = readFileSync(path.join(dir, file), 'utf8');
      expect(applied).toBe(applyBodyToSource(source, draft));
      expect(applied).toContain('The safety population');
      expect(splitFrontmatter(applied).frontmatter).toBe(split.frontmatter);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('TXT-EDIT-006: a patch of a file with no trailing newline says so, as git does (#113)', () => {
    const patch = unifiedDiff('f.md', 'one\ntwo', 'one\nthree');
    expect(patch).toContain('\\ No newline at end of file');
  });

  test('TXT-EDIT-007: dropping the file’s final newline is a change, not an empty patch (#113)', () => {
    // Nothing on any LINE changed, so a naive line diff sees nothing and reports
    // "no change yet" for an edit the writer really made. Git rewrites the last
    // line and marks the side that lost its newline; so does this.
    const patch = unifiedDiff('f.md', 'a\nb\n', 'a\nb');
    expect(patch).not.toBe('');
    expect(patch).toContain('-b\n+b\n\\ No newline at end of file');
    expect(unifiedDiff('f.md', 'a\nb', 'a\nb\n')).toContain('-b\n\\ No newline at end of file\n+b');
  });

  test('TXT-EDIT-006: git applies the patch for every shape of edit a writer can make (#113)', () => {
    // Deletions, insertions, edits that merge into one hunk and edits that must
    // not, and the trailing-newline case that a line diff cannot see. Each is
    // applied for real and the result compared to the source with the draft body
    // substituted — the editor's promise, checked by the tool that has to keep it.
    const file = 'library/text/TXT-E3-1300.md';
    const source = readFileSync(path.join(rootDir, file), 'utf8');
    const body = splitFrontmatter(source).body;
    const start = bodyStartLine(source);
    const lines = body.split('\n');

    const drafts = {
      'the whole body deleted': '',
      'all but one line deleted': `${lines[3]}\n`,
      'two edits far apart': lines
        .map((line, i) => (i === 2 || i === lines.length - 4 ? `${line} CHANGED` : line))
        .join('\n'),
      'two edits that merge into one hunk': lines
        .map((line, i) => (i === 5 || i === 6 ? `X${line}` : line))
        .join('\n'),
      'an insertion at the top': `New opening line.\n\n${body}`,
      'an append at the end': `${body}\nA trailing sentence.\n`,
      'the trailing newline stripped': body.replace(/\n+$/, ''),
      'paragraphs reordered': body.split(/\n{2,}/).reverse().join('\n\n'),
      'non-ASCII punctuation introduced': body.replace(/\./, ' — “quoted” ∑.'),
      'an interior run blanked out': lines.map((line, i) => (i > 4 && i < 9 ? '' : line)).join('\n')
    };

    const dir = mkdtempSync(path.join(tmpdir(), 'open-csr-shapes-'));
    try {
      execFileSync('git', ['init', '--quiet'], { cwd: dir });
      mkdirSync(path.join(dir, 'library', 'text'), { recursive: true });
      for (const [shape, draft] of Object.entries(drafts)) {
        writeFileSync(path.join(dir, file), source);
        writeFileSync(path.join(dir, 'change.patch'), unifiedDiff(file, body, draft, { startLine: start }));
        execFileSync('git', ['apply', 'change.patch'], { cwd: dir });
        expect(readFileSync(path.join(dir, file), 'utf8'), shape).toBe(
          applyBodyToSource(source, draft)
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// The surface: what the pane actually ships
// ---------------------------------------------------------------------------

describe('the editor as rendered into the Text pane', () => {
  const config = JSON.parse(readFileSync(path.join(rootDir, 'site', 'config.json'), 'utf8'));
  const displays = loadDisplays(rootDir, config);
  const textBlocks = loadTextBlocks(rootDir, config);
  const realArds = Object.fromEntries(
    displays.filter((d) => d.outputs?.current?.ard).map((d) => [d.slug, d.outputs.current.ard])
  );
  const slugs = Object.keys(realArds);
  const editor = {
    intro: editorIntro(),
    bar: renderEditorBar({ context: editorContext({ displays }) }),
    render: (block) =>
      renderBlockEditor(block, {
        source: readFileSync(path.join(rootDir, block.file), 'utf8'),
        displays: editorDisplays(block, slugs)
      })
  };
  const withEditor = renderTextStatus({ config, textBlocks, ards: realArds, editor });
  const withoutEditor = renderTextStatus({ config, textBlocks, ards: realArds });
  const written = textBlocks.filter((block) => block.exists);

  test('TXT-EDIT-009: every written block in the library gets an editor, seeded with its source (#113)', () => {
    for (const block of written) {
      expect(withEditor).toContain(`data-editor="${block.id}"`);
      expect(withEditor).toContain(`data-editor-file="${block.file}"`);
    }
    expect(withEditor.match(/data-editor="/g)).toHaveLength(written.length);
  });

  test('TXT-EDIT-009: the editor records approval nowhere and reaches no network host (#113)', () => {
    // The line the surface must not cross. In-app sign-off was deferred on
    // 2026-07-25; editing source is a different act from approving it, and the
    // markup has to make that impossible to confuse rather than merely unlikely.
    for (const pattern of [
      /localStorage/i,
      /sessionStorage/i,
      /api\.github\.com/i,
      /\btoken\b/i,
      /dispatch/i,
      /<form/i,
      /https?:\/\/(?!github\.com)/i
    ]) {
      expect(withEditor).not.toMatch(pattern);
    }
    // The only controls on the pane are the editor's own, and the complete list
    // of them is checked rather than sampled: a control that records a decision
    // could only arrive by appearing here.
    const buttons = [
      ...new Set([...withEditor.matchAll(/<button[^>]*>([^<]*)</g)].map((m) => m[1].trim()))
    ].sort();
    expect(buttons).toEqual([
      'Copy patch',
      'Download one patch for every change',
      'Download patch',
      'Edit',
      'Revert to committed'
    ]);
  });

  test('TXT-EDIT-010: the editor ships hidden, so the pane without JavaScript is the status view (#113)', () => {
    for (const section of withEditor.split('<section class="tb-edit"').slice(1)) {
      expect(section.slice(0, section.indexOf('>'))).toContain('hidden');
    }
    const bar = withEditor.slice(withEditor.indexOf('<div class="tbe-all"'));
    expect(bar.slice(0, bar.indexOf('>'))).toContain('hidden');
  });

  test('TXT-EDIT-010: without the editor option the view renders exactly what it always did (#113)', () => {
    // TXT-REVIEW-007 is asserted against this rendering, and it must keep
    // meaning what it meant: no control, no script, nothing to act on.
    expect(withoutEditor).not.toContain('tb-edit');
    expect(withoutEditor).not.toMatch(/<button|<textarea|<form|<script/i);
  });

  test('TXT-EDIT-001: each editor carries its body start line, never its frontmatter (#113)', () => {
    for (const block of written) {
      const source = readFileSync(path.join(rootDir, block.file), 'utf8');
      const section = withEditor.slice(withEditor.indexOf(`data-editor="${block.id}"`));
      expect(section).toContain(`data-editor-line="${bodyStartLine(source)}"`);
      // The frontmatter is not in the page: it cannot be edited, and no patch
      // the browser composes can reach a line above the body.
      const frontmatter = splitFrontmatter(source).frontmatter;
      const approvalLine = frontmatter.split('\n').find((line) => line.startsWith('approval:'));
      expect(section.slice(0, section.indexOf('</section>'))).not.toContain(approvalLine);
    }
  });

  test('TXT-EDIT-002: each editor declares the ARDs its block binds, so the browser fetches those (#113)', () => {
    const block = written.find((entry) => entry.displays?.length);
    const section = withEditor.slice(withEditor.indexOf(`data-editor="${block.id}"`));
    expect(section).toContain(`data-editor-ards="${block.displays.join(' ')}"`);
  });
});

describe('the published ARD payload', () => {
  const config = JSON.parse(readFileSync(path.join(rootDir, 'site', 'config.json'), 'utf8'));
  const displays = loadDisplays(rootDir, config);
  const source = displays.find((display) => display.outputs?.current?.ard)?.outputs.current.ard;

  test('TXT-EDIT-002: the payload keeps every row, so the browser counts matches as CI does (#113)', () => {
    const payload = ardPayload(source);
    expect(payload.rows).toHaveLength(source.rows.length);
  });

  test('TXT-EDIT-002: a binding resolves identically against the payload and the ARD on disk (#113)', () => {
    const payload = ardPayload(source);
    const row = source.rows.find((entry) => entry.group1_level && typeof entry.stat === 'number');
    const address = `${source.display}:${row.analysis}:${row.stat_name};group=${row.group1_level}`;
    const body = `Value: {{ard:${address}}}.`;
    const meta = { id: 'X', displays: [source.display], allow_digits: [] };
    const fromDisk = evaluateDraft({ meta, body, ards: { [source.display]: source } });
    const fromPayload = evaluateDraft({ meta, body, ards: { [source.display]: payload } });
    expect(fromPayload.text).toBe(fromDisk.text);
    expect(fromPayload.ok).toBe(fromDisk.ok);
  });

  test('TXT-EDIT-002: the payload drops the columns resolution never reads (#113)', () => {
    const payload = ardPayload({ rows: [{ analysis: 'a', stat_name: 'n', stat: 1, context: 'x' }] });
    expect(payload.rows[0].context).toBeUndefined();
    expect(payload.rows[0].stat).toBe(1);
  });
});

describe('hiding actually hides', () => {
  // A UA stylesheet's `[hidden] { display: none }` is beaten by any author rule
  // that sets `display` on a class — so a flex or grid component toggled by the
  // hidden attribute stays on screen with nothing in it. That is exactly what
  // happened to the pane-level patch bar: `.tbe-all { display: flex }` kept it
  // visible on a page with no edits, while `element.hidden` read true and every
  // markup assertion passed. Only looking at the page caught it, so the check
  // below is the one that would have.
  const css = readFileSync(path.join(rootDir, 'site', 'site.css'), 'utf8');
  const config = JSON.parse(readFileSync(path.join(rootDir, 'site', 'config.json'), 'utf8'));
  const block = loadTextBlocks(rootDir, config).find((entry) => entry.exists);
  const markup =
    renderBlockEditor(block, {
      source: readFileSync(path.join(rootDir, block.file), 'utf8'),
      displays: []
    }) + renderEditorBar();

  // Every class on an element the editor renders with a `hidden` attribute.
  const hiddenClasses = [
    ...new Set(
      [...markup.matchAll(/<[a-z]+[^>]*\bclass="([^"]+)"[^>]*\shidden[\s>]/g)].flatMap((match) =>
        match[1].split(/\s+/)
      )
    )
  ];

  test('TXT-EDIT-010: no class the editor hides is forced visible by a display rule (#113)', () => {
    expect(hiddenClasses.length).toBeGreaterThan(0);
    const broken = hiddenClasses.filter((name) => {
      const rule = css.match(new RegExp(`\\.${name}\\s*\\{[^}]*\\}`, 'g')) || [];
      const setsDisplay = rule.some((body) => /display:/.test(body));
      if (!setsDisplay) return false;
      return !new RegExp(`\\.${name}\\[hidden\\]\\s*\\{[^}]*display:\\s*none`).test(css);
    });
    expect(
      broken,
      `These classes set display and are toggled by [hidden]; each needs a ` +
        `.<class>[hidden] { display: none } rule or it shows when hidden:\n${broken.join('\n')}`
    ).toEqual([]);
  });
});
