# The safety.viz Requirements → Tests → Evidence → Published-Page Framework

Local source of truth for this section: `/Users/jwildfire/Documents/obot2/safety.viz`
(v1.4.0) and `/Users/jwildfire/Documents/obot2/obot.agent/docs/requirements/`.
Published result: <https://jwildfire.github.io/safety.viz/> (example evidence page:
<https://jwildfire.github.io/safety.viz/histogram/evidence.html>).

## 1. The loop in one paragraph

A **reviewed requirement matrix** (Markdown table, one row per requirement, IDs like
`SH-FUNC-004A`) lives in a *separate* repo (`jwildfire/obot.agent`). **Test names** in the
implementation repo embed those IDs plus a `(#N)` issue reference. A build script runs the
suites once with JSON reporters and emits a committed **`evidence.json`** per module,
tagging each test record with the requirement IDs parsed out of its own name. A second
script vendors the reviewed **requirement text** out of the matrices into
`docs/requirements/<module>.json`. The **static-site build** joins a hand-written coverage
table + `evidence.json` + the requirement-text extract into an audit-style **evidence page**,
and CI publishes the whole site to GitHub Pages in three tiers (release / dev / per-PR).
Two freshness guards (`evidence:check`, `requirements:check`) fail CI if any committed
artifact drifts from a fresh run or from the upstream matrix.

Total tooling: **~590 lines** of pipeline JS (`evidence-lib.mjs` 184, `evidence.mjs` 193,
`requirements-lib.mjs` 66, `requirements.mjs` 145) plus a site renderer
(`site-lib.mjs` 1171, `site.mjs` 211). It is small enough to port wholesale.

## 2. Layer 1 — Requirement matrices (the spec, in another repo)

Location: `/Users/jwildfire/Documents/obot2/obot.agent/docs/requirements/*.md` —
one Markdown file per module (`safety-histogram.md` 125 rows, `web-codebook.md` 223 rows,
`qt-explorer.md`, `hep-explorer.md`, …), published at
<https://github.com/jwildfire/obot.agent/tree/main/docs/requirements>.

Each file has a fixed shape: title → intro paragraph → `## Requirement context` →
`## Scope` → `## Source inventory` → `## Requirements` table. The table columns are:

```
| ID | Area | Requirement | Source | Evidence Type | Test/Evidence Link | Status | AI Review | Notes |
```

Load-bearing conventions:

- **ID format `<PREFIX>-<AREA>-<NNN><suffix?>`** — 2–4 uppercase letters, area code, zero-padded
  number, optional `A`–`D` split suffix (`SH-FUNC-004A`). Prefixes are per-module
  (`SH-`, `SSP-`, `SDD-`, `SROT-`, `SOE-`, `AET-`, `AE-`, `HEP-`, `QT-`).
- **Column 3 is the requirement text** — this is the only prose the downstream tooling reads.
- **`Evidence Type` routes the row**: `unit` → Vitest, `browser` → Playwright. This is how
  a spec row decides *which test tier* must evidence it.
- **`Status` / `AI Review`** track the human-review lifecycle (`ai-reviewed` →
  "OK for human review"). The dir's `README.md` is explicit that AI review ≠ approval.
- Matrices are **harvested first, reviewed second** (`harvest_wiki_requirements.py` in
  `obot.agent/scripts/`), then cleaned by a sub-agent, then human-gated.

The matrix repo is deliberately *not* the implementation repo: the spec has its own review
cadence, and CI pulls it in read-only.

## 3. Layer 2 — Test naming is the tagging mechanism

There is no separate annotation system. Requirement traceability rides on the **test title
string**, documented in `/Users/jwildfire/Documents/obot2/safety.viz/CONTRIBUTING.md`:

```js
test('SH-CTRL-004: normal range checkbox displays overlay when available (#12)', …)
```

