# 01 — The Existing CSR-Automation and Clinical-Report-Automation Landscape

*Research for open.csr design doc. Compiled 2026-07-25. All package versions verified against CRAN metadata (crandb.r-pkg.org) on 2026-07-25.*

---

## 0. Framing: what a CSR actually is, and why automation is hard

A Clinical Study Report is structured by **ICH E3, "Structure and Content of Clinical Study Reports"** (adopted 1995; supplementary Q&A 2012) — 16 numbered sections plus Section 14 (in-text tables/figures) and Section 16 (appendices, including patient listings and narratives). See the [EMA scientific-guideline page for ICH E3](https://www.ema.europa.eu/en/ich-e3-structure-content-clinical-study-reports-scientific-guideline) and the [ECA summary](https://www.gmp-compliance.org/guidelines/gmp-guideline/ich-e3-structure-and-content-of-clinical-study-reports). **ICH E3 has not been revised** — unlike E6 (GCP), which reached R3 with EU applicability 23 July 2025 and Canadian implementation 1 April 2026 ([ACRP](https://acrpnet.org/2026/02/17/ich-e6r3-unpacked-diving-deep-into-the-impacts-of-the-guideline-changes)), and unlike M11 (protocol), whose enforcement begins June 2026. **The CSR is the last major regulatory document without a modern structured-content standard.** That is a strategically important fact for open.csr.

The de-facto content guidance layer above ICH E3 is **CORE Reference (Clarity and Openness in Reporting: E3-based)**, an open-access user manual published 2016 by EMWA/AMWA, with a Version 2 Terminology Table published 2019 ([Hamilton et al., *Research Integrity and Peer Review*, 2016](https://researchintegrityjournal.biomedcentral.com/articles/10.1186/s41073-016-0009-4); [V2 terminology critique of the TransCelerate CSR template, PMC6683477](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6683477/)). CORE Reference is explicitly **content guidance, not a template** — which leaves an unoccupied slot for a machine-readable, testable encoding of that guidance.

Scale of the problem, from the vendor-neutral survey at [IntuitionLabs](https://intuitionlabs.ai/articles/clinical-study-report-automation-ai-risks): median CSR ≈ **644 pages**; traditional authoring takes **3–6 months**; global medical-writing market ≈ **$3.6B (2021)**. A large share of that page count is Section 14/16 TFLs — i.e. **the document is mostly generated output wrapped in prose**, which is exactly the observation open.csr is built on.

---

## 1. Commercial CSR / medical-writing automation

### 1.1 Certara CoAuthor
The most feature-complete commercial analogue to open.csr's concept.

- Launched as CoAuthor 2023; **next-generation release 17 June 2024** ([press release](https://www.certara.com/pressrelease/certara-launches-next-generation-coauthor-generative-ai-regulatory-writing-software/)). Descends from **Synchrogenix Writer** (Certara acquired Synchrogenix 2017).
- [Product page](https://www.certara.com/coauthor/) claims: **275+ eCTD templates**, Microsoft Word extension, **structured content authoring** with a "permissions-governed repository of structured content", client-specific GPT with **proprietary RAG that references only allowed source data/text**, traceability and version control, **real-time preview**, and **">90% TLF accuracy with automated analysis and summarization of tables, listings, and figures"**.
- Critically for us: Certara advertises that CoAuthor "directly incorporates analysis datasets, CDISC data, tables, listings, and figures within a report, providing a real-time preview." Integrates with **Pinnacle 21** (Certara-owned) and **Veeva RIM**.
- Reported outcome: up to **40% productivity increase** for drafting and QC at an unnamed biotech.
- **What it does *not* do:** the TFLs are *ingested*, not *generated*. CoAuthor summarizes an existing TFL package; it does not own the code that produced the numbers, so a "change this table" request goes back to the statistical programming team on a separate cycle.

### 1.2 Yseop Copilot
- Hybrid/"composite AI": symbolic reasoning + templates + LLMs ([Yseop medical writing automation](https://yseop.com/medical-writing-automation/)). Named to **TIME Best Inventions 2025** ([TIME](https://time.com/collections/best-inventions-2025/7318458/yseop-copilot/)).
- Document packs: **CSR, Clinical Trial Narratives (CTN), Summary of Clinical Safety (2.7.4), Summary of Clinical Efficacy, Investigator's Brochure, ICF**, plus preclinical PK/PD/tox.
- Integrates into Word and Veeva. Adopters named publicly since 2023 launch: **Eli Lilly, Novartis, GSK, AstraZeneca**. Per the IntuitionLabs survey, Yseop has been involved in 150+ trials and **Novartis reportedly generated >10,000 AI-drafted reports in 2023**.
- Provenance heritage is NLG (Yseop began as a rule-based NLG company, pre-LLM) — its strength is deterministic, auditable sentence generation from structured inputs; its weakness is that the structured inputs must be hand-mapped per sponsor.

### 1.3 TriloDocs
- Closest philosophical cousin to open.csr on the *text* side. Generates a **first draft CSR in the TransCelerate template** (adaptable on request) from protocol + amendments + SAP + the TLF package ([EMWA sponsor page](https://emwa.org/sponsors/trilo-docs/); [GitHub org](https://github.com/TriloDocs)).
- Explicit design claim: **"no risk of hallucinations or 'making things up'"** — it extracts and re-expresses rather than free-generates, and creates in-text tables for key parameters.
- Roadmap: **Module 2.7.4 Summary of Clinical Safety and Investigator's Brochure landing Spring/Summer 2026**. Also does lay summaries, ICFs, patient narratives.
- Same structural limitation as CoAuthor: it consumes a finished TLF package.

### 1.4 Narrativa
- [CSR automation with "AI Agents"](https://www.narrativa.com/automation-of-clinical-study-reports/). Ingests **TLF and ADaM datasets** into a **knowledge graph**, then generates prose. Ships **clickable source tracing** — every generated text element links back to its data origin.
- Narrativa's click-to-trace is the single most relevant *feature* precedent for open.csr's traceability requirement, and IntuitionLabs argues bluntly that "any AI system lacking such features could be non-compliant."

### 1.5 Clinion CSR
- [Auto-generates ICH E3-compliant CSRs](https://www.clinion.com/csr-automation/) from protocol, SAP, and TLFs, as a module inside a full eClinical (EDC/CTMS) suite.
- Notable feature: **cross-checks values between narrative text and statistical tables**, auto-flagging discrepancies — a QC concern open.csr can solve structurally (the number in the sentence *is* the number in the ARD) rather than by after-the-fact reconciliation.

### 1.6 Structured content management platforms (the "SCM" layer)
- **Veeva Vault Submissions / Vault RIM** — end-to-end authoring, review, approval, and assembly of submission content explicitly including **clinical study reports** ([Veeva Submissions brief](https://www.veeva.com/resources/vault-submissions-product-brief/); [Veeva RIM](https://www.veeva.com/products/veeva-rim/)). Document-level reuse across plans/markets; 26R2 general release scheduled 7 August 2026. Veeva is the *system of record*, not a generator.
- **Docuvera** — [governance-first structured content platform](https://docuvera.com/) purpose-built for pharma; component-level create-once/reuse-everywhere, with each content block carrying metadata, source references, usage rules, and version history. This is essentially the commercial version of open.csr's **Text Library**, minus the code-generation link.
- **RWS Tridion Docs**, **DITA Exchange**, **MadCap** — DITA XML component authoring adapted to pharma; the schema acts as guardrails ("every Task must include a Safety Warning") ([RWS](https://www.rws.com/content-management/blog/intelligent-structured-content-and-dita-xml/); [DITA Exchange](https://ditaexchange.com/open-dita-lets-make-structured-writing-for-everyone/)).
- Also named in the landscape: **Lexoro** (RPA + NLG, 25,000-page projects), **Axtria** (~30% time reduction), ArisGlobal (safety/regulatory-ops focused, not CSR authoring), IQVIA (platform-level genAI).

### 1.7 Published evidence on LLM regulatory writing
The best public benchmark is **AutoIND** (Takeda + Weave), [arXiv:2509.09738](https://arxiv.org/abs/2509.09738):
- Task: eCTD **modules 2.6.2 / 2.6.4 / 2.6.6** nonclinical written summaries.
- Time: **~100 h → 3.7 h** for 18,870 pages / 61 reports (IND-1); **→ 2.6 h** for 11,425 pages / 58 reports (IND-2) — ~97% faster first draft.
- Quality (blinded scorer, 7 categories, 0–3 scale): **69.6% and 77.9%**; **no critical regulatory errors**; deficiencies concentrated in *emphasis, conciseness, clarity*.
- Conclusion: "expert regulatory writers remain essential to mature outputs to submission-ready quality."

**Read for open.csr:** the LLM's measured weakness is *judgment and emphasis*, not *fact assembly*. That argues for an architecture where facts come from code/ARDs (deterministic) and the LLM is confined to assembling and phrasing curated blocks — which is exactly the Text Library design.

---

## 2. Open-source efforts adjacent to CSR building

### 2.1 Roche/Genentech NEST (insightsengineering) — the TLG production layer
The most mature open-source TLG stack. From the [NEST landing page](https://insightsengineering.github.io/nest/):

| Package | Role | CRAN version (2026-07-25) |
|---|---|---|
| `rtables` | Declarative complex multi-level tabulation | 0.6.16 (2026-04-22) |
| `tern` | Clinical-trial statistical analysis layers | 0.9.11 (2026-07-17) |
| `rlistings` | Clinical data listings | — |
| `formatters` | Headers, footnotes, pagination | — |
| `chevron` | **Standard TLG templates** for clinical reporting, with data checks + script generation ([CRAN](https://cran.r-project.org/package=chevron), [GitHub](https://github.com/insightsengineering/chevron); maintainer Joe Zhu, Roche) | 0.2.13 (2026-07-17) |
| `autoslider.core` | Slide automation for TLFs ([CRAN](https://cran.r-project.org/package=autoslider.core)) | — |
| `teal` | Shiny interactive exploration framework | — |
| `cards` / `cardx` | ARD construction (now maintained under insightsengineering) | 0.8.1 / 0.3.4 (2026-07-06) |

Also: the [**TLG Catalog**](https://insightsengineering.github.io/tlg-catalog/) — a curated, executable catalog of tables, listings and graphs, open-sourced 2023; and the Biomarker Catalog. NEST supported **the first R-based submission to FDA** and won the Roche PD Breakthrough Award ([R Consortium](https://r-consortium.org/posts/clinical-reporting-roches-nest-and-admiral-teams/)).

**Strength:** industrial-grade, submission-proven table engine with a public catalog of standard displays. **Gap:** NEST stops at the *output object*. There is no document assembly, no ICH E3 structure, no prose, no report-level traceability manifest. `autoslider.core` proves the "assemble many outputs into a deliverable" pattern works — but the deliverable is a PowerPoint deck for internal review, not a CSR.

### 2.2 The ARD/ARS layer — the newest and most relevant substrate
- **CDISC Analysis Results Standard (ARS) v1.0, released April 2024** ([CDISC](https://www.cdisc.org/standards/foundational/analysis-results-standard/analysis-results-standard-v1-0); [model + user guide](https://cdisc-org.github.io/analysis-results-standard/); [GitHub](https://github.com/cdisc-org/analysis-results-standard)). ARS closes the long-standing gap that ADaM standardized *analysis data* but nothing standardized the link from a *table* back to that data. PHUSE US 2025 paper DS09 ("Selecting GeARS") catalogs implementation strategies from macro-library integration to fully automated TFL generation.
- R implementations: `cards` **0.8.1**, `cardx` **0.3.4**, `gtsummary` **2.5.1** (2026-05-30) — gtsummary was refactored to use cards/cardx as its backend, so you can extract an ARD *from* a table and build a table *from* an ARD ([ARD-first tables vignette](https://www.danieldsjoberg.com/gtsummary/articles/tbl_ard-functions.html)); `tfrmt` **0.4.0** (GSK) — a display-metadata language automating ARD → table; `siera` **0.5.6** (Clymb Clinical) — generates analysis programs *from ARS metadata*.
- This layer is **~2 years old and still consolidating**. It is the right substrate to build on, and it is early enough that a reference implementation carries outsized influence.

### 2.3 pharmaverse
- [pharmaverse.org](https://pharmaverse.org/) — the multi-company open-source clinical reporting ecosystem (originating from an R/Pharma 2021 talk). The [TLG page of the e2e clinical guide](https://pharmaverse.org/e2eclinical/tlg/) is the canonical recommendation set: rtables/chevron (Roche), Tplyr **1.3.3** (Atorus), gtsummary, tfrmt (GSK), tidytlg **0.12.0**, rlistings, ggsurvfit, cards/cardx, siera, plus **`docorator`** (GSK — headers/footers framing across file types) and **`gridify`** (headers/footers on tables and figures).
- [**pharmaverse examples**](https://pharmaverse.github.io/examples/) — a living collection of executable end-to-end examples from raw data → SDTM → ADaM → TLG, using `pharmaverseraw` / `pharmaversesdtm` / **`pharmaverseadam` 1.3.0** (2026-02-20). Includes "automated reporting of outputs via slides or docs."
- **Gap:** examples are per-output vignettes. There is **no pharmaverse example that assembles an ICH E3-structured document**.

### 2.4 R Consortium Submissions Working Group — the regulatory-credibility layer
From the [2026 plans post](https://r-consortium.org/posts/submissions-wg-2026/) and [WG site](https://rconsortium.github.io/submissions-wg/):

| Pilot | Focus | Status |
|---|---|---|
| Pilot 1 | R-based ADaM + TLF submission package, R scripts to FDA | Complete |
| Pilot 2 | **Shiny app** submitted to FDA | Complete |
| Pilot 3 | **ADaM datasets produced in R** submitted to FDA ([repo](https://github.com/RConsortium/submissions-pilot3-adam-to-fda)) | Complete |
| Pilot 4 | **Containers + WebAssembly (webR)** — first publicly available submission package containing a WebAssembly component; submitted Sept 2024; FDA reviewers *preferred* webR over Shiny for browser accessibility; container variant submitted Summer 2025, Windows-compat discussions ongoing | Complete/ongoing |
| Pilot 5 | **Dataset-JSON** replacing all XPT for ADaM+SDTM via `datasetjson` (0.3.0); submitted Fall 2025; FDA requested minor rework; **resubmitted January 2026**; Dataset-JSON v1.1 not yet in Pinnacle 21 so XPT used for validation | Resubmitted Jan 2026 |
| Pilot 6 | Expands ADaM + display program coverage; **incorporates AI and automation tools**; **no FDA submission planned** | Launched Jan 2026 |
| Pilot 7 | **Realistic simulated CDISC-aligned trial datasets** to fill benchmarking gaps "for modern R-based and AI-enabled workflows" | Launched Jan 2026 |

Also: FDA expanded eCTD file-format support for R packages through this collaboration. Supporting tooling: `pkglite` (bundle R packages into a submittable text file), `r2rtf` **1.3.1** (Merck), `logrx` 0.4.0 (execution logs for traceability).

**Note the shape:** every pilot submits *datasets, programs, and apps*. **None submits a report document.** Pilots 6 and 7 (AI + simulated data, both launched six months ago) are the working group publicly signalling exactly the territory open.csr occupies.

### 2.5 r4csr — the closest thing to a public CSR playbook
[**"R for Clinical Study Reports and Submission"**](https://r4csr.org/) — Zhang, Xiao, Anderson, Zhu (Merck). Organized around ICH E3 requirements, covering TLF delivery (disposition, populations, baseline, efficacy, AE), project management/setup, and eCTD submission. Built on `r2rtf` ([merck.github.io/r2rtf](https://merck.github.io/r2rtf/)) + pkglite.
**Limitation stated by the book itself:** it emphasizes creating **TLFs and submission documentation, not generating a complete CSR end-to-end**, and is labelled a work-in-progress draft. It is a *book*, not a runnable library or app.

### 2.6 TransCelerate — the template/content-reuse layer
From the [Clinical Content & Reuse assets page](https://www.transceleratebiopharmainc.com/assets/clinical-content-reuse-solutions/):

| Asset | Latest version | Notes |
|---|---|---|
| Common Protocol Template (CPT) | **V011 (2026)** | Basic Word Edition aligned with finalized **ICH M11** and synchronized with **USDM** |
| SAP template | V005 (2024) | Basic Word + eSAP |
| **CSR template** | **V005 (2024)** | Basic Word + eCSR; **mapped to ICH E3 and CORE Guidance** |
| eTemplates (eCPT/eSAP/eCSR) | 2024 release (**final** update) | Word + add-in; **source code publicly available under an open-source license agreement** |
| Participant/TA libraries, master protocol templates (EU-PEARL) | 8 active versions | — |

Two facts matter enormously for open.csr: (1) there **is** a free, ICH E3-mapped CSR Word template with reusable content — the raw material for a Text Library; (2) the **eTemplate program was frozen after the 2024 release** and the eCSR add-in source is not discoverable as a public GitHub repo (TransCelerate's [GitHub org](https://github.com/transcelerate) hosts 8 repos, all DDF/CDISC-rules-engine, none eCSR). **The industry's structured-CSR effort has stalled at a Word macro.**

Related TransCelerate work: **Digital Data Flow (DDF)** with CDISC, built on the **Unified Study Definitions Model (USDM)** ([TransCelerate](https://www.transceleratebiopharmainc.com/initiatives/digital-data-flow/); [CDISC DDF](https://www.cdisc.org/ddf)); a DDF Solution Showcase was co-hosted with CDISC in **April 2026**. DDF digitizes the *protocol* end of the lifecycle; nothing equivalent exists at the *report* end.

### 2.7 OpenStudyBuilder (Novo Nordisk) — the model to emulate organizationally
[openstudybuilder.com](https://www.openstudybuilder.com/) / [DDF context](https://novo-nordisk.gitlab.io/nn-public/openstudybuilder/project-description/info_ddf/) / [GitHub](https://github.com/NovoNordisk-OpenSource/openstudybuilder-description).
- Open-source, metadata-driven study definition tool; **~300 production users at Novo Nordisk**, external contributions from Boehringer Ingelheim.
- Grounded in **CDISC 360i, TransCelerate DDF with USDM 4.0, and ICH M11**. DDF API v3 endpoint implements USDM 2.7.1 (from v0.9); USDM v3 expected v0.10/0.11. Exports **USDM-compliant JSON or M11-formatted HTML** protocol documents.
- **This is the single best precedent for open.csr**: a sponsor-originated open-source project that owns one document type end-to-end, anchors on a public standard, and produces a real document artifact. OpenStudyBuilder did it for the **protocol**; the **CSR** slot is empty.

### 2.8 Other adjacent open source
- **clinDataReview** (UCB) — validated open-source interactive medical/safety monitoring reports; notable for its explicit *validation + CI + traceability* framing ([PMC11271019](https://pmc.ncbi.nlm.nih.gov/articles/PMC11271019/)).
- **grstat** — academic oncology CTU standardized statistical reporting toolbox with reporting templates in beta ([arXiv:2601.13755](https://arxiv.org/pdf/2601.13755)).
- **Quarto** (`quarto` R pkg 1.5.1) / **officer 0.7.6** / **officedown 0.4.1** / **flextable 0.10.0** — the generic document-assembly substrate. Widely used for reproducible reports; **no published CSR-specific Quarto pipeline exists as a maintained open-source project.** Note officedown is the least actively maintained of the set (last release 2025-05-20), which is a dependency-risk consideration.
- **Explicit search finding:** as of July 2026, searching GitHub and the web for an open-source project that calls itself a CSR builder returns **nothing** — only vendor pages and generic Quarto/publishing tooling. There is no incumbent to displace.

---

## 3. Gap-analysis table

Legend: ●●● strong / ●●○ partial / ●○○ weak / ○○○ absent.

| Capability | Certara CoAuthor | Yseop Copilot | TriloDocs | Narrativa | Veeva/Docuvera (SCM) | NEST / chevron | pharmaverse + ARD stack | R Consortium pilots | TransCelerate eCSR | r4csr | OpenStudyBuilder | **open.csr target** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Generates TFLs from data** | ○○○ (ingests) | ○○○ | ○○○ | ○○○ | ○○○ | ●●● | ●●● | ●●● | ○○○ | ●●● | ○○○ | **●●●** |
| **TFL source code is the artifact of record** | ○○○ | ○○○ | ○○○ | ○○○ | ○○○ | ●●● | ●●● | ●●● | ○○○ | ●●● | ●●○ | **●●●** |
| **User change request → code edit → regenerate** | ●○○ (edits prose only) | ●○○ | ●○○ | ●○○ | ○○○ | ●○○ (dev loop, not user loop) | ●○○ | ○○○ | ○○○ | ○○○ | ●●○ | **●●●** |
| **ARD/ARS-native (CDISC ARS v1.0)** | ●○○ | ○○○ | ○○○ | ●○○ (knowledge graph) | ○○○ | ●●○ (cards/cardx) | ●●● | ●●○ | ○○○ | ●○○ | n/a (USDM) | **●●●** |
| **ICH E3 document structure encoded** | ●●● (templates) | ●●● | ●●● (TransCelerate tmpl) | ●●○ | ●●○ | ○○○ | ○○○ | ○○○ | ●●● (Word) | ●●○ (book only) | n/a (M11) | **●●●** |
| **Reusable prose/text block library** | ●●● | ●●● | ●●○ | ●●○ | ●●● | ○○○ | ○○○ | ○○○ | ●●○ | ○○○ | ●●○ (protocol) | **●●●** |
| **LLM assistance for prose** | ●●● | ●●● | ●●● | ●●● | ●●○ | ○○○ | ○○○ | ●○○ (Pilot 6) | ○○○ | ○○○ | ○○○ | **●●○ (bounded)** |
| **End-to-end traceability data→ARD→display→document** | ●●○ | ●○○ | ●●○ | ●●● (click-to-trace) | ●○○ | ●○○ | ●●○ | ●●○ (logrx) | ○○○ | ●○○ | ●●○ | **●●●** |
| **Every iteration versioned & reproducible** | ●●○ (doc versions) | ●○○ | ●○○ | ●○○ | ●●● (doc versions) | ●●● (git) | ●●● | ●●● | ○○○ | ●●● | ●●● | **●●●** |
| **Published test/QC evidence per component** | ○○○ (vendor validation) | ○○○ | ○○○ | ○○○ | ○○○ | ●●○ (unit tests) | ●●○ | ●●● (FDA-reviewed) | ○○○ | ●○○ | ●●○ | **●●●** |
| **Requirements matrix ↔ evidence linkage** | ○○○ | ○○○ | ○○○ | ○○○ | ○○○ | ○○○ | ○○○ | ●○○ (ADRG) | ○○○ | ○○○ | ●○○ | **●●●** |
| **Open source / inspectable** | ○○○ | ○○○ | ○○○ | ○○○ | ○○○ | ●●● | ●●● | ●●● | ●●○ (add-in src, frozen) | ●●● | ●●● | **●●●** |
| **Free public demo on real ADaM data** | ○○○ | ○○○ | ○○○ | ○○○ | ○○○ | ●●○ (TLG Catalog) | ●●○ (examples site) | ●●○ (pilot repos) | ○○○ | ●●○ | ●●○ | **●●●** |
| **Assembles a complete CSR document** | ●●● | ●●● | ●●● | ●●● | ●●○ (assembly, not generation) | ○○○ | ○○○ | ○○○ | ●●○ (manual) | ○○○ | ○○○ (protocol) | **●●●** |

### Reading the table: the two halves never meet

The landscape splits cleanly and the split is the whole opportunity:

- **The right half (open source)** owns *number generation* — code-first, versioned, tested, FDA-exercised — and stops at the output object. **Nothing open source assembles a CSR.**
- **The left half (commercial)** owns *document assembly and prose* — ICH E3 templates, content reuse, LLM drafting — and treats the TFL package as an opaque, already-final input. **Nothing commercial owns the code that made the numbers.**

The seam between them is exactly where CSR pain lives: a reviewer says "split this table by baseline severity," and today that becomes a ticket to a statistical programmer, a new TFL package, a re-import into the authoring tool, and a re-reconciliation of every number quoted in prose. Clinion's headline feature — cross-checking numbers between text and tables — is a *symptom* of that seam. Narrativa's click-to-trace is a *patch* over it.

**open.csr's genuine gap: it is the only design in which the change request, the code edit, the regenerated number, and the sentence that quotes it are the same versioned transaction.** Nobody occupies this. Three supporting gaps make it defensible:

1. **No open-source ICH E3 document model.** TransCelerate's eCSR is Word + a frozen add-in; CORE Reference is prose guidance; ICH E3 itself has never been revised. A machine-readable, testable E3 section model with slots for TFLs and text blocks does not exist in public.
2. **No public reference implementation of ARS v1.0 → display → document.** ARS is 2 years old; `siera`, `cards`, `tfrmt` each do a segment; nobody has published the chain end to end with evidence.
3. **No published test-evidence framework for a report-generation system.** The R Consortium pilots produce ADRGs; NEST produces unit tests; commercial vendors produce vendor validation packages behind an NDA. A public requirements-matrix + per-component evidence site (the safety.viz pattern) applied to a CSR builder would be the first of its kind — and is the credibility mechanism that lets an open-source project be taken seriously against validated commercial tools.

### Positioning summary (one line each)

- vs **CoAuthor/Yseop/TriloDocs/Narrativa**: they draft prose around *your* TFLs; open.csr owns the TFLs, so "change the table" is a code edit, not a new vendor cycle.
- vs **NEST/chevron/pharmaverse**: they stop at the display; open.csr adds the E3 document model, the text layer, and the assembly.
- vs **R Consortium pilots**: they prove R-generated *data and programs* pass FDA review; open.csr extends the same evidence discipline to the *document*.
- vs **TransCelerate CC&R**: it provides the ICH E3-mapped template as a frozen Word asset; open.csr makes it live, executable, and diffable.
- vs **OpenStudyBuilder**: it did this for the protocol via USDM/M11; open.csr does it for the CSR via ARS/E3.

---

## 4. Concrete assets open.csr can adopt or must not duplicate

| Adopt | Why |
|---|---|
| `cards` 0.8.1 / `cardx` 0.3.4 / `gtsummary` 2.5.1 / `tfrmt` 0.4.0 | The ARD spine; gtsummary is ARD-round-trippable both directions |
| `pharmaverseadam` 1.3.0 | Public ADaM demo data with no licensing friction |
| CDISC ARS v1.0 model ([GitHub](https://github.com/cdisc-org/analysis-results-standard)) | The metadata contract for "what analysis produced this display" |
| TransCelerate CSR Template V005 + CORE Reference | Free, ICH E3-mapped section skeleton and content guidance to encode as the Text Library taxonomy |
| `siera` 0.5.6 | Prior art for generating analysis programs *from* ARS metadata |
| `logrx` 0.4.0 | Established execution-log/traceability convention from the submissions community |
| `docorator` / `gridify` | Header/footer framing already solved in pharmaverse |
| Quarto (`quarto` 1.5.1) + `officer` 0.7.6 / `flextable` 0.10.0 / `r2rtf` 1.3.1 | Document assembly; r2rtf specifically for submission-grade RTF |
| The **TLG Catalog** display taxonomy | A ready-made naming/organization scheme for the TFL Library |

| Do not duplicate | Reason |
|---|---|
| Table-layout engines | rtables/gt/flextable are mature and submission-proven |
| A new ADaM or ARD standard | ADaM + ARS v1.0 exist; deviating destroys the traceability story |
| A protocol/study-definition model | OpenStudyBuilder + USDM own that end |
| A document management system | Veeva owns the system-of-record layer; integrate, don't compete |
| A general-purpose LLM writing assistant | AutoIND shows the marginal value is in *bounding* the LLM, not in the LLM |

---

## Sources

- [Certara CoAuthor product page](https://www.certara.com/coauthor/) · [Next-gen CoAuthor press release (17 Jun 2024)](https://www.certara.com/pressrelease/certara-launches-next-generation-coauthor-generative-ai-regulatory-writing-software/)
- [Yseop Medical Writing Automation](https://yseop.com/medical-writing-automation/) · [TIME Best Inventions 2025: Yseop Copilot](https://time.com/collections/best-inventions-2025/7318458/yseop-copilot/)
- [TriloDocs (EMWA sponsor profile)](https://emwa.org/sponsors/trilo-docs/) · [TriloDocs GitHub](https://github.com/TriloDocs)
- [Narrativa CSR automation](https://www.narrativa.com/automation-of-clinical-study-reports/) · [Clinion CSR automation](https://www.clinion.com/csr-automation/)
- [Veeva Vault Submissions brief](https://www.veeva.com/resources/vault-submissions-product-brief/) · [Veeva RIM](https://www.veeva.com/products/veeva-rim/) · [Docuvera](https://docuvera.com/)
- [IntuitionLabs: CSR Automation — AI Opportunities & Risks](https://intuitionlabs.ai/articles/clinical-study-report-automation-ai-risks)
- [AutoIND / Human-AI collaboration in regulatory writing (arXiv:2509.09738)](https://arxiv.org/abs/2509.09738)
- [NEST](https://insightsengineering.github.io/nest/) · [TLG Catalog](https://insightsengineering.github.io/tlg-catalog/) · [chevron on CRAN](https://cran.r-project.org/package=chevron) · [chevron GitHub](https://github.com/insightsengineering/chevron) · [autoslider.core on CRAN](https://cran.r-project.org/package=autoslider.core)
- [R Consortium: NEST & admiral clinical reporting](https://r-consortium.org/posts/clinical-reporting-roches-nest-and-admiral-teams/)
- [R Submissions WG: 2026 plans & 2025 success](https://r-consortium.org/posts/submissions-wg-2026/) · [Submissions WG site](https://rconsortium.github.io/submissions-wg/) · [submissions-wg GitHub](https://github.com/RConsortium/submissions-wg) · [Pilot 3 repo](https://github.com/RConsortium/submissions-pilot3-adam-to-fda)
- [CDISC Analysis Results Standard v1.0](https://www.cdisc.org/standards/foundational/analysis-results-standard/analysis-results-standard-v1-0) · [ARS model site](https://cdisc-org.github.io/analysis-results-standard/) · [ARS GitHub](https://github.com/cdisc-org/analysis-results-standard) · [PHUSE US 2025 DS09 "Selecting GeARS"](https://www.lexjansen.com/phuse-us/2025/ds/PAP_DS09.pdf)
- [pharmaverse](https://pharmaverse.org/) · [e2e clinical TLG guidance](https://pharmaverse.org/e2eclinical/tlg/) · [pharmaverse examples](https://pharmaverse.github.io/examples/) · [gtsummary ARD-first tables](https://www.danieldsjoberg.com/gtsummary/articles/tbl_ard-functions.html)
- [r4csr — R for Clinical Study Reports and Submission](https://r4csr.org/) · [r2rtf](https://merck.github.io/r2rtf/)
- [TransCelerate Clinical Content & Reuse assets](https://www.transceleratebiopharmainc.com/assets/clinical-content-reuse-solutions/) · [TransCelerate DDF](https://www.transceleratebiopharmainc.com/initiatives/digital-data-flow/) · [CDISC DDF](https://www.cdisc.org/ddf) · [TransCelerate GitHub](https://github.com/transcelerate)
- [OpenStudyBuilder](https://www.openstudybuilder.com/) · [OpenStudyBuilder DDF context](https://novo-nordisk.gitlab.io/nn-public/openstudybuilder/project-description/info_ddf/) · [OpenStudyBuilder GitHub](https://github.com/NovoNordisk-OpenSource/openstudybuilder-description)
- [ICH E3 (EMA)](https://www.ema.europa.eu/en/ich-e3-structure-content-clinical-study-reports-scientific-guideline) · [ICH E3 (ECA Academy)](https://www.gmp-compliance.org/guidelines/gmp-guideline/ich-e3-structure-and-content-of-clinical-study-reports)
- [CORE Reference development paper (Res Integr Peer Rev, 2016)](https://researchintegrityjournal.biomedcentral.com/articles/10.1186/s41073-016-0009-4) · [CORE Reference V2 terminology / TransCelerate CSR template critique](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6683477/)
- [clinDataReview (PMC11271019)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11271019/) · [grstat (arXiv:2601.13755)](https://arxiv.org/pdf/2601.13755)
- [ICH E6(R3) impacts (ACRP, Feb 2026)](https://acrpnet.org/2026/02/17/ich-e6r3-unpacked-diving-deep-into-the-impacts-of-the-guideline-changes)
