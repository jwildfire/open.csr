# Requirement matrix — TFL engine (`opencsr`)

Requirements for the R pipeline that turns ADaM data into Analysis Results Data
and rendered displays: data preparation, spec validation, ARD construction, ARD
serialisation, rendering, and the iteration ledger behind the change-request
loop.

Scope: the R package in [`pipeline/`](../../pipeline). Display-level requirements
(the correctness of individual tables and listings) live in
[`displays.md`](displays.md).

**Verification** names the test file that carries the requirement ID in its test
titles. Every ID below is cited by at least one `testthat` test, and every ID a
test cites appears below — both directions are enforced by `TFL-QC-002` and
`TFL-QC-003`.

## Data preparation

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| TFL-PREP-001 | `prepare_data()` excludes all screen-failure subjects (`ARM == "Screen Failure"`) from ADSL and restricts every other prepared dataset to the surviving subjects. | Functional | `test-data-prep.R` | Verified |
| TFL-PREP-002 | `ITTFL` is derived from randomisation (`!is.na(RANDDT)`); `SAFFL` is used as shipped with `NA` recoded to `"N"`. | Functional | `test-data-prep.R` | Verified |
| TFL-PREP-003 | `COMPLFL` and the derived `DISCREAS` reproduce `EOSSTT` exactly and partition the discontinued subjects. | Functional | `test-data-prep.R` | Verified |
| TFL-PREP-004 | Baseline weight, height and BMI are merged onto ADSL from the ADVS records flagged `ABLFL == "Y"`, so display code never joins subject-level data. | Functional | `test-data-prep.R` | Verified |
| TFL-PREP-005 | Every prepared dataset is described in a manifest with row/column counts, a SHA-256 content hash, and the source package and version. | Traceability | `test-data-prep.R` | Verified |
| TFL-PREP-006 | The analysis-set registry maps `analysis_set` keys onto population flags and rejects unknown sets and datasets lacking the required flag. | Functional | `test-data-prep.R` | Verified |
| TFL-PREP-007 | Treatment arms are ordered by dose, not alphabetically, in every prepared dataset. | Functional | `test-data-prep.R` | Verified |
| TFL-PREP-008 | Every vendored PHUSE file matches the SHA-256 and byte count recorded in `PROVENANCE.json`, which pins the upstream repository, commit, per-file git blob SHA-1 and MIT licence. | Traceability | `test-data-phuse.R` | Verified |
| TFL-PREP-009 | `prepare_data()` exposes the whole CDISCPILOT01 ADaM package — the ten datasets the study's `define.xml` documents, plus PHUSE's added `adcm` — and rejects an unknown dataset name by listing the known ones. | Functional | `test-data-phuse.R` | Verified |
| TFL-PREP-010 | `TRT01A` on every non-ADSL dataset is taken from the prepared ADSL rather than the dataset's own `TRTA`/`TRTP`, so no display can group on an arm the subject-level table disagrees with. | Functional | `test-data-phuse.R` | Verified |
| TFL-PREP-011 | On the PHUSE source the study's own `SAFFL`/`ITTFL`/`EFFFL` and baseline vitals are used as stated rather than re-derived, screen-failure absence is asserted rather than assumed, and `AGEGR1` carries the study's three age groups. | Functional | `test-data-phuse.R` | Verified |
| TFL-PREP-012 | ADCM's relabelling of even-numbered sites into a synthetic second study is reversed, and every remapped subject is proven to be the same subject by age, sex and actual treatment before the remap is accepted. | Robustness | `test-data-phuse.R` | Verified |
| TFL-PREP-013 | The manifest records the upstream repository path and pinned commit for every PHUSE-sourced dataset, in the same `source_pkg`/`source_version` pair a package uses. | Traceability | `test-data-phuse.R` | Verified |
| TFL-PREP-014 | The pharmaverse re-derivation remains readable wholesale as the alternate lane: its own derivations and age grouping hold, its arm labels reach every dataset it serves, and it is the lane on which twelve subjects sit on a different actual arm from the study's own package. | Traceability | `test-data-phuse.R` | Verified |
| TFL-PREP-015 | The analysis-set registry resolves `efficacy` to `EFFFL`; a source that states no efficacy set fails by naming the missing flag rather than returning every subject. | Functional | `test-data-phuse.R` | Verified |
| TFL-PREP-016 | A display declaring a packaging in its `sources:` block is refused prepared data built from a different one, naming the datasets that disagree, rather than silently rendering against data its specification did not ask for. | Robustness | `test-displays-efficacy.R` | Verified |
| TFL-PREP-017 | `RACEOR`, Race (Origin) as the 2006 report coded it, is derived on both lanes from ethnicity first and race second with the report's labels, so that Caucasian plus Hispanic equals White. | Correctness | `test-data-prep.R` | Verified |
| TFL-SRC-001 | The two packagings of CDISCPILOT01 are measured against each other on the domains they share, and every divergence matches the record committed at `quality/data/source-agreement.json`; an unrecorded divergence fails the build. | Quality evidence | `test-data-phuse.R`, `qc/source-agreement.R` | Verified |

