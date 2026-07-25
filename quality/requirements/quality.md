# Quality Framework — Requirements

The requirements → tests → evidence loop itself: how a reviewed requirement becomes a test title, how two test suites in two languages become one evidence stream, and what fails the build when a committed artifact stops telling the truth.

Ported from the safety.viz framework (see [research §05](../../research/sections/05_safetyviz-evidence-framework.md)) with open.csr's additions: a testthat normalizer beside the vitest one, a traceability object on every evidence set, human review modelled as its own suite, and a build-time report of unresolved requirement IDs — the blind spot safety.viz degrades through silently.

## Requirement context

Design decision **D11** (see [design §3](../../docs/design/design.md)) fixes the framework in place: matrices in `quality/requirements/`, the ID regex `^[A-Z]{2,4}-[A-Z]+-\d+[A-D]?$` unchanged, test titles carrying IDs, testthat + vitest normalizing into one `evidence.json` per module, published as evidence pages. [Contracts §8](../../docs/design/contracts.md) is normative for the record shape.

## Scope

In scope: matrix extraction, evidence normalization and routing, the freshness guards, the naming convention and its guard tests, the unresolved-ID report, and the static site that publishes all of it.

Out of scope: the statistical content of any display (see `displays.md`), the prose gates on text blocks (see `text.md`), and document assembly (see `templates.md`).

## Source inventory

- `scripts/requirements-lib.mjs`, `scripts/requirements.mjs` — matrix → `docs/requirements/<component>.json`
- `scripts/evidence-lib.mjs`, `scripts/evidence.mjs` — suites → `docs/evidence/<module>/evidence.json`
- `scripts/site-lib.mjs`, `scripts/site.mjs`, `site/config.json`, `site/shell.html`, `site/site.css`
- `.github/workflows/ci.yml`, `.github/workflows/pages.yml`

## Requirements