- One or more IDs, slash- or comma-separated, at the head of the title:
  `'QT-CTRL-001/QT-CTRL-002/QT-CTRL-003: renders the view, correction, … controls (#68)'`.
- Trailing `(#N)` = the implementation issue. Multiple allowed: `(#7) (#17)`.
- Scaffold/infrastructure tests omit the requirement ID but **keep** the `(#N)` ref.
- Vitest `describe` nesting is fine — the normalizer reads `fullName`.

Extraction lives in `scripts/evidence-lib.mjs` — `parseTestName(name)` → `{ requirementIds,
issueRefs }` using `/[A-Z]{2,4}-[A-Z]+-\d+[A-D]?/g` (global, **unanchored**) and
`/\(#(\d+)\)/g`.

**Module routing is by file path, not by tag** (`moduleForFile`):

| Path | Routed to |
| --- | --- |
| `tests/unit/<module>/**` | `<module>` |
| `tests/e2e/<module>.spec.js` | `<module>` |
| anything else (`smoke.spec.js`, `site.spec.js`, `tests/unit/main.test.js`, `tests/unit/api/**`) | `null` = **shared scaffold** |

Shared scaffold records are **duplicated into every module's evidence set**, so each
`evidence.json` is self-contained and scaffold drift still trips the guard. `<module>` must
exist in the site registry (`site/config.json`) — the registry is the module universe, so
adding a renderer requires zero pipeline edits.

## 4. Layer 3 — `evidence.json` production

`npm run evidence` → `node scripts/evidence.mjs`. It runs each suite **once**:

```
npx vitest run --reporter=default --reporter=json --outputFile=<tmp>/vitest.json
npx playwright test --reporter=json      (PLAYWRIGHT_JSON_OUTPUT_NAME=<tmp>/playwright.json)
```

`normalizeVitest` (jest-shaped `testResults[].assertionResults[]`) and
`normalizePlaywright` (recursive `suites`/`specs` walk, last result wins) both emit the same
record. Output per module at `docs/evidence/<module>/evidence.json`:

```json
{
  "module": "qt-explorer",
  "generatedAt": "2026-07-18T03:33:04.499Z",
  "environment": { "os": "linux 6.17.0-1020-azure", "node": "v22.23.1",
                   "playwright": "1.61.1", "chromium": "149.0.7827.55" },
  "run": { "id": "29628999191",
           "url": "https://github.com/jwildfire/safety.viz/actions/runs/29628999191" },
  "records": [
    { "test": "QT-CTRL-001/…: renders the view, correction, … controls (#68)",
      "suite": "browser", "status": "pass",
      "requirementIds": ["QT-CTRL-001","QT-CTRL-002","QT-CTRL-003"],
      "issueRefs": [68],
      "screenshots": ["QT-CTRL-001-central-tendency-delta.png"] }
  ]
}
```

Design decisions worth copying verbatim:

- **Records are timestamp-free and sorted** (`suite`, then `test`) — a pure function of the
  run. Volatile provenance is quarantined in three top-level keys, which the guard ignores.
- **Provenance is auto-detected**: `buildRun(process.env)` returns `null` locally and
  `{id, url}` from `GITHUB_RUN_ID`/`GITHUB_REPOSITORY` in Actions.
- **`compareEvidence`** keys on `` `${suite}|${test}` `` and diffs only membership +
  pass/fail (`missing in fresh run` / `status changed` / `new test not in committed
  evidence`). `npm run evidence:check` exits 1 on drift.
- **Screenshots attach by ID prefix**: files named `${requirementId}-${slug}.png` attach to
  every record whose `requirementIds` contains that prefix.
- Current scale: 9 evidence sets, 152–222 records each (mostly shared scaffold).

### Screenshot = baseline = evidence artifact = site image

`tests/e2e/evidence.js` exports one helper:

