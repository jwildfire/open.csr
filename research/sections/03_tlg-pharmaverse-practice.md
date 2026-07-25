# 03 — Pharmaverse TLG Production Practice and What "FDA Submission Level" Means

Research for **open.csr**. Everything below is either fetched from a cited URL or verified
locally with `Rscript` against the installed packages (marked **[verified locally]**).
Local session: R with `pharmaverseadam` 1.1.0, `cards` 0.6.1, `cardx` 0.2.5,
`gtsummary` 2.3.0, `gt` 1.0.0, `tfrmt` 0.1.3, `r2rtf` 1.3.1, `admiral`, `quarto`.

---

## 1. What "FDA submission level" actually means for a TFL

There is no single "FDA-quality TFL" standard. In practice it decomposes into **four
independent layers**, and open.csr needs an answer for each:

| Layer | What it means | Governing artifact |
|---|---|---|
| **A. Analysis content** | The right populations, the right denominators, the right statistic, the right groupings (MedDRA SOC/PT, FMQ, CTCAE grade) | FDA Standard Safety Tables & Figures (ST&F); PHUSE white papers; the protocol/SAP |
| **B. Display conventions** | Titles/subtitles, footnotes, source line, column spanners, "big N" headers, precision/rounding, sort order, population label, page headers/footers | Sponsor TFL shells; ICH E3 §14/§16; r2rtf/tfrmt display metadata |
| **C. Output format & packaging** | RTF (or PDF) files, page size/orientation, fonts, pagination, ≤180-char eCTD paths, lowercase no-space filenames | FDA *Study Data Technical Conformance Guide* (sdTCG); FDA PDF specifications; eCTD backbone spec |
| **D. Traceability & evidence** | Result → ARD → ADaM → SDTM lineage; define.xml + Analysis Results Metadata; ADRG; submitted source programs; reproducible environment | sdTCG; PHUSE ADRG template; CDISC ARS v1.0; R Consortium pilot feedback |

open.csr's stated principles (code-generated TFLs, live regeneration, saved iterations,
end-to-end traceability, test evidence) map almost exactly onto layers **B + D** — which is
where the open-source ecosystem is *weakest* and where a differentiated product exists.
Layers A and C are already well served by existing packages and should be consumed, not
rebuilt.

---

## 2. FDA Standard Safety Tables and Figures (ST&F) — the closest thing to an FDA-defined TFL set

CDER's Office of New Drugs published the **Standard Safety Tables and Figures: Integrated
Guide (ST&F IG)**, first released **August 2022** via docket FDA-2022-N-1961-0046, with a
current copy on fda.gov. It is what FDA *reviewers* build for NDA/BLA safety review, so it
is the best available proxy for "what FDA wants to see."

- Docket PDF: https://downloads.regulations.gov/FDA-2022-N-1961-0046/attachment_1.pdf
- Docket landing: https://www.regulations.gov/document/FDA-2022-N-1961-0046
- FDA program page: https://www.fda.gov/drugs/development-resources/standard-safety-tables-and-figures-stfs
- Integrated Guide (fda.gov copy): https://www.fda.gov/media/187065/download
- Targeted Analysis Guides (TAGs): Kidney Injury https://www.fda.gov/media/187063/download ·
  Muscle Injury https://www.fda.gov/media/187064/download

Key ST&F conventions worth copying:

- **FDA Medical Queries (FMQ/OCMQ)** — FDA's own standardized MedDRA PT groupings
  (narrow/broad), used instead of or alongside SMQs. Introduced publicly in 2022;
  see https://www.thefdalawblog.com/2022/09/fda-unveils-its-own-medical-queries-a-standardized-approach-for-grouping-meddra-preferred-terms-that-will-impact-nda-bla-safety-analyses-and-drug-labeling/
- **Safety population, pooled analyses** as the default population/scope label in titles.
- **Threshold displays** — e.g. "Common Adverse Events Occurring at ≥X% Frequency."
- Titles are fully self-describing: *"Patients With Serious Adverse Events by System Organ
  Class and FDA Medical Query (Narrow), Safety Population, Pooled Analyses"* (Table 10).

**{cardinal}** (pharmaverse) is the open-source implementation of the ST&F IG:
https://pharmaverse.github.io/cardinal/ · https://github.com/pharmaverse/cardinal ·
catalog: https://pharmaverse.github.io/cardinal/quarto/index-catalog.html

Cardinal's catalog currently maps these ST&F tables (ID → title):