| ID | Area | Requirement | Source | Evidence Type | Test/Evidence Link | Status | AI Review | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QC-MATRIX-001 | Extraction | A requirement matrix row contributes to the extract only when its ID cell is exactly a requirement ID matching `^[A-Z]{2,4}-[A-Z]+-\d+[A-D]?$` and its requirement text is non-empty. | D11 | js-unit | requirements-matrix.test.js | draft | ai-drafted | Structural, so header and separator rows are skipped without hard-coding table position. |
| QC-MATRIX-002 | Extraction | When a table header row is present, columns are located by name (ID, Area, Requirement, Source, Evidence Type, Status); the safety.viz positional layout is the fallback. | open.csr | js-unit | requirements-matrix.test.js | draft | ai-drafted | Matrices are authored by several agents, so column order cannot be assumed. |
| QC-MATRIX-003 | Extraction | Requirement text containing an escaped pipe (`\|`) is extracted intact rather than split into two cells. | safety.viz | js-unit | requirements-matrix.test.js | draft | ai-drafted | |
| QC-MATRIX-004 | Extraction | Tables in the document that are not requirement tables, and prose containing requirement IDs, contribute nothing to the extract. | safety.viz | js-unit | requirements-matrix.test.js | draft | ai-drafted | |
| QC-MATRIX-005 | Extraction | The committed extract is timestamp-free and a pure function of the matrix content, so the freshness guard is a plain content comparison. | safety.viz | js-unit | requirements-matrix.test.js | draft | ai-drafted | Volatile provenance is quarantined in the evidence set, never the extract. |
| QC-DRIFT-001 | Guards | `requirements --check` reports added, removed and text-changed requirement IDs and exits non-zero when the committed extract differs from a fresh extraction. | safety.viz | js-unit | requirements-matrix.test.js | draft | ai-drafted | |
| QC-DRIFT-002 | Guards | `evidence --check` reports missing tests, new tests and pass/fail changes, and ignores provenance and traceability fields entirely. | safety.viz | js-unit | evidence-normalize.test.js | draft | ai-drafted | Provenance in the guard would make it noise, and noisy guards get switched off. |
| QC-NAME-001 | Convention | Every test title in both suites matches `"<REQ-ID>[, <REQ-ID>]: <description> (#<issue>)"`; a guard test in each suite enforces it. | D11 | js-unit | site-convention.test.js | draft | ai-drafted | Retrofitting IDs onto an existing suite is the expensive path — the guard ships on day one. |
| QC-NAME-002 | Convention | Requirement IDs and issue references are parsed out of a test title, supporting several IDs and several issue refs in one title. | safety.viz | js-unit | evidence-normalize.test.js | draft | ai-drafted | |
| QC-EVID-001 | Evidence | Vitest JSON reporter output normalizes into contracts §8 records carrying `requirementIds`, `title`, `suite`, `passed` and `file`. | contracts §8 | js-unit | evidence-normalize.test.js | draft | ai-drafted | |
| QC-EVID-002 | Evidence | testthat results from `qc/testthat-results.json` normalize into the same record shape with `suite: "r-unit"`. | contracts §8 | js-unit | evidence-normalize.test.js | draft | ai-drafted | R owns the statistics; both suites feed one evidence stream. |
| QC-EVID-003 | Evidence | Any testthat status that is not exactly `pass` (fail, error, skip) records as not passed, so the evidence page never overstates a run. | open.csr | js-unit | evidence-normalize.test.js | draft | ai-drafted | |
| QC-EVID-004 | Evidence | Human review of a text block records as a `text-review` suite record carrying `reviewedBy` and `reviewedAt`, so one page shows automated and human evidence together. | research §16 | js-unit | evidence-normalize.test.js | draft | ai-drafted | A suite cannot produce medical-writer sign-off. |
| QC-ROUTE-001 | Routing | A JS test file routes to its module by path — `tests/unit/<module>/**` or `tests/unit/<module>-<topic>.test.js`. | safety.viz | js-unit | evidence-normalize.test.js | draft | ai-drafted | |
| QC-ROUTE-002 | Routing | An R test file `test-<module>[-<topic>].R` routes to `<module>` by longest-prefix match against the registry. | research §13 | js-unit | evidence-normalize.test.js | draft | ai-drafted | `test-t-ae-overview-ard.R` must beat a hypothetical `t` module. |
| QC-ROUTE-003 | Routing | A test that routes to no module is shared scaffold and is duplicated into every module's evidence set, so each set is self-contained. | safety.viz | js-unit | evidence-normalize.test.js | draft | ai-drafted | |
| QC-ROUTE-004 | Routing | The module universe comes from `site/config.json` — components plus displays — so registering a display is all it takes for its evidence set to appear. | contracts §9 | js-unit | evidence-normalize.test.js | draft | ai-drafted | |
| QC-ROUTE-005 | Routing | A component whose test files are named by topic rather than by module declares its file stems in the registry (`testPrefixes`), and the longest declared prefix wins. | open.csr | js-unit | evidence-normalize.test.js | draft | ai-drafted | `test-ard-build.R` belongs to the engine; `site-binding.test.js` belongs to traceability. |
| QC-ROUTE-006 | Routing | A whole suite may be owned by one component through the registry (`suites`), which is how `text-review` records route to the Text Library regardless of file path. | research §16 | js-unit | evidence-normalize.test.js | draft | ai-drafted | |
| QC-ROUTE-007 | Routing | When a test file covers several modules, records route by the requirement-ID prefixes their owning registry entries declare; a record whose IDs no entry claims stays shared. | open.csr | js-unit | evidence-normalize.test.js | draft | ai-drafted | `test-displays.R` holds every display's assertions; `DSP-ALL-*` is deliberately cross-cutting. |
| QC-EVID-005 | Evidence | A text block awaiting human approval is reported as pending review and blocks assembly, but does not fail the evidence run — draft is a lifecycle state, not a defect. | D8 | js-unit | evidence-normalize.test.js | draft | ai-drafted | |
| QC-UNRES-001 | Resolution | Requirement IDs referenced by a test but defined in no matrix are reported as UNRESOLVED at build time and rendered on the Quality page. | research §16 | js-unit | requirements-matrix.test.js | draft | ai-drafted | The safety.viz blind spot: exact-match resolution degrades silently today. |
| QC-UNRES-002 | Resolution | Reviewed requirements that no test references are reported as uncovered, with a coverage proportion per component. | research §16 | js-unit | requirements-matrix.test.js | draft | ai-drafted | |
| QC-UNRES-003 | Resolution | An ID defined in a sibling component's matrix counts as resolved, not unresolved, so shared IDs do not produce false alarms. | research §16 | js-unit | requirements-matrix.test.js | draft | ai-drafted | |
| QC-SITE-001 | Site | The shared shell substitutes title, description, navigation and root prefix, so one build serves the site at any mount depth via relative URLs. | safety.viz | js-unit | site-render.test.js | draft | ai-drafted | |
| QC-SITE-002 | Site | The build fails when any internal `href`/`src` in the emitted HTML does not resolve to an emitted file. | safety.viz | js-unit | site-validate.test.js | draft | ai-drafted | A broken site can never publish. |
| QC-SITE-003 | Site | The build fails when the emitted site references any external resource — script, stylesheet, font, image or CSS import — so the whole site works offline. | D11 | js-unit | site-validate.test.js | draft | ai-drafted | Outbound `<a href>` links are navigation, not a runtime dependency. |
| QC-SITE-004 | Site | HTML embedded from the pipeline (a rendered display, an assembled fragment) is stripped of scripts, event handlers, external stylesheets and document wrappers before it is placed on a page. | open.csr | js-unit | site-validate.test.js | draft | ai-drafted | |
| QC-SITE-005 | Site | A registry entry's status is derived from the filesystem — `planned` until an ARD exists, `built` once it does, `evidenced` once an evidence set does. | contracts §9 | js-unit | site-render.test.js | draft | ai-drafted | The registry declares intent; the filesystem decides. |
| QC-SITE-006 | Site | Every page renders a documented "not yet generated" state when its input is absent, and the build never throws on a missing or malformed input. | open.csr | js-unit | site-render.test.js | draft | ai-drafted | The pipeline, the assembler and the site are built in parallel. |
| QC-SITE-007 | Site | A display directory present on disk but absent from the registry renders as an unregistered card rather than disappearing from the gallery. | open.csr | js-unit | site-render.test.js | draft | ai-drafted | Slug drift surfaces instead of hiding. |
| QC-CI-001 | CI | CI runs the JS suite, both freshness guards and the site build on every pull request, and runs the R suite in a separate job. | D11 | ci | .github/workflows/ci.yml | draft | ai-drafted | Evidence for this row is the workflow run itself. |
| QC-CI-002 | CI | The built site publishes to GitHub Pages from the default branch through `actions/deploy-pages` under the `pages` concurrency group. | D11 | ci | .github/workflows/pages.yml | draft | ai-drafted | |
