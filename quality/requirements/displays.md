# Requirement matrix — displays (`library/tfl/`)

Requirements for the individual tables and listings in the v0 TFL library. Each
requirement is a statement about *the numbers a display reports*, verified by
recomputing them directly from the source datasets with `dplyr` and comparing
against the rendered cells — value-level regression rather than pixel comparison
(design decision D4). Since v0.4.0 every display reads the CDISC pilot's own
ADaM packaging (D0032 R2), and the second measurement is recomputed from the
vendored `.xpt.gz` read straight with `{haven}`, never through `prepare_data()`.

Requirements for the individual tables, listings and figures in the v0 TFL
library. Each requirement is a statement about *the numbers a display reports*,
verified against a second measurement of the same quantity and compared with the
rendered cells — value-level regression rather than pixel comparison (design
decision D4).

Where the second measurement comes from depends on what the display claims. The
six safety displays are recomputed directly from the vendored source datasets
with base R; the five efficacy and time-to-event displays are checked
against the analysis the study's own report published, because a display that
carries a model cannot be qualified by two implementations of the same
misunderstanding. That distinction is set out under
[Efficacy: CIBIC+](#efficacy-cibic-eff02-eff03-eff04-eff05) below.

Engine-level requirements (how ARDs are built, serialised and rendered at all)
live in [`tfl-engine.md`](tfl-engine.md).

| Display | Slug | Regulatory ID | Dataset |
|---|---|---|---|
| Demographic and Baseline Characteristics | `t-demographics` | DMT01 | ADSL (+ ADVS baseline) |
| Subject Disposition | `t-disposition` | DST01 | ADSL |
| Summary of Populations | `t-populations` | DST02 | ADSL (CDISC pilot packaging) |
| Summary of End of Study Data | `t-end-of-study` | DST03 | ADSL (CDISC pilot packaging) |
| Extent of Exposure | `t-exposure` | EXT01 | ADEX |
| Overview of Treatment-Emergent Adverse Events | `t-ae-overview` | AET01 | ADAE |
| Adverse Events by SOC and Preferred Term | `t-ae-common` | AET02 | ADAE |
| Listing of Serious Adverse Events | `l-ae-serious` | AEL01 | ADAE |
| Summary of Vital Signs at Baseline and End of Treatment | `t-vitals` | VST01 | ADVS |
| Summary of Vital Signs Change from Baseline at End of Treatment | `t-vitals-change` | VST02 | ADVS |
| Summary of Weight and Weight Change from Baseline at End of Treatment | `t-weight` | VST03 | ADVS |
| Summary of Concomitant Medications | `t-conmeds` | CMT01 | ADCM |

## Demographics (DMT01)

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| DSP-DEMO-001 | The age summary (n, mean, SD, median, min, max) by treatment arm equals the value computed directly from the vendored pilot ADSL on the intent-to-treat population; the display carries the report's Placebo, low dose, high dose, Total and p-value columns. | Correctness | `test-displays.R` | Verified |
| DSP-DEMO-002 | Sex, Race (Origin) and age-group counts and percentages by treatment arm and overall equal the values computed directly from ADSL, printed as the report prints them: integer percentages, a bare 0 for nobody, `<1%` for a share under half a percent. | Correctness | `test-displays.R` | Verified |
| DSP-DEMO-003 | Every p-value the display prints is the test the report's footnote names — one-way ANOVA across the three arms for a continuous block, Pearson's chi-square (no continuity correction) for a categorical one — recomputed independently and printed to four decimals, on the block's n row (or the first level of a sub-block) and nowhere else. | Correctness | `test-displays.R` | Verified |
| DSP-DEMO-004 | Race (Origin) is the report's classification recoded from the study's race and ethnicity — ethnicity first, then race — and reproduces 218 Caucasian, 23 African Descent, 12 Hispanic, 1 Other, with every Hispanic subject White by race so 218 + 12 = 230; the CDISC-coded race stays in the ARD for the narrative and is not rendered. | Traceability | `test-displays.R` | Verified |
| DSP-AEI-001 | The incidence display's any-event row and every organ-class and preferred-term row report, per arm, the subjects with at least one treatment-emergent event, the percentage of the safety population and the number of events in brackets, equal to a direct computation from the vendored ADAE and ADSL; the columns are the three arms and the two placebo comparisons. | Correctness | `test-displays.R` | Verified |
| DSP-AEI-002 | Every p-value is Fisher's exact test of placebo against the active arm on subject incidence, printed to three decimals with an asterisk below 0.15 and `>0.99` when it rounds to one, and blank where neither arm has a subject with the event. | Correctness | `test-displays.R` | Verified |
| DSP-AEI-003 | Organ classes print alphabetically and preferred terms within a class by high-dose subjects descending then name, the order the reference prints; the serious-events table orders its terms by subjects summed across the arms, as its own program does. | Regulatory | `test-displays.R` | Verified |
| DSP-AEI-004 | The serious-events display counts through the incidence display's implementation (`custom_from`), carries no custom code of its own, and reports the three serious treatment-emergent events the data hold. | Traceability | `test-displays.R` | Verified |
| DSP-FLOW-001 | The disposition figure counts the subjects screened (every subject in the study's SDTM DM), the screen failures (DM's arm label), the randomised (every subject in ADSL), the Week 24 completers (COMP24FL) and the study completers (the complement of DISCONFL), equal to a direct count of the vendored files — 306, 52, 254, 118 and 110 as the reference report's Figure 10-1 prints — draws them as a self-contained flow, and prints them in its table. | Correctness | `test-displays.R` | Verified |

## Disposition (DST01)

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| DSP-DISP-001 | Randomised, treated, completed and discontinued counts reproduce `EOSSTT` by treatment arm, with percentages based on randomised subjects. | Functional | `test-displays.R` | Verified |
| DSP-DISP-002 | The derived discontinuation reasons partition the discontinued subjects exactly, in every column including Total, and the death count matches `DTHFL`. | Functional | `test-displays.R` | Verified |

## Populations (DST02)

Rebuilds Table 14-1.01 of the clinical study report the CDISC pilot itself
published. The reference prints the row **Complete Study** and states no
definition for it; this display derives it as the complement of the study's own
`DISCONFL` and says so in a footnote, so a reader is not left to infer that the
definition came from the reference.

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| DSP-POP-001 | The ITT, Safety and Efficacy rows equal the counts of the study's own `ITTFL`, `SAFFL` and `EFFFL` in the CDISC pilot ADSL, by planned treatment group and overall, with percentages based on the group's randomised N. | Functional | `test-displays.R` | Verified |
| DSP-POP-002 | Complete Week 24 equals the study's `COMP24FL`; Complete Study is derived as the complement of the study's `DISCONFL`; and completing the study implies having completed Week 24. | Functional | `test-displays.R` | Verified |
| DSP-POP-003 | The display reads the packaging that states the flags it reports. `EFFFL` and `COMP24FL` are absent from the `{pharmaverseadam}` re-derivation of this study, so `sources: phuse` is forced by the analysis rather than chosen. | Traceability | `test-displays.R` | Verified |
| DSP-POP-004 | Planned and actual treatment agree for all 254 subjects, which is what makes the planned-treatment grouping both displays declare — and footnote — report the same subjects an actual-treatment grouping would. | Consistency | `test-displays.R` | Verified |

## End of study data (DST03)

Rebuilds Table 14-1.02. Two definitions here are the project's rather than the
reference's, and both are footnoted on the table: the reference states no
completion-status source, and it prints no denominator rule for the reason rows.

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| DSP-EOS-001 | The three completion-status rows — completed Week 24, terminated early, status missing — partition every treatment group and the Total column exactly. | Consistency | `test-displays.R` | Verified |
| DSP-EOS-002 | The nine reasons for early termination plus the missing-reason row partition the early terminations exactly, in every column including Total, so no subject falls through a reason the spec omitted. | Consistency | `test-displays.R` | Verified |
| DSP-EOS-003 | A p-value appears on exactly the three rows the statistical analysis plan names — protocol completion, adverse event and lack of efficacy — and each equals a Fisher's exact test computed independently across the three treatment groups. No other row carries one. | Functional | `test-displays.R` | Verified |
| DSP-EOS-004 | Every percentage, the reason rows included, is based on the treatment group's randomised N rather than on the number of early terminations. | Functional | `test-displays.R` | Verified |

## Agreement with the published reference report

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| DSP-REF-001 | Every cell `t-populations` and `t-end-of-study` publish equals the figure the CDISC pilot's own clinical study report printed for Tables 14-1.01 and 14-1.02 in 2006, from SAS programs sharing no code with this repository. The transcribed reference is at `quality/data/reference-report-agreement.json`; `qc/reference-report-agreement.R` compares it against both a from-scratch recomputation and the committed rendered HTML and exits non-zero on any disagreement, and `--verify-transcription` re-derives the transcription itself from the source document. | Quality evidence | `test-displays.R`, `qc/reference-report-agreement.R` | Verified |
| DSP-REF-002 | Every cell `t-demographics` and `t-exposure` publish equals the figure the CDISC pilot's own clinical study report printed for Tables 14-2.01 and 14-4.01 — 58 report lines of four cells and a p-value, and 12 lines of six cells gathered from the rendered blocks the record names — as transcribed in `quality/data/reference-report-agreement.json` and re-derived from the pinned document by `--verify-transcription`. | Regulatory | `test-displays.R` | Verified |
| DSP-REF-003 | Every cell `t-ae-incidence` and `t-sae-incidence` publish equals the figure the CDISC pilot's own report printed for Tables 14-5.01 and 14-5.02 — 258 lines of three cells and two p-values, wrapped and truncated labels resolved to the data's terms — as transcribed in the agreement record and re-derived from the pinned document; the four p-values the 2006 program rounded a thousandth higher are recorded as known differences, printed as recomputed, and tracked. | Regulatory | `test-displays.R` | Verified |

## Exposure (EXT01)

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| DSP-EXP-001 | Duration-of-exposure statistics equal those computed directly from the ADEX `TDURD` parameter for each treatment arm. | Functional | `test-displays.R` | Verified |
| DSP-EXP-002 | Cumulative exposure categories are monotone non-increasing and each equals the number of subjects reaching that duration threshold. | Functional | `test-displays.R` | Verified |

## Adverse events (AET01, AET02, AEL01)

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| DSP-AE-001 | Any-AE and serious-AE subject counts and percentages equal the values computed directly from ADAE over the safety analysis set. | Functional | `test-displays.R` | Verified |
| DSP-AE-002 | Severity, seriousness and relatedness rows never exceed the any-AE row in any column — a subject counted in a subset must be counted in the whole. | Consistency | `test-displays.R` | Verified |
| DSP-AE-003 | The event-count row supplied by `custom.R` counts ADAE records, not subjects, and exceeds the number of subjects reporting them. | Functional | `test-displays.R` | Verified |
| DSP-AE-004 | System organ class and preferred term subject counts equal the values computed directly from ADAE, with each subject counted once per term. | Functional | `test-displays.R` | Verified |
| DSP-AE-005 | The in-text variant of AET02 applies the 5% threshold declared in its spec: terms reaching 5% in any treatment group are shown, terms below it in every group are not, and the full display is unaffected. | Functional | `test-displays.R` | Verified |
| DSP-SAE-001 | The serious-AE listing has exactly one row per `AESER == "Y"` record, reports the recorded preferred terms and subjects, and is sorted as its spec declares. | Functional | `test-displays.R` | Verified |

## Vital signs, weight and concomitant medications (VST01-03, CMT01)

These four displays target Tables 14-7.01 to 14-7.04 of the reference clinical
study report for this study. They are qualified on three routes rather than two:
the pipeline, an independent recomputation in
[`qc/vitals-conmeds-agreement.R`](../../qc/vitals-conmeds-agreement.R) that shares
no code with it, and
[`quality/data/vitals-conmeds-reference.json`](../data/vitals-conmeds-reference.json),
a transcription of what a SAS implementation printed for the same displays in
2006. `Rscript qc/vitals-conmeds-agreement.R` exits non-zero on any disagreement
and is a required CI step.

**Definitions this display group owns.** Three choices here were made by open.csr
rather than inherited from a specification, and each is carried in the display's
own footnotes so a reader of the table sees it:

- *Planned treatment.* These four group by `TRT01P`, while the rest of the library
  groups by `TRT01A`. The reference report's safety displays are by planned
  treatment (86 / 84 / 84); twelve subjects received a treatment other than the
  one planned, and grouping by actual treatment gives 86 / 96 / 72. Verified by
  DSP-VWC-001.
- *Baseline and end of treatment are derived here, not taken as shipped.*
  `{pharmaverseadam}` ships `BASE`/`CHG` and an `AVISIT == "End of Treatment"`
  record; neither implements the definitions these displays need, so
  `prepare_data()` derives `BLVAL`, `CHGBL` and `EOTFL` instead. The reasons are
  in the roxygen block on `prepare_data()`. Verified by DSP-VS-002 and TFL-PREP.
- *Ordering, and the width of a percentage.* `t-conmeds` orders therapeutic classes
  and medications by descending subject count, the convention the rest of this
  library uses, where the reference ordered classes alphabetically; and it prints
  percentages to one decimal where the reference printed whole numbers. Both are
  presentation, and the underlying counts are identical -- the agreement script
  rounds to the reference's precision before comparing.

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| DSP-VS-001 | Every rendered cell of the vital signs summary -- three measures, three positions, three visits, three treatment groups -- equals the value the reference clinical study report printed for the same cell. | Functional | `test-displays-vitals.R` | Verified |
| DSP-VS-002 | Baseline and end of treatment each select at most one observed record per subject, parameter and position; end of treatment is that series' last planned visit after Week 0 up to and including Week 24, and never the Week 26 follow-up visit or a derived record. | Functional | `test-displays-vitals.R` | Verified |
| DSP-VSC-001 | Every rendered cell of the vital signs change display equals the value the reference report printed, and a subject with no observed Week 0 measurement contributes to no change row -- so a change row's n falls below the matching value row's n by exactly the number of subjects without a baseline. | Functional | `test-displays-vitals.R` | Verified |
| DSP-WT-001 | Every rendered cell of the weight display -- weight and weight change, at baseline, Week 24 and end of treatment -- equals the value the reference report printed. | Functional | `test-displays-vitals.R` | Verified |
| DSP-CM-001 | Subject counts by therapeutic class and coded medication equal those computed directly from ADCM, with each subject counted once per class and once per medication however many records they have, and the rendered percentage is that count over the treatment group's safety analysis set. | Functional | `test-displays-vitals.R` | Verified |
| DSP-CM-002 | No therapeutic class count exceeds the number of subjects taking any concomitant medication, and no medication count exceeds the class it is nested under -- a subject counted in a part is counted in the whole. | Consistency | `test-displays-vitals.R` | Verified |
| DSP-CM-003 | The in-text variant of CMT01 applies the 5% threshold declared in its spec: medications reaching 5% in any treatment group are shown, medications below it in every group are not, and the full display is unaffected. | Functional | `test-displays-vitals.R` | Verified |
| DSP-VWC-001 | All four displays group by planned treatment over the safety analysis set, carry no pooled Total column, and head their columns with the safety analysis set sizes. On the pharmaverse re-derivation the library first read, planned and actual differed for twelve subjects, so the choice was consequential; on the study's own package (the default since v0.4.0, #60) the two agree for every subject, and both facts are asserted so the choice stays visible. | Regulatory | `test-displays-vitals.R` | Verified |
| DSP-VWC-002 | The committed three-route agreement record reports no disagreement, leaves no publishable statistic unchecked, and describes the iteration of each display that is committed now rather than an earlier one. | Quality evidence | `test-displays-vitals.R` | Verified |

## Efficacy — ADAS-Cog and NPI-X (EFT01–EFT09)

Nine displays built from the CDISC pilot's own ADaM package (`adqsadas`,
`adqsnpix`), specified by the CDISCPILOT01 statistical analysis plan and
targeted at the reference report's Section 14 displays.

