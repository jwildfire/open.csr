# CDISCPILOT01 — the CDISC pilot submission's own ADaM package

Eleven gzipped SAS transport files, vendored from
[`phuse-org/phuse-scripts`](https://github.com/phuse-org/phuse-scripts) at the
commit recorded in `PROVENANCE.json`. This is the analysis data CDISC published
with its SDTM/ADaM pilot electronic submission — the same xanomeline
Alzheimer's study open.csr already demonstrates on, in the packaging the study's
own `define.xml` and data guide describe.

## Licence

`phuse-org/phuse-scripts` is MIT. The upstream licence text is vendored beside
the data as `LICENSE-phuse-scripts.md` and must stay there: MIT requires the
notice to travel with the files. MIT is compatible with open.csr's Apache-2.0.

`data/adam/` carries no NOTICE, no terms-of-use and no data-specific conditions;
the licence predates the data's arrival in the repository. The pilot's data
guide states the affirmative intent — PHUSE and CDISC created these datasets to
make CDISC-compliant test data publicly available.

Nothing here comes from `RConsortium/submissions-pilot*`. Those packages are
GPL-3.0 or unlicensed, and open.csr is not relicensing.

## What is in it

Ten datasets documented in the study's `define.xml`:

| File | Contents |
|---|---|
| `adsl` | Subject level. Demographics, the study's own `SAFFL`/`ITTFL`/`EFFFL`, baseline weight/height/BMI, discontinuation reason (`DCDECOD`, `DCREASCD`). 254 subjects. |
| `adae` | Adverse events, one record per reported event. 1,191 records, 225 subjects. |
| `advs` | Vital signs. Six parameters, 32,139 records. |
| `adlbc` | Laboratory chemistry. |
| `adlbh` | Laboratory haematology. |
| `adlbhy` | Laboratory, Hy's-law parameters derived from `adlbc`. |
| `adqsadas` | ADAS-Cog (11) — the study's **first primary efficacy endpoint** at Week 24. |
| `adqscibc` | CIBIC+ — the study's **second primary efficacy endpoint** at Week 24. |
| `adqsnpix` | NPI-X — secondary. |
| `adtte` | Time to first dermatologic event. A *safety* analysis: dermatologic AEs are the study's adverse event of special interest. |

And one that is not:

| File | Contents |
|---|---|
| `adcm` | Concomitant medications. **Not part of the CDISC pilot package**: it is absent from the study's `define.xml`, from its data guide, and from the `cdiscpilot01/` folder. It comes from PHUSE's `data/adam/cdisc/`, which PHUSE's own README flags as "2-study data that seem out-of-place here". Half the subjects were relabelled into a synthetic `CDISCPILOT02`; `prepare_data()` reverses that and proves the remap. See `prep_adcm_phuse()`. |

Screen failures are already excluded — the data guide states that subjects who
failed screening were not included in any analysis dataset — so the 306-subject
ADSL of `{pharmaverseadam}` and this 254-subject one describe the same study
after that exclusion.

MedDRA code variables (`AELLTCD`, `AEPTCD`, `AEHLTCD`, `AEHLGTCD`, `AESOCCD`)
are empty and HLT/HLGT carry dummy terms, upstream and by design: MedDRA is
proprietary and these data are public. That is the publisher's decision, not a
defect introduced here.

## Rules

- **Do not edit these files.** They are third-party data, verified byte-for-byte
  against upstream. `qc/vendor-phuse-data.R --check` fails on any change, and CI
  runs it.
- **Do not add a file by hand.** `qc/vendor-phuse-data.R` is the only writer; it
  verifies each download's git blob SHA-1 against the upstream commit's tree
  before writing, so a vendored file is provably the upstream file rather than
  something that merely parses.
- **Read them through `read_phuse()`**, and through `prepare_data()` when you
  want the derivations. `read_phuse(name, verify = TRUE)` re-checks the digest.
