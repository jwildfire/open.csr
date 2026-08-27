# Requirement matrix — displays (`library/tfl/`)

Requirements for the individual tables and listings in the v0 TFL library. Each
requirement is a statement about *the numbers a display reports*, verified by
recomputing them directly from the source `{pharmaverseadam}` datasets with
`dplyr` and comparing against the rendered cells — value-level regression rather
than pixel comparison (design decision D4).

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
| Summary of Vital Signs at Baseline and End of Treatment | `t-vitals` | VST01 | ADVS |
| Summary of Vital Signs Change from Baseline at End of Treatment | `t-vitals-change` | VST02 | ADVS |
| Summary of Weight and Weight Change from Baseline at End of Treatment | `t-weight` | VST03 | ADVS |
| Summary of Concomitant Medications | `t-conmeds` | CMT01 | ADCM |

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
| DSP-VWC-001 | All four displays group by planned treatment over the safety analysis set, carry no pooled Total column, and head their columns with the safety analysis set sizes -- which differ from the actual-treatment sizes, so the choice is consequential rather than cosmetic. | Regulatory | `test-displays-vitals.R` | Verified |
| DSP-VWC-002 | The committed three-route agreement record reports no disagreement, leaves no publishable statistic unchecked, and describes the iteration of each display that is committed now rather than an earlier one. | Quality evidence | `test-displays-vitals.R` | Verified |


## Library-wide

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| DSP-ALL-001 | Every display in the library renders a table containing real numbers — no shells, no placeholder output. | Quality evidence | `test-displays.R` | Verified |
| DSP-ALL-002 | Every display declares a regulatory identifier, a source line naming the data cut-off, and at least one footnote. | Regulatory | `test-displays.R` | Verified |