These are qualified by three routes, not two. Route A is the pipeline; route B
is an independent recomputation in base R that never loads `{opencsr}`; route C
is the CDISC pilot's own published tables, computed in SAS by other people in
2006–2007. `qc/efficacy-agreement.R` runs all three and exits non-zero on any
change; `quality/data/efficacy-reference.json` holds route C, extracted
mechanically from the source document rather than transcribed.

| Slug | Regulatory ID | Display | Reference |
|---|---|---|---|
| `t-eff-adas-wk24` | EFT01 | ADAS-Cog, change from baseline to Week 24, LOCF | Table 14-3.01 |
| `t-eff-adas-wk8` | EFT02 | ADAS-Cog, change from baseline to Week 8, LOCF | Table 14-3.03 |
| `t-eff-adas-wk16` | EFT03 | ADAS-Cog, change from baseline to Week 16, LOCF | Table 14-3.05 |
| `t-eff-adas-wk24-completers` | EFT04 | ADAS-Cog, Week 24 completers, observed cases | Table 14-3.07 |
| `t-eff-adas-wk24-male` | EFT05 | ADAS-Cog, Week 24, male subjects | Table 14-3.08 |
| `t-eff-adas-wk24-female` | EFT06 | ADAS-Cog, Week 24, female subjects | Table 14-3.09 |
| `t-eff-adas-overtime` | EFT07 | ADAS-Cog, mean and mean change over time | Table 14-3.10 |
| `t-eff-adas-mmrm` | EFT08 | ADAS-Cog, repeated measures analysis | Table 14-3.11 |
| `t-eff-npix-mean` | EFT09 | NPI-X, mean total score from Week 4 through Week 24 | Table 14-3.12 |

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| DSP-EFF-001 | Every descriptive statistic in the six ANCOVA-style ADAS-Cog and NPI-X displays — n, mean, SD, median, minimum and maximum, at baseline, on treatment and for the change — equals the value computed directly from the vendored ADaM package, at the display's declared precision. | Functional | `test-displays-efficacy.R` | Verified |
| DSP-EFF-002 | The ANCOVA statistics — dose-response p-value, pairwise differences of least-squares means, their standard errors, p-values and confidence intervals — reproduce the CDISCPILOT01 reference report exactly, for every display that reports them. | Functional | `test-displays-efficacy.R` | Verified |
| DSP-EFF-003 | The Week-24 completers display reports the population size and the number of records summarised as separate statistics: its placebo column is headed N=60 while summarising 59 assessments, because one completer has no assessment inside the Week-24 window. | Functional | `test-displays-efficacy.R` | Verified |
| DSP-EFF-004 | The over-time display's windowed and LOCF lanes select different record sets at Weeks 16 and 24 and identical ones at Week 8, every cell reproduces reference Table 14-3.10, and each visit's baseline row is the baseline of the subjects contributing to that visit rather than of the whole column. | Functional | `test-displays-efficacy.R` | Verified |
| DSP-EFF-005 | The repeated-measures fit reproduces the reference report's own PROC MIXED output: the same 539 observations from 234 subjects, all six unstructured covariance parameters to six significant figures, and the REML criterion to eight. | Functional | `test-displays-efficacy.R` | Verified |
| DSP-EFF-006 | The repeated-measures least-squares means are the visit-averaged treatment main effect, not the Week-24-conditioned estimate, and the two are far enough apart that a silent change of estimand would be caught. | Consistency | `test-displays-efficacy.R` | Verified |
| DSP-EFF-007 | The NPI-X endpoint is the per-subject mean over the Week 4 to Week 24 windows as the analysis plan defines it, and reproduces reference Table 14-3.12. The study's own NPTOTMN parameter does not: it omits exactly twelve subjects and adds none, and that difference stays measured. | Functional | `test-displays-efficacy.R` | Verified |
| DSP-EFF-008 | A derived per-subject record refuses to carry a column that varies inside the subject, so a covariate can never depend silently on record order. | Robustness | `test-displays-efficacy.R` | Verified |
| DSP-EFF-009 | Every rendered cell of all nine displays matches the reference report, except the five cells of the repeated-measures display that the committed agreement record declares and explains. A sixth difference, or a different fifth, fails. | Regulatory | `test-displays-efficacy.R` | Verified |