| ID | Title |
|---|---|
| Table 02 | Demographics and Baseline Clinical Characteristics |
| Table 03 | Subject Screening and Enrollment |
| Table 04 | Subject Populations, Randomized Population |
| Table 06 | Duration of Treatment Exposure |
| Table 07 | Overview of Adverse Events |
| Table 08 / 09 | Deaths / All Individual Subject Deaths |
| Table 10 / 11 | SAEs by SOC+PT / by Organ System + OCMQ |
| Table 12 / 13 | AEs Leading to Discontinuation (SOC+PT / Organ+OCMQ) |
| Table 14 | Subjects With Adverse Events (SOC+PT) |
| Table 15 | Common AEs at ≥X% Frequency |
| Table 17 | Subjects With AEs (Organ + OCMQ) |
| Table 18 | Summary Assessment of AE of Interest |
| Table 29 | SAEs (Organ/OCMQ/PT) |
| Table 33 / 34 | AEs by Male- / Female-Specific OCMQ |
| Table 36 / 37 / 38 | Max Postbaseline SBP / DBP / Hypotension Levels |
| Table 43 / 44 / 45 | AEs by Organ+OCMQ (Broad) and sex-specific broad |
| Table 50 / 51 | SAEs / AEs by Demographic Subgroup |
| Roche LBT01 | Lab Test Results and Change from Baseline (non-FDA contribution) |

