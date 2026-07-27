# open.csr — Interface Contracts (v0)

Normative file formats and function signatures. Every component builds against this document; changing a contract is a design change, not an implementation detail.

*Reconciled with the shipped v0 implementation on 2026-07-25 — where the build learned something the first draft got wrong, this document follows the code.*

---

## 1. Repository layout

```
pipeline/                 R package `opencsr` (DESCRIPTION, NAMESPACE, R/, tests/testthat/)
library/tfl/<slug>/       analysis.yaml, display.yaml, [custom.R], iterations.yaml
library/text/<ID>.md      text blocks (YAML frontmatter + prose)
library/templates/ich-e3/ sections.yaml, assembly.yaml
outputs/<slug>/vNNN/      spec snapshots, ard.json, table.html, table-in-text.html, manifest.json
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

## 4. Prepared datasets (data-prep layer)

`opencsr::prepare_data()` returns a named list of tibbles derived from `{pharmaverseadam}`, with documented derivations (D12):

- Screen failures (`ARM == "Screen Failure"`) excluded from all analysis datasets.
- `SAFFL` used as shipped; `ITTFL` derived (randomized, non-screen-failure); `EFFFL` not derived in v0 (no efficacy data).
- **`DISCREAS`** is a *derived* discontinuation reason, deliberately not named `DCSREAS`: pharmaverseadam's ADSL ships neither `DCSREAS` nor `DCDECOD`, so the derivation collapses to Death (from `DTHFL`) versus Other/Not specified, and must not borrow the CDISC variable's semantics. Surfaced as a display footnote, asserted by a test.
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

**Cross-reference tokens** keep prose from typing numbers the assembler owns (D6): `{{xref:display:<slug>}}` resolves to the display's assigned 14.x number and title, `{{xref:section:<number>}}` to a section link. Both fail the build when unresolvable, and their output is span-tracked so the digits they emit are exempt from the fidelity gate.

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

**What "no network calls" forbids, precisely.** No external host, no API, no CDN, no analytics, no font — enforced by `validateNoExternalResources`, which fails the build on any absolute or protocol-relative resource URL. A page may `fetch` a **build artifact from its own origin** when loading it eagerly would be wasteful: the text-block editor pulls `demo/ard/<slug>.json` (published by the same build, from the same committed ARD) the first time a block that binds it is opened, rather than inlining 832 KB of ARD into every visit of the Demo page. The site still serves from any static host with nothing behind it, which is the property the rule protects.

---

## 10. Conventions the v0 build established

Learned during implementation; normative from here.

- **Evidence routing is data, not code.** `site/config.json` carries `testPrefixes` (test filename → component), `prefixes` (requirement-ID prefix → module), and `suites` (whole suite → component). Registering a new display is a registry edit; no script changes. R test files are organized by engine topic rather than by display, so display attribution comes from the requirement-ID prefix (`DSP-<AREA>-*`).
- **Requirement IDs cannot contain digits in the middle segment.** The regex `^[A-Z]{2,4}-[A-Z]+-\d+[A-D]?$` rejects `RPT-E3-001`; use `RPT-MODEL-001`. (Text-block *file* IDs like `TXT-E3-1202` are identities, not requirement IDs — the requirements a block satisfies live in its `requirements:` frontmatter.)
- **Draft is a lifecycle state, not a failure.** A `generated`-tier block awaiting approval reports as pending review — a warning chip on the evidence page, not a failed test, and not a non-zero exit code.
- **The evidence record extends §8** with `issueRefs` on every record, and `reviewedBy`/`reviewedAt` on human-review records; evidence sets carry a `run` key (GitHub Actions run id/url, `null` locally).
- **The Reader renders from library source**, resolving bindings against the committed ARDs, rather than from pre-flattened assembler prose — so display formatting stays a rendering-time concern.
- **Ordering is load-bearing:** the R pipeline must run before `assemble.mjs`, which must run before `site.mjs`. CI re-assembles on every run rather than trusting committed output.
- **`git_commit` is `null` when the tree is dirty**, by design — an artifact that cannot name its commit says so instead of guessing.