## Specification validation

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| TFL-SPEC-001 | An analysis method outside the documented vocabulary is rejected, naming the offending analysis and listing the known methods. | Functional | `test-spec-validation.R` | Verified |
| TFL-SPEC-002 | Missing required keys and missing per-method fields (`variables`, `hierarchy`, `custom`) are rejected before any `{cards}` call is attempted. | Functional | `test-spec-validation.R` | Verified |
| TFL-SPEC-003 | A display specification must carry a study identifier, a population label and a data cut-off — the ICH E3 header requirement — as non-empty strings. | Regulatory | `test-spec-validation.R` | Verified |
| TFL-SPEC-004 | Row-plan keys that YAML 1.1 silently coerces to booleans (bare `n`, `y`, `no`, `on`, `off`) are rejected with an explanation rather than rendered as `FALSE`. | Robustness | `test-spec-validation.R` | Verified |
| TFL-SPEC-005 | A display row referencing an analysis the analysis spec does not define, or an id mismatch between the two specs, fails the build. | Functional | `test-spec-validation.R` | Verified |
| TFL-SPEC-006 | Every display committed to `library/tfl/` validates, has matching ids, and declares a `post_text` variant. | Functional | `test-spec-validation.R` | Verified |
| TFL-SPEC-007 | Spec map KEYS that YAML 1.1 resolves to booleans are rejected naming the file and the path. A digit plan written `N: 0` parses cleanly and means `FALSE: 0`, so the declared precision would never reach the renderer; the failure is loud instead. | Robustness | `test-displays-efficacy.R` | Verified |

## ARD construction

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| TFL-ARD-001 | `build_ard()` emits one row per computed statistic, carrying the `analyses[].name` that produced it, and its continuous statistics equal a direct `dplyr` computation. | Functional | `test-ard-build.R` | Verified |
| TFL-ARD-002 | `subject_count` counts distinct subjects over the analysis-set subject denominator, never over event records. | Functional | `test-ard-build.R` | Verified |
| TFL-ARD-003 | `hierarchical_count` nests inner terms under their outer level, counts each subject once per level, and matches a direct `dplyr` computation. | Functional | `test-ard-build.R` | Verified |
| TFL-ARD-004 | The total column is computed by the same code path as the treatment columns and is labelled with the grouping variable, not an internal constant. | Functional | `test-ard-build.R` | Verified |
| TFL-ARD-005 | `listing` passes records through as one ARD row per record per listed variable, addressable by record index. | Functional | `test-ard-build.R` | Verified |
| TFL-ARD-006 | An analysis may dispatch to a function in the display's `custom.R`; a missing custom function is a build failure, not a silent skip. | Functional | `test-ard-build.R` | Verified |
| TFL-ARD-007 | An analysis `filter` restricts the records summarised, and a filter that is not one logical per row or references an unknown variable fails loudly. | Functional | `test-ard-build.R` | Verified |
| TFL-ARD-008 | `{cards}`' per-statistic `warning` and `error` values are retained as ARD columns; statistics computed on empty groups are recorded, not dropped. | Quality evidence | `test-ard-build.R` | Verified |
| TFL-ARD-009 | A binding address resolves to exactly one ARD row; zero or multiple matches raise an error. | Traceability | `test-ard-build.R` | Verified |
| TFL-QNT-001 | Quartiles use the SAS-compatible type-2 quantile definition, not R's default type 7. | Regulatory | `test-ard-build.R` | Verified |

