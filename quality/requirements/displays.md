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

## Library-wide

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| DSP-ALL-001 | Every display in the library renders a table containing real numbers — no shells, no placeholder output. | Quality evidence | `test-displays.R` | Verified |
| DSP-ALL-002 | Every display declares a regulatory identifier, a source line naming the data cut-off, and at least one footnote. | Regulatory | `test-displays.R` | Verified |
