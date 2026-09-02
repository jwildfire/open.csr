# open.csr — Interface Contracts (v0)

Normative file formats and function signatures. Every component builds against this document; changing a contract is a design change, not an implementation detail.

*Reconciled with the shipped v0 implementation on 2026-07-25 — where the build learned something the first draft got wrong, this document follows the code.*

---

## 1. Repository layout

```
pipeline/                 R package `opencsr` (DESCRIPTION, NAMESPACE, R/, tests/testthat/)
library/tfl/<slug>/       analysis.yaml, display.yaml, [custom.R], iterations.yaml
library/text/<ID>.md      text blocks (YAML frontmatter + prose)
library/values/values.yaml named-value declarations (§11)
library/templates/<id>/   sections.yaml, assembly.yaml (one directory per template object)
outputs/<slug>/vNNN/      spec snapshots, ard.json, table.html + table.rtf (per variant), manifest.json
outputs/<slug>/current.json
outputs/values/values.json generated values store (§11)
quality/requirements/     requirement matrices (*.md)
qc/run-tests.R            testthat -> qc/testthat-results.json
scripts/*.mjs             requirements, evidence, assemble, site builders
site/                     shell.html, site.css, config.json, assets/
tests/unit/*.test.js      vitest suites
docs/                     design/, requirements/ (generated), evidence/ (generated)
```

## 2. `analysis.yaml` — what to compute

ARS-aligned profile (D2). Interpreted by `opencsr::build_ard()`.

```yaml
id: t-ae-overview              # display slug, matches directory name
title: "Overview of Adverse Events"
regulatory_id: AET01           # optional: chevron / FDA ST&F identifier
type: table                    # table | listing | figure
dataset: adae                  # prepared dataset name (see §4)
analysis_set: safety           # key into data-prep population flags
group:                         # column(s) defining table columns; [] for ungrouped
  - TRT01A
total: true                    # add an "All Subjects"-style total column
analyses:                      # ordered; each yields ARD rows
  - name: any_ae
    method: subject_count      # see method vocabulary below
    label: "Subjects with any adverse event"
    filter: null               # optional R expression string, evaluated on dataset
  - name: by_soc_pt
    method: hierarchical_count
    label: "Adverse events by SOC and preferred term"
    hierarchy: [AEBODSYS, AEDECOD]
denominator: adsl              # dataset supplying subject denominators
```

**Method vocabulary (v0):** `continuous` (N, mean, sd, median, min, max, q1, q3), `categorical` (n, p by level), `subject_count` (unique subjects, with denominator + pct), `hierarchical_count` (subject counts nested by `hierarchy`), `listing` (row passthrough of `variables`), `figure` (delegates to `custom.R`).

Any analysis may set `custom: <function_name>` to dispatch to `custom.R` instead of a built-in method; the function receives `(data, spec, denominator)` and must return a `{cards}` ARD. `figure` is dispatch-only: a figure analysis without `custom:` is a validation error.

**YAML gotcha, enforced:** a bare `pattern: n` parses as boolean `false` under YAML 1.1. Quote string values for row keys (`pattern: "n"`); spec validation rejects non-character values with an explicit message.

## 3. `display.yaml` — how to show it

```yaml
id: t-ae-overview
title: "Overview of Adverse Events"      # 14.x number assigned at assembly, see §7
study: CDISCPILOT01                      # required
population_label: "Safety Analysis Set"  # required
cutoff: "2014-07-01"                     # required
footnotes:
  - "Percentages are based on the number of subjects in the safety analysis set."
source: "Source: adae, adsl. Data cut-off: 2014-07-01."
columns:
  order: [Placebo, "Xanomeline Low Dose", "Xanomeline High Dose", Total]
  labels: { AEDECOD: "Preferred Term" }   # optional: column headers, mainly for listings
rows:                                    # optional relabeling / ordering of analysis output
  - analysis: any_ae
    label: "Subjects with ≥1 AE"
    # optional row keys: variable, level, levels (or `all`), level_order, indent,
    # section: true, pattern, digits (row-level override), and
    # type: hierarchical + levels: [outer, inner] for SOC/PT-style nesting
format:
  n_pct: "{n} ({p}%)"                    # count-with-percent pattern
  continuous: "{mean} ({sd})"
  digits: { p: 1, mean: 1, sd: 2 }       # collected-precision +1 / +2 convention
variants:
  post_text: {}                           # full display (Section 14)
  in_text:                                # reduced variant for the narrative section
    filter: { min_pct: 5 }                # thresholded rendering of the same ARD
```

