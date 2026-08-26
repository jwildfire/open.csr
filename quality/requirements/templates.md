# Requirement matrix — Report Template Library and assembler (`RPT-`)

Requirements for the machine-readable ICH E3 document model, the per-CSR assembly
configuration, and the Node assembler that walks them to produce the report.

Scope: [`library/templates/`](../../library/templates) — one directory per template
object, each a document model (`sections.yaml`) plus a per-report assembly
(`assembly.yaml`): [`ich-e3`](../../library/templates/ich-e3) (the full clinical study
report) and [`e3-synopsis`](../../library/templates/e3-synopsis) (the ICH E3 Annex I
synopsis) — together with [`scripts/template-lib.mjs`](../../scripts/template-lib.mjs) and
[`scripts/assemble.mjs`](../../scripts/assemble.mjs). Prose content and the text gates
are [`text.md`](text.md); ARD production is [`tfl-engine.md`](tfl-engine.md); the site
that renders `csr.json` is [`quality.md`](quality.md).

## Requirement context

- **D6** — display identity is the slug; the 14.x number is assigned at build time from
  `post_text` order, because E3 explicitly permits renumbering and real SAPs drift by
  design. In-text and post-text variants render from the same ARD.
- Research finding: **no public machine-readable ICH E3 document model exists.** ICH M11
  (Step 4, Nov 2025) did this for protocols; there is no M11 analogue for the CSR.
  `sections.yaml` is open.csr's attempt at one, so its fidelity to E3's own numbering and
  headings is a requirement in its own right, not an implementation detail.