Cardinal is built on **{cards} + {gtsummary}** and explicitly aligns with the CDISC ARD/ARM
effort — i.e. the same ARD-first architecture open.csr proposes. It is listed as *"Under
development / Upcoming"* on the pharmaverse TLG page
(https://pharmaverse.org/e2eclinical/tlg/), so it is a collaborator, not a competitor.

---

## 3. The pharmaverse TLG package landscape (with current CRAN versions)

Fetched from crandb (https://crandb.r-pkg.org/<pkg>) on 2026-07-25:

| Package | CRAN version | Published | Role |
|---|---|---|---|
| `cards` | 0.8.1 | 2026-07-06 | CDISC-compliant **ARD** construction (Roche + GSK copyright) |
| `cardx` | 0.3.4 | 2026-07-06 | ARD wrappers for statistical models/tests |
| `gtsummary` | 2.5.1 | 2026-05-30 | ARD → presentation-ready summary tables |
| `crane` | 0.3.2 | 2026-06-03 | gtsummary supplement for pharma reporting (Insights Engineering) |
| `tfrmt` | 0.4.0 | 2026-07-10 | **Display metadata** applied to ARDs; mock tables; JSON round-trip (GSK) |
| `rtables` | 0.6.16 | 2026-04-22 | Declarative multi-level tabulation engine |
| `tern` | 0.9.11 | 2026-07-17 | Clinical analysis layers on top of rtables |
| `rlistings` | 0.2.13 | 2025-12-08 | Regulatory-style data listings |
| `chevron` | (see repo) | — | Standard TLG catalog functions over `adam_db` |
| `r2rtf` | 1.3.1 | 2026-06-10 | Production-ready **RTF** tables and figures (Merck) |
| `pharmaRTF` | 0.1.4 | 2021-09-28 | RTF wrapper for huxtable/gt — **effectively unmaintained (2021)** |
| `Tplyr` | 1.3.3 | 2026-06-30 | Traceability-focused grammar of clinical summary |
| `tidytlg` | 0.12.0 | 2026-04-21 | Tidyverse-style TLG generation |
| `siera` | 0.5.6 | 2026-06-17 | **Generate ARD programs from CDISC ARS metadata** (Clymb Clinical) |
| `xportr` | 0.5.0 | 2026-01-13 | Write submission-ready XPT with metadata |
| `datasetjson` | 0.3.0 | 2025-01-30 | CDISC Dataset-JSON read/write |
| `admiral` | 1.5.0 | 2026-06-12 | ADaM derivation |
| `metacore` / `metatools` | 0.3.0 / 0.3.0 | 2026-04 | Metadata object + dataset build/check from metadata |
| `pharmaverseadam` | 1.3.0 | 2026-02-20 | ADaM test data (local install is **1.1.0**) |

pharmaverse's own recommendation split (https://pharmaverse.org/e2eclinical/tlg/):
**Recommended** = rtables, chevron, pharmaRTF, Tplyr, gtsummary, tfrmt, tidytlg, cards,
rlistings, ggsurvfit. **Available** = cardx, siera, tfrmtbuilder, eudract, tern, teal,
gridify, docorator, clinify, autoslider, tidyCDISC.

Note the ecosystem is **bifurcated**: the NEST/Roche stack (`rtables` → `tern` → `chevron` →
`rlistings`) and the ARD stack (`cards` → `gtsummary`/`tfrmt`). Both are pharmaverse-blessed.
`cards`/`gtsummary` is the one aligned with CDISC ARS and the one Cardinal chose.

---

## 4. The TLG Catalog (insightsengineering/tlg-catalog)

- Site: https://insightsengineering.github.io/tlg-catalog/ · Repo:
  https://github.com/insightsengineering/tlg-catalog (open-sourced 2023, permissive license)
- Built with Quarto; `book/` contains `tables/`, `listings/`, `graphs/`, `appendix/`.

**Verified via GitHub API** — table categories and entry counts (`.qmd` files):

```
ADA 5 · ECG 5 · adverse-events 15 · concomitant-medications 4 · deaths 1 · demography 1
disclosures 3 · disposition 3 · efficacy 15 · exposure 1 · lab-results 18
medical-history 1 · pharmacokinetic 9 · risk-management-plan 5 · safety 1 · vital-signs 2
= 89 table entries
```

Listings categories: ADA, ECG, adverse-events, concomitant-medications,
development-safety-update-report, disposition, efficacy, exposure, lab-results,
medical-history, pharmacokinetic, vital-signs. Graphs: efficacy, other, pharmacokinetic.
(Public write-ups cite "over 220 standard table variants across 8 categories" once variants
within each qmd are counted.)

**{chevron}** exposes the same catalog as callable functions with sponsor-style IDs
(https://insightsengineering.github.io/chevron/). Selected IDs — this is the closest thing
to a canonical "CSR TFL numbering scheme" in open source:

- **AE**: `AET01` Overview of Deaths and AEs · `AET01_AESI` AESI summary · `AET02` AEs by SOC
  and PT · `AET03` AEs by greatest intensity · `AET04` AEs by highest NCI-CTCAE grade ·
  `AET05` / `AET05_ALL` exposure-adjusted rates per patient-year · `AET10` Most common (x%)
  AE PTs · `AEL02` AE listing · `AEL03` SAE listing · `AEL01_NOLLT` PT/verbatim glossary
- **DM/DS/EX**: `DMT01` Demographics and Baseline Characteristics · `DST01` Patient
  Disposition · `EXT01` Exposure Summary
- **LB**: `LBT01` results + change from baseline by visit · `LBT04` abnormalities not present
  at baseline · `LBT05` single/replicated marked abnormalities · `LBT06` abnormalities by
  visit and baseline status · `LBT14` shift to highest NCI-CTCAE grade · `LBT15` shifts to
  grade 3–4 post-baseline
- **VS/EG**: `VST01`, `VST02` · `EGT01`, `EGT02`, `EGT03` (shift baseline vs min/max),
  `EGT05_QTCAT`
- **CM/MH/DTH/PD**: `CMT01A`, `CMT02_PT`, `CML02A_GL` · `MHT01` · `DTHT01` · `PDT01`, `PDT02`
- **Efficacy**: `RSPT01` binary outcomes · `TTET01` time-to-event · `COXT01`/`COXT02` Cox
  models · `FSTG01`/`FSTG02` subgroup forest · `CFBT01` change from baseline
- **RMP**: `RMPT01`, `RMPT03`–`RMPT06` (EU risk-management-plan exposure/extent tables)
- **Graphs**: `KMG01` Kaplan-Meier · `MNG01` mean plot

Chevron functions all take `adam_db` — a *named list of ADaM datasets* — as first argument.
A useful API convention for open.csr's TFL Builder.

---

## 5. {pharmaverseadam} contents — verified locally

`pharmaverseadam` 1.1.0 ships **23 datasets** [verified locally]:

```
adae adbcva_ophtha adce_vaccine adcm adeg adex adface_vaccine adis_vaccine adlb adlbhy
admh adoe_ophtha adpc adpp adppk adrs_onco adsl adsl_vaccine adtr_onco adtte_onco
advfq_ophtha advs advs_peds
```

Sizes and study IDs [verified locally]:

| Dataset | Rows | Cols | Subjects | STUDYID |
|---|---|---|---|---|
| `adsl` | 306 | 54 | 306 | CDISCPILOT01 |
| `adae` | 1,191 | 105 | 225 | CDISCPILOT01 |
| `adlb` | 83,652 | 115 | 254 | CDISCPILOT01 |
| `advs` | 65,032 | 105 | 254 | CDISCPILOT01 |
| `adeg` | 78,756 | 108 | 254 | CDISCPILOT01 |
| `adex` | 6,315 | 92 | 254 | CDISCPILOT01 |
| `adcm` | 7,510 | 95 | 229 | CDISCPILOT01 |
| `admh` | 1,818 | 114 | 254 | CDISCPILOT01 |
| `adtte_onco` | 512 | 20 | 254 | CDISCPILOT01 |
| `adrs_onco` | 3,694 | 79 | 306 | CDISCPILOT01 |
| `adpc` | 3,852 | 127 | 168 | CDISCPILOT01 |
| `adlbhy` | 251 | 14 | 11 | CDISCPILOT01 |
| `*_vaccine` | — | — | — | **ABC** (different study) |

**Provenance** (https://pharmaverse.github.io/pharmaverseadam/): datasets are produced by a
script that runs the **templates** shipped in `admiral`, `admiralonco`, `admiralophtha`,
`admiralvaccine`, `admiralpeds`, `admiralmetabolic`, `admiralneuro` against
**`pharmaversesdtm`** SDTM. Specs are kept in `adams-specs.xlsx`. Regenerated on new package
releases and ad hoc when templates change. These are **test data, not QC'd production
datasets** — the site directs users to the changelog to know which package versions produced
a given snapshot.

Underlying study: **CDISCPILOT01**, the CDISC pilot (xanomeline transdermal in Alzheimer's).
`TRT01A` levels [verified locally]: Placebo (86), Screen Failure (52), Xanomeline High Dose
(72), Xanomeline Low Dose (96).

**Gaps that matter for a CSR demo** [verified locally]:

1. **No primary-efficacy ADaM for CDISCPILOT01.** There is no `adadas` / `adqs` / `adcibc`.
   The CDISC pilot's primary endpoint (ADAS-Cog(11) change from baseline at Week 24, LOCF)
   lives in the R Consortium pilot packages, not in pharmaverseadam. The only efficacy data
   is oncology-shaped (`adtte_onco` PARAMCDs = OS, PFS, RSD; `adrs_onco`; `adtr_onco`) —
   which is *not* the CDISCPILOT01 protocol.
2. **Population flags are thin.** `adsl` `*FL` variables are only
   `DTHFL, SAFFL, DTH30FL, DTHA30FL, DTHB30FL` — **no `ITTFL`, `EFFFL`, `COMPLFL`,
   `RANDFL`**. The R Consortium pilot ADSL has these. open.csr must either derive them or
   source ADSL from the pilot packages.
3. **`ARM`/`ACTARM` include "Screen Failure"** (52 subjects), so disposition/screening tables
   need explicit handling of the screen-failure column.
4. Structure is otherwise complete: `adae` has `AEDECOD, AEBODSYS, AESEV, AESER, AEREL,
   AEOUT, TRTEMFL, AESDTH, ASTDT, AENDT, AEACN, AOCCIFL, SAFFL`; `adlb` has
   `PARAM, PARAMCD, AVAL, BASE, CHG, PCHG, ANRIND, BNRIND, AVISIT, AVISITN, ATOXGR, BTOXGR,
   ABLFL, ANL01FL` (shift tables are fully derivable); `advs` PARAMCDs =
   `BMI, BSA, DIABP, HEIGHT, MAP, PULSE, SYSBP, TEMP, WEIGHT`; `adeg` PARAMCDs =
   `EGINTP, HR, QT, QTCBR, QTCFR, QTLCR, RR, RRR` [all verified locally].

---

## 6. The standard CSR TFL set, mapped to ICH E3

ICH E3 places outputs in **§14 (in-text and end-of-text tables/figures)** — conventionally
14.1 subject disposition & demographics, 14.2 efficacy, 14.3 safety — and **§16.2 appendix
listings** (16.2.1 discontinued subjects, 16.2.2 protocol deviations, 16.2.3 excluded from
efficacy, 16.2.4 demographic data, 16.2.5 compliance/drug concentration, 16.2.6 individual
efficacy response, 16.2.7 AE listings, 16.2.8 individual lab listings).

A defensible minimum viable set for open.csr's Report Template Library, cross-referenced to
chevron IDs / FDA ST&F numbers:

| CSR slot | Display | chevron | FDA ST&F |
|---|---|---|---|
| 14.1 | Subject disposition / discontinuation | `DST01` | T03, T04 |
| 14.1 | Analysis populations | — | T04 |
| 14.1 | Demographics & baseline characteristics | `DMT01` | T02 |
| 14.1 | Medical history | `MHT01` | — |
| 14.1 | Prior/concomitant medications | `CMT01A` | — |
| 14.1 | Extent of exposure | `EXT01` | T06 |
| 14.2 | Primary efficacy (ANCOVA / MMRM change from baseline) | `CFBT01` | — |
| 14.2 | Time-to-event + KM figure | `TTET01` + `KMG01` | — |
| 14.2 | Subgroup forest plot | `FSTG01/02` | T50, T51 |
| 14.3 | Overview of AEs (TEAE summary) | `AET01` | T07 |
| 14.3 | TEAEs by SOC and PT | `AET02` | T14 |
| 14.3 | Common TEAEs ≥X% | `AET10` | T15 |
| 14.3 | SAEs | — | T10, T11, T29 |
| 14.3 | AEs leading to discontinuation | — | T12, T13 |
| 14.3 | Deaths | `DTHT01` | T08, T09 |
| 14.3 | Lab shift table (baseline → worst post-baseline) | `LBT06`, `LBT14` | — |
| 14.3 | Lab results & change from baseline by visit | `LBT01` | — |
| 14.3 | Vital signs / ECG by visit + outliers | `VST01`, `EGT01/02` | T36–T38 |
| 16.2 | AE listing, SAE listing, subject data listings | `AEL02`, `AEL03` | — |

PHUSE's *Standard Analyses and Code Sharing* white papers are the reference for the analysis
conventions inside each of these (treatment-emergent definition, EAIR/patient-years,
descending-frequency sort, ≥X% thresholds, SOC/PT nesting): AE white paper at
https://phuse.s3.eu-central-1.amazonaws.com/Deliverables/Standard+Analyses+and+Code+Sharing/Analyses+and+Displays+Associated+with+Adverse+Events+Focus+on+Adverse+Events+in+Phase+2-4+Clinical+Trials+and+Integrated+Summary.pdf
(companion papers cover demographics/disposition/medications, measures of central tendency,
outliers/shifts, hepatotoxicity, QT). Standard scripts index:
https://github.com/phuse-org/phuse-scripts/wiki/Standard-Script-Index

---

## 7. Output conventions and the RTF/PDF path

### r2rtf (Merck) — the de facto submission RTF engine

`r2rtf` 1.3.1. **Verified locally**, the complete export list is:

```
rtf_page, rtf_page_header, rtf_page_footer, rtf_title, rtf_subline, rtf_colheader,
rtf_body, rtf_footnote, rtf_source, rtf_figure, rtf_read_figure, rtf_read_png,
rtf_rich_text, rtf_encode, write_rtf, assemble_rtf, assemble_docx, utf8Tortf
```

That export list *is* the CSR display grammar. Verified argument sets:

- `rtf_page(tbl, orientation, width, height, margin, nrow, border_first, border_last,
  border_color_first, border_color_last, col_width, use_color)` — page size, landscape /
  portrait, margins, and **rows per page** (pagination) are first-class.
- `rtf_title(tbl, title, subtitle, text_font, text_format, text_font_size, ...)` — multi-line
  titles + subtitles.
- `rtf_body(...)` includes `group_by`, `page_by`, `new_page`, `pageby_header`, `pageby_row`,
  `subline_by`, `last_row`, plus per-cell borders, `text_justification` (incl. **decimal
  alignment**), indents, fonts, colors.
- `rtf_footnote()` / `rtf_source()` — footnotes and the "Source: ..." provenance line, with
  `as_table` control.
- `assemble_rtf()` / `assemble_docx()` — concatenate many outputs into one deliverable.

Docs https://merck.github.io/r2rtf/ · paper Wang, Ye, Anderson, Zhang (2020) PharmaSUG
https://pharmasug.org/proceedings/2020/DV/PharmaSUG-2020-DV-198.pdf · customization
https://pharmasug.org/proceedings/2021/EP/PharmaSUG-2021-EP-085.pdf

The canonical textbook is ***R for Clinical Study Reports and Submission*** (r4csr.org),
whose chapters are a CSR TFL curriculum: Overview, Disposition, Analysis population, Baseline
characteristics, Efficacy table, Efficacy figure, AE summary, Specific AE, Assemble TLFs —
https://r4csr.org/tlf-overview.html. It frames deliverables as following "ICH E3 guidance and
the FDA's PDF Specifications," while noting each organization defines its own TFL rules.

### Other output paths

- **gt → RTF**: `gt` 1.0.0 exports `as_rtf`, `as_word`, `as_latex`, `as_raw_html`, `as_gtable`
  [verified locally]. `gtsummary` 2.3.0 exports `as_gt`, `as_flex_table`, `as_hux_table`,
  `as_kable*`, `as_hux_xlsx` — **no direct `as_rtf`** [verified locally]; the route is
  `gtsummary → as_gt() → gt::as_rtf()`. gt's RTF lacks the page/pagination/footnote grammar
  r2rtf has. See PharmaSUG QT-263, "R Tables via GT for Regulatory Submissions",
  https://pharmasug.org/proceedings/2023/QT/PharmaSUG-2023-QT-263.pdf
- **pharmaRTF** — last CRAN release **2021-09-28 (0.1.4)**. Still "recommended" by
  pharmaverse but a maintenance risk; prefer r2rtf.
- **tfrmt** (GSK) — display metadata as data: `body_plan`, `frmt`, `frmt_combine`,
  `frmt_when`, `col_plan`, `col_style_plan`, `row_grp_plan`, `footnote_plan`, `page_plan`,
  `big_n_structure`, `span_structure`, `tfrmt_n_pct`, **`tfrmt_sigdig`**, `make_mock_data`,
  `print_mock_gt`, `tfrmt_to_json` / `json_to_tfrmt`, `layer_tfrmt` [verified locally,
  0.1.3]. The JSON round-trip plus mock-table generation is directly relevant to open.csr's
  "TFL definition is version-controlled source" principle. Companion Shiny app:
  https://gsk-biostatistics.github.io/tfrmtbuilder/ · paper:
  https://www.lexjansen.com/phuse-us/2024/sm/PAP_SM09.pdf
- **Frameworks for headers/footers**: `gridify`, `docorator`, `clinify` (pharmaverse
  "Available" tier) wrap tables/figures with the page furniture.

### Precision and rounding

The near-universal SAP convention (confirmed across many public SAPs indexed by
clinicaltrials.gov): **min/max at collected precision; mean and median at one more decimal
place than collected; SD and SE at two more (equivalently, one more than the mean); typically
capped at 3 decimals; percentages to one decimal.** `tfrmt::tfrmt_sigdig()` implements
significant-digit plans declaratively; `r2rtf` supports decimal alignment via
`text_justification`. Rounding must be **half-up**, not R's default banker's rounding — a
classic R-vs-SAS discrepancy and a required test case.

### Population/denominator conventions

Every safety display is "Safety Population" with N from `SAFFL == "Y"`; treatment columns
from `TRT01A`/`TRTA` (actual) for safety and `TRT01P`/`TRTP` (planned) for efficacy; TEAE
subsets by `TRTEMFL == "Y"`; "big N" header counts come from ADSL, not the analysis dataset —
a distinction `tfrmt::big_n_structure()` and `cards::ard_total_n()` both encode.

---

## 8. ARD-first architecture: cards / cardx / gtsummary / CDISC ARS

**CDISC Analysis Results Standard (ARS) v1.0** was published **19 April 2024**:
https://www.cdisc.org/standards/foundational/analysis-results-standard/analysis-results-standard-v1-0
Model entities: `ReportingEvent`, `AnalysisSet`, `DataSubset`, `GroupingFactor`, `Analysis`,
`AnalysisMethod`, `Operation`, `Output`, `OutputDisplay`. Deliverables include a logical
model, **JSON/YAML schema**, and Excel representation.

**`{cards}`** builds the ARD. Verified locally (`cards` 0.6.1):

```r
cards::ard_continuous(pharmaverseadam::adsl, by = "TRT01A", variables = "AGE")
# columns: group1, group1_level, variable, context, stat_name, stat_label, stat,
#          fmt_fun, warning, error
#   group1 group1_level variable    context stat_name stat_label     stat fmt_fun
# 1 TRT01A      Placebo      AGE continuous         N          N       86       0
# 2 TRT01A      Placebo      AGE continuous      mean       Mean  75.2093       1
# 3 TRT01A      Placebo      AGE continuous        sd         SD 8.590167       1
```

The `warning` / `error` list-columns are the built-in **quality-evidence channel** — every
statistic carries its own condition record. That is an unusually good fit for open.csr's
"test evidence for every component" requirement.

`cards` generators [verified locally]: `ard_continuous`, `ard_categorical`, `ard_dichotomous`,
`ard_hierarchical`, `ard_hierarchical_count`, `ard_stack`, `ard_stack_hierarchical`,
`ard_stack_hierarchical_count`, `ard_strata`, `ard_pairwise`, `ard_missing`, `ard_total_n`,
`ard_attributes`, `ard_complex`, `ard_identity`, `ard_formals`.

`cardx` adds ~40 model/test ARDs [verified locally]: `ard_stats_t_test`, `ard_stats_anova`,
`ard_stats_chisq_test`, `ard_stats_fisher_test`, `ard_survival_survfit`,
`ard_survival_survdiff`, `ard_survival_survfit_diff`, `ard_incidence_rate`,
`ard_emmeans_mean_difference`, `ard_regression`, `ard_smd_smd`, `ard_continuous_ci`,
`ard_categorical_ci`, etc. — i.e. KM medians, hazard ratios, LS-mean differences and
exposure-adjusted incidence rates are all ARD-native.

`gtsummary` 2.3.0 consumes ARDs directly via `tbl_ard_summary`, `tbl_ard_continuous`,
`tbl_ard_wide_summary`, `tbl_ard_hierarchical`, plus `tbl_hierarchical`,
`tbl_hierarchical_count` (the AE-by-SOC/PT workhorses), `tbl_survfit`, `tbl_split_by_rows`,
`tbl_split_by_columns` [verified locally]. gtsummary was refactored to use cards as its
backend, so a table can emit its own ARD.

**`{siera}`** (Clymb Clinical, CRAN 0.5.6) closes the loop the other way: `readARS()` ingests
ARS metadata (JSON or xlsx) and **auto-generates the R scripts** that produce the ARD.
https://clymbclinical.github.io/siera/ · https://github.com/clymbclinical/siera

Reference talks: Sjoberg, *Harnessing CDISC's Emerging ARD Standard with {cards} and
{gtsummary}* — https://www.danieldsjoberg.com/ARD-RinPharma-talk-2024/ and the 2025 CDISC
COSA spotlight https://www.danieldsjoberg.com/CDISC-COSA-Spotlight-ARD-gtsummary-2025/

---

## 9. R Consortium FDA submission pilots 1–7 — what was submitted and what FDA said

Hub: https://rconsortium.github.io/submissions-wg/ · 2026 status post:
https://r-consortium.org/posts/submissions-wg-2026/

| Pilot | Years | Content | Status / outcome |
|---|---|---|---|
| **1** | 2021–22 | Static TLFs from R, packaged as an R package (`pilot1wrappers`), `renv` lock | Submitted 2021-11-22 (v0.1.0), FDA review complete 2021-12-03; updated 2022-02-11 (v0.1.1), review complete 2022-03-14 |
| **2** | 2022–24 | Same TLFs delivered as a **Shiny app** through eCTD | Accepted; FDA asked that p-values be removed from interactively-filtered tables (unplanned-analysis / "p-hacking" concern) |
| **3** | 2023–24 | **ADaMs generated in R** + TLFs; `admiral`, `metacore`, `metatools`, `xportr`, `{pilot3utils}` | Submitted 2023-08-28; FDA feedback Jan–Jul 2024; resubmitted 2024-04-19; **final FDA response letter 2024-08-08** |
| **4a** | 2024–25 | **WebAssembly**-bundled Shiny app | Submitted via eCTD **2024-09-20** — first public submission containing a WebAssembly component; reviewers found it *easier* than containers (browser only) |
| **4b** | 2025 | **Linux container** version | Submitted summer 2025; Windows dependency-install friction; viability behind the FDA firewall still under discussion |
| **5** | 2025–26 | **Dataset-JSON** instead of XPT (ADaM writes datasetjson; SDTM converted) | Submitted fall 2025; FDA asked for rework of intermediate-dataset usage; resubmitted early Jan 2026; completion expected spring 2026. Note: **Dataset-JSON v1.1 is not yet supported by Pinnacle 21**, so validation was done against XPT equivalents |
| **6** | 2026– | Expanded ADaM + display programs; exploring **AI/automation** for robust pipelines | Kicked off Jan 2026; **will not be submitted to FDA** — groundwork for later pilots |
| **7** | 2026– | **Simulated/synthetic** CDISC-conformant benchmark trial data via statistics + AI | Kicked off Jan 2026; community survey open |

**Pilot 1 outputs** (the canonical four): Demographics & baseline characteristics; primary
efficacy — ADAS-Cog(11) change from baseline to Week 24 (LOCF); a secondary efficacy table;
Kaplan-Meier plot of time to first dermatologic event.
https://rconsortium.github.io/submissions-pilot1/

**FDA feedback themes from Pilot 3** (https://r-consortium.org/posts/news-from-r-submissions-working-group-pilot-3/):

1. "Clear ADRG documentation on computing environment, package dependencies, and expected
   warnings."
2. "Clear documentation on data processing rules and statistical method implementation."
3. "Good statistical practice in confirmatory trials, such as avoiding the possibility of
   *p-hacking*."

**Cross-pilot lessons** (Appsilon synthesis, https://www.appsilon.com/post/r-in-fda-submissions):

- ADRGs for R submissions need **substantially more detail than SAS equivalents**, including
  step-by-step Windows installation instructions. "You can never have too much documentation."
- **Reviewers are on Windows.** "You better work on Windows."
- Reviewers **prefer CRAN packages** over sponsor-internal ones; a custom package "just opens
  up another risk." (Pilots still shipped one — `pilot3utils_0.0.2.zip`.)
- Reviewers were content to spend 5–10 min installing from an `renv.lock`, and in fact
  preferred compiling packages themselves over receiving binaries.
- Interactivity is acceptable; interactive *inference* is not.

---

## 10. eCTD packaging — the exact folder shape (verified from the pilot repos)

**Verified via GitHub API**, `RConsortium/submissions-pilot3-adam-to-fda` (65 paths):

```
m1/us/cover-letter.pdf
m1/us/report-tlf-pilot3.pdf
m1/us/response-FDA-IR-pilot3.pdf
m5/sap-cdiscpilot01.pdf
m5/datasets/rconsortiumpilot3/tabulations/sdtm/{ae,cm,dm,ds,ex,lb,mh,qs,...}.xpt
m5/datasets/rconsortiumpilot3/tabulations/sdtm/{define.xml, define.pdf, blankcrf.pdf}
m5/datasets/rconsortiumpilot3/analysis/adam/datasets/{adsl,adae,adlbc,adadas,adtte}.xpt
m5/datasets/rconsortiumpilot3/analysis/adam/datasets/{define.xml, define2-0-0.xsl, adrg.pdf}
m5/datasets/rconsortiumpilot3/analysis/adam/datasets/adam-pilot-3.xlsx     <- specs
m5/datasets/rconsortiumpilot3/analysis/adam/programs/{adsl,adae,adlbc,adadas,adtte}.r
m5/datasets/rconsortiumpilot3/analysis/adam/programs/{tlf-demographic,tlf-efficacy,
                                                      tlf-kmplot,tlf-primary}.r
m5/datasets/rconsortiumpilot3/analysis/adam/programs/pilot3utils_0.0.2.zip
m5/datasets/rconsortiumpilot3/analysis/adam/programs/renv-lock.txt
```

Pilot 1's package is the same shape with a wider ADaM set (`adsl, adae, adadas, adcibc,
adlbc, adlbcpv, adlbh, adlbhpv, adlbhy, adnpix, adtte, advs`) and `r0pkg.txt`.

Notable conventions to copy: **`.r` (not `.R`) lowercase program files**, `renv.lock` renamed
to `renv-lock.txt` (eCTD file-type restrictions), the internal package shipped as a `.zip`,
`adrg.pdf` living next to the datasets, and define.xml accompanied by its XSL stylesheet.
eCTD rules also cap **total path length at 180 characters** and require lowercase names with
no spaces or special characters.

---

## 11. ADRG and analysis metadata expectations

- FDA's **Study Data Technical Conformance Guide** (current version v6.0, March 2025;
  Technical Specifications Document reissued Dec 2025) recommends an **SDRG** for
  clinical/nonclinical tabulation data and an **ADRG** for clinical analysis data, submitted
  as **`adrg.pdf`**. Landing page:
  https://www.fda.gov/industry/fda-data-standards-advisory-board/study-data-standards-resources
  (Direct PDF fetches from fda.gov/hhs.gov were 403/404 from this environment — retrieve
  manually before quoting section numbers.)
- **PHUSE ADRG template** — 7 required sections: (1) Introduction, (2) Protocol Description,
  (3) Analysis Considerations Related to Multiple Analysis Datasets, (4) Analysis Data
  Creation and Processing Issues, (5) Analysis Dataset Descriptions, (6) Data Conformance
  Summary, (7) Submission of Programs. Template at https://phuse.global/Deliverables/1 ;
  PHUSE working group page:
  https://advance.hub.phuse.global/wiki/spaces/WEL/pages/26804405/
- A **worked R-based ADRG** is public from Pilot 4:
  https://rpodcast.quarto.pub/pilot4-webassembly-adrg/ — this is the single best model for
  what an R-generated ADRG looks like (computing environment, package inventory, expected
  warnings, execution steps).
- **Analysis Results Metadata (ARM)** is the define.xml v2.x extension describing *the purpose
  of each analysis*, the ADaM datasets and methods used — the bridge between define.xml
  (structure) and the TFL (result). Background:
  https://www.lexjansen.com/phuse-us/2018/ds/DS10.pdf . CDISC ARS v1.0 is the modern,
  machine-actionable successor.
- PHUSE **OSDocuMeta** working group is actively building open-source metadata documentation
  tooling: https://phuse-org.github.io/OSDocuMeta/references/problem_statement.html

---

## 12. Gaps and openings for open.csr

1. **Nobody owns the document.** Every package above stops at the individual display.
   Assembling TFLs + prose into an ICH E3 CSR is manual/Word-based today. That is open.csr's
   component (3) and it is genuinely unoccupied.
2. **Display metadata is not standardized across the two stacks.** tfrmt's JSON is the only
   serializable display spec; chevron/tern encode display in R code. A neutral,
   version-controlled TFL definition format (ARS for the analysis + tfrmt-style JSON for the
   display) is a real contribution.
3. **Test evidence is ad hoc.** `cards`' `warning`/`error` columns and `qcthat`-style
   conventions exist, but no one publishes a per-TFL evidence page. The safety.viz
   requirements-matrix + evidence model transfers directly.
4. **pharmaverseadam has no CDISCPILOT01 efficacy dataset** — plan for it (derive an `adadas`
   from `pharmaversesdtm::qs`, or vendor the R Consortium pilot's `adadas.xpt`).
5. **A static GitHub Pages demo is achievable** — Pilot 4 proved FDA reviewers prefer
   browser-only WebAssembly delivery, which is exactly what a Pages site is.

---

## Sources

All URLs are cited inline in the sections above. Primary hubs, for convenience:
TLG Catalog https://insightsengineering.github.io/tlg-catalog/ ·
chevron https://insightsengineering.github.io/chevron/ ·
pharmaverse TLGs https://pharmaverse.org/e2eclinical/tlg/ ·
pharmaverseadam https://pharmaverse.github.io/pharmaverseadam/ ·
cardinal https://pharmaverse.github.io/cardinal/ ·
FDA ST&F https://www.fda.gov/drugs/development-resources/standard-safety-tables-and-figures-stfs ·
CDISC ARS v1.0 https://www.cdisc.org/standards/foundational/analysis-results-standard/analysis-results-standard-v1-0 ·
r2rtf https://merck.github.io/r2rtf/ · tfrmt https://gsk-biostatistics.github.io/tfrmt/ ·
siera https://clymbclinical.github.io/siera/ · r4csr https://r4csr.org/tlf-overview.html ·
R Submissions WG https://rconsortium.github.io/submissions-wg/ ·
Pilot 4 ADRG https://rpodcast.quarto.pub/pilot4-webassembly-adrg/ ·
PHUSE deliverables https://phuse.global/Deliverables/1 ·
FDA study data standards https://www.fda.gov/industry/fda-data-standards-advisory-board/study-data-standards-resources