**Row options added for the reference demographics table (#61).** On a `levels: all` row, `level_labels: { M: Male, F: Female }` prints a level under the report's word while the ARD keeps the data's level, so `{{ard:…;variable_level=F}}` still binds. `p_from: <analysis>` names a sibling analysis whose hypothesis-test rows (`group1 = "statistic"`, `group1_level = "p-value"`) fill the row's p-value column; a custom analysis places the test on one level by setting the test rows' `variable_level`, so a sub-block with no n row carries its p-value beside its first level only. `format.zero_count: "0"` prints a count of nobody as that string instead of `0 (0%)`; `format.sub_one_pct: true` prints a percentage shown to no decimals that is positive but rounds to zero as `<1`. Both are per display: the same 2006 report prints `1 ( 0%)` in its end-of-study table and `1 ( <1%)` in its demographics table.

**Hierarchical sort and shared custom code (#62).** A `type: hierarchical` row accepts `sort: { outer: alpha | { by_group }, inner: alpha | { by_group: "<arm label>" } | { by: sum } }`; the default at both levels is the largest count in any one arm, descending, then name. An analysis spec may declare `custom_from: <slug>` to dispatch its `custom:` entries to another display's `custom.R`, so two tables that must count the same way share one implementation.

**Flow figures (#63).** A `figure:` block with `kind: flow` draws boxes of counts rather than curves: `analysis` names the ARD analysis, and `boxes` lists `{level, label, from?, side?}` — each box prints its label and the `n` the ARD holds at `variable_level = level`; `from` draws the arrow that feeds it and `side: right` hangs it off its source as a branch. No axes; the axis checks do not apply.
**Column objects and variant redraws (#63).** An entry of `columns.order` may be an object `{label, group, analysis, pattern}`: the column prints `label`, reads the ARD at group level `group`, and — when set — reads `analysis` rather than the row's and prints `pattern` rather than the row's. Twelve columns of arm × population on the subjects-by-site table, and n / mean pairs per arm on the in-text weight table, are that. A variant may declare `rows`, `columns` and `format` of its own; they replace the display's for that rendering, over the same ARD, which is how the report's in-text Tables 11-1, 12-1 and 12-4 are drawn from the Section 14 displays' results. A hierarchical row accepts `inner_only: true` (no outer headings, the inner level flat) and `label_case: title`.

## 4. Prepared datasets (data-prep layer)

`opencsr::prepare_data(datasets, source_pkg, sources)` returns a named list of tibbles for one study, CDISCPILOT01, drawn from two packagings of it and prepared with documented derivations (D12).

**Sources.** `data_sources()` maps each dataset name to `"phuse"` or `"pharmaverseadam"`. Since v0.4.0 (D0032 R2, #60) the default registry resolves every dataset the CDISC pilot publishes — `adsl`, `adae`, `advs`, `adqsadas`, `adqscibc`, `adqsnpix`, `adlbc`, `adlbh`, `adlbhy`, `adtte`, `adcm` — to `"phuse"`, the study's own package; only `adex` and `adlb`, which that package does not contain, resolve to `"pharmaverseadam"`, and no display reads them. `sources = "pharmaverseadam"` selects the alternate lane wholesale; a named vector overrides per dataset; `regenerate(sources = …)` builds one iteration on a stated lane and records it. The study model `library/study.yaml` (§4a) names the default.

**Vendored data.** `pipeline/inst/extdata/phuse-cdiscpilot01/` holds eleven gzipped `.xpt` files from `phuse-org/phuse-scripts` (MIT), with `PROVENANCE.json` recording the upstream repository, the pinned commit, and each file's upstream path, git blob SHA-1, SHA-256 and byte count, plus the upstream licence text. `qc/vendor-phuse-data.R` writes it and `--check` verifies it; nothing else may edit it.

**Derived medications and the screened population (#65, #63).** `adcm` on the default lane is `derive_adcm(read_phuse("cm"))`: the study's SDTM CM domain, every column as published, `ASTDT`/`AENDT` only where the source states a full date, `CMFL = "Y"`; `SAFFL` and the treatment columns join from ADSL by subject in `attach_trt()`. The relabelled PHUSE `adcm` stays vendored and readable as `read_phuse("adcm")` for the test that holds the derivation to it. `dm` is the study's SDTM demographics domain and the one dataset `prepare_data()` does not restrict to ADSL's subjects — its 52 screen failures are its point.

**Study model (`library/study.yaml`).** One file declares what the study IS: `id`, `title`, `cutoff`; `arms` as a list of `{id, label}` in print order (the `label` is the only spelling of an arm anywhere in the repository); `group_variables`, a map from each column that carries an arm label to `planned` or `actual`; `assignment_columns`, the ADSL column for each; `source.default` and `source.alternates`; and `analysis_sets`, each with `label`, `flag` (`null` for no filter) and `subjects`, the distinct subjects per arm on the default lane — spelled `subjects`, not `n`, because YAML 1.1 parsers read a bare `n` as false. `trt_levels()`, `analysis_set_flag()` and `study_arm_labels()` read it; `test-study-model.R` re-measures every count against the data; the assembler's treatment-consistency gate (`gates.treatmentConsistency` in every `docs/assembled/*.json`) holds every placed display to it.

**Population record.** Every `ard.json` provenance envelope carries `population = {analysis_set, group, n, total}`: the spec's analysis set, its first grouping column, the distinct subjects per arm in the denominator after the analysis set is applied (counted on the ADSL column of the same assignment, so `TRTP` counts on `TRT01P`), and the distinct subjects overall. `n` is `null` when the grouping column is not a treatment column the model knows (a listing).

**Derivations, `{pharmaverseadam}` lane:**

- Screen failures (`ARM == "Screen Failure"`) excluded from all analysis datasets.
- `SAFFL` used as shipped; `ITTFL` derived (randomized, non-screen-failure); `EFFFL` **not derived and not guessed** — this packaging states no efficacy analysis set, so `analysis_set: efficacy` fails here, naming the missing flag.
- **`DISCREAS`** is a *derived* discontinuation reason, deliberately not named `DCSREAS`: pharmaverseadam's ADSL ships neither `DCSREAS` nor `DCDECOD`, so the derivation collapses to Death (from `DTHFL`) versus Other/Not specified, and must not borrow the CDISC variable's semantics. Surfaced as a display footnote, asserted by a test.
- `BLWT`/`BLHT`/`BLBMI` merged from the ADVS baseline records.

**Derivations, PHUSE lane:** the study states its own `SAFFL`/`ITTFL`/`EFFFL` (blank recoded to `"N"`), its own baseline weight/height/BMI on ADSL, and its own three age groups (`<65`, `65-80`, `>80`); none of these is re-derived. `COMPLFL` is the complement of the study's `DISCONFL`. `DISCREAS` is derived to the *same two levels* as the other lane so a display specified against one source renders against the other; `DCDECOD` and `DCREASCD` are carried through untouched for a display that wants the collected reason. Screen-failure absence is asserted, not assumed. ADCM's relabelling of even-numbered sites into a synthetic `CDISCPILOT02` is reversed, and every remapped subject must match ADSL on age, sex and actual arm or the preparation fails.

**Both lanes:** `TRT01A` on every non-ADSL dataset is taken from the prepared ADSL by `USUBJID`, never from the dataset's own `TRTA`/`TRTP`.

**Analysis sets:** `safety` → `SAFFL`, `itt` → `ITTFL`, `efficacy` → `EFFFL`, `completers` → `COMPLFL`, `all` → no filter.

**Manifest:** `list(dataset, n_row, n_col, hash, source_pkg, source_version)` per dataset, where `hash = digest::digest(df, algo = "sha256")`. For a `{pharmaverseadam}` dataset the last pair is the package and its version; for a PHUSE dataset it is `"phuse-org/phuse-scripts:data/adam"` and the pinned upstream commit.

**Source agreement:** the two packagings overlap on ADSL, ADAE and ADVS and do not agree on all of it. Every divergence is recorded in `quality/data/source-agreement.json` and reproduced by `qc/source-agreement.R`, which exits non-zero when any measured fact stops matching the record. The record's `environment` block — the R version, OS and `{pharmaverseadam}` version that measured — is recorded and printed but never compared: a version bump that moves no measured fact is news, not a failure, and one that moves a fact still fails on the fact it moved.

## 5. `ard.json` — the ARD serialization (owned schema, D5)

```json
{
  "schema": "opencsr/ard/v1",
  "display": "t-ae-overview",
  "created": "2026-07-25T04:00:00Z",
  "provenance": {
    "spec_hash": "sha256:…",         // analysis.yaml
    "display_hash": "sha256:…",      // display.yaml
    "data": [{ "dataset": "adae", "hash": "sha256:…", "n_row": 1191,
               "source_pkg": "pharmaverseadam", "source_version": "1.1.0" }],
    "environment": { "r": "4.3.3", "os": "…",
                     "packages": { "cards": "0.8.1", "gtsummary": "2.5.1" } },
    "git_commit": "…"                 // null when the tree is dirty
  },
  "rows": [
    { "analysis": "any_ae", "group1": "TRT01A", "group1_level": "Placebo",
      "group2": null, "group2_level": null,
      "variable": "AEFL", "variable_level": "Y", "context": "subject_count",
      "stat_name": "n", "stat_label": "n", "stat": 69,
      "warning": null, "error": null }
  ]
}
```

`rows` is the `{cards}` ARD flattened one row per computed statistic, plus an `analysis` column naming the `analyses[].name` that produced it. Every row carries the same fixed 13 keys — `group2`/`group2_level` are `null` unless the analysis is hierarchical — so the JS side can rely on the shape. `stat` is a scalar (numbers stay numeric); list-valued statistics serialize as arrays. `warning`/`error` carry `{cards}`' per-statistic condition strings — they are quality evidence, never dropped.

**Percentages are stored as proportions** in `[0, 1]` (`p` = 0.433, not 43.3). Scaling is a presentation concern, handled by `display.yaml` `format` on the display side and the `scale` qualifier on the binding side.

**Quantiles use the type-2 (SAS) definition**, not R's default type 7 — any recomputation must match.

**Binding address** (used by text blocks, §6):

```
<display>:<analysis>:<stat_name>[;<qualifier>=<value>]…
```

Selection qualifiers narrow which ARD row is addressed — `group`, `group2`, `variable`, `variable_level`. Presentation qualifiers affect only rendering and never the stored value — `scale` (multiplier, e.g. `scale=100` for a percentage) and `digits` (rounding). Exactly one row must match, or the binding is an error.

## 6. Text blocks — `library/text/<ID>.md`

```markdown
---
id: TXT-E3-1202
e3_section: "12.2.1"
title: "Brief Summary of Adverse Events"
tier: parameterized            # boilerplate | parameterized | generated
displays: [t-ae-overview]
approval: { state: approved, by: "@jwildfire", at: "2026-07-25" }
provenance: { model: null, prompt: null }
requirements: [TXT-AE-001]
---

Overall, {{ard:t-ae-overview:any_ae:n;group=Xanomeline High Dose}} subjects
({{ard:t-ae-overview:any_ae:p;group=Xanomeline High Dose}}%) in the high-dose group
reported at least one adverse event.
```

Binding syntax: `{{ard:<binding address>}}` (§5). Rendering resolves against `outputs/<display>/current` ARD.

**Named values** (§11): `{{value:<id>}}` resolves against the generated values store. It is an ARD binding that has been named once, centrally, rather than re-addressed per sentence; its substitution is span-tracked exactly like an `{{ard:…}}` one, so its digits are exempt from the fidelity gate — and the store itself is re-derived from the committed ARDs at assembly, so naming a number never loosens the check on it.

**Cross-reference tokens** keep prose from typing numbers the assembler owns (D6): `{{xref:display:<slug>}}` resolves to the display's assigned 14.x number and title, `{{xref:section:<number>}}` to a section link. Both fail the build when unresolvable, and their output is span-tracked so the digits they emit are exempt from the fidelity gate.

**CI gates (D7):** (a) every binding resolves to exactly one ARD row; (b) every digit run in *rendered* prose traces to a resolved binding — except inside inline code, markdown links, and an explicit `allow_digits` frontmatter list (E3 section numbers, citations, protocol IDs); (c) `generated`-tier blocks with `approval.state != approved` are excluded from assembly and reported.

## 7. Template model — `library/templates/<id>/`

One directory per **template object**. A directory containing a `sections.yaml` is a template object; the assembler discovers them from disk and `--template <id>` selects one (`--all` builds every one). `ich-e3` is the default and writes `docs/assembled/csr.{json,html}`; any other id writes under its own name.

`sections.yaml`: the document model — what this kind of document IS. `library/templates/ich-e3/sections.yaml` is the full ICH E3 skeleton; `library/templates/e3-synopsis/sections.yaml` is the ICH E3 Annex I synopsis; `library/templates/display-package/sections.yaml` is the post-text displays on their own; `library/templates/e3-abbreviated/sections.yaml` is the reduced report E3's Introduction contemplates.

A document model may be a **restriction** of another: the display package and the abbreviated report declare only sections that exist in `ich-e3`, each carrying the number, title, slug and content declaration it has there, unchanged. Nothing in the loader enforces that — it is a property of those two files, checked by `tests/unit/assemble-template-subsets.test.js` — but it is what lets a restricted model reuse the full report's prose without a single edit: the cross-references in that prose resolve because the referenced sections are retained.

```yaml
sections:
  - number: "12.2.1"
    title: "Brief Summary of Adverse Events"
    slug: ae-brief-summary
    content: [text, in_text_display]      # text | in_text_display | post_text_index | generated_provenance
```

`assembly.yaml`: study configuration.

```yaml
study: { id: CDISCPILOT01, title: "…", cutoff: "2014-07-01" }
slots:
  - section: "12.2.1"
    text: [TXT-E3-1202]
    displays: [t-ae-overview]            # rendered as in_text variant here
post_text:
  - { section: "14.3.1", displays: [t-ae-overview, t-ae-common] }
```

Numbering (D6): the assembler assigns post-text positions from `post_text` order and rewrites display titles at render time. Slugs are identity; numbers are derived — the same display is `Table 14.1.1` in the clinical study report and `Table 13.1` in the synopsis from one unchanged specification.

**Inputs record (#78).** The assembled document carries `inputs` — what it was built from, derived at build and never declared: `template {id, title, version}`, `study {id, file, cutoff}`, `displays[] {slug, number, title, variants, iteration, ardHash, source, datasets[] {dataset, hash, n_row}}`, `datasets[] {dataset, hash, n_row, readBy[]}`, `textBlocks[] {id, section, tier, state, included, displays[], values[]}` and `values[]` (the ids cited). Each block in a section carries its own `inputs {displays[] {slug, iteration, ardHash, source, bindings}, values[]}`, the displays being those its bindings resolved against. The Reader renders the document record as a panel of links above the text and the block records beside each block; the frontmatter's `displays:` list remains the author's declaration, and the gate that fails a block binding an undeclared display is unchanged.

Gate scope: gates judge the document being assembled, over the blocks its assembly claims. A block written for the full E3 report may cross-reference Section 16.2.1 and must not be failed against a synopsis model that has no Section 16. A block the Text Library holds but this build did not assemble is reported in `gates.warnings`, so "not gated" cannot pass for "gated and clean".

## 8. Evidence contract

`qc/run-tests.R` writes `qc/testthat-results.json`:

```json
{ "records": [ { "file": "test-tfl-demographics.R",
                 "test": "DSP-DEMO-001: age summary matches ADSL (#1)",
                 "status": "pass" } ] }
```

`scripts/evidence.mjs` normalizes testthat + vitest into `docs/evidence/<module>/evidence.json`:

```json
{ "module": "t-ae-overview", "generated": "…",
  "records": [ { "requirementIds": ["DSP-AE-001"], "title": "…", "suite": "r-unit",
                 "passed": true, "file": "…" } ],
  "traceability": { "adamDatasets": ["adae"], "ardFile": "outputs/…/ard.json",
                    "ardHash": "sha256:…", "displayFile": "…", "sourceCommit": "…" },
  "environment": { "r": "4.3.3", "packages": { … } } }
```

**Requirement ID regex (unchanged from safety.viz):** `^[A-Z]{2,4}-[A-Z]+-\d+[A-D]?$`. Prefixes: `TFL-` engine, `DSP-` displays, `TXT-` text, `RPT-` templates/assembly, `TRC-` traceability, `QC-` framework.

**Test naming (both suites):** `"<REQ-ID>[, <REQ-ID>]: <description> (#<issue>)"`. Guard tests in each suite enforce it.

**Reference-report agreement record (`quality/data/reference-report-agreement.json`).** One entry per display held to the 2006 report. `rows[].analysis` is the row's key for the recomputation route; `label` is what the rendered display prints; `report_label` (optional) is what the report prints before the cells on that line — a block name shares the line with its first row — and is what `--verify-transcription` compares; `printed` are the report's cells; `p_value_printed` its p-value. `n_cells` (default 4) is the report's cell count per line. `published_from` (optional) maps a report line onto rendered rows by label and occurrence when the two layouts differ, as Table 14-4.01's column groups become row blocks. `reference.source_document.pages[slug]` is one page or a vector.

## 9. Site build

`site/config.json` is the registry — every display, text block, and template with `status` (`planned` | `built` | `evidenced`). `scripts/site.mjs` renders static HTML into `site/_build/` from the registry plus generated `docs/requirements/` and `docs/evidence/`. No network calls, no server, no external CDN.

**The Data section (#76).** `site/config.json` → `data` names the study's data package (its directory, `PROVENANCE.json` and the verify command), the lanes record (`quality/data/source-agreement.json`) and one entry per dataset: `id`, `domain` (`adam` | `sdtm`), `title`, `blurb`, `source` (`pipeline` for a vendored file the preparation layer reads, `derived` for an analysis dataset the pipeline builds from another, named by `derivedFrom`, `alternate` for one only the alternate lane serves), optional `file` when the vendored file's name differs from the id, optional `lane`, and `notes` (the derivations applied, in words; §4 is the authority). Everything else on the pages is read, never typed: the package's provenance record, and the `provenance.data` envelope of every current ARD, from which `scripts/data-lib.mjs` builds the reverse index — dataset → every display that read it, with the iteration, row count and hash that display recorded. A display header links its datasets to those pages with the same hash and row count; `data/<id>.html` is a dataset's permalink and the app absorbs it as the Data view with that dataset in focus. The `source` field is what the ARDs-received page of design decision D13 will extend.

**The Pipeline section and the flows (#82, #83).** `site/config.json` → `pipeline.functions` declares the pipeline's functions by the code's own names — `id`, `label`, `kind` (`R` | `node`), `code`, `blurb`, `reads[]` and `writes[]` (each a label with an optional `sub` and site-relative `href`), `calls[]`, `gates[]`, and `produces` naming the collection the function writes into (`datasets` | `displays` | `values` | `documents` | `site`), from which `scripts/pipeline-lib.mjs` lists what each produced. The explorer arranges its groups in three parts in the pipeline's order (Inputs: Data, Metadata, Text; Pipeline; Outputs: Displays, Values, Documents), and the application strip's study views follow it. `scripts/flow-lib.mjs` → `renderFlow({inputs, steps, outputs})` draws every element's flow in three lanes from the records above; the call sites pass what the ARD envelope, the manifest, the assembled document's `inputs` and the registry already say.

**Links both ways (#78).** A display's header links the analysis set and grouping column as the study model defines them, its specification history, its environment, the text blocks that bind it and the values sourced from it; a text block's card lists its inputs derived from its bindings; the values pane links the arm an address names, the datasets behind the value and the documents citing it; the provenance appendix is rendered as links; the explorer flags a document whose build failed a gate. Every one of these is computed by `scripts/site.mjs` from records the pipeline and the assembler already write.

**The Metadata section (#77).** Six pages under `metadata/`, each read from the file that declares the thing and none of them typed: `study` renders `library/study.yaml` through the same validated loader the assembler's gate uses; `models` indexes the template objects on disk with the documents assembled from each (the Templates view remains the walk through one model's sections); `specs` lists every display's `analysis.yaml` and `display.yaml` with the iteration history the manifests recorded (actor, change request, spec, display and ARD hashes) and the custom code shared through `custom_from`, plus the value declarations in `library/values/values.yaml`; `approvals` lists every text block's tier, version, approval and drafting model from its frontmatter; `environments` deduplicates the R, OS and package-version records across every iteration; `requirements` lists the matrices. `scripts/metadata-lib.mjs` builds them; the app absorbs `metadata/<page>.html` as the Metadata view with that section in focus.

**What "no network calls" forbids, precisely.** No external host, no API, no CDN, no analytics, no font — enforced by `validateNoExternalResources`, which fails the build on any absolute or protocol-relative resource URL. A page may `fetch` a **build artifact from its own origin** when loading it eagerly would be wasteful: the text-block editor pulls `demo/ard/<slug>.json` (published by the same build, from the same committed ARD) the first time a block that binds it is opened, rather than inlining 832 KB of ARD into every visit of the Demo page. The site still serves from any static host with nothing behind it, which is the property the rule protects.

## 10. Submission artifacts (RTF)

Every rendered variant of a display is written twice: `table.html` (or `table-<variant>.html`) and `table.rtf` (or `table-<variant>.rtf`), both from the same rendered cell table, in the same `regenerate()` loop. RTF is produced with `{r2rtf}` via `opencsr::render_rtf()`.

The iteration manifest records each variant's artifacts:

```json
"variants": { "post_text": { "file": "table.html", "rtf": "table.rtf",
                             "rtf_hash": "sha256:…", "n_rows": 22 } }
```

`rtf_hash` is the sha256 of the file as written, which is what allows a committed RTF to be proved to be the pipeline's output rather than a hand-edited copy — a testthat guard (`TFL-RTF-006`) re-hashes every committed RTF against its manifest. The site build republishes each current-iteration RTF flat as `artifacts/<slug>[-<variant>].rtf` and offers it for download beside the rendered display.

RTF is a 7-bit format: `\`, `{` and `}` are escaped and non-ASCII code points travel as `\uc1\uNNNN?`. `_` is subscript markup in `{r2rtf}` and never reaches a document as a literal.

## 11. The values store

A **value** is a named scalar with provenance — the unit a writer reuses ("randomized N", "median age") as opposed to the address a binding uses.

`library/values/values.yaml` is source (D9):

```yaml
study: CDISCPILOT01
values:
  - id: randomised-n                       # kebab-case, unique, the citation key
    label: "Subjects randomised"           # required: a name has to read
    source: t-disposition:randomised:n;group=Total   # §5 binding address, display included
    format: { scale: 1, digits: 0 }        # presentation only
    notes: "…"                             # optional
  - id: ae-any-n-xanomeline
    label: "…"
    derived: { op: sum, inputs: [ae-any-n-low, ae-any-n-high] }
```

Exactly one of `source:` or `derived:` per value. Derivation operators are a **closed vocabulary** — `sum` (≥2 inputs), `difference`, `ratio`, `percent` (exactly 2, in order) — precisely so the R builder and the JavaScript gate can each evaluate them and agree. Inputs must be declared before use.

`opencsr::regenerate_values()` writes `outputs/values/values.json`:

```json
{ "schema": "opencsr/values/v1", "study": "CDISCPILOT01", "created": "…",
  "provenance": { "source_file": "library/values/values.yaml", "source_hash": "sha256:…",
                  "git_commit": "…", "environment": { … } },
  "values": [ { "id": "randomised-n", "label": "…", "kind": "ard",
                "value": 254, "formatted": "254",
                "format": { "scale": 1, "digits": 0 },
                "source": { "address": "…", "display": "t-disposition", "analysis": "randomised",
                            "iteration": "v002", "ard_file": "outputs/…/ard.json",
                            "ard_hash": "sha256:…" } } ] }
```

`value` is the ARD's number unscaled — proportions stay in [0, 1] as in §5 — and `formatted` carries scaling and half-up rounding, so the store stays directly comparable to the ARD.

**Gate (d), the values gate.** At assembly every value is re-derived from the same committed ARDs the report is built from. A value fails when its address resolves to zero or several rows, when the ARD row no longer equals the stored value, when the cited ARD hash is not the committed one, when `formatted` does not match the declared format, or when a derived value no longer equals its own arithmetic. Any of these fails the build exactly as a typed number in prose does.

---

## 12. Conventions the v0 build established

Learned during implementation; normative from here.

- **Evidence routing is data, not code.** `site/config.json` carries `testPrefixes` (test filename → component), `prefixes` (requirement-ID prefix → module), and `suites` (whole suite → component). Registering a new display is a registry edit; no script changes. R test files are organized by engine topic rather than by display, so display attribution comes from the requirement-ID prefix (`DSP-<AREA>-*`).
- **Requirement IDs cannot contain digits in the middle segment.** The regex `^[A-Z]{2,4}-[A-Z]+-\d+[A-D]?$` rejects `RPT-E3-001`; use `RPT-MODEL-001`. (Text-block *file* IDs like `TXT-E3-1202` are identities, not requirement IDs — the requirements a block satisfies live in its `requirements:` frontmatter.)
- **Draft is a lifecycle state, not a failure.** A `generated`-tier block awaiting approval reports as pending review — a warning chip on the evidence page, not a failed test, and not a non-zero exit code.
- **The evidence record extends §8** with `issueRefs` on every record, and `reviewedBy`/`reviewedAt` on human-review records; evidence sets carry a `run` key (GitHub Actions run id/url, `null` locally).
- **The Reader renders from library source**, resolving bindings against the committed ARDs, rather than from pre-flattened assembler prose — so display formatting stays a rendering-time concern.
- **Ordering is load-bearing:** the R pipeline must run before `assemble.mjs`, which must run before `site.mjs`. CI re-assembles on every run rather than trusting committed output.
- **`git_commit` is `null` when the tree is dirty**, by design — an artifact that cannot name its commit says so instead of guessing.