```js
export const CANONICAL = process.platform === 'linux';
export async function captureEvidence(page, requirementId, slug) {
  const module = path.basename(test.info().file).replace(/\.spec\.js$/, '');
  const name = `${requirementId}-${slug}.png`;
  if (CANONICAL) await expect(page).toHaveScreenshot([module, name]);
  else await page.screenshot({ path: `test-results/evidence-preview/${module}/${name}` });
}
```

With `snapshotPathTemplate: 'docs/evidence/{arg}{ext}'` in `playwright.config.js`, the
*same PNG* is the visual-regression baseline, the audit evidence artifact, and the image on
the published page. Capture conditions are fixed and stated on the page: 1280×800,
`deviceScaleFactor: 1`, `animations: 'disabled'`, `maxDiffPixelRatio: 0.02`. Linux is the
**canonical rendering environment**; macOS dev runs write throwaway previews so cross-platform
pixel noise never fails a local run. Baselines are refreshed only by the
`evidence-update.yml` `workflow_dispatch` job (`npm run evidence:update` → Playwright
`--update-snapshots` → commit `docs/evidence/` back to the branch); running `--update`
off-Linux is blocked unless `FORCE_EVIDENCE_UPDATE=1`.

## 5. Layer 4 — Vendoring reviewed requirement *text*

`npm run requirements` → `scripts/requirements.mjs` + `requirements-lib.mjs`. Reads matrices
from `REQUIREMENTS_SRC` (default the sibling checkout `../obot.agent/docs/requirements`) and
writes `docs/requirements/<module>.json`:

```json
{ "module": "histogram", "matrix": "safety-histogram.md",
  "requirements": { "SH-FUNC-001": "This drop-down menu is used to filter the lab variable …" } }
```

Parsing is structural, not positional:

```js
const REQUIREMENT_ID = /^[A-Z]{2,4}-[A-Z]+-\d+[A-D]?$/;   // ANCHORED — cell must be exactly an ID
const SEPARATOR_ROW  = /^\|[\s\-:|]+\|$/;
// row → cells; id = cells[0], text = cells[2]; keep only rows whose cell[0] is an ID
```

Escaped pipes are handled (`split(/(?<!\\)\|/)`), so requirement prose containing `|`
survives. Because only rows whose **first cell is exactly a requirement ID** contribute,
header rows, separator rows, and every other table in the document are skipped without
hard-coding table positions. Which module maps to which matrix file comes from
`site/config.json` (`"matrix": "safety-histogram.md"`), so a new module needs **no code edit**.

`npm run requirements:check` is the drift guard: with the source present it re-extracts and
compares (`compareRequirements` → `added:` / `removed:` / `text changed:` per ID, exit 1);
with no source it falls back to validating the committed extract is well-formed. Modules
with no harvested matrix are reported and skipped — their evidence page **degrades to
IDs-only** instead of failing.

## 6. Layer 5 — How an evidence page resolves requirement text

Third input: a hand-maintained coverage table per module,
`docs/<module>-coverage.md`. Its tables are:

```
| Requirement ID | Source matrix rows | Issue | Test |
| SH-CTRL-004    | SH-FUNC-004A, SH-FUNC-004B | #2 | normal range checkbox toggles a stable overlay region |
```

`parseCoverage` splits the doc into intro / one section per `##` heading (heading matching
`/playwright|browser/i` ⇒ `kind: 'browser'`, else `'unit'`) / a raw tail from the
"routing status" heading down. `expandRequirementIds` expands the doc's shorthands into full
IDs — plain IDs, slash-continuations (`SH-LIST-002/003`), and `..` ranges
(`QT-CFG-001..007`, zero-pad width inferred). Prose like `—` or `(defaults)` contributes nothing.

Then `renderEvidencePage({ module, config, coverage, evidence, requirements })` joins:

1. **Row → test records** (`matchRecords`): browser rows match by *test-title substring*
   first, falling back to shared requirement IDs; unit rows match purely on
   `record.requirementIds ∩ row.requirementIds`.
