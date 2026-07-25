# The CDISC Analysis Results Standard (ARS) and the ARD Ecosystem

Research section for **open.csr**. All R output below was executed locally against the
installed package versions listed in §0; all external claims carry inline source URLs.

---

## 0. Verified local environment (2026-07-25)

| Package | Version | Role in an ARD-centric CSR pipeline |
|---|---|---|
| `cards` | **0.6.1** | ARD construction + the ARD data model itself |
| `cardx` | **0.2.5** | ARD constructors for models/tests (extra dependencies) |
| `gtsummary` | **2.3.0** | ARD → summary table (`tbl_ard_*`), ARD extraction (`gather_ard`) |
| `tfrmt` | **0.1.3** | Display metadata → submission-grade `gt` table |
| `gt` | **1.0.0** | Rendering backend (HTML/RTF/LaTeX/Word) |
| `pharmaverseadam` | **1.1.0** | 23 ADaM datasets (`adsl`, `adae`, `adlb`, `adeg`, `advs`, `adtte_onco`, …) |
| `admiral` | **1.3.0** | ADaM derivation (upstream of the ARD) |
| *(not installed)* | `siera` 0.5.6 | ARS metadata (JSON/xlsx) → runnable `cards`/`cardx` R scripts |

`cards` exports 83 functions; `cardx` exports 68. Full lists were enumerated locally and
are summarized in §3–§4.

---

## 1. CDISC ARS v1.0 — the metadata model

### 1.1 What it is