## ARD serialisation

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| TFL-IO-001 | `ard.json` conforms to the owned schema: `schema`, `display`, `created`, `provenance`, `rows`, with the full thirteen-key row shape on every row. | Interface | `test-ard-io.R` | Verified |
| TFL-IO-002 | The provenance envelope records spec and display hashes, per-dataset hashes and versions, the R and package environment, and the git commit. | Traceability | `test-ard-io.R` | Verified |
| STD-MODEL-003 | The treatment vocabulary (`trt_levels()`) and the analysis-set registry (`analysis_set_flag()`) resolve from `library/study.yaml`, not from code; a model that spells an arm twice or counts a set for the wrong arms is refused. | Interface | `test-study-model.R` | Verified |
| STD-MODEL-004 | Every per-arm count `library/study.yaml` declares for an analysis set is what the default lane's ADSL holds — measured from the vendored file with `{haven}` and again through `prepare_data()` on both treatment assignments. | Traceability | `test-study-model.R` | Verified |
| STD-MODEL-005 | Every committed ARD carries a `population` record in its provenance — analysis set, grouping column, distinct subjects per arm — that agrees with the study model for its analysis set; a listing with no arm grouping says so rather than carrying counts. | Traceability | `test-study-model.R` | Verified |
| STD-SRC-001 | The default source registry serves every dataset the CDISC pilot publishes from the pilot's own package; only ADEX and ADLB, which it does not publish, resolve to the pharmaverse re-derivation, and no committed display reads that lane. The alternate stays readable as a whole and per dataset. | Traceability | `test-study-model.R` | Verified |
| STD-SRC-002 | The pilot's ADVS prepares on the default lane: with no derived-record column every record is observed, a blank timepoint keys the same series as a missing one, and baseline, change and end-of-treatment derive as on the alternate. | Correctness | `test-study-model.R` | Verified |
| TFL-IO-003 | `write_ard()` / `read_ard()` round-trip an ARD without loss; numeric statistics stay numeric. | Interface | `test-ard-io.R` | Verified |
| TFL-IO-004 | Reading refuses a document that is not an `opencsr/ard/v1` ARD; writing refuses rows missing schema columns. | Robustness | `test-ard-io.R` | Verified |
| TFL-IO-005 | Every committed ARD is readable, names only analyses its spec defines, and carries no statistic-level errors. | Quality evidence | `test-ard-io.R` | Verified |

## Formatting and precision

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| TFL-FMT-001 | Rounding is half away from zero (SAS behaviour), not R's round-half-to-even, and is stable against binary representation error. | Regulatory | `test-formatting.R` | Verified |
| TFL-FMT-002 | Proportions are scaled to percent and every statistic is rendered at its declared precision, including trailing zeros. | Functional | `test-formatting.R` | Verified |
| TFL-FMT-003 | The digit plan is declarative: a display-level plan applies by default and a row-level plan overrides it for variables with different collected precision. | Functional | `test-formatting.R` | Verified |
| TFL-FMT-004 | A p-value too small or too large to print at its declared precision is reported at the boundary (`<0.0001`, `>0.9999`) rather than rounded to `0.0000` or `1.0000`; the unrounded probability stays in the ARD, and proportions are unaffected. | Regulatory | `test-displays-efficacy.R` | Verified |