2. **Row → requirement text** (`requirementTexts`): iterate
   `[...row.matrixIds, ...row.requirementIds]`, de-dupe, and look up
   `requirements[id]` by **exact base-ID key match**. Source-matrix IDs lead (they carry the
   reviewed prose); module-scheme IDs that also resolve are appended. IDs the matrix does not
   enumerate contribute nothing → the cell renders IDs only.

**This is the sharpest edge in the whole framework.** Resolution is a literal object-key
lookup. If a matrix row is `SH-FUNC-004` but tests/coverage say `SH-FUNC-004A`, nothing
resolves; if a shared ID (`SH-API-001`) is referenced by two modules, only the module whose
extract contains it renders text. Split A/B rows and shared `API-*` IDs are the documented
failure mode (recorded in workspace memory as "requirement-matrix resolution").

The page also renders: a fact list (coverage rows, distinct requirement IDs, tests executed
split browser/unit, pass/fail chips linked to the Actions run, generated timestamp,
environment versions), a captioned **visual-evidence gallery**, the routing-status appendix,
and a reproduction block (`npm ci; npm run evidence:check`). Provenance absence is stated
honestly ("Not recorded for this evidence set") rather than hidden.

## 7. The site: registry-driven static build

`site/config.json` is the single registry. Top-level keys: `siteTitle`, `repoUrl`, `hubUrl`,
`matrixBaseUrl`, and `renderers[]`. Each renderer entry:

```json
{ "module": "qt-explorer", "title": "QT Safety Explorer", "status": "available",
  "experimental": true, "blurb": "…", "hero": "QT-OUT-003-outlier-scatter-max.png",
  "heroAsset": "qt-explorer-hero.png", "matrix": "qt-explorer.md",
  "guide": "qt-explorer.md", "data": "adeg.csv" }
```

`status: available | planned` drives everything: which modules get demo/evidence/API pages,
which appear as live gallery cards vs. a queued list linking only their matrix, which get
requirement extracts. Today: **11 registered, 9 available**.

`npm run site` = `node scripts/api/build-api-data.mjs && node scripts/site.mjs`. It is a
**pure function of the repo tree — no test execution, no network**. It wipes `_site/` and emits:

```
_site/index.html                 gallery (cards from config, hero from site/assets or evidence PNG)
_site/about.html  architecture.html
_site/site.css   assets/   dist/safety.viz-<version>/
_site/<module>/index.html        live demo (shell + committed dist bundle + site/data/<data>.csv)
_site/<module>/guide.html        optional clinical guide from docs/guides/<module>.md
_site/<module>/evidence.html     the evidence report
_site/<module>/api.html          generated API reference from _api/<module>.json
_site/<module>/evidence/*.png    copied from docs/evidence/<module>/
```

Every page is `site/shell.html` with `{{title}} {{description}} {{root}} {{version}}
{{galleryNav}} {{content}}` substituted; all URLs are **relative**, which is what makes the
same output work at `/`, `/dev/`, and `/pr/N/`. The build **fails** on any broken internal
link (`validateSiteLinks` stats every non-external `href`/`src` in the emitted HTML), any
screenshot referenced by `evidence.json` but absent from the evidence dir
(`validateEvidenceScreenshots`), or any undocumented public API surface — so a broken site
can never publish.

## 8. CI and GitHub Pages

`.github/workflows/ci.yml` (PR + push to `main`/`dev`, Node 22, `npm ci`), in order:

1. `npm run format:check` (Prettier 3.9.4)
2. `npm run build` then `npm run build:check-dist` (committed `dist/` must match a fresh build)
3. `npm test` (Vitest 4.1.9)
4. `npm run site` (link + evidence-screenshot validation)
5. `npx playwright install --with-deps chromium`; `npm run test:e2e -- --project=chromium`
6. **`npm run evidence:check`** — freshness guard
7. `actions/checkout` of `jwildfire/obot.agent` into `.requirements-src`, then
   **`npm run requirements:check`** with `REQUIREMENTS_SRC=.requirements-src/docs/requirements`