## Efficacy: CIBIC+ (EFF02, EFF03, EFF04, EFF05)

These five displays are verified differently from the six above, and the
difference is the point. A safety display is right when the pipeline and a direct
`dplyr` recomputation agree. An efficacy display carries a *model*, and two
implementations of the same misunderstanding agree perfectly — so the standard
here is agreement with the analysis the sponsor published.

Three measurements, of which only two are ours:

1. the pipeline, through `regenerate()` and each display's `custom.R`;
2. `qc/efficacy-reference.R`, which reads the vendored `.xpt.gz` files itself and
   recomputes every published statistic without loading `{opencsr}` — solving the
   analysis of covariance from the normal equations rather than with `stats::lm()`,
   building the Cochran-Mantel-Haenszel statistic from per-stratum score sums
   rather than in the Kronecker form the display uses, and computing the
   Kaplan-Meier estimator, Greenwood's variance, the Brookmeyer-Crowley median
   limits and the log-rank test from risk sets without `{survival}`;
3. `quality/data/efficacy-reference.json`, a transcription of what the study's
   2006 clinical study report printed.

(1) and (2) are compared to full numeric precision; (2) and (3) as the strings the
declared digit plans produce. The script exits non-zero on any disagreement and is
run by CI. The `test-displays-efficacy.R` tests below are the cell-level half of
the same claim.