ARS is a **logical model to support both the prospective specification of analyses and the
fully contextualized representation of the results of the analyses**
(<https://cdisc-org.github.io/analysis-results-standard/>). CDISC's four stated objectives
are: use metadata to drive automation; enable storage/access/processing/reproduction of
results; improve navigation and reuse; and provide traceability to the Protocol, SAP, and
input ADaM data (<https://www.cdisc.org/standards/foundational/analysis-results-standard>).

**Version status (a date to double-check before citing):** the GitHub releases page lists
*ARS Phase 1, Public Review* `v0.14.0-pr` on **16 Apr 2025** and **ARS v1.0** on
**19 Apr 2025**, with earlier sprints `v0.1.0` (Nov 2023), `v0.2.0` (Jan 2024), `v0.10.0`
(Apr 2024) — <https://github.com/cdisc-org/analysis-results-standard/releases>. The CDISC
standards page for v1.0 states **19 April 2024**
(<https://www.cdisc.org/standards/foundational/analysis-results-standard/analysis-results-standard-v1-0>).
The release/public-review sequence on GitHub is self-consistent for 2025; treat the CDISC
page date as suspect and verify before it appears in a submission-facing document.

Deliverables of v1.0: the **logical data model**, the **Analysis Results Standard User
Guide v1.0** (worked through *common safety displays*), and **Reporting Events and
supporting files** (examples). Some downloads sit behind a free CDISC account / Wiki
registration. The GitHub repo is MIT + CC-BY-4.0 licensed.

### 1.2 The class hierarchy

Repository layout: `model/` (LinkML schema), `docs/`, `documents/`, `HowTos/`, `utilities/`
(validation/serialization helpers), `workfiles/`
(<https://github.com/cdisc-org/analysis-results-standard>). The schema is authored in
**LinkML**, which generates JSON Schema and YAML artifacts; instances are exchanged as
**JSON** (canonical) or **Excel workbooks** (human-authoring convenience).

**`ReportingEvent`** is the top-level container
(<https://cdisc-org.github.io/analysis-results-standard/ReportingEvent/>):

| Attribute | Card. | Meaning |
|---|---|---|
| `id`, `name`, `version`, `description`, `label` | 1..1 / 0..1 | identity |
| `mainListOfContents` | 1..1 | the ordered TOC of analyses and outputs |
| `otherListsOfContents` | 0..* | alternate TOCs (e.g. by section, by ICH E3 appendix) |
| `referenceDocuments` | 0..* | external docs — **SAP, protocol, CSR** |
| `analysisSets` | 0..* | subject populations (e.g. `SAFFL = "Y"`) |
| `dataSubsets` | 0..* | record-level filters (e.g. treatment-emergent AEs) |
| `analysisGroupings` | 0..* | grouping factors (treatment, visit, SOC) |
| `methods` | 0..* | reusable `AnalysisMethod` definitions |
| `analyses` | 0..* | the analyses themselves |
| `outputs` | 0..* | the displays/deliverables |
| `globalDisplaySections` | 0..* | headers/footers applying to any display |
| `analysisOutputCategorizations` | 0..* | sponsor-defined categorizations |
| `terminologyExtensions` | 0..* | sponsor extensions to extensible CT |

### 1.3 WHAT to compute

`Analysis` (<https://cdisc-org.github.io/analysis-results-standard/Analysis/>) binds
population + data + grouping + method:

`id` (1..1), `name` (1..1), `version`, `reason` (1..1, `ExtensibleTerminologyTerm`),
`purpose` (1..1), `dataset`, `variable`, `analysisSetId`, `dataSubsetId`,
`orderedGroupings` (0..*, `OrderedGroupingFactor`), **`methodId` (1..1)**,
`referencedAnalysisOperations`, `categoryIds`, `documentRefs`,
**`programmingCode`** (`AnalysisOutputProgrammingCode`), **`results` (0..*, `OperationResult`)**.

`AnalysisMethod` (<https://cdisc-org.github.io/analysis-results-standard/AnalysisMethod/>)
= `id`, `name`, `description`, `label`, **`operations` (1..*, `Operation`)**,
`documentRefs`, **`codeTemplate` (`AnalysisProgrammingCodeTemplate`)**. An `Operation` is
"a statistical operation that produces a **single** analysis result value" — i.e. one
`Operation` ↔ one number (n, %, mean, SD, p-value, CI bound).

Selection logic is expressed with `WhereClauseCondition` / `CompoundExpression` on
`AnalysisSet` and `DataSubset` — machine-evaluable filters, not prose.

`OperationResult` (<https://cdisc-org.github.io/analysis-results-standard/OperationResult/>)
carries the computed value: `operationId` (1..1), `resultGroups` (0..*, the group values the
result belongs to), **`rawValue`** (unmodified, unrounded), **`formattedValue`** (formatted
per the operation's `resultPattern`). This raw/formatted pairing is the single most
important design idea to carry into open.csr.

### 1.4 HOW to display

`Output` = `id`, `version`, `fileSpecifications`, `displays` (ordered), `categoryIds`,
`documentRefs`, **`programmingCode`**
(<https://cdisc-org.github.io/analysis-results-standard/Output/>). `fileSpecifications`
plus `programmingCode` is the ARS traceability hook from a rendered RTF/PDF back to the
program that made it.

`OutputDisplay` (<https://cdisc-org.github.io/analysis-results-standard/OutputDisplay/>) =
"a tabular representation of the results of one or more analyses": `id`, `name`, `version`,
`displayTitle`, `displaySections` (0..*). Each `DisplaySection` has a
`DisplaySectionTypeEnum` type with **seven permissible values**
(<https://cdisc-org.github.io/analysis-results-standard/DisplaySectionTypeEnum/>):

1. **Header** — text above the title (study identifier, page numbering)
2. **Title** — "Table 14.1.1" style caption
3. **Rowlabel Header** — column header for the stub column
4. **Legend** — explanatory statements immediately after the table body
5. **Abbreviation** — abbreviation/acronym definitions
6. **Footnote** — symbol/superscript-anchored notes
7. **Footer** — below footnotes; explicitly for **"traceability of the source program"** and page numbering

That enum is effectively a ready-made schema for CSR display furniture — open.csr should
adopt it verbatim rather than invent section names.

### 1.5 Where ARS is thin

- ARS models the display **furniture and structure**, not the pixel-level formatting
  (decimal alignment, column widths, indentation depth, pagination rules). `tfrmt`'s plan
  objects fill exactly that gap.
- The `codeTemplate` mechanism is language-agnostic string templating with parameters — it
  has no notion of a package API contract. Two sponsors' templates for "mean (SD)" will not
  be interchangeable unless they agree on the target library.
- Controlled terminology is "extensible" (`ExtensibleTerminologyTerm` +
  `terminologyExtensions`), so `reason`/`purpose` values are only weakly standardized.

---

## 2. ARD vs ARS — the relationship, stated precisely

**ARS is the specification standard; ARD is the results-data shape.** CDISC's ARS
initiative names two planned outcomes: the *Analysis Results Metadata Technical
Specification* (ARM-TS) and the *Analysis Results Dataset* (ARD). In ARS v1.0, "the ARD"
is not a separately published foundational standard with its own IG — the results live
inside `Analysis.results[]` as `OperationResult` objects. Searching CDISC's roadmap and
standards-in-development pages surfaced no separate ARD standard release
(<https://www.cdisc.org/standards/in-development>, <https://cdisc.org/standards/roadmap>).

Meanwhile the pharmaverse `{cards}` package implements a **de facto tabular ARD**: "an
emerging standard for encoding statistical analysis summaries in a machine-readable
format," with the goals of automation, reproducibility, reusability, and traceability
(<https://www.danieldsjoberg.com/ARD-onboarding/>). It is a Roche/GSK/Novartis
collaboration (<https://r-consortium.org/posts/supercharging-statistical-analysis-with-ards-and-the-cards-r-package/>).

**Practical consequence:** ARS gives you the *specification* vocabulary and the
*traceability* attributes; `{cards}` gives you the *executable* results container. They are
complementary, and `siera` (§7) is the documented bridge.

---

## 3. The `{cards}` ARD data model

### 3.1 Columns (verified locally)

```r
ard_continuous(ADSL, by = ARM, variables = AGE)
#>  group1 group1_level variable    context stat_name stat_label     stat fmt_fun warning error
#>     ARM      Placebo      AGE continuous         N          N  86         0    NULL  NULL
#>     ARM      Placebo      AGE continuous      mean       Mean  75.2093    1    NULL  NULL
#>     ARM      Placebo      AGE continuous        sd         SD   8.590167  1    NULL  NULL
```

Class is `c("card", "tbl_df", "tbl", "data.frame")` — an ARD *is* a tibble, which means
every dplyr/tidyr verb, `write_parquet()`, and `haven::write_xpt()` work on it unchanged.

| Column | Meaning | ARS analogue |
|---|---|---|
| `group1` … `groupN` | name of the k-th grouping **variable** | `GroupingFactor.groupingVariable` |
| `group1_level` … | value of that grouping variable (list-col) | `ResultGroup.groupValue` |
| `variable` | the analysis variable | `Analysis.variable` |
| `variable_level` | level of a categorical analysis variable (list-col) | `ResultGroup` |
| `context` | which `ard_*()` produced the row (`continuous`, `categorical`, `attributes`, `total_n`, `stats_t_test`, …) | ~ `AnalysisMethod.id` |
| `stat_name` | machine name of the statistic (`N`, `mean`, `sd`, `p25`, `n`, `p`, `estimate`, `p.value`) | `Operation.id` |
| `stat_label` | human label (`Mean`, `SD`, `Q1`, `%`) | `Operation.name` / `label` |
| `stat` | **the raw, unrounded value** (list-col; any type) | `OperationResult.rawValue` |
| `fmt_fun` | formatting function or integer digit count | `Operation.resultPattern` |
| `warning` | captured warnings (list-col) | *no ARS analogue* |
| `error` | captured errors (list-col) | *no ARS analogue* |

Default `stat_label` mappings live in `cards::default_stat_labels()`
(`mean`→"Mean", `sd`→"SD", `p25`→"Q1", `p75`→"Q3", `p`→"%", `n_cum`→"Cumulative n", …).

### 3.2 Error capture — a QC feature, not an accident

```r
ard_continuous(ADSL, variables = AGE, statistic = ~list(bad = \(x) stop("boom!")))
#>  variable stat_name stat error
#>       AGE       bad NULL boom!
```

Computation **never aborts**; failures are recorded as data. `eval_capture_conditions()`,
`print_ard_conditions()`, and `captured_condition_as_error()` make the failure surface
programmatically. For open.csr this means a CSR build can produce a complete ARD *and* a
machine-readable defect list in one pass — the raw material for an automated test-evidence
page.

### 3.3 The API surface

- **Constructors:** `ard_continuous()`, `ard_categorical()`, `ard_dichotomous()`,
  `ard_hierarchical()`, `ard_hierarchical_count()`, `ard_complex()`, `ard_missing()`,
  `ard_attributes()`, `ard_total_n()`, `ard_identity()`, `ard_pairwise()`, `ard_strata()`.
  Shared signature (verified): `ard_continuous.data.frame(data, variables, by, strata,
  statistic, fmt_fun, stat_label, ...)`; `ard_categorical()` adds `denominator`;
  `ard_hierarchical()` adds `id` (subject-level de-duplication for AE tables).
- **Stacking:** `ard_stack(data, ..., .by, .overall, .missing, .attributes, .total_n,
  .shuffle)`, `ard_stack_hierarchical()`. Verified: one `ard_stack()` over ADSL produced a
  67-row ARD spanning AGE (continuous), AGEGR1 + SEX (categorical), variable attributes, and
  a study-level `..ard_total_n..` row. `ard_stack_hierarchical(ADAE, variables = c(AESOC,
  AETERM), by = TRTA, denominator = ADSL, id = USUBJID)` produced a **2,394-row** ARD — an
  entire AE-by-SOC-by-PT table as data.
- **Reshaping/combining:** `bind_ard()`, `shuffle_ard()`, `tidy_ard_column_order()`,
  `tidy_ard_row_order()`, `rename_ard_columns()`, `rename_ard_groups_shift/reverse()`,
  `unlist_ard_columns()`, `filter_ard_hierarchical()`, `sort_ard_hierarchical()`,
  `add_calculated_row()`, `replace_null_statistic()`.
- **Access/mutation:** `get_ard_statistics()`, `update_ard_fmt_fun()`,
  `update_ard_stat_label()`, `apply_fmt_fun()`.
- **Validation:** `check_ard_structure(x, column_order, method)`.
- **Mocking:** `mock_continuous/categorical/dichotomous/missing/attributes/total_n()` — a
  *shell ARD* with the right skeleton and no values: the ARD-native path to CSR mock shells.

### 3.4 Serialization — the notable gap

`as_nested_list()` (flagged **`[Experimental]`** in the Rd) converts an ARD to a nested list
keyed `variable → group → group level → stat_name → {stat, stat_fmt, warning, error,
context}`. Verified round trip through `jsonlite::toJSON()`:

```json
{"variable":{"AGE":{"group1":{"ARM":{"group1_level":{"Placebo":{"stat_name":{
  "N":   {"stat":86,      "stat_fmt":"86",   "warning":{},"error":{},"context":"continuous"},
  "mean":{"stat":75.2093, "stat_fmt":"75.2", "warning":{},"error":{},"context":"continuous"}
}}}}}}}}
```

**There is no `ard_to_json()`/`ard_to_yaml()` in `cards` 0.6.1** — a grep of the entire Rd
database for "JSON"/"YAML" returned zero topics. Talks describe JSON/YAML support
aspirationally; the shipped reality is `as_nested_list()` + `jsonlite`/`yaml`, and the
nested shape is lossy for multi-group ARDs and drops `fmt_fun` closures. open.csr will need
to own its serializer and pin a schema.

---

## 4. `{cardx}` — ARDs for models and tests

`cardx` 0.2.5 supplies the statistical-inference half (68 exports), all returning the same
`card` structure. Tests: `ard_stats_t_test()`, `ard_stats_paired_t_test()`,
`ard_stats_wilcox_test()`, `ard_stats_chisq_test()`, `ard_stats_fisher_test()`,
`ard_stats_kruskal_test()`, `ard_stats_mcnemar_test()`, `ard_stats_mantelhaen_test()`,
`ard_stats_prop_test()`, `ard_stats_poisson_test()`, `ard_stats_mood_test()`,
`ard_stats_oneway_test()`. Models: `ard_regression()`, `ard_regression_basic()`,
`ard_stats_anova()`, `ard_stats_aov()`, `ard_car_anova()`, `ard_car_vif()`,
`ard_aod_wald_test()`, `ard_emmeans_mean_difference()`. Survival: `ard_survival_survfit()`,
`ard_survival_survfit_diff()`, `ard_survival_survdiff()`. Intervals/effect sizes:
`ard_continuous_ci()`, `ard_categorical_ci()`, `ard_incidence_rate()`,
`ard_effectsize_cohens_d()`, `ard_effectsize_hedges_g()`, `ard_smd_smd()`, plus six named
binomial-CI methods (`proportion_ci_wilson()`, `..._clopper_pearson()`,
`..._agresti_coull()`, `..._jeffreys()`, `..._strat_wilson()`, `..._wald()`).
Survey-weighted: `ard_survey_svyttest/svychisq/svyranktest()`.

The split exists because `cards` deliberately keeps a near-zero dependency footprint;
`cardx` absorbs `survival`, `car`, `emmeans`, `broom`, `survey`, etc.

---

## 5. `{gtsummary}` — ARD in, table out, ARD back out

gtsummary 2.x was **refactored to use `{cards}` as its computational backend**
(<https://www.danieldsjoberg.com/ARD-onboarding/>). Two directions matter:

**ARD → table.** `tbl_ard_summary(cards, by, statistic, type, label, missing, missing_text,
missing_stat, include, overall)`, plus `tbl_ard_continuous()`, `tbl_ard_wide_summary()`,
`tbl_ard_hierarchical(cards, variables, by, include, statistic, label)`. Verified: an
`ard_stack()` over ADSL rendered directly to a 3-arm demographics table (Age median (Q1,
Q3); AGEGR1 and SEX as n (%)) **with no access to the subject-level data**. That property —
*the table builder never touches patient data* — is a significant architectural asset for a
public demo app.

**Table → ARD.** `gather_ard(x)` extracts the ARD backing any gtsummary table. Verified: the
returned ARD carries an extra **`gts_column`** column (`stat_1`, `stat_2`, …) mapping each
ARD row to the rendered table cell. That is a *cell-level* provenance link — click a number
in the output, recover the exact `stat_name`/`variable`/`group` that produced it.

`tidy_standardize()` and the `as_gt()`/`as_flex_table()`/`as_rtf()` family handle the
render step.

---

## 6. `{tfrmt}` — display metadata → submission-grade output

`tfrmt` 0.1.3 (GSK) "applies display metadata to Analysis Results Datasets"
(<https://gsk-biostatistics.github.io/tfrmt/>). The core object:

```r
tfrmt(tfrmt_obj, group, label, param, value, column, title, subtitle,
      row_grp_plan, body_plan, col_style_plan, col_plan, sorting_cols,
      big_n, footnote_plan, page_plan, ...)
```

**Plan objects:** `body_plan()` + `frmt_structure()` + `frmt()` / `frmt_combine()` /
`frmt_when()` (cell formatting and combination, e.g. `"{n} ({pct}%)"`); `row_grp_plan()` +
`row_grp_structure()` + `element_block()` + `element_row_grp_loc()` (row-group blocking and
label placement); `col_plan()` + `span_structure()` (select/rename/nest columns, spanning
headers); `col_style_plan()` + `col_style_structure()` (alignment, including **decimal-point
alignment**, and widths); `footnote_plan()` + `footnote_structure()`; `page_plan()` +
`page_structure()` (pagination); `big_n_structure()` (big-N in column headers);
`tfrmt_n_pct()` and `tfrmt_sigdig()` (reusable presets); `layer_tfrmt()` (inherit and
override a template).

**Serialization:** `tfrmt_to_json()` / `json_to_tfrmt()` / `as_json()` — display metadata is
itself a portable JSON artifact. That is exactly the ARS `OutputDisplay` role, in a format
that already round-trips.

**Mocks:** `make_mock_data()` + `print_mock_gt()` produce table shells before data exist.

**Outputs:** `print_to_gt()` (→ `gt` → HTML/RTF/Word/LaTeX), `print_to_ggplot()`,
`cleaned_data_to_gt()`.

### 6.1 `tfrmt`'s ARD dialect is *not* `cards`' ARD

Verified from `tfrmt::data_demog`:

```
rowlbl1  rowlbl2  param  grp   ord1  ord2  column                value
Age (y)  n        n      cont  1     1     Placebo               86.0
Age (y)  n        p      cont  1     1     p-value               0.593
Age (y)  Mean     Mean   cont  1     2     Xanomeline Low Dose   75.667
```

Roles: optional **group** columns, one **label** column, one or more **column** columns
(these become table columns, including `p-value`), a **param** column, a numeric **value**
column, optional **sorting** columns (`ord1`, `ord2`). Same "one row per computed value"
philosophy, entirely different column names, and — critically — **`value` must be numeric**,
so `tfrmt` cannot hold the mixed-type list-column `stat` that `cards` uses.

**The bridge is `cards::shuffle_ard()`** (also available as `ard_stack(.shuffle = TRUE)`).
Verified: it pivots `group1`/`group1_level` into a real `ARM` column:

```
ARM                   variable  context     stat_name  stat_label  stat
Placebo               AGE       continuous  N          N           86.0
Xanomeline High Dose  AGE       continuous  mean       Mean        74.38
```

From there a `dplyr::rename()`/`select()` maps `stat_name`→`param`, `stat`→`value`,
`variable`→label, and the treatment column→`column`. `shuffle_ard(x, trim)` is documented as
"helpful for streamlining across multiple ARDs"
(<https://gsk-biostatistics.github.io/tfrmt/articles/ard.html>). **This mapping is
hand-rolled glue in every project that does it** — a natural, high-value piece for open.csr
to own and test.

---

## 7. `{siera}` — the ARS → `cards` code generator

`siera` 0.5.6 (Clymb Clinical; CRAN + <https://clymbclinical.github.io/siera/>) is the
missing link between ARS metadata and the pharmaverse.

- **One function:** `readARS(<ARS file .json|.xlsx>, <output dir>, <ADaM folder>)`.
- Emits **one runnable R script per Output** defined in the ARS `ReportingEvent`; each
  script reads ADaM (`readr::read_csv()` for `.csv`, `haven::read_xpt()` for `.xpt`) and
  produces an ARD via `cards`/`cardx`.
- `ars_xlsx_to_json()` converts the human-authored Excel workbook to canonical ARS JSON.
- Mapping is **template-based, not a lookup table**: ARS `AnalysisMethodCodeTemplate` holds
  parameterized R referencing `cards`/`cardx`; `AnalysisMethodCodeParameters` supplies the
  variable/dataset names; `readARS()` substitutes at generation time. Code templates may be
  attached at the **Output**, **Analysis**, or **AnalysisMethod** level
  (<https://cran.rediris.es/web/packages/siera/vignettes/using-cards.Rmd>):

```r
# template
Analysis_ARD <- ard_continuous(data = filtered_ADSL,
                               by = c(byvariables_here),
                               variables = analysisvariable_here)
# populated
Analysis_ARD <- ard_continuous(data = filtered_ADSL,
                               by = c(TRT01A),
                               variables = AGE)
```

- A reference construct table ships as `ARS_example("cards_constructs.xlsx")`.
- Vignettes: *Getting Started*, *Concepts and Conventions*, *Making use of cards and cardx*,
  *ARD Program Structure*, *Applying ARD Results*.

The canonical pharmaverse chain is therefore:
**`admiral` → ADaM → `siera` (from ARS metadata) → `cards`/`cardx` → ARD → `gtsummary` /
`tfrmt` → `gt` → TFL** (<https://pharmaverse.org/e2eclinical/tlg/>).

Other implementation routes exist — Excel workbooks, `ars-py` (Python), CDISC's SAS **ARD
Generator** (<https://www.cdisc.org/sites/default/files/2024-04/Wallendszus_ARD-Generator_CDISC-Europe-Interchange-2024.pdf>),
and `TFLDesigner` — compared in PHUSE US 2025 paper DS09, *Selecting GeARS*
(<https://www.lexjansen.com/phuse-us/2025/ds/PAP_DS09.pdf>), which recommends a phased
adoption: start with simple metadata, validate against legacy TFLs, then widen scope.

---

## 8. Traceability and QC

### 8.1 The traceability chain

```
Protocol/SAP ──(ARS referenceDocuments)──► ReportingEvent
   ► AnalysisSet (SAFFL="Y")  ► DataSubset (TEAE)  ► GroupingFactor (TRT01A)
   ► AnalysisMethod ► Operation(id="mean")
        │
ADaM ───┴──(cards call, generated by siera)──► ARD row
        (variable=AGE, group1=ARM, stat_name=mean, stat=75.2093, fmt_fun=1)
   ► gtsummary gather_ard() ⇒ gts_column="stat_1"  ────────► rendered cell
   ► tfrmt frmt()/frmt_combine()                    ────────► formatted cell
   ► Output.fileSpecifications + Output.programmingCode ───► the RTF/PDF in the CSR
   ► DisplaySection type="Footer" ─────────────────────────► "source program" footer
```

Every hop is addressable by an ID. The chain is bidirectional at the two places that matter
most: `gather_ard()` recovers the ARD row for a rendered cell, and `OperationResult` pairs
`rawValue` with `formattedValue` so a displayed "75.2" is provably the rounding of
75.2093023.

### 8.2 ARD-based QC vs double programming

The classical control is **double programming**: two programmers independently implement the
same spec, then `PROC COMPARE` the datasets and manually/programmatically diff the outputs
(<https://support.sas.com/resources/papers/proceedings17/0867-2017.pdf>). It is expensive
and its comparison surface — a rendered table — is the *worst* place to diff.

ARDs move the comparison surface:

1. **Diff numbers, not documents.** Two ARDs are long data frames with identical schemas
   (`variable`, `group*`, `stat_name`, `stat`). A QC ARD vs a production ARD is an exact
   anti-join on `(variable, variable_level, group*, stat_name)` plus a tolerance comparison
   on `stat` — deterministic, complete, and reportable as a machine-readable pass/fail set.
   The industry framing is explicit: ARD standardization means "analysis results datasets
   will have consistent structures and column names… long, with 1 record per computed
   value."
2. **Formatting bugs stop masking numeric bugs.** Because `stat` is raw and `fmt_fun` is
   separate, a rounding-rule change is a display diff, not a results diff.
3. **The spec becomes testable.** With ARS metadata as the spec, a QC program can be
   generated from the *same* metadata by a different implementation (e.g. `siera`+`cards` vs
   a SAS ARD Generator) — independence at the implementation layer while sharing one
   unambiguous spec.
4. **Failures are data.** `cards`' `warning`/`error` columns plus `check_ard_structure()`
   turn "the program errored" into a queryable row.
5. **Regression testing is free.** Snapshot the ARD; any code change that moves a number
   fails loudly, and the failing rows name themselves.

What ARD-based QC does **not** replace: correctness of the *specification* (wrong population
computed perfectly is still wrong), derivation logic upstream in ADaM, and the visual/ICH E3
compliance of the final display.

---

## 9. Where ARS and `{cards}` diverge

| Concern | CDISC ARS v1.0 | `{cards}` 0.6.1 | Consequence |
|---|---|---|---|
| Primary artifact | Spec (metadata) that *may* carry results | Results table | ARS = plan; cards = output |
| Physical shape | Nested JSON object graph (LinkML) | Flat tibble, one row per stat | No lossless 1:1 |
| Result identity | `Operation.id` + `resultGroups[]` | `stat_name` + `group1..N`/`variable_level` | Mappable, needs a convention |
| Raw vs formatted | `rawValue` + `formattedValue` both stored | `stat` raw; `fmt_fun` stored as a **closure**, formatted value computed on demand | ARD is not self-contained once serialized |
| Grouping | `GroupingFactor` objects, ordered, with where-clauses | `group1`/`group1_level` columns, positional | ARD loses grouping *semantics* (which factor is treatment?) |
| Population/subset | First-class `AnalysisSet`/`DataSubset` with machine-evaluable conditions | Implicit — whatever `data` you passed in | **Biggest gap**; the ARD does not record its own filter |
| Display metadata | `OutputDisplay` + 7 `DisplaySection` types | none (out of scope) | `tfrmt` fills it; ARS names it |
| Provenance to code | `programmingCode`, `codeTemplate`, `fileSpecifications`, `documentRefs` | none | Must be added by the surrounding pipeline |
| Errors/warnings | not modeled | `warning`/`error` list-columns | cards is better here |
| Serialization | JSON/YAML/Excel, schema-validated | `as_nested_list()` **experimental**, lossy | Needs owning |
| Governance | CDISC standard, versioned releases | CRAN package, semantic versioning, fast-moving | Different change cadence |

### Recommendation for open.csr

**Standardize on `{cards}` as the runtime results container; standardize on ARS as the
specification vocabulary and the persistence/exchange schema.** Concretely:

- ARS `ReportingEvent` JSON is the **source of truth** checked into git. It is what a
  medical writer's change request ultimately edits.
- `cards` ARDs are the **computed artifact** — regenerated, never hand-edited, snapshot for
  QC.
- Do **not** try to make `cards` emit ARS-conformant JSON as its native output, and do not
  try to make ARS the in-memory model. Write one adapter in each direction and test it.
- Where ARS lacks display fidelity, extend with `tfrmt` JSON (`tfrmt_to_json()`) attached to
  the `OutputDisplay` via a sponsor `terminologyExtension` or a side-car keyed by
  `OutputDisplay.id`.

---

## 10. Best practices for an ARD-centric TFL pipeline

1. **One analysis = one ARD; one Output = one ARD bundle.** Mirror ARS: an `Analysis`
   produces a set of `OperationResult`s; a `cards` ARD produced by one `ard_stack()` call is
   the natural unit. Persist per-Output, `bind_ard()` at assembly time.
2. **Never let a display function touch subject-level data.** `tbl_ard_summary()` and
   `tfrmt` both prove this is achievable. It enforces the separation and makes the demo app
   shippable without patient data.
3. **Keep `stat` raw; format last.** Store `fmt_fun`/`resultPattern` as metadata and apply at
   render (`apply_fmt_fun()`, `frmt()`). Never round into the ARD.
4. **Record the population and filter in the ARD itself.** `cards` won't do this — add
   `analysis_set_id` / `data_subset_id` / `analysis_id` columns (or an ARD-level attribute)
   so an orphaned ARD is still interpretable. This closes the single biggest ARS↔cards gap.
5. **Stable IDs everywhere.** `analysis_id`, `output_id`, `display_id`, `operation_id` —
   these are what the text library, the requirements matrix, and the evidence pages key on.
6. **Generate code from metadata; commit the generated code.** The `siera` model
   (metadata → R script → ARD) is right, and committing the generated script keeps a
   human-reviewable, diffable artifact between the spec and the numbers. A writer's
   "change request → code edit → live regeneration" loop becomes: edit ARS metadata →
   regenerate script → rerun → new ARD → new display, with git diffs at every stage.
7. **Snapshot ARDs as test evidence.** ARD equality is the regression test. Store as
   Parquet/CSV + a JSON manifest with input dataset hashes and package versions.
8. **Machine-readable failures.** Propagate `warning`/`error` columns and
   `check_ard_structure()` results into the evidence pages rather than into the console.
9. **Mock-first.** `cards::mock_*()` + `tfrmt::make_mock_data()`/`print_mock_gt()` let the
   display and the ICH E3 text be reviewed before any data exist — the same shell then fills
   in. This directly supports the Report Template Library.
10. **Adopt ARS's `DisplaySectionTypeEnum` as the display-furniture schema** (Header, Title,
    Rowlabel Header, Legend, Abbreviation, Footnote, Footer). It maps cleanly onto both
    `tfrmt` (title/subtitle/footnote_plan/col_plan) and ICH E3 display conventions, and the
    `Footer` type is explicitly for source-program traceability.
11. **Version-pin and record.** ARDs are only reproducible alongside `cards`/`cardx`
    versions; capture them in the ARD manifest (`renv.lock` hash is sufficient).

---

## 11. Open risks and unknowns for open.csr

- **ARS v1.0 date discrepancy** (2024 vs 2025) — resolve before it appears in a submission-facing doc.
- **`as_nested_list()` is Experimental**; no ARD JSON/YAML writer exists in `cards` 0.6.1. open.csr must define and own an ARD serialization schema.
- **`fmt_fun` closures do not serialize.** Persisted ARDs need declarative formatting (digit counts, `resultPattern` strings), not R functions.
- **`tfrmt` is at 0.1.3** — pre-1.0 API, with an ARD dialect that differs from `cards`'; the `shuffle_ard()` → tfrmt mapping is unstandardized glue.
- **`siera` is a small third-party CRAN package** (Clymb Clinical, single entry point); decide whether to depend on it or reimplement its template substitution.
- **CDISC's ARS examples/User Guide sit behind registration**, constraining what a public demo can bundle. The GitHub `workfiles/` examples (MIT/CC-BY-4.0) are the safe source.
- **`pharmaverseadam` 1.1.0** ships 23 ADaM datasets (`adsl`, `adae`, `adlb`, `adeg`, `advs`, `adtte_onco`, `adrs_onco`, vaccine/ophtha/peds variants) — enough for the ICH E3 §14 core safety and efficacy displays without generating data.

---

## Sources

**Standard** — model docs <https://cdisc-org.github.io/analysis-results-standard/> (per-class: [ReportingEvent](https://cdisc-org.github.io/analysis-results-standard/ReportingEvent/), [Analysis](https://cdisc-org.github.io/analysis-results-standard/Analysis/), [AnalysisMethod](https://cdisc-org.github.io/analysis-results-standard/AnalysisMethod/), [OperationResult](https://cdisc-org.github.io/analysis-results-standard/OperationResult/), [Output](https://cdisc-org.github.io/analysis-results-standard/Output/), [OutputDisplay](https://cdisc-org.github.io/analysis-results-standard/OutputDisplay/), [DisplaySectionTypeEnum](https://cdisc-org.github.io/analysis-results-standard/DisplaySectionTypeEnum/)) · repo <https://github.com/cdisc-org/analysis-results-standard> · releases <https://github.com/cdisc-org/analysis-results-standard/releases> · CDISC pages <https://www.cdisc.org/standards/foundational/analysis-results-standard> and <https://www.cdisc.org/standards/foundational/analysis-results-standard/analysis-results-standard-v1-0>

**Papers** — PHUSE US 2024 DS04 *Getting Started with the New CDISC ARS* <https://www.lexjansen.com/phuse-us/2024/ds/PAP_DS04.pdf> · PHUSE US 2025 DS09 *Selecting GeARS* <https://www.lexjansen.com/phuse-us/2025/ds/PAP_DS09.pdf> · PharmaSUG 2023 MM-327 <https://pharmasug.org/proceedings/2023/MM/PharmaSUG-2023-MM-327.pdf> · CDISC EU 2024 *ARD Generator (SAS)* <https://www.cdisc.org/sites/default/files/2024-04/Wallendszus_ARD-Generator_CDISC-Europe-Interchange-2024.pdf> · SAS GF 867-2017 *Quality Control Programming: A Lost Art?* <https://support.sas.com/resources/papers/proceedings17/0867-2017.pdf> · *Rethinking clinical study data* <https://pmc.ncbi.nlm.nih.gov/articles/PMC9649650/>

**Packages/talks** — `cards` <https://cran.r-project.org/web/packages/cards/cards.pdf> · `tfrmt` <https://gsk-biostatistics.github.io/tfrmt/> and <https://gsk-biostatistics.github.io/tfrmt/articles/ard.html> · `siera` <https://clymbclinical.github.io/siera/>, <https://cran.r-project.org/package=siera>, <https://github.com/clymbclinical/siera>, <https://cran.rediris.es/web/packages/siera/vignettes/using-cards.Rmd> · pharmaverse TLG <https://pharmaverse.org/e2eclinical/tlg/> · Sjoberg <https://www.danieldsjoberg.com/ARD-onboarding/>, <https://www.danieldsjoberg.com/ARD-PHUSE-workshop-2025/>, <https://www.danieldsjoberg.com/ARD-RinPharma-talk-2024/> · R Consortium <https://r-consortium.org/posts/supercharging-statistical-analysis-with-ards-and-the-cards-r-package/>