## Rendering

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| TFL-RND-001 | Rendered HTML is a standalone document with inline CSS and no external stylesheet, script or CDN reference. | Interface | `test-render.R` | Verified |
| TFL-RND-002 | In-text and post-text variants render from one ARD; the in-text variant is a strict subset of the post-text variant and applies the declared percentage threshold exactly. | Functional | `test-render.R` | Verified |
| TFL-RND-003 | Columns follow the declared order, carry group headcounts (a p-value column heads none), and silently omit declared columns absent from the ARD. | Correctness | `test-render.R` | Verified |
| TFL-RND-004 | Every rendered display states its study, its analysis set and its data cut-off, and carries a source line. | Regulatory | `test-render.R` | Verified |
| TFL-RND-005 | Rendering a variant the display does not declare is an error. | Robustness | `test-render.R` | Verified |
| TFL-RND-006 | Section headings left without data rows are dropped, and indentation distinguishes headings from the rows beneath them. | Functional | `test-render.R` | Verified |
| TFL-RND-007 | A listing renders one column per listed variable with the label declared in the display spec. | Functional | `test-render.R` | Verified |
| TFL-RND-008 | A `levels: all` row prints each level under `level_labels` while the ARD keeps the data's level; `p_from` names a sibling analysis whose hypothesis-test rows fill a row's p-value column, placed by the test rows' `variable_level` so a sub-block's test sits on its first level only; `format.zero_count` prints a count of nobody as the declared string; with `format.sub_one_pct`, a percentage at zero decimals that is positive but rounds to zero prints `<1` — both opt-in, because the same report prints `1 ( 0%)` in one table and `1 ( <1%)` in another. | Correctness | `test-render.R` | Verified |
| TFL-RND-009 | A hierarchical row plan's `sort` orders the outer level by name or count and the inner level by name, by one named arm's subject count or by subjects summed across the arms, ties by name; `format.zero_count` applies to any pattern that prints a count. | Correctness | `test-render.R` | Verified |
| TFL-RND-010 | A `columns.order` entry may be an object naming the column's label, group level, analysis and pattern, so one row reads a different analysis or statistic per column; a variant may declare its own `rows`, `columns` and `format` and is rendered from the same ARD as the display's full form; a hierarchical row may print its inner level flat and in title case. | Correctness | `test-render.R` | Verified |
| TFL-FIG-001 | A display declaring a `figure:` block renders an inline, self-contained curve drawn only from the committed ARD — deterministic for a given ARD, absent when no figure is declared, and a build failure when the declared coordinate statistics are missing rather than an empty frame. | Functional | `test-displays-efficacy.R` | Verified |
| TFL-FIG-002 | A rendered figure keeps its appearance when the site embeds it by lifting the document body and discarding the head: every drawn element carries its colour and its `fill` as SVG presentation attributes, and the stylesheet holding the dark-scheme palette travels inside the `<svg>`. A figure styled only from the document head publishes as filled black shapes, and silently. | Robustness | `test-displays-efficacy.R` | Verified |
| TFL-SPEC-008 | An analysis spec typed `figure` and a display spec's `figure:` block must both be present or both absent, the block must name an analysis the spec defines, and an axis key YAML 1.1 resolved to a boolean is refused. A `type: figure` display with no block renders as a table and publishes silently as one. | Robustness | `test-displays-efficacy.R` | Verified |

## Iteration ledger and regeneration

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| TFL-ITER-001 | `regenerate()` writes a complete iteration directory — spec snapshots, `ard.json`, rendered variants and a manifest — with spec snapshots byte-identical to the specs read. | Functional | `test-regenerate.R` | Verified |
| TFL-ITER-002 | The iteration manifest records the actor, the change request, the regulatory identifier, the ARD hash, row counts, error counts, the rendered variants and the environment. | Traceability | `test-regenerate.R` | Verified |
| TFL-ITER-003 | A second regeneration — whether through `regenerate()` or `regenerate_all()` — allocates a new version and never overwrites an earlier one; `current.json` moves and the ledger grows. | Functional | `test-regenerate.R` | Verified |
| TFL-ITER-004 | Version allocation takes the maximum of the filesystem and the ledger, so a partially written or partially deleted iteration cannot be silently overwritten. | Robustness | `test-regenerate.R` | Verified |
| TFL-ITER-005 | The committed `t-ae-common` ledger records a real two-iteration change-request story: differing spec and ARD hashes, a recorded request and actor, and unchanged values for the numbers the change did not touch. | Traceability | `test-regenerate.R` | Verified |
| TFL-ITER-006 | Regenerating a display whose spec id does not match its directory is an error. | Robustness | `test-regenerate.R` | Verified |
| TFL-ITER-007 | Every display in the library has a current iteration on disk, referenced by both `current.json` and the ledger. | Quality evidence | `test-regenerate.R` | Verified |