Where the reference is silent, the display's own footnotes say so — see
[Engineered definitions](#engineered-definitions) below.

| Display | Slug | Regulatory ID | Reference | Dataset |
|---|---|---|---|---|
| Primary Endpoint Analysis: CIBIC+ at Week 24 (LOCF) | `t-cibic-week24` | EFF02 | Table 14-3.02 | ADQSCIBC |
| CIBIC+ at Week 8 (LOCF) | `t-cibic-week8` | EFF03 | Table 14-3.04 | ADQSCIBC |
| CIBIC+ at Week 16 (LOCF) | `t-cibic-week16` | EFF04 | Table 14-3.06 | ADQSCIBC |
| CIBIC+ Categorical Analysis (LOCF) | `t-cibic-categorical` | EFF05 | Table 14-3.13 | ADQSCIBC |
| Time to Dermatologic Event | `f-derm-time-to-event` | AEF01 | Figure 14-1 | ADTTE |

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| DSP-CIBIC-001 | The n, mean, standard deviation, median and range printed at Weeks 8, 16 and 24 are the values the study's report printed for Tables 14-3.04, 14-3.06 and 14-3.02. | Correctness | `test-displays-efficacy.R`, `qc/efficacy-reference.R` | Verified |
| DSP-CIBIC-002 | The analysis of covariance reproduces the report's dose-response p-value, pairwise p-values, differences of least-squares means, standard errors and confidence limits, with the model-level result printed once. | Correctness | `test-displays-efficacy.R`, `qc/efficacy-reference.R` | Verified |
| DSP-CIBIC-003 | The column heading is the size of the efficacy analysis set and the `n` row is the number of subjects with a value at the visit; the two differ at Week 8 and the display does not conflate them. | Correctness | `test-displays-efficacy.R`, `qc/efficacy-reference.R` | Verified |
| DSP-CIBIC-004 | The categorical analysis reports all seven CIBIC+ categories at all three visits, including those no subject fell into, and the counts partition the subjects assessed at that visit exactly. | Correctness | `test-displays-efficacy.R`, `qc/efficacy-reference.R` | Verified |
| DSP-CIBIC-005 | The categorical p-value is the stratified Cochran-Mantel-Haenszel row-mean-scores statistic — the one of the three candidate statistics that reproduces the published values, and demonstrably not the general-association statistic. | Correctness | `test-displays-efficacy.R`, `qc/efficacy-reference.R` | Verified |
| DSP-TTE-001 | The Kaplan-Meier display reproduces the event counts, percentages, censored counts, medians and confidence limits the report's narrative states; events and censored subjects sum to the number at risk; a median not reached is empty rather than a number. | Correctness | `test-displays-efficacy.R`, `qc/efficacy-reference.R` | Verified |
| DSP-TTE-002 | The survival curve is drawn from the committed ARD and from nothing else: one series per treatment group, each non-increasing, ending at the ARD's final estimate, with the numbers-at-risk strip printing the ARD's counts. | Correctness | `test-displays-efficacy.R`, `qc/efficacy-reference.R` | Verified |
| DSP-TTE-003 | The log-rank p-value is reported as `<0.0001` rather than rounded to `0.0000`, and the unrounded probability is retained in the ARD. | Regulatory | `test-displays-efficacy.R` | Verified |

### Two statistics in the ARD that no route checks

Measured 2026-08-27 by changing one statistic at a time in the committed ARD and
running both gates. `t-cibic-categorical` writes three statistics per visit for
the Cochran-Mantel-Haenszel test — `pval`, `chisq` and `df`. Only `pval` is
compared:

- Change `pval` and `qc/efficacy-reference.R` exits 1 and names the cell.
- Change `chisq`, or `df`, at any or all three visits, and `qc/efficacy-reference.R`
  exits 0 and the whole testthat suite passes 1,974 assertions. Nothing fails.

Neither statistic is printed on the display, so no *published figure* is
unchecked and the qualification claim above stands as written. What is unchecked
is the ARD, which is a deliverable in its own right under the analysis-results
metadata this project targets — a reader of `ard.json` gets a chi-square and a
degrees-of-freedom no route has ever confirmed.

The degrees of freedom is also asserted in the display's own footnote, as the
literal words "on 2 degrees of freedom" rather than as a binding. The footnote
and the ARD can therefore disagree with nothing failing, which is the same defect
the numeric-fidelity gate exists to prevent in text blocks.

Fixing this means comparing both statistics in `qc/efficacy-reference.R` against
the second measurement it already computes, and binding the footnote's `2`. It is
deliberately NOT fixed here: this branch is preserved, not proposed, and adding a
comparison to a branch nobody has reviewed would bury it.

### Engineered definitions

Three things these displays report are not settled by the reference, and are
recorded here so that a reader can tell a transcribed decision from one open.csr
made. Each is also stated in the display's own footnotes.

- **The confidence limits for the median time to event.** The report gives the
  intervals but not the transformation used to derive them, and the three
  candidates do not agree on this data. The linear (Brookmeyer-Crowley) form is
  the only one that reproduces both published intervals, so the display declares
  it; all three are recorded in `quality/data/efficacy-reference.json`.
- **The log-rank chi-square and its degrees of freedom.** Not in the published
  figure, which states only that the difference was significant. open.csr reports
  them so the p-value beneath them can be checked.
- **The boundary form of a p-value.** The report writes `p<0.0001`; open.csr
  reaches the same string by a stated rule (TFL-FMT-004) rather than by
  transcription.

## Library-wide

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| DSP-ALL-001 | Every display in the library renders a table containing real numbers — no shells, no placeholder output. | Quality evidence | `test-displays.R` | Verified |
| DSP-ALL-002 | Every display declares a regulatory identifier, a source line naming the data cut-off, and at least one footnote. | Regulatory | `test-displays.R` | Verified |
