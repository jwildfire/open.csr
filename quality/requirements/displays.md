# Requirement matrix — displays (`library/tfl/`)

Requirements for the individual tables, listings and figures in the v0 TFL
library. Each requirement is a statement about *the numbers a display reports*,
verified against a second measurement of the same quantity and compared with the
rendered cells — value-level regression rather than pixel comparison (design
decision D4).

Where the second measurement comes from depends on what the display claims. The
six safety displays are recomputed directly from the source `{pharmaverseadam}`
datasets with `dplyr`; the five efficacy and time-to-event displays are checked
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
| Extent of Exposure | `t-exposure` | EXT01 | ADEX |
| Overview of Treatment-Emergent Adverse Events | `t-ae-overview` | AET01 | ADAE |
| Adverse Events by SOC and Preferred Term | `t-ae-common` | AET02 | ADAE |
| Listing of Serious Adverse Events | `l-ae-serious` | AEL01 | ADAE |

## Demographics (DMT01)

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| DSP-DEMO-001 | The age summary (n, mean, SD, median, min, max) by treatment arm equals the value computed directly from ADSL, at the display's declared precision. | Functional | `test-displays.R` | Verified |
| DSP-DEMO-002 | Sex, race and age-group counts and percentages by treatment arm and overall equal the values computed directly from ADSL. | Functional | `test-displays.R` | Verified |

## Disposition (DST01)

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| DSP-DISP-001 | Randomised, treated, completed and discontinued counts reproduce `EOSSTT` by treatment arm, with percentages based on randomised subjects. | Functional | `test-displays.R` | Verified |
| DSP-DISP-002 | The derived discontinuation reasons partition the discontinued subjects exactly, in every column including Total, and the death count matches `DTHFL`. | Functional | `test-displays.R` | Verified |

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
| Time to First Dermatologic Event | `f-tte-derm` | TTE01 | Figure 14-1 | ADTTE |

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
