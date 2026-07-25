# open.csr — Interface Contracts (v0)

Normative file formats and function signatures. Every component builds against this document; changing a contract is a design change, not an implementation detail.

---

## 1. Repository layout

```
pipeline/                 R package `opencsr` (DESCRIPTION, NAMESPACE, R/, tests/testthat/)
library/tfl/<slug>/       analysis.yaml, display.yaml, [custom.R], iterations.yaml
library/text/<ID>.md      text blocks (YAML frontmatter + prose)
library/templates/ich-e3/ sections.yaml, assembly.yaml
outputs/<slug>/vNNN/      spec snapshots, ard.json, table.html, manifest.json
outputs/<slug>/current.json
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

Any analysis may set `custom: <function_name>` to dispatch to `custom.R` instead of a built-in method; the function receives `(data, spec, denominator)` and must return a `{cards}` ARD.

## 3. `display.yaml` — how to show it

```yaml
id: t-ae-overview
title: "Table 14.3.1.1  Overview of Adverse Events"      # 14.x assigned in assembly, see §7
subtitle: "Safety Analysis Set"
population_label: "Safety Analysis Set"
footnotes:
  - "Percentages are based on the number of subjects in the safety analysis set."
source: "Source: adae, adsl. Data cut-off: 2014-07-01."
columns:
  order: [Placebo, "Xanomeline Low Dose", "Xanomeline High Dose", Total]
rows:                                    # optional relabeling / ordering of analysis output
  - analysis: any_ae
    label: "Subjects with ≥1 AE"
format:
  n_pct: "{n} ({p}%)"                    # count-with-percent pattern
  continuous: "{mean} ({sd})"
  digits: { p: 1, mean: 1, sd: 2 }       # collected-precision +1 / +2 convention
variants:
  post_text: {}                           # full display (Section 14)
  in_text:                                # reduced variant for the narrative section
    filter: { min_pct: 5 }                # thresholded rendering of the same ARD
```

## 4. Prepared datasets (data-prep layer)

`opencsr::prepare_data()` returns a named list of tibbles derived from `{pharmaverseadam}`, with documented derivations (D12):

- Screen failures (`ARM == "Screen Failure"`) excluded from all analysis datasets.
- `SAFFL` used as shipped; `ITTFL` derived (randomized, non-screen-failure); `EFFFL` not derived in v0 (no efficacy data).
- Datasets: `adsl`, `adae`, `adlb`, `advs`, `adex`.
- Attaches a manifest: `list(dataset, n_row, n_col, hash, source_pkg, source_version)` per dataset, where `hash = digest::digest(df, algo = "sha256")`.

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
      "variable": "AEFL", "variable_level": "Y", "context": "subject_count",
      "stat_name": "n", "stat_label": "n", "stat": 69,
      "warning": null, "error": null }
  ]
}
```

`rows` is the `{cards}` ARD flattened one row per computed statistic, plus an `analysis` column naming the `analyses[].name` that produced it. `stat` is a scalar (numbers stay numeric); list-valued statistics serialize as arrays. `warning`/`error` carry `{cards}`' per-statistic condition strings — they are quality evidence, never dropped.

**Binding address** (used by text blocks, §6): `<display>:<analysis>:<stat_name>[;group=<level>][;variable_level=<level>]`.

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

**CI gates (D7):** (a) every binding resolves to exactly one ARD row; (b) every digit run in *rendered* prose traces to a resolved binding — except inside inline code, markdown links, and an explicit `allow_digits` frontmatter list (E3 section numbers, citations, protocol IDs); (c) `generated`-tier blocks with `approval.state != approved` are excluded from assembly and reported.

## 7. Template model — `library/templates/ich-e3/`

`sections.yaml`: full ICH E3 skeleton.

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

Numbering (D6): the assembler assigns `14.x` positions from `post_text` order and rewrites display titles at render time. Slugs are identity; numbers are derived.

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

## 9. Site build

`site/config.json` is the registry — every display, text block, and template with `status` (`planned` | `built` | `evidenced`). `scripts/site.mjs` renders static HTML into `site/_build/` from the registry plus generated `docs/requirements/` and `docs/evidence/`. No network calls, no server, no external CDN.
