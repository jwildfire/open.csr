# open.csr — agent instructions

Open-source Clinical Study Report builder. Read [`docs/design/design.md`](docs/design/design.md) for the architecture and the twelve design decisions, and [`docs/design/contracts.md`](docs/design/contracts.md) for the normative file formats before changing anything.

## The invariant

**Agents write source, never outputs. The pipeline is the only thing that regenerates. Humans approve.** (Design D9.)

A change request becomes a spec edit (`analysis.yaml` / `display.yaml` / `custom.R`), a text-block edit, or a template edit — then `regenerate()` produces the new artifacts. Never hand-edit anything under `outputs/`, `docs/assembled/`, `docs/evidence/`, `docs/requirements/`, or `site/_build/`; those are generated and will be overwritten.

## Rules that are enforced by tests

- **Test names carry requirement IDs:** `"<REQ-ID>: <description> (#<issue>)"`, ID matching `^[A-Z]{2,4}-[A-Z]+-\d+[A-D]?$`. Prefixes: `TFL-` engine, `DSP-` displays, `TXT-` text, `RPT-` templates, `TRC-` traceability, `QC-` framework. Guard tests fail the build otherwise.
- **Every requirement ID a test references must exist in a matrix** under `quality/requirements/`.
- **Prose never states a number.** Text blocks bind values with `{{ard:<display>:<analysis>:<stat>[;group=…]}}`, or by name with `{{value:<id>}}` against the values store (`library/values/values.yaml` → `outputs/values/values.json`). The numeric-fidelity gate fails any digit in rendered prose that didn't come from a binding, and the values gate re-derives every named value from the committed ARDs.
- **Display identity is the slug**, not the 14.x number — numbering is assigned at assembly time.

## Commands

```bash
Rscript -e 'pkgload::load_all("pipeline"); regenerate("t-ae-overview")'   # rebuild one display (ARD + HTML + RTF)
Rscript -e 'pkgload::load_all("pipeline"); regenerate_values()'           # rebuild outputs/values/values.json
Rscript qc/run-tests.R          # R tests -> qc/testthat-results.json
npx vitest run                  # JS tests
node scripts/assemble.mjs       # text + templates + displays -> docs/assembled/
node scripts/requirements.mjs   # matrices -> docs/requirements/
node scripts/evidence.mjs       # test results -> docs/evidence/
node scripts/site.mjs           # everything -> site/_build/
```

## Data

CDISCPILOT01 (xanomeline Alzheimer's study) from two packagings, chosen per dataset by `data_sources()` — see design D12 and contracts §4.

- `{pharmaverseadam}`: `adsl`, `adae`, `adex`, `adlb`, `advs`. The only source of `adex`. Screen failures present and excluded in `prepare_data()`; no `ITTFL`/`EFFFL`; no efficacy domains.
- The CDISC pilot's own ADaM package, vendored under `pipeline/inst/extdata/phuse-cdiscpilot01/` from `phuse-org/phuse-scripts` (MIT): `adqsadas`, `adqscibc`, `adqsnpix`, `adlbc`, `adlbh`, `adlbhy`, `adtte`, `adcm` (plus its own `adsl`/`adae`/`advs`, reachable with `sources = "phuse"`).

Never assume a flag exists on the raw dataset — population flags are derived or asserted in the tested `prepare_data()` layer, and which lane you are on decides which. The default registry deliberately leaves every domain `{pharmaverseadam}` already served where it was, because the two packagings disagree on figures the displays publish; run `Rscript qc/source-agreement.R` to see exactly where.

Efficacy data is available and five efficacy displays are specified against it (`t-cibic-week8`, `t-cibic-week16`, `t-cibic-week24`, `t-cibic-categorical`, `f-tte-derm`). The study's own analysis results metadata in its `define.xml` is the reference for specifying another — do not invent an analysis. Where the reference is genuinely silent, engineer a defensible one and say so in the display's own footnotes and in `quality/requirements/displays.md`, so a reader can tell a transcribed definition from one open.csr chose.

An efficacy display is qualified differently from a safety display: `Rscript qc/efficacy-reference.R` recomputes every published statistic from the vendored data without loading `{opencsr}` and compares it with both the committed ARDs and the study's own published values in `quality/data/efficacy-reference.json`. It exits non-zero on disagreement and CI runs it. That file is a transcription of a 2006 document — never rewrite it from a computation.

## Workspace conventions

This repo lives in the obot2 workspace — the parent `CLAUDE.md` and `.github/AGENTS.md` conventions apply: attribution lines at the bottom of drafted artifacts, no merges without @jwildfire's approval, worktrees for parallel branch work.
