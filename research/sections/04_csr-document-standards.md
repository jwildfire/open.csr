# CSR Document Structure, Medical-Writing Standards, and Agentic Writing

Research input for the **open.csr** design document. Focus: what a Clinical Study Report
actually *is* as a structured artifact, which parts are text vs. TFL, how industry
templates and content libraries work today, and what regulators currently expect when an
LLM touches any of it.

Date of research: 2026-07-25. All claims carry inline source URLs.

---

## 1. ICH E3: the canonical skeleton

**Source of truth:** *ICH Harmonised Tripartite Guideline E3 — Structure and Content of
Clinical Study Reports*, Step 4 adopted **30 November 1995**
([ICH PDF](https://database.ich.org/sites/default/files/E3_Guideline.pdf),
[EMA page](https://www.ema.europa.eu/en/ich-e3-structure-content-clinical-study-reports-scientific-guideline),
[FDA page](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/e3-structure-and-content-clinical-study-reports)).
Supplemented by *E3 Questions & Answers (R1)*
([ICH PDF](https://database.ich.org/sites/default/files/E3_Q&As_R1_Q&As.pdf)), which
stresses that E3 "is a Guideline, not a set of rigid requirements" and that structural
adaptation improving communication is encouraged.

E3 has never been revised — there is no E3(R1) guideline, only the Q&A. Thirty years of
practice have accreted *around* a 1995 document. That is the central fact for open.csr:
the structure is stable, universally recognised, and free to implement.

### The 16 sections (verbatim headings)

| # | Section | Nature |
|---|---------|--------|
| 1 | Title Page | Metadata (14 required fields, incl. protocol ID, phase, GCP statement, dates) |
| 2 | Synopsis | Text + numeric results; "usually limited to 3 pages"; Annex I gives an example |
| 3 | Table of Contents for the Individual Clinical Study Report | Generated |
| 4 | List of Abbreviations and Definition of Terms | Library-managed |
| 5 | Ethics (5.1 IEC/IRB, 5.2 Ethical Conduct, 5.3 Patient Information and Consent) | Boilerplate text |
| 6 | Investigators and Study Administrative Structure | Text + cross-ref to 16.1.4 |
| 7 | Introduction | Text (product/indication rationale) |
| 8 | Study Objectives | Text (reused from protocol) |
| 9 | Investigational Plan (9.1–9.8) | Text + schedule-of-assessments in-text figure/table |
| 10 | Study Patients (10.1 Disposition, 10.2 Protocol Deviations) | Text + in-text tables + 14.1/16.2 refs |
| 11 | Efficacy Evaluation (11.1–11.4.7) | Text + in-text tables + heavy 14.2 refs |
| 12 | Safety Evaluation (12.1–12.6) | Text + in-text tables + heavy 14.3/16.2 refs |
| 13 | Discussion and Overall Conclusions | Pure narrative (the hardest LLM target) |
| 14 | **Tables, Figures and Graphs Referred to but not Included in the Text** | Post-text TFL block |
| 15 | Reference List | Bibliography |
| 16 | Appendices (16.1–16.4) | Documents + patient-level listings |

Section 9 detail worth noting for a builder: 9.4.1–9.4.8 (treatments, identity of IP,
assignment method, dose selection, blinding, prior/concomitant therapy, compliance),
9.5.1–9.5.4 (measurements, appropriateness, primary efficacy variable, drug
concentrations), 9.7.1–9.7.2 (statistical/analytical plans, sample size), 9.8 (changes in
conduct or planned analyses). Section 11.4.2 has eight numbered statistical-issue
subsections (covariates, dropouts/missing data, interim analyses, multicentre,
multiplicity, efficacy subset, equivalence, subgroups) — each is a reusable prose block.

### Section 14 substructure (this is the TFL contract)

```
14    TABLES, FIGURES AND GRAPHS REFERRED TO BUT NOT INCLUDED IN THE TEXT
14.1  Demographic Data
14.2  Efficacy Data
14.3  Safety Data
      14.3.1  Displays of Adverse Events
      14.3.2  Listings of Deaths, Other Serious and Significant Adverse Events
      14.3.3  Narratives of Deaths, Other Serious and Certain Other Significant Adverse Events
      14.3.4  Abnormal Laboratory Value Listing (Each Patient)
```

Note 14.3.3 is *prose*, not a table — narratives sit in the TFL block. That is a natural
seam between open.csr's TFL Builder and its Text Library.

### Section 16 substructure

- **16.1 Study Information** — 16.1.1 protocol + amendments; 16.1.2 sample CRF; 16.1.3
  IEC/IRB list + consent forms; 16.1.4 investigator list + CVs; 16.1.5 signatures; 16.1.6
  batch listing; 16.1.7 randomisation scheme and codes; 16.1.8 audit certificates; **16.1.9
  documentation of statistical methods**; 16.1.10 inter-laboratory standardisation;
  16.1.11–16.1.12 publications.
- **16.2 Patient Data Listings** — 16.2.1 discontinued patients; 16.2.2 protocol deviations;
  16.2.3 patients excluded from efficacy analysis; 16.2.4 demographic data; 16.2.5
  compliance/drug concentration; 16.2.6 individual efficacy response; 16.2.7 adverse event
  listings; 16.2.8 individual laboratory measurements.
- **16.3 Case Report Forms** — 16.3.1 CRFs for deaths/SAEs/AE withdrawals; 16.3.2 other CRFs.
- **16.4 Individual Patient Data Listings (US Archival Listings)**.

Annexes I–VIII give worked examples (synopsis, signature page, study design/schedule,
disposition, discontinuation listing, exclusions from efficacy analysis, and guidance for
§11.4.2 / Appendix 16.1.9).

**16.1.9 is the hook for open.csr's traceability story.** E3 already demands a section
documenting statistical methods; a generated CSR can populate it with the exact code
versions, ARD definitions, and environment used.

---

## 2. In-text vs. post-text: E3's three-level rule

The single most important paragraph in E3 for a TFL builder (Introduction, p. 2):

> "Data should be presented in the report at different levels of detail: overall summary
> figures and tables for important demographic, efficacy and safety variables **may be
> placed in the text** to illustrate important points; other summary figures, tables and
> listings for demographic, efficacy and safety variables **should be provided in section
> 14**; individual patient data for specified groups of patients should be provided as
> listings in **Appendix 16.2**; and all individual patient data (archival listings
> requested only in the US) should be provided in **Appendix 16.4**."

Two more sentences that read like requirements for an ARD-driven system:

> "It is also particularly important that all analyses, tables, and figures carry, in text
> or as part of the table, **clear identification of the set of patients from which they were
> generated**."

> "In any table, figure or data listing, **estimated or derived values, if used, should be
> identified in a conspicuous fashion**. Detailed explanations should be provided as to how
> such values were estimated or derived and what underlying assumptions were made."

And on flexibility:

> "Each report should consider all of the topics described (unless clearly not relevant)
> although the specific sequence and grouping of topics may be changed if alternatives are
> more logical for a particular study… **The numbering should then be adapted accordingly.**"

### Which sections carry in-text tables in practice

| E3 section | Typical in-text display | Full/secondary version in |
|---|---|---|
| 9.1 | Study design schematic; schedule of assessments | — (or 14.1) |
| 10.1 Disposition | Disposition summary by arm | 14.1.x; listing 16.2.1 |
| 10.2 Protocol Deviations | Important deviations by category | 14.1.x; listing 16.2.2 |
| 11.1 Data Sets Analysed | Analysis-set counts by arm | listing 16.2.3 |
| 11.2 Demographics | Demographic/baseline summary | 14.1.x; listing 16.2.4 |
| 11.4.1 Analysis of Efficacy | Primary endpoint estimate + CI + p | 14.2.x (all sensitivity/subgroup) |
| 12.1 Extent of Exposure | Exposure summary | 14.3.x |
| 12.2.1/12.2.2 | Overall AE summary; TEAEs by SOC/PT above a frequency threshold | 14.3.1.x (all AE displays) |
| 12.3.1 | Deaths/SAE overview | 14.3.2; listing 16.2.7 |
| 12.3.2 | — (narratives are prose) | 14.3.3 |
| 12.4.2 | Lab shift / markedly-abnormal summary | 14.3.x; 14.3.4; listing 16.2.8 |
| 12.5 | Vital signs summary | 14.3.x |

The pattern is consistent: **every in-text table is a reduced or thresholded rendering of a
post-text display built from the same analysis results**. That is exactly an ARD →
multiple-display relationship, and it is the strongest argument for open.csr generating
in-text and post-text variants from one source ARD rather than authoring them separately.

---

## 3. Numbering conventions and shells, as actually practised

E3 numbers *sections*, not displays. Industry convention is to number displays **by their
Section 14 / 16.2 position**: `Table 14.1.1`, `Table 14.3.1.2`, `Figure 14.2.1.2`,
`Listing 16.2.7.4`. In-text displays are usually renumbered sequentially (`Table 1`,
`Table 2`, …) or by section (`Table 10-1`) with a footnote pointing to the post-text source.

A concrete, public, real-world example — the SAP for Zealand Pharma study
**ZP4207-17086 (ZEA-DNK-02170)**, v1.0, 16 Aug 2019, prepared by Syneract
([PDF, NCT03667053](https://cdn.clinicaltrials.gov/large-docs/53/NCT03667053/SAP_001.pdf)).
Its *Appendix C: List of Tables, Figures, and Listings* is a four-column index —
**Table Number | Table Title | Analysis Set | Comment** — introduced with:

> "The following proposal for section 14 and 16.2 is completed according to ICH E3
> guidelines. The ICH heading numbers and description are in bold. Minor changes from this
> planned index do not need to be amended in the SAP."
>
> "Formal organization of tabulations may be changed during programming, if appropriate,
> eg, tables for the different variables may be combined into a single table, or tables
> with more than 1 variable may be split into several tables."

Sample rows, showing the numbering depth and the analysis-set column:

```
14.1      DEMOGRAPHIC DATA
14.1.1    Patient number by country                       All patients
14.1.3    Patient disposition                             All patients
14.1.5    Demographic characteristics                     Safety analysis set
14.1.6    Demographic characteristics                     FAS
14.1.7.1  Diabetes history                                Safety analysis set
14.2      Efficacy data
14.2.1.1  Time to plasma glucose recovery - summary table FAS
14.2.1.2  Time to plasma glucose recovery - KM curve      FAS
14.2.1.5  Sensitivity analysis - ... without censoring    FAS
14.3.1.1  Overall summary of adverse events               Safety analysis set
14.3.1.2  TEAEs by system organ class and preferred term  Safety analysis set
14.3.2    Listings of deaths, other serious and significant AEs   [cross-ref to listing 16.2.7.4]
14.3.3    Narratives of deaths ...                        [cross-ref to CSR section 12.3.2]
```

Takeaways for open.csr:

1. The **SAP is the shell repository**. Mock-ups/shells (titles, subtitles, footnotes,
   spanning headers, decimal precision, page orientation) live in the SAP appendix; a
   "TOC"/index spreadsheet is then handed to programming
   ([PharmaSUG 2023 MM-315](https://pharmasug.org/proceedings/2023/MM/PharmaSUG-2023-MM-315.pdf)).
   SAP outlines commonly reserve §14.1 for *general TFL specifications* (margins, fonts,
   headers/footers) and §14.2–14.5 for in-text summary shells, figure shells, summary table
   shells and listing shells — note this is SAP numbering, distinct from CSR §14.
2. The display index is **metadata**: number, title, analysis set (population), comment.
   That maps 1:1 onto CDISC ARS `ReportingEvent` / `Output` metadata and onto a
   `tfrmt`/`gtsummary` spec.
3. Display numbers **drift** during programming, and the SAP explicitly tolerates it.
   Therefore display *identity* must not be the E3 number. Use a stable slug
   (`t-ae-overall`) with the E3 position as an assigned attribute.
4. Cross-references between §14, §12, and §16.2 are first-class content and must be
   resolvable/checkable — a natural automated test.
5. The CORE Reference critique of TransCelerate flags that regulators expect the **study
   number in every table/figure header**; treat header/footer metadata as required fields.

Standard display *content* (not just format) is codified by the **PHUSE Standard Analyses
& Code Sharing / Safety Analytics Working Group** white papers — the AE white paper
("Analysis and Displays Associated with Adverse Events: Focus on Adverse Events in Phase
2-4 Clinical Trials and Integrated Summary Documents") plus papers for labs, vital signs,
demographics/disposition, and hepatotoxicity (eDISH)
([overview paper](https://pharmasug.org/proceedings/2023/SI/PharmaSUG-2023-SI-277.pdf)).
These are the best public specification of "what the standard safety TFLs are".

---

## 4. CORE Reference

**CORE Reference** = *Clarity and Openness in Reporting: E3-based*. Released **May 2016**
by a joint EMWA/AMWA Budget & Working Group as an open-access **user manual** for CSR
authoring; it is explicitly **not a template**
([development paper, Res Integr Peer Rev 2016;1:4](https://researchintegrityjournal.biomedcentral.com/articles/10.1186/s41073-016-0009-4)).
Version 2 of its **Terminology Table** was published August 2019 alongside a critical
review of the TransCelerate CSR template
([Res Integr Peer Rev 2019;4:15, doi:10.1186/s41073-019-0075-5](https://pmc.ncbi.nlm.nih.gov/articles/PMC6683477/));
the main V2 addition was **estimand** (per ICH E9(R1)). Ongoing news summaries are
maintained by EMWA
([Dec 2024 summary](https://emwa.org/news/core-reference-news-summary-december-2024/)).
Note: `core-reference.org` currently serves a mismatched TLS certificate — cite the EMWA
and PMC mirrors instead.

**What it actually provides:** section-by-section *content* suggestions mapped onto the E3
skeleton, an explanation of *why* each content element matters, a standardised terminology
table, and — uniquely — an enumeration of **every point in an E3-compliant CSR where public
disclosure/anonymisation considerations apply**. Industry use is as a companion checklist
layered on top of a company's own Word template, not as a replacement for one.

---

## 5. TransCelerate templates and the structured-authoring trajectory

TransCelerate BioPharma's **Clinical Content & Reuse (CC&R)** assets
([landing page](https://www.transceleratebiopharmainc.com/assets/clinical-content-reuse-solutions/)):

- **Common Protocol Template (CPT)** — current Word edition **V011 (2026)**, now aligned to
  the **ICH M11 protocol template** and CDISC's **Unified Study Definitions Model (USDM)**.
  Eight participant/therapeutic-area content libraries (healthy volunteers, patients,
  paediatrics, pregnant participants, breast cancer, prostate cancer, vaccines, liver safety
  in oncology) supply regulator-accepted endpoint definitions.
- **Common SAP template** and **Common CSR template** — **2024 Release** is the final
  synchronised Word edition of both. The CSR template was first released **November 2018**.
- **eTemplates (eCPT, eSAP, eCSR)** — Word + add-ins that tag content for automated reuse
  downstream (into registries, other documents). **2024 was the final eTemplate release;
  no further maintenance is planned.**

The 2019 critical review of the TransCelerate CSR template
([doi:10.1186/s41073-019-0075-5](https://pmc.ncbi.nlm.nih.gov/articles/PMC6683477/))
found: a "Core Backbone Headings" structure that departs from E3's flat 16-section
numbering; instructional text forbidding reordering of sections (inflexible for non-standard
designs); **no Discussion section**; no "background and rationale" in the synopsis; thin
instructions for AE/lab/device safety sections and for PK/PD/biomarkers; no hyperlinks to
referenced guidance; no ICH-GCP compliance statement on the title page; no anonymisation
guidance; **insufficient in-text summary tables for AE reporting**; and no requirement to
carry the study number in table/figure headers. The authors' conclusion — use CORE
Reference *with* a template — is the pragmatic industry position.

**ICH M11 (CeSHarP)** is the direction of travel for structured authoring: template +
technical specification, **Step 4 adopted 19 November 2025**
([ICH final technical spec](https://database.ich.org/sites/default/files/ICH_Step4_M11_Final_TechnicalSpecification_2025_1119.pdf),
[EMA page](https://www.ema.europa.eu/en/ich-m11-guideline-clinical-study-protocol-template-technical-specifications-scientific-guideline)).
It defines harmonised headers, common text, and a data-field/terminology layer in an open
non-proprietary exchange format. **There is no M11 analogue for the CSR.** That gap is
open.csr's opportunity: a machine-readable CSR content model does not yet exist as a
standard, and building one that is E3-numbered and ARS-linked is defensible and novel.

Commercial structured/component authoring today = Veeva Vault (submission content plans,
global content plans, reusable document libraries;
[Veeva Submissions brief](https://www.veeva.com/resources/vault-submissions-product-brief/)),
plus vendors selling modular component libraries and metadata schemas over Vault/RIM
(e.g. [Straive](https://www.straive.com/blogs/optimizing-modular-content-creation-for-pharma-teams/)),
and AI authoring copilots such as [Yseop Copilot](https://yseop.com/automate-medical-regulatory-authoringworkflows/).
The common pattern: an approved **content block** with an ID, an owner, an approval state,
variables/parameters, and a reuse audit trail. open.csr's Text Library should adopt the same
vocabulary (block ID, version, approval state, parameters, provenance) so it reads as
familiar to a medical writer.

---

## 6. eCTD placement (Module 5.3.5)

Per **ICH M4E(R2)** CTD organisation, the CSR lands in Module 5:

- **5.2** Tabular Listing of All Clinical Studies
- **5.3** Clinical Study Reports and Related Information
  - 5.3.1 Biopharmaceutic Studies · 5.3.2 Human Biomaterials PK · 5.3.3 Human PK ·
    5.3.4 Human PD
  - **5.3.5 Reports of Efficacy and Safety Studies**
    - **5.3.5.1** Study Reports of Controlled Clinical Studies Pertinent to the Claimed Indication
    - **5.3.5.2** Study Reports of Uncontrolled Clinical Studies
    - **5.3.5.3** Reports of Analyses of Data from More than One Study (ISS/ISE, meta-analyses)
    - **5.3.5.4** Other Study Reports
  - 5.3.6 Postmarketing Experience · 5.3.7 CRFs and Individual Patient Listings
- **5.4** Literature References

([overview](https://www.mastercontrol.com/au/regulatory/ectd/module-5/),
[EUPATI](https://learning.eupati.eu/mod/book/view.php?id=904&chapterid=865))

A pivotal Phase 3 CSR is therefore a **5.3.5.1** leaf; E3 §16.2/16.4 listings and CRFs
typically move to **5.3.7**. The practical consequence for open.csr: the output unit is a
single navigable PDF (with bookmarks and internal hyperlinks) plus a defined granularity of
appended files — the demo's export should mimic that leaf/bookmark structure even if it only
renders HTML.

**Transparency drivers that shape CSR content:** EMA **Policy 0070** (2019 revision;
publication relaunched 16 May 2023, Step 2 expansion from April 2025 —
[EMA clinical data publication](https://www.ema.europa.eu/en/human-regulatory-overview/marketing-authorisation/clinical-data-publication))
and **Regulation (EU) 536/2014 Article 37**, which requires the CSR to be submitted to the
EU database (CTIS) within 30 days of the MA decision/withdrawal for trials supporting an
application. Consequence: CSRs are written **disclosure-ready** — anonymisation and CCI
redaction are planned at authoring time, which is precisely the "content block with a
disclosure attribute" pattern CORE Reference documents.

---

## 7. LLM / agentic medical writing: state of the art

### Documented industry results

- **Merck (MSD)** — internal generative-AI CSR platform: first-draft creation reduced from
  **~180 hours to ~80 hours**, elapsed time **2–3 weeks → 3–4 days**, and **errors reduced
  ~50%**; built by >80 data science/AI/medical staff across three continents; **live CSRs
  produced and submitted** on the platform, with scale-out planned across the late-phase
  pipeline. The platform automates "table mapping, data extraction, styling and validation"
  and is "carefully designed to operate with **rigorous oversight by qualified medical
  writers**"
  ([Merck press release](https://www.merck.com/news/merck-expands-innovative-internal-generative-ai-solutions-helping-to-deliver-medicines-to-patients-faster/)).
  This is the most important existence proof: AI-drafted CSRs are already in regulatory
  submissions, with humans accountable.
- **Pfizer's LLM challenge** (Landman R, Healey SP, Loprinzo V, et al., *JAMIA Open*
  2024;7(2):ooae043,
  [doi:10.1093/jamiaopen/ooae043](https://academic.oup.com/jamiaopen/article/7/2/ooae043/7685047))
  — six vendors, 16 Aug–5 Oct 2023, task = generate the **CSR Safety Summary narrative from
  safety tables**. 72 real CSRs, 70/30 train/test; 22 test CSRs with only tables, protocol
  and narrative plan, 24-hour turnaround. Mostly prompt-engineered GPT-3.5-turbo; one
  fine-tuned FLAN-T5-XL; one LLaMA 7B. Scoring had three axes: **Technical** (ROUGE-1/ROUGE-L,
  Jaccard on *numeric* tokens, keyword presence, GPT-4 semantic similarity, plus expert
  factual-accuracy rating), **Business** ("lean writing" and **provenance** = traceability +
  hallucination check), and **Implementation** (scalability, usability). Findings that
  matter for open.csr: variance concentrated in **factual accuracy** and **lean writing**;
  teams that allowed **intermediate human review of table parsing** achieved materially
  better extraction accuracy; and the authors conclude that "ranking of facts by importance,
  and inference cannot at present be automated, and therefore require SMEs." Recommended
  improvements included **JSON-based table ingestion** rather than free-text tables.

The single strongest engineering lesson: **do not make the LLM read a rendered table.**
Feed it the ARD. That is exactly what a `{cards}`-based pipeline provides, and it converts
the hardest failure mode (numeric hallucination) into a lookup.

### Regulatory posture

- **EMA Reflection paper on the use of AI in the medicinal product lifecycle**
  (EMA/CHMP/CVMP/83833/2023, adopted CHMP/CVMP Sept 2024, published **9 September 2024** —
  [PDF](https://www.ema.europa.eu/system/files/documents/scientific-guideline/reflection-paper-use-artificial-intelligence-ai-medicinal-product-lifecycle-en.pdf)).
  The directly on-point paragraph is **§2.3.5 Product information**:

  > "AI/ML applications used for **drafting, compiling, editing, translating, tailoring, or
  > reviewing** medicinal product information documents should be used **under close human
  > supervision**. Given that generative language models are prone to include **plausible but
  > erroneous or incomplete output**, **quality review mechanisms need to be in place** to
  > ensure that all model-generated text is both factually and syntactically correct before
  > submission for regulatory review."

  Also relevant: **§2.3.3.3** (models used for transformation/analysis/interpretation of
  trial data are "part of the statistical analysis"; for confirmatory inference the pipeline
  and models must be **pre-specified, frozen and documented** in the SAP — any
  non-prespecified modification after data are opened makes results *post hoc*);
  **§2.3.3.1** (for high regulatory impact, "the full model architecture, **logs from model
  development, validation and testing**, training data and description of the data processing
  pipeline" may be requested at MAA/CTA/GCP inspection); **§2.5.1** (data sources and all
  processing "documented in a detailed and fully traceable manner in line with GxP");
  **§2.4** (perform a regulatory-impact and risk analysis of all AI/ML applications).

- **FDA draft guidance**, *Considerations for the Use of Artificial Intelligence To Support
  Regulatory Decision-Making for Drug and Biological Products*, published **6–7 January 2025**
  ([Federal Register](https://www.federalregister.gov/documents/2025/01/07/2024-31542/considerations-for-the-use-of-artificial-intelligence-to-support-regulatory-decision-making-for-drug),
  [CDER AI page](https://www.fda.gov/about-fda/center-drug-evaluation-and-research-cder/artificial-intelligence-drug-development)),
  comments closed 7 April 2025. Introduces a **risk-based credibility assessment framework**
  built on a **context of use (COU)** and a **7-step process** (define the question of
  interest → define the COU → assess model risk → develop a credibility plan → execute →
  document results/deviations → determine adequacy). Notably it scopes *in* AI producing
  information to support decisions on safety/efficacy/quality and scopes *out* pure
  operational efficiency uses — an argument that a CSR drafting assistant with a verified
  numeric layer sits at the lower-risk end, but a CSR is still the evidentiary artifact.
- **Joint FDA–EMA "Guiding Principles of Good AI Practice in Drug Development"**, released
  **14 January 2026** ([EMA PDF](https://www.ema.europa.eu/en/documents/other/guiding-principles-good-ai-practice-drug-development_en.pdf),
  [FDA copy](https://www.fda.gov/media/189581/download)). Ten principles, verbatim titles:
  1 Human-centric by design · 2 Risk-based approach · 3 Adherence to standards ·
  4 Clear context of use · 5 Multidisciplinary expertise · **6 Data governance and
  documentation** ("Data source provenance, processing steps, and analytical decisions are
  documented in a detailed, traceable, and verifiable manner, in line with GxP requirements") ·
  7 Model design and development practices · 8 Risk-based performance assessment
  (evaluates "the complete system including human-AI interactions") · 9 Life cycle
  management · 10 Clear, essential information.
- **ICH E6(R3) GCP** (Step 4 Jan 2025; principles + Annex 1 effective 23 July 2025 in the EU;
  Annex 2 Step 4 June 2026, effective Jan 2027) reinforces computerised-system validation
  proportionate to risk, audit trails, and data integrity for any system in the trial-record
  chain ([EMA E6 page](https://www.ema.europa.eu/en/ich-e6-good-clinical-practice-scientific-guideline)).
- **Publication-side norms** (relevant to the Text Library's disclosure attribute): AMWA /
  EMWA / ISMPP joint position statements hold that AI tools cannot be authors, AI assistance
  must be disclosed (acknowledgements), and human authors remain accountable
  ([ISMPP statements](https://www.ismpp.org/position-statements-and-guidances),
  [EMWA AI Working Group](https://emwa.org/communities-engagement/ai-working-group/)).

**Synthesis of the regulatory posture:** nothing prohibits agentic CSR authoring. Every
authority converges on the same four demands — (i) documented **context of use** and risk
assessment, (ii) **close human supervision** with a defined review/approval mechanism,
(iii) **traceable provenance** from source data through every processing step, in GxP
detail, and (iv) **evidence** that the whole human+AI system performs. open.csr's
"every TFL generated from version-controlled source code, every iteration saved,
end-to-end traceability" principle is a direct, demonstrable answer to (iii) and (iv).

---

## 8. Quality/QC practice the evidence framework must mirror

Industry norm for TFL production is **double programming**: production and QC programmers
independently build the analysis dataset/display, then `PROC COMPARE` (or equivalent) must
match 100%; listings double-programmed, tables independently QC'd for numeric results.
Risk-based validation (assigning a validation method per output based on a risk matrix) is
the modern refinement
([Quanticate](https://www.quanticate.com/blog/sas-quality-control-clinical-trials),
[PharmaSUG 2018 SI02](https://pharmasug.org/proceedings/2018/SI/PharmaSUG-2018-SI02.pdf),
[PHUSE 2025 ET02](https://www.lexjansen.com/phuse-us/2025/et/PAP_ET02.pdf)).

Mapping to open.csr's safety.viz-style evidence framework:
- one **requirement ID per display** (and per text block), matching the E3 anchor;
- **unit tests** on the ARD-producing code (the equivalent of double programming — e.g. an
  independent computation asserted against `{cards}` output);
- **snapshot/visual tests** on the rendered display;
- **cross-reference tests** (every "see Table 14.3.1.2" resolves; every §14 entry is
  referenced from body text; every listing referenced from §14 exists in §16.2);
- **numeric-fidelity tests for generated prose** (every number in an LLM-written paragraph
  must exist in the source ARD — the Pfizer challenge's "Jaccard on numeric tokens" and
  "provenance" scores, operationalised as a CI gate).

---

## 9. Tooling landscape (for the TFL Builder)

- **CDISC Analysis Results Standard (ARS) v1.0**, published **19 April 2024**
  ([CDISC](https://www.cdisc.org/standards/foundational/analysis-results-standard/analysis-results-standard-v1-0),
  [model docs](https://cdisc-org.github.io/analysis-results-standard/),
  [GitHub](https://github.com/cdisc-org/analysis-results-standard)). Provides
  `ReportingEvent` → `Analysis` → `Output` metadata with traceability to protocol/SAP and to
  input ADaM — i.e. a standards-based encoding of exactly the SAP Appendix-C index shown in
  §3 above, plus enough to drive display generation.
- **pharmaverse** R stack: `{cards}` (ARD), `{gtsummary}` (ARD → table), `{tfrmt}` (display
  metadata/formatting language), plus `{Tplyr}`, `{chevron}`, `{tidytlg}`, `{pharmaRTF}`
  ([pharmaverse TLGs](https://pharmaverse.org/e2eclinical/tlg/)).
- **`pharmaverse/cardinal`** — industry-collaborative open catalog of harmonised
  FDA-oriented safety tables and figures using `{cards}` + `{gtsummary}`
  ([GitHub](https://github.com/pharmaverse/cardinal)). This is the closest existing thing to
  open.csr's "TFL Library" and should be treated as a source/ally rather than a competitor.
- Precedent: an entire CSR re-created with `{gtsummary}` won the 2024 Posit Pharma Table
  Contest ([talk](https://www.danieldsjoberg.com/CDISC-COSA-Spotlight-ARD-gtsummary-2025/slides/)).

---

## 10. Minimal viable CSR skeleton for the demo

Goal: the smallest artifact that a medical writer or biostatistician recognises as "a real
CSR", built entirely from `{pharmaverseadam}` (CDISC pilot / Xanomeline ADaM: `adsl`, `adae`,
`adlb`, `advs`, `adeg`, `adtte`, `adqsadas`). Recommendation: implement **all 16 section
headings** (cheap, and the recognisability comes from the numbering), but populate only the
starred ones.

### Sections

| E3 § | Demo treatment |
|---|---|
| 1 Title Page | ★ generated from study metadata YAML (all 14 E3 fields) |
| 2 Synopsis | ★ generated: design + disposition + primary result + AE overview, with numbers pulled from ARDs; capped at 3 pages |
| 3 TOC | ★ auto-generated with working internal links |
| 4 Abbreviations | ★ auto-assembled from abbreviations used, from the Text Library |
| 5 Ethics · 6 Investigators | ○ fixed boilerplate blocks (demonstrates "static block" reuse tier) |
| 7 Introduction · 8 Objectives | ○ parameterised blocks (product, indication, objectives from metadata) |
| 9 Investigational Plan | ★ 9.1 design + schedule-of-assessments in-text figure; 9.7 SAP summary; 9.8 changes |
| 10 Study Patients | ★ 10.1 disposition (in-text + 14.1.1); 10.2 deviations |
| 11 Efficacy Evaluation | ★ 11.1 analysis sets; 11.2 demographics; 11.4.1 primary analysis + 11.4.2.2 missing-data block; 11.4.7 efficacy conclusions (generated) |
| 12 Safety Evaluation | ★ 12.1 exposure; 12.2.1–12.2.3 AE summary/display/analysis; 12.3 deaths & SAEs; 12.4 labs; 12.5 vitals; 12.6 safety conclusions (generated) |
| 13 Discussion and Overall Conclusions | ★ the flagship agentic section — grounded strictly in the ARDs of §11/§12 |
| 14 TFLs | ★ full 14.1 / 14.2 / 14.3.1–14.3.4 block, rendered |
| 15 References | ○ bibliography block |
| 16 Appendices | ★ 16.1.9 **auto-generated statistical-methods + provenance appendix** (code versions, ARD hashes, session info); 16.2.1/16.2.2/16.2.7 sample listings; others as stubs |

### Minimal TFL set (13 displays)

| ID (stable slug) | E3 position | Display | Source | In-text twin |
|---|---|---|---|---|
| `t-disposition` | 14.1.1 | Subject disposition by treatment | ADSL | yes (§10.1) |
| `t-deviations` | 14.1.2 | Important protocol deviations by category | ADSL | yes (§10.2) |
| `t-analysis-sets` | 14.1.3 | Analysis sets by treatment | ADSL | yes (§11.1) |
| `t-demog` | 14.1.4 | Demographic and baseline characteristics | ADSL | yes (§11.2) |
| `t-eff-primary` | 14.2.1.1 | Primary endpoint: ANCOVA/MMRM, LS means, CI, p | ADQSADAS | yes (§11.4.1) |
| `f-eff-time` | 14.2.1.2 | Mean change from baseline over time (with CI ribbons) | ADQSADAS | no |
| `f-eff-forest` | 14.2.1.3 | Subgroup forest plot | ADQSADAS + ADSL | no |
| `t-exposure` | 14.3.1.1 | Extent of exposure | ADSL/ADEX | yes (§12.1) |
| `t-ae-overall` | 14.3.1.2 | Overall summary of TEAEs | ADAE | yes (§12.2.1) |
| `t-ae-soc-pt` | 14.3.1.3 | TEAEs by SOC and PT | ADAE | yes, thresholded ≥5% (§12.2.2) |
| `t-ae-severity` | 14.3.1.4 | TEAEs by SOC, PT and maximum severity | ADAE | no |
| `t-lab-shift` | 14.3.1.5 | Laboratory shift table, baseline to worst post-baseline | ADLB | yes (§12.4.2) |
| `l-ae-sae` | 16.2.7.1 | Listing of deaths, SAEs and AEs leading to discontinuation | ADAE | referenced from 14.3.2 |

Plus §14.3.3 patient narratives (prose generated per SAE subject, from ADAE + ADSL) as the
demonstration that the Text Library and the TFL Library share one data spine.

### Minimal text-block taxonomy (3 reuse tiers)

1. **Fixed** — verbatim boilerplate (§5.2 ethical conduct, §5.3 consent, GCP statement).
   Versioned, approved, never LLM-touched.
2. **Parameterised** — templated with slots resolved from study metadata or ARD values
   (§1, §7, §8, §9.4, §12.1 lead-ins). Deterministic; unit-testable.
3. **Generated + reviewed** — agentic drafts grounded on a named set of ARDs
   (§11.4.7, §12.2.3, §12.6, §13, §14.3.3 narratives). Every one carries: source ARD IDs,
   model + prompt version, generation timestamp, numeric-fidelity check result, and a
   human review state.

### Non-negotiable demo features (the differentiators)

- **One ARD → in-text + post-text variants** of the same display, provably consistent.
- **Every display header carries study number + population + data cut-off** (the E3
  "identify the set of patients" rule, and the TransCelerate critique's header requirement).
- **Change → code edit → regenerate**: a user-requested display change (add a subgroup,
  change decimals) becomes a diff in a version-controlled spec, re-runs, and the document
  re-renders with a new version stamp.
- **Cross-reference integrity as a CI gate.**
- **Numeric-fidelity gate on generated prose**: no number appears in text unless it exists
  in the referenced ARD.
- **§16.1.9 provenance appendix** rendered automatically — this is the artifact that turns
  the traceability claim into something a reviewer can inspect.
- **Requirements matrix** keyed to E3 section IDs + display slugs, with test evidence per row
  (the safety.viz pattern), published to GitHub Pages.

---

## 11. Open questions / risks for the design doc

1. **Display identity vs. E3 numbering.** Numbers drift; slugs must be canonical, with E3
   position as assignable metadata and renumbering as a build step.
2. **How far to go toward CDISC ARS.** Full ARS conformance is heavy; a pragmatic subset
   (ReportingEvent/Analysis/Output identifiers + ADaM traceability) buys most of the
   credibility at a fraction of the cost.
3. **No standard machine-readable CSR content model exists** (M11 covers protocols only).
   open.csr will have to define one — worth flagging as a contribution, and worth aligning
   its section IDs to E3 numbering so it is obviously mappable.
4. **CORE Reference licensing** — open access, but confirm terms before embedding its
   content guidance text into the Text Library rather than linking to it.
5. **TransCelerate template licensing** — templates are freely downloadable but are not
   open-source-licensed; mirror structure/numbering (which is E3's anyway), not their text.
6. **Disclosure attributes** — even a demo should carry an anonymisation/CCI flag per block,
   because Policy 0070 and CTR Art. 37 make that a first-class CSR concern.