## Submission artifacts (RTF)

Requirement source: [obot.roadmap #129](https://github.com/jwildfire/obot.roadmap/issues/129) part A.
RTF is the format statisticians and regulatory reviewers exchange; a display that
cannot leave the browser in submission form is not a filing artifact. Every RTF is
produced by the same pipeline run — and from the same rendered cells — as the ARD
and the HTML beside it.

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| TFL-RTF-001 | A rendered display encodes as a complete RTF document. | Functional | `test-rtf.R` | Verified |
| TFL-RTF-002 | Every cell of the rendered display appears in the RTF, and row labels arrive without the non-breaking-space indentation the HTML renderer uses. | Correctness | `test-rtf.R` | Verified |
| TFL-RTF-003 | The display title, population label, footnotes, source line and column headers with their subject counts travel into the RTF. | Functional | `test-rtf.R` | Verified |
| TFL-RTF-004 | Listings and reduced in-text variants render as RTF as well as full summary tables do, each naming the variant it is. | Functional | `test-rtf.R` | Verified |
| TFL-RTF-005 | `regenerate()` writes an RTF beside every rendered variant and records its filename and sha256 in the iteration manifest. | Traceability | `test-rtf.R` | Verified |
| TFL-RTF-006 | Every committed display has an RTF for each variant whose hash matches the manifest, so a hand-edited artifact fails the build. | Quality evidence | `test-rtf.R` | Verified |

## The values store

Requirement source: [obot.roadmap #129](https://github.com/jwildfire/obot.roadmap/issues/129) part B.
A value is a named number with provenance: declared in `library/values/values.yaml`,
resolved by the pipeline against the committed ARDs, cited from prose by id. The
JavaScript half of the contract — binding and the fidelity gate — is in
[`text.md`](text.md).

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| TFL-VAL-001 | The values declaration validates: unique ids, a readable label on every value, and exactly one of an ARD source or a declared derivation. | Robustness | `test-values.R` | Verified |
| TFL-VAL-002 | A malformed binding address or an operation outside the closed vocabulary is rejected with a message naming the value. | Robustness | `test-values.R` | Verified |
| TFL-VAL-003 | Every ARD-sourced value equals its row in the committed ARD and carries that iteration's path and sha256. | Correctness | `test-values.R` | Verified |
| TFL-VAL-004 | A derived value equals the arithmetic it declares over values defined before it; a forward reference is an error. | Correctness | `test-values.R` | Verified |
| TFL-VAL-005 | A binding that resolves to no ARD row, or names a display with no committed iteration, fails the build rather than producing a blank value. | Robustness | `test-values.R` | Verified |
| TFL-VAL-006 | Scaling and rounding are presentation only: the stored value stays the ARD's, and `formatted` carries the display format. | Correctness | `test-values.R` | Verified |
| TFL-VAL-007 | The committed store matches a fresh build of the declaration, value for value. | Quality evidence | `test-values.R` | Verified |

## Quality framework guards

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| TFL-QC-001 | Every `testthat` test name matches `<REQ-ID>[, <REQ-ID>]: <description> (#<issue>)`. | Process | `test-naming-convention.R` | Verified |
| TFL-QC-002 | Every requirement ID cited by a test exists in a matrix under `quality/requirements/`. | Process | `test-naming-convention.R` | Verified |
| TFL-QC-003 | Every requirement in a matrix is cited by at least one test — no untested claims. | Process | `test-naming-convention.R` | Verified |
| TFL-QC-004 | Requirement matrices use the five columns ID, Requirement, Type, Verification and Status, with five cells on every requirement row. | Process | `test-naming-convention.R` | Verified |