- **Plural by construction** ([#28](https://github.com/jwildfire/open.csr/issues/28)) — the
  model/assembly pair is generic, but the library held one instance until a second was
  added, so nothing distinguished a framework from an ICH E3 file with two names. The
  synopsis is the smallest document that exercises sections, assembly, text blocks, named
  values, in-text displays, a post-text index and the generated provenance appendix at
  once, against the same study and the same ARDs as the full report.
- **Licence position** — no template object in this library is derived from the R
  Consortium Submissions Working Group pilot repositories. Pilots 1, 2 and 3 are GPL-3.0,
  which is one-way incompatible with this Apache-2.0 project in the direction reuse would
  need; pilots 4, 5-dev and 6, the ADRG automation pipeline and most of the eCTD
  `-to-fda` packages carry no licence at all. Both models are encoded from ICH E3, a
  public guideline. See the design report published with #28.
- [Contracts §7](../../docs/design/contracts.md) fixes the template model and the
  assembly configuration formats.

**Verification** names the vitest file whose test titles carry the requirement ID.

## Document model — `sections.yaml`

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| RPT-MODEL-001 | The model carries all sixteen ICH E3 top-level sections, numbered 1 to 16, with E3's own headings. | Functional | `assemble-template.test.js` | Verified |
| RPT-MODEL-002 | The Section 14 substructure reproduces E3: 14.1 demographic, 14.2 efficacy, 14.3 safety, and 14.3.1 to 14.3.4 (AE displays, death and SAE listings, narratives, abnormal laboratory listings). 14.3.3 is modelled as prose, because in E3 it is. | Functional | `assemble-template.test.js` | Verified |
| RPT-MODEL-003 | Section 16 carries the full appendix structure: 16.1.1 to 16.1.12, 16.2.1 to 16.2.8, 16.3.1 to 16.3.2 and 16.4. | Functional | `assemble-template.test.js` | Verified |
| RPT-MODEL-004 | Section 16.1.9 (Documentation of Statistical Methods) is declared as accepting generated provenance content — the slot E3 reserved in 1995 that open.csr fills mechanically. | Functional | `assemble-template.test.js` | Verified |
| RPT-MODEL-005 | Section numbers and slugs are each unique, every number is well formed, and every subsection names a parent that exists in the model. | Functional | `assemble-template.test.js` | Verified |
| RPT-MODEL-006 | Every declared content type comes from the closed vocabulary `text`, `in_text_display`, `post_text_index`, `generated_provenance`; a structural heading declares none. | Functional | `assemble-template.test.js` | Verified |
| RPT-MODEL-007 | Section level, parent and document ordering are derived from the dotted number, so 9.10 sorts after 9.2 and no ordering metadata is stored redundantly. | Functional | `assemble-template.test.js` | Verified |

## Assembly configuration — `assembly.yaml`

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| RPT-ASM-001 | Every slot targets a section that exists in the document model and that accepts the content the slot supplies. | Functional | `assemble-template.test.js` | Verified |
| RPT-ASM-002 | Every text block named by a slot exists in the Text Library. | Functional | `assemble-template.test.js` | Verified |
| RPT-ASM-003 | Section 14 display numbers are assigned from `post_text` order at build time and appear nowhere in the source; reordering a slot renumbers the displays without touching a slug. | Functional | `assemble-template.test.js` | Verified |
| RPT-ASM-004 | An assigned display number that would collide with a section number in the document model fails the build, because such a collision makes every cross-reference in the document ambiguous. | Functional | `assemble-template.test.js` | Verified |
| RPT-ASM-005 | A display may occupy at most one post-text position, and no two displays may be assigned the same number. | Functional | `assemble-template.test.js` | Verified |
| RPT-ASM-006 | A slot naming an unknown section, an unknown text block, or content the section does not accept is rejected with the reason. | Functional | `assemble-template.test.js` | Verified |
| RPT-ASM-007 | The demonstration assembly claims only the sections it populates, names the study, its data cut-off and its analysis set, and states its scope limits — including the absence of efficacy data (design D12). | Traceability | `assemble-template.test.js` | Verified |
| RPT-ASM-008 | The assembler places `in_text` display variants in narrative sections and `post_text` variants only under Section 14, and assigns each post-text display its derived number. | Functional | `assemble-document.test.js` | Verified |
| RPT-ASM-009 | A display placed both in-text and post-text renders both variants from the same ARD file — one analysis, two renderings, never re-authored. | Functional | `assemble-document.test.js` | Verified |

## Data resolution and provenance

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| RPT-ARD-001 | Every display in the assembly resolves to a real ARD — the pipeline output pointed at by `outputs/<slug>/current.json` where one exists, a committed fixture otherwise — and the assembled document records which, so a report built from fixtures can never be mistaken for one built from a pipeline run. | Traceability | `assemble-document.test.js` | Verified |
| RPT-PROV-001 | Section 16.1.9 is generated from the provenance envelope of every ARD in the report: specification and display hashes, input dataset hashes with row counts and source package versions, the R and package versions, and the source commit. It is generated, never authored. | Traceability | `assemble-document.test.js` | Verified |

## Assembler output

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| RPT-OUT-001 | `assemble()` emits `docs/assembled/csr.json` in the documented `opencsr/csr/v1` shape: study, template, flat sections, display index, text blocks, provenance appendix and gate report. | Interface | `assemble-document.test.js` | Verified |
| RPT-OUT-002 | The section list is flat and in document order, and every section that names a parent names one that is present — the site builder can nest it without a second pass. | Interface | `assemble-document.test.js` | Verified |
| RPT-OUT-003 | A build with any structural error, unresolved binding, unresolved cross-reference or numeric-fidelity violation reports `ok: false` and exits non-zero; the shipped configuration builds clean. | Functional | `assemble-document.test.js` | Verified |
| RPT-OUT-004 | The assembled document contains the full E3 skeleton, with sections the demonstration does not fill marked unpopulated rather than dropped — the numbering is what makes the artifact recognisable as a CSR. | Functional | `assemble-document.test.js` | Verified |
| RPT-OUT-005 | `docs/assembled/csr.html` contains resolved values and never a raw binding token or an unresolved marker. | Functional | `assemble-document.test.js` | Verified |
| RPT-OUT-006 | `csr.html` is self-contained: no external host, no script, no external stylesheet, no font or image fetched at view time. | Non-functional | `assemble-document.test.js` | Verified |
| RPT-OUT-007 | The rendered document shows the assigned display numbering, the per-block gate report and the generated provenance appendix, so a reader can see the evidence for the numbers beside them. | Traceability | `assemble-document.test.js` | Verified |

## Template library — plural template objects

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| RPT-LIB-001 | The library holds more than one template object, discovered from disk rather than enumerated in code: a directory under `library/templates/` containing a `sections.yaml` is a template object. | Functional | `assemble-templates-plural.test.js` | Verified |
| RPT-LIB-002 | A template id resolves to its own document model, its own assembly and its own output basename. `ich-e3` keeps writing `docs/assembled/csr.{json,html}`, so the site build and every published link are unchanged by the library becoming plural. | Interface | `assemble-templates-plural.test.js` | Verified |
| RPT-LIB-003 | An unknown template id fails loudly and names the ids the library actually holds, rather than falling back to the default and assembling the wrong document under the right name. | Functional | `assemble-templates-plural.test.js` | Verified |
| RPT-LIB-004 | Gates judge the document being assembled, not the whole Text Library: a block written for the full E3 report may cross-reference Section 16.2.1 without failing a synopsis model that has no Section 16. A library block that this build did not assemble is reported as a warning, so "not gated" can never pass for "gated and clean". | Functional | `assemble-templates-plural.test.js` | Verified |

## Second template object — ICH E3 Annex I synopsis

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| RPT-SYN-001 | `library/templates/e3-synopsis/sections.yaml` is a structurally valid document model under the same schema and the same validator as the CSR model. | Functional | `assemble-templates-plural.test.js` | Verified |
| RPT-SYN-002 | The model carries ICH E3 Annex I's own synopsis fields, numbered 1 to 12 in E3's order, with E3's field names. | Functional | `assemble-templates-plural.test.js` | Verified |
| RPT-SYN-003 | The generated provenance appendix is declared on the synopsis model's own section rather than borrowed from E3 Section 16.1.9, because a synopsis has no Section 16. Sections 13 and 14 are open.csr's additions and are marked as such in the model. | Traceability | `assemble-templates-plural.test.js` | Verified |
| RPT-SYN-004 | Efficacy fields are declared in the model and left unclaimed by the assembly, so they appear as headings marked unpopulated rather than being dropped (design D12). | Traceability | `assemble-templates-plural.test.js` | Verified |
| RPT-SYN-005 | The synopsis assembles green against CDISCPILOT01 — every gate passes, no build error, and at least twenty of its sections are populated. | Functional | `assemble-templates-plural.test.js` | Verified |
| RPT-SYN-006 | The same display carries a different number in each document from one unchanged specification: `Table 14.1.1` in the report and `Table 13.1` in the synopsis, because identity is the slug and the number is a build-time assignment (design D6). | Functional | `assemble-templates-plural.test.js` | Verified |
| RPT-SYN-007 | Both documents resolve the same named values, from the same store, to the same numbers, and both re-derive every value against the committed ARDs. Two documents about one study cannot disagree about a quantity. | Traceability | `assemble-templates-plural.test.js` | Verified |

## Known limitations

- Display titles fall back to a built-in map when the TFL Library supplies no
  `display.yaml`; when one exists it wins, and any `Table 14.x` prefix in a spec title is
  stripped so the assembler remains the sole owner of the number.
- The assembler renders a pipeline-produced `table.html` when it finds one and otherwise
  builds a table from the ARD. The fallback renderer applies a documented percentage
  convention (`p` in [0,1] is scaled) that the binding path never relies on — prose scales
  explicitly with the `scale` qualifier.
- Whole-document RTF/DOCX assembly (`r2rtf::assemble_rtf` / `assemble_docx`) is the
  roadmap submission path; v0 emits JSON and HTML only.
- The demo site is still single-template: it reads `docs/assembled/csr.json` and one
  template directory, so the synopsis assembles and is committed but is not yet reachable
  from the Reader or the Templates page.
- The two template objects share one flat Text Library. A block's `e3_section` is metadata
  only, so a synopsis block and a report block sit side by side with nothing but their id
  prefix distinguishing them; if a third document model is added, the library will want a
  per-model index.
