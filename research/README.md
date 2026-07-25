# open.csr — Design Research

Background research feeding the open.csr design document. Five sections, compiled 2026-07-25, covering the competitive landscape, the CDISC ARS/ARD substrate, pharmaverse TLG production practice, CSR document standards and agentic writing, and the safety.viz evidence framework to port. All claims carry inline source URLs in the section files.

## Executive summary

**What exists.** The ecosystem splits cleanly in two and the halves never meet.

The **open-source half** owns *number generation*: Roche/Genentech NEST (`rtables` 0.6.16, `tern` 0.9.11, `chevron`, the [TLG Catalog](https://insightsengineering.github.io/tlg-catalog/)), the ARD stack (`cards` 0.8.1 / `cardx` 0.3.4 / `gtsummary` 2.5.1 / `tfrmt` 0.4.0 / `siera` 0.5.6), `r2rtf` 1.3.1 for submission RTF, `pharmaverseadam` 1.3.0 for public ADaM, and `pharmaverse/cardinal` implementing FDA's Standard Safety Tables & Figures. It is code-first, versioned, tested and FDA-exercised — and it **stops at the output object**.

The **commercial half** owns *document assembly and prose*: Certara CoAuthor, Yseop Copilot, TriloDocs, Narrativa, Clinion, over Veeva/Docuvera content management. It has ICH E3 templates, reusable content blocks and LLM drafting — and it treats the TFL package as an opaque, already-final input. Merck's internal genAI CSR platform (180h → 80h first draft, ~50% fewer errors) proves AI-drafted CSRs are already in submissions; AutoIND ([arXiv:2509.09738](https://arxiv.org/abs/2509.09738)) and Pfizer's LLM challenge ([JAMIA Open 2024;7(2):ooae043](https://academic.oup.com/jamiaopen/article/7/2/ooae043/7685047)) show the measured weakness is judgment and emphasis, not fact assembly.

**What's missing.** Four public gaps, each independently defensible:

1. **The closed loop.** Nobody makes the change request, the code edit, the regenerated number and the sentence quoting it one versioned transaction. Clinion's headline feature (cross-checking numbers between text and tables) is a *symptom* of that seam; Narrativa's click-to-trace is a *patch* over it.
2. **No open-source machine-readable ICH E3 document model.** E3 (1995) has never been revised; CORE Reference is prose guidance; TransCelerate's eCSR is a Word add-in whose 2024 release was its last. ICH M11 gave protocols a structured standard — **there is no M11 analogue for the CSR**.
3. **No public reference implementation of ARS v1.0 → display → document.** ARS is ~2 years old; `siera`, `cards`, `tfrmt` each own a segment; nobody has published the chain end-to-end with evidence.
4. **No published test-evidence framework for a report generator.** Pilots produce ADRGs, NEST produces unit tests, vendors produce NDA-gated validation packages.

**What to build on.** ICH E3 (16 sections; §14 TFL block, §16.2 listings, §16.1.9 statistical-methods slot) + CORE Reference + the free TransCelerate CSR Template V005 for the document model. CDISC **ARS v1.0** for analysis/display metadata (`ReportingEvent` → `Analysis` → `Output` → `OutputDisplay`, plus the 7-value `DisplaySectionTypeEnum`). `{cards}` as the runtime ARD container, `{tfrmt}` JSON for display metadata, `{r2rtf}` for submission output. FDA ST&F table numbers and chevron IDs (`AET01`, `DMT01`, `LBT06`) as display identity. `pharmaverseadam` (CDISCPILOT01) as demo data. FDA sdTCG / PHUSE ADRG / Analysis Results Metadata for traceability deliverables. EMA's AI reflection paper §2.3.5, FDA's Jan-2025 draft AI guidance (7-step credibility framework) and the joint FDA–EMA Guiding Principles (Jan 2026) for LLM guardrails. Organisationally, **OpenStudyBuilder** is the model: sponsor-originated open source owning one document type end-to-end against a public standard — it did the protocol; the CSR slot is empty.

> **Version caveat.** Sections 02–03 report locally installed versions (`cards` 0.6.1, `gtsummary` 2.3.0, `tfrmt` 0.1.3, `pharmaverseadam` 1.1.0) alongside current CRAN (0.8.1 / 2.5.1 / 0.4.0 / 1.3.0) — pin against CRAN. Also unresolved: the **ARS v1.0 release date** (CDISC says 19 Apr 2024; GitHub releases say 19 Apr 2025). Settle it before it appears in a submission-facing document.

## Document map

| # | Section | Covers |
|---|---|---|
| 01 | [The existing CSR-automation landscape](sections/01_existing-tools.md) | Commercial tools (CoAuthor, Yseop, TriloDocs, Narrativa, Clinion, Veeva/Docuvera); open-source adjacents (NEST, pharmaverse, r4csr, TransCelerate, OpenStudyBuilder); R Consortium pilots 1–7; a 14-row gap-analysis table; adopt / don't-duplicate lists |
| 02 | [CDISC ARS and the ARD ecosystem](sections/02_ars-ard-standards.md) | ARS v1.0 class hierarchy; the `{cards}` data model (verified locally); `{cardx}`; `{gtsummary}` round-trip; `{tfrmt}` plan objects and its differing ARD dialect; `{siera}` code generation; the traceability chain; ARD-based QC vs double programming; ARS↔cards divergence table |
| 03 | [Pharmaverse TLG practice / "FDA submission level"](sections/03_tlg-pharmaverse-practice.md) | The four layers of submission quality; FDA ST&F + `{cardinal}` catalog; package landscape with CRAN versions; TLG Catalog + chevron IDs; `pharmaverseadam` contents and gaps; the standard CSR TFL set mapped to E3; the r2rtf grammar; precision/rounding; pilots 1–7 and FDA feedback; verified eCTD folder shape; ADRG expectations |
| 04 | [CSR document structure, writing standards, agentic writing](sections/04_csr-document-standards.md) | ICH E3's 16 sections and §14/§16 substructure; the in-text/post-text three-level rule; real SAP Appendix-C numbering; CORE Reference; TransCelerate CC&R and its documented critique; eCTD Module 5.3.5; Merck/Pfizer/EMA/FDA evidence on LLM writing; QC practice; a minimal 16-heading / 13-display demo skeleton; the 3-tier text-block taxonomy |
| 05 | [The safety.viz evidence framework](sections/05_safetyviz-evidence-framework.md) | The requirements-matrix → test-name → `evidence.json` → static-page loop (~590 lines of tooling); screenshot-as-baseline-as-evidence; drift guards; three-tier Pages publishing; the gsm.safety/qcthat R precedent; a porting guide with file list, ID scheme and sequencing |

## Implications for the open.csr design

### Positioning and scope

- **The differentiator is the closed loop**: change request → code edit → regenerated number → updated sentence as ONE versioned transaction. Every other tool breaks at the TFL handoff. Lead with this, not with "AI writes your CSR."
- **Do not build**: a table-layout engine (rtables/gt/flextable are submission-proven), a new ADaM or ARD standard, a study-definition model (USDM/OpenStudyBuilder's turf), a document management system (integrate with Veeva, don't compete), or a general-purpose LLM writing assistant.
- **Treat `pharmaverse/cardinal` as an upstream ally** for the TFL Library, and frame the narrative against the R Consortium pilot arc — pilots proved R-generated *data and programs* pass FDA review; open.csr extends the same evidence discipline to the *document*. Watch Pilots 6 (AI/automation) and 7 (simulated data) for collaboration or collision.

### Analysis layer — ARS as spec, cards as runtime

- **Standardize on ARS as the git-tracked specification/exchange schema and `{cards}` as the runtime results container.** Write one tested adapter each way; do not force either to be both.
- **Build ARD-first** (`cards`/`cardx` → `gtsummary`/`tfrmt`), not rtables/tern: it is the only path aligned to ARS v1.0, and it yields per-statistic `warning`/`error` records for free — which *is* the "test evidence for every component" requirement.
- **Close the population/filter gap `cards` leaves open**: add `analysis_id`, `output_id`, `analysis_set_id`, `data_subset_id` columns (or ARD-level attributes) to every ARD, so an orphaned ARD is still interpretable.
- **Own an ARD serialization schema** (Parquet + JSON manifest carrying input dataset hashes and package versions). `cards::as_nested_list()` is Experimental and lossy and there is no `ard_to_json()`. Express formatting declaratively (digits / `resultPattern`) — `fmt_fun` closures do not serialize.
- **Implement the writer change-request loop as**: edit ARS metadata → regenerate the `cards` script (siera-style templating) → rerun → new ARD → new display, **committing the generated script** so every stage produces a reviewable git diff.
- **Own the `shuffle_ard()` → tfrmt mapping** (group/label/param/value/column/ord) as a tested, first-class component. It is unstandardized hand-rolled glue everywhere else, and `tfrmt` is still pre-1.0.

### Display layer

- **Persist each TFL as two diffable artifacts**: an ARS/ARD spec (the analysis) and `tfrmt` JSON (the display, via `tfrmt_to_json()`/`json_to_tfrmt()`). This makes "change → regeneration" mechanical and every saved iteration a reviewable diff.
- **Adopt ARS `DisplaySectionTypeEnum` verbatim** (Header, Title, Rowlabel Header, Legend, Abbreviation, Footnote, Footer) as the display-furniture vocabulary shared by the Text Library and Report Template Library — the `Footer` type is explicitly for source-program traceability, matching the "every TFL from version-controlled code" principle.
- **Key the TFL Library and requirements matrix on recognized regulatory IDs** — FDA ST&F table numbers (via `cardinal`) plus chevron IDs (`AET01`, `DMT01`, `LBT06`…) — so every display carries an identifier an FDA reviewer or sponsor statistician already knows.
- **Make `r2rtf` the submission-grade output path** (it owns orientation, page size, `nrow` pagination, titles/sublines/footnotes/source lines, and `assemble_rtf`/`assemble_docx`). Treat `gt::as_rtf` as preview-only; do not depend on `pharmaRTF` (unmaintained since 2021).
- **Encode precision declaratively** (`tfrmt_sigdig`: min/max at collected precision, mean and median +1 dp, SD/SE +2 dp, capped at 3) and make **half-up rounding a required regression test** — R's banker's rounding is a known R-vs-SAS discrepancy that will surface in any submission-quality comparison.
- **Require study number, analysis set/population, and data cut-off in every display header/footer** — this satisfies both ICH E3's "identify the set of patients" rule and the regulator expectation the CORE Reference critique of TransCelerate flagged.
- **Never let display code touch subject-level data** (`tbl_ard_summary`/`tfrmt` both allow this), and use `cards::mock_*()` + `tfrmt::make_mock_data()` for shell-first review of TFLs and E3 text before data exist.

### Document model

- **Encode ICH E3 as a machine-readable, testable, diffable document model**, seeded from the free TransCelerate CSR Template V005 + CORE Reference taxonomy (mirror structure and numbering, not their text — confirm licensing). This artifact does not exist in public and is the single highest-leverage thing open.csr can publish.
- **Model the CSR as 16 E3 sections with stable display slugs** (`t-ae-overall`) carrying an *assignable* 14.x position, so renumbering is a build step rather than a refactor — SAPs explicitly tolerate number drift during programming.
- **Make display metadata mirror the real SAP Appendix-C index** (number, title, analysis set, comment) and the ARS `ReportingEvent`/`Analysis`/`Output` model, not an ad hoc schema.
- **Generate in-text and post-text variants of every display from one ARD**, and make their consistency an automated test — the cleanest demonstration of "regenerate, don't re-author." Make cross-reference resolution a CI gate alongside it.
- **Auto-generate §16.1.9 as a provenance appendix** (code versions, ARD hashes, session info). E3 already reserves that slot, turning the traceability claim into an inspectable artifact.
- **Ship a 13-display / 16-heading minimal skeleton** over `pharmaverseadam`, with §13 Discussion and §14.3.3 patient narratives as the flagship agentic sections.

### Text Library and the LLM boundary

- **Bound the LLM to assembling and phrasing curated blocks**, never to free-generating facts. AutoIND's evidence says the marginal value is in constraining the model, not in the model itself; Pfizer's challenge adds: never make the LLM read a rendered table — feed it the ARD.
- **Three explicit reuse tiers** — fixed boilerplate, parameterised, generated+reviewed — each block carrying version, approval state, source ARD IDs, model/prompt version, and a disclosure/anonymisation flag (EMA Policy 0070 and CTR Art. 37 make that first-class).
- **Gate LLM prose in CI on numeric fidelity** (no number in text that is not in the referenced ARD) plus cross-reference resolution — this operationalises the Pfizer challenge's factual-accuracy and provenance scores and the EMA's "quality review mechanisms" language.

### Evidence framework (ported from safety.viz)

- **Make the published requirements-matrix + per-component evidence site a first-class deliverable.** It would be the first public validation-evidence framework for a report generator, and is the credibility mechanism against NDA-gated vendor validation packages.
- **Fix the requirement-ID scheme (`TFL-`/`DSP-`/`TXT-`/`RPT-`/`TRC-`/`QC-`) and zero-padding BEFORE writing tests.** Never re-split an ID after tests cite it; avoid IDs shared across modules (they resolve in only one extract).
- **Add `qc/run-tests.R`** (testthat `ListReporter` → JSON) plus a `normalizeTestthat` alongside `normalizeVitest`/`normalizePlaywright`, and extend `moduleForFile` with `tests/testthat/test-<id>-*.R → <id>`.
- **Ship convention guard tests in BOTH stacks on day one** (R: parse `test_that()` names; JS: parse `test()`/`it()` titles) requiring an ID prefix and a trailing `(#N)`.
- **Make the primary TFL evidence artifact a committed ARD snapshot** (`docs/evidence/<display>/<REQID>-ard.csv` via `expect_snapshot_value`) — value-level, diffable, immune to font/renderer noise — with the rendered PNG/RTF beside it. **ARD equality is the QC gate**: diff on `(variable, variable_level, group*, stat_name)` with tolerance on `stat`, replacing document-level double-programming comparison.
- **Extend the evidence record with a `traceability` object** (`adamDataset`/`adamHash`, `ardFile`/`ardHash`, `displayFile`, `sourceScript`, `sourceCommit`) to render the promised data → ARD → display → document chain.
- **Put R + package versions (`sessionInfo`) in the `environment` provenance block**, and refresh all baselines only via a `workflow_dispatch` evidence-update job on the canonical Linux runner.
- **Add the unresolved-ID report safety.viz lacks**: warn at build time when coverage IDs resolve no requirement text, so exact-match failures surface instead of silently degrading.
- **Model medical-writer review of `TXT-*` blocks as its own suite** (`suite: "text-review"`, or `reviewedBy`/`reviewedAt` fields) so one evidence page carries both automated and human sign-off evidence.
- **Emit traceability as a product output, not documentation debt**: auto-generate ARM-style analysis metadata and per-TFL ADRG fragments (computing environment, package inventory, expected warnings, execution steps), modeled on the public Pilot 4 ADRG — FDA's #1 feedback theme across the pilots.

### Demo and data

- **Demo on `pharmaverseadam` 1.3.0 (CDISCPILOT01) in a fully public repo** so the whole chain is inspectable. Free public demos on real ADaM data are absent across every commercial vendor and are open.csr's cheapest credibility win.
- **Plan explicitly around the efficacy gap**: `pharmaverseadam` has no CDISCPILOT01 efficacy ADaM. Derive an `adadas` from `pharmaversesdtm` QS (or vendor the R Consortium pilot ADaM), and derive `ITTFL`/`EFFFL`/`COMPLFL` plus screen-failure exclusion (52 subjects) in a documented, tested data-prep layer rather than assuming the flags exist.
- **Ship as a static GitHub Pages site** and mirror the verified eCTD shape in its export bundle (`m5/datasets/<study>/analysis/adam/{datasets,programs}`, lowercase `.r` program files, `renv-lock.txt`, `adrg.pdf` beside the datasets) — Pilot 4 showed FDA reviewers prefer browser-only delivery over containers.