8. Upload the Playwright report artifact (14-day retention)

`.github/workflows/pages.yml` writes the `gh-pages` branch **incrementally** so three tiers
coexist:

| Trigger | Destination |
| --- | --- |
| push `main` | branch root (`rsync -a --delete --exclude=/dev --exclude=/pr`) |
| push `dev` | `dev/` |
| PR opened/sync (same-repo only) | `pr/{N}/` + sticky preview comment |
| PR closed | `rm -rf pr/{N}` + comment update |

It checks out `gh-pages` into a temp worktree, rsyncs, commits, and **retries the push up to
3× re-fetching on rejection**, with `concurrency: group: pages, cancel-in-progress: false`,
so racing deploys can never lose an update. `.nojekyll` is touched each time. Fork PRs are
skipped (no write token).

`.github/workflows/evidence-update.yml` is `workflow_dispatch`-only and is the *authoritative*
way to refresh canonical baselines.

## 9. The done-gate that makes it stick

`CONTRIBUTING.md` § "Renderer definition of done" — a module is not done, and its roadmap
requirement is not Released, until: gallery card flipped to `available` with a hero
screenshot, live demo against *real* vendored example data, shared shell chrome (enforced by
`tests/e2e/site.spec.js`), evidence page green for every matrix-routed row, and a complete
generated API reference. Demo data is itself generated and documented —
`docs/DATA_SOURCES.md` records that `adbds.csv` / `adae.csv` / `adeg.csv` come from
`scripts/build-demo-data.mjs` over **pharmaverseadam** (CDISC Pilot 01, `CDISCPILOT01`,
254 subjects) — the same source open.csr is planning on.

## 10. The R-side precedent (gsm.safety + qcthat)

`/Users/jwildfire/Documents/obot2/gsm.safety` branch `release/v1.0.0` shows the R analog:

- `.github/workflows/qcthat.yaml` calls the reusable
  `Gilead-BioStats/qcthat/.github/workflows/qcthat-core.yaml@actions` with
  `fail-for-test-failures: true`, `fail-for-missing-tests: true`, `manage-uat: true`, and
  PR / milestone / release report generation.
- `tests/testthat/test-qcthat-convention.R` is a **guard test**: it parses every
  `tests/testthat/test-*.R`, pulls each `test_that()` description, and asserts each ends with
  `(#N)` — `expect_identical(chrUnlinked, character(0))`. Cheap, self-enforcing, and exactly
  the mechanism open.csr needs to keep the naming convention from rotting.
- Per `CONTRIBUTING.md`, qcthat does not yet support JS frameworks — the safety.viz naming
  convention is explicitly the JS-side stand-in (tracked as obot.roadmap#15).

---

# Porting Guide for open.csr (mixed R + JS)

## 11. Minimal file set to replicate

| File (new in open.csr) | Ported from | Purpose |
| --- | --- | --- |
| `docs/requirements/*.md` **or** a sibling `open.csr.agent` repo | `obot.agent/docs/requirements/` | Reviewed matrices, one per component |
| `site/config.json` | same path | Registry: displays/blocks/templates + `status`, `matrix`, `data`, `hero` |
| `scripts/requirements-lib.mjs` + `requirements.mjs` | verbatim (66+145 lines) | Matrix → `docs/requirements/<id>.json` + drift guard |
| `scripts/evidence-lib.mjs` + `evidence.mjs` | +`normalizeTestthat` | Reporter JSON → `docs/evidence/<id>/evidence.json` + guard |
| `qc/run-tests.R` | **new** | testthat → machine-readable JSON |
| `tests/testthat/test-convention.R` | `gsm.safety` guard test | Enforce `ID: … (#N)` naming in R |
| `tests/unit/convention.test.js` | analogous | Enforce naming in JS |
| `docs/<id>-coverage.md` | same | Human traceability table per component |
| `site/shell.html`, `site/site.css`, `scripts/site.mjs`, `scripts/site-lib.mjs` | same | Static build + `validateSiteLinks` |
| `.github/workflows/ci.yml`, `pages.yml`, `evidence-update.yml` | same | Guards + 3-tier publish + baseline refresh |

## 12. Adapt the ID scheme

Keep the regex `^[A-Z]{2,4}-[A-Z]+-\d+[A-D]?$` unchanged — it costs nothing and every
downstream tool depends on it. Suggested open.csr prefixes, one per component and one per
display family:

- `TFL-` TFL Builder engine (`TFL-ARD-001`, `TFL-FMT-004`, `TFL-REGEN-002`)
- `DSP-` per-display requirements in the library (`DSP-DEMO-001` demographics table,
  `DSP-AE-003`, `DSP-LB-007`), or per-display prefixes if the library gets large
- `TXT-` Text Library blocks (`TXT-E3-014` keyed to ICH E3 section numbering)
- `RPT-` Report Template assembly (`RPT-ASM-002`, `RPT-TOC-001`)
- `TRC-` traceability/provenance (data → ARD → display → document)
- `QC-` quality/test framework itself

**Rules learned the hard way**: never split an ID after tests reference it (use `A`/`B`
suffixes *from the start* when a requirement is genuinely two behaviors); avoid one ID shared
across modules (it resolves in only one extract); zero-pad to 3 digits so range shorthand
(`TFL-ARD-001..009`) expands with the right width.

## 13. R side: making testthat emit evidence records

safety.viz gets machine-readable results free from `vitest --reporter=json`. For R, add
`qc/run-tests.R`:

```r
# emits qc/testthat-results.json in the shape scripts/evidence-lib.mjs consumes
res <- testthat::test_local(reporter = testthat::ListReporter$new(), stop_on_failure = FALSE)
df  <- as.data.frame(res)     # cols: file, context, test, nb, failed, skipped, error, warning, passed
recs <- lapply(seq_len(nrow(df)), function(i) list(
  file   = df$file[i],                                   # "test-tfl-demographics.R"
  test   = df$test[i],                                   # "DSP-DEMO-001: … (#12)"
  status = if (df$failed[i] > 0 || df$error[i]) "fail" else "pass"
))
jsonlite::write_json(list(records = recs), "qc/testthat-results.json", auto_unbox = TRUE)
```

Then add a third normalizer next to `normalizeVitest` / `normalizePlaywright`:

```js
export function normalizeTestthat(json) {
  return (json.records || []).map((r) => record(r.test, 'r-unit', r.status === 'pass', r.file));
}
```

and extend `moduleForFile` with an R routing rule — `tests/testthat/test-<id>-*.R → <id>`
(module names in `site/config.json` must then be file-safe: `ae-summary`,
`demographics`, `lb-shift`). Everything downstream (screenshot attachment, freshness guard,
page rendering) is untouched; the evidence page grows a third suite column
(`r-unit` alongside `unit`/`browser`), and `parseCoverage`'s heading heuristic needs one more
branch (`/testthat|R unit/i → 'r-unit'`).

Enforce the naming with the gsm.safety guard test, generalized to require an ID too:

```r
test_that("every test names a requirement ID and an issue (#1)", {
  # parse test_that() descriptions; assert grepl("^[A-Z]{2,4}-[A-Z]+-\\d+[A-D]?", nm)
  #                                 && grepl("\\(#\\d+(, #\\d+)*\\)$", nm)
})
```

Mirror it in JS (`tests/unit/convention.test.js`) by walking `tests/**` with a regex over
`test('…')` / `it('…')` titles, exempting a small allowlist of scaffold files.

## 14. The evidence *artifact* for a CSR is the display, not a screenshot

`captureEvidence` is the piece that needs the most rethinking. safety.viz's insight —
**one artifact that is simultaneously the regression baseline, the audit evidence, and the
published image** — transfers directly, but for open.csr the artifact is the rendered TFL.
Recommended shape:

- Render each display to `docs/evidence/<display>/<REQID>-<slug>.{png,html,rtf}` from the
  canonical Linux runner. PNG for the site gallery + pixel diff; keep the submission-format
  artifact (RTF/PDF via `{tfrmt}`/`{gt}`) beside it and link it from the page.
- For value-level (not pixel-level) regression, prefer a **committed ARD snapshot**:
  `docs/evidence/<display>/<REQID>-ard.csv` (a `{cards}` ARD is already a tidy, diffable
  long table) asserted with `testthat::expect_snapshot_value()`. This is *stronger* evidence
  than an image and immune to font/renderer noise — the ARD is the numeric contract.
- Keep the "canonical environment" rule: R version + package versions belong in the
  `environment` provenance block (`sessionInfo()` → `{ r, os, pkgs: {cards, gtsummary,
  tfrmt, …} }`), and refresh baselines only via the dispatch workflow.
- Extend the record with a `traceability` object — `{ adamDataset, adamHash, ardFile,
  ardHash, displayFile, sourceScript, sourceCommit }` — so the evidence page can render the
  full **data → ARD → display → document** chain the concept promises. This is a strict
  superset of safety.viz's `screenshots` array and costs one extra field in `record()`.

## 15. Sequencing for open.csr

1. **Registry + shell first.** `site/config.json` with every planned display/block/template
   at `status: "planned"`, plus `shell.html`/`site.css`/`site.mjs`. A gallery of planned
   cards publishes on day one and gives the roadmap a public face.
2. **Matrices second, before any implementation.** One matrix per component with the exact
   9-column table; even 15 rows is enough to start. Decide the matrix's home now — sibling
   repo (safety.viz's choice, cleaner review cadence, needs the CI checkout step) vs. in-repo
   (simpler, `REQUIREMENTS_SRC=docs/requirements`, loses the review separation).
3. **Naming convention + guard tests third**, before the suite grows. Retrofitting IDs onto
   200 existing tests is the expensive path.
4. **Evidence pipeline fourth** — port `evidence-lib.mjs` + `requirements-lib.mjs` unchanged,
   add `normalizeTestthat`, wire `evidence:check` / `requirements:check` into CI.
5. **Coverage tables + evidence pages fifth**, one module at a time. Modules with no matrix
   degrade to IDs-only by design, so partial coverage publishes cleanly.
6. **Pages three-tier workflow last** — copy `pages.yml` nearly verbatim; the retry loop and
   `concurrency: pages` are not optional if PR previews are wanted.

## 16. Pitfalls to design around from day one

- **Exact-match ID resolution is unforgiving.** Add a build-time report of *unresolved* IDs
  per module (safety.viz lacks this — it silently degrades). A one-line warning
  "12 of 40 coverage IDs resolved no requirement text" would have caught the A/B split issue.
- **Renaming a test invalidates evidence.** The guard keys on the literal test title; plan
  test names like public API.
- **The coverage table is hand-maintained and drifts** from both the matrix and the tests.
  Consider generating it from `evidence.json` + the extract, and hand-writing only the
  Scope/routing-status prose.
- **Suite-once discipline.** `evidence.mjs` runs each suite exactly once and derives
  everything; do not let R and JS runs diverge into two "truths".
- **Provenance separation.** Keep every volatile field out of `records` or the freshness
  guard becomes noise and gets disabled.
- **CSR-specific addition:** medical-writer text blocks need a *review* status, not just a
  test status. Extend the record with `reviewedBy` / `reviewedAt` for `TXT-*` requirements,
  or model text-block QC as its own suite (`suite: "text-review"`) so the same page
  renders both automated and human evidence in one table.
