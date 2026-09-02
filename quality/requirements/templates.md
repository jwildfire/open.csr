# Requirement matrix — Report Template Library and assembler (`RPT-`)

Requirements for the machine-readable ICH E3 document model, the per-CSR assembly
configuration, and the Node assembler that walks them to produce the report.

Scope: [`library/templates/`](../../library/templates) — one directory per template
object, each a document model (`sections.yaml`) plus a per-report assembly
(`assembly.yaml`): [`ich-e3`](../../library/templates/ich-e3) (the full clinical study
report), [`e3-synopsis`](../../library/templates/e3-synopsis) (the ICH E3 Annex I
synopsis), [`display-package`](../../library/templates/display-package) (the post-text
displays delivered on their own) and
[`e3-abbreviated`](../../library/templates/e3-abbreviated) (the reduced report E3
contemplates for a study not intended to support a claim) — together with [`scripts/template-lib.mjs`](../../scripts/template-lib.mjs) and
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
- **Restriction, not rewrite** ([#34](https://github.com/jwildfire/open.csr/issues/34)) —
  the third and fourth template objects are each expressed as a SUBSET of the full E3
  model: every section they declare carries the number, title, slug and content
  declaration it has in `ich-e3`, unchanged. That is what let both be added without
  writing a sentence of prose. The synopsis needed eighteen new blocks because the
  report's prose cross-references E3 section numbers a synopsis has not got; a document
  that keeps E3's numbering reuses the same prose untouched, and its model retains every
  cross-referenced section precisely so that it does.
- **The cost of a fifth** — no file under `scripts/` names any template id except the
  `ich-e3` default, and the demo site follows the library rather than a member of it
  ([#32](https://github.com/jwildfire/open.csr/issues/32)). A new template object is two
  YAML files, a matrix section and a test file; the framework itself does not move.
- **Licence position** — no template object in this library is derived from the R
  Consortium Submissions Working Group pilot repositories. Pilots 1, 2 and 3 are GPL-3.0,
  which is one-way incompatible with this Apache-2.0 project in the direction reuse would
  need; pilots 4, 5-dev and 6, the ADRG automation pipeline and most of the eCTD
  `-to-fda` packages carry no licence at all. Both models are encoded from ICH E3, a
  public guideline. See the design report published with #28.
- **Coverage of the TFL Library** ([#45](https://github.com/jwildfire/open.csr/issues/45)) —
  the assembler read `library/tfl/` only through the slugs an `assembly.yaml` already
  named, so a display the library held and no template carried was invisible: four green
  documents, exit 0, no mention of it. The Text Library never had that hole (RPT-LIB-004).
  This matters at the seam #44 describes, where displays land in the library in one
  increment and the wiring into Section 14.2 is a separate one; between the two, nothing
  said the analysis had reached no deliverable.
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
| STD-MODEL-001 | `library/study.yaml` loads with the study's arms in print order and every analysis set counted per arm; the default data source is the pilot's own package. | Interface | `study-model.test.js` | Verified |
| STD-MODEL-002 | An assembly that declares `study.treatment_groups` or `study.id` declares the model's arms in the model's order and the model's id; two files may not spell the study. | Interface | `study-model.test.js` | Verified |
| STD-GATE-001 | A placed display whose per-arm counts differ from the study model's for its analysis set fails the treatment-consistency gate, and the error names the display, the arm and both numbers. | Correctness | `study-model.test.js` | Verified |
| STD-GATE-002 | Two placed displays reporting the same analysis set with different per-arm counts fail the gate with one error naming both, even when one of them agrees with the model. | Correctness | `study-model.test.js` | Verified |
| STD-GATE-003 | A placed display with no population record is a warning that names it and says it is not gated; one with no arm grouping is warned and not counted as checked. Neither is a silent pass. | Correctness | `study-model.test.js` | Verified |
| STD-GATE-004 | A population record naming an analysis set the model does not declare is an error, not a skipped check. | Correctness | `study-model.test.js` | Verified |
| STD-GATE-005 | The committed clinical study report assembles green on the gate: every placed table and figure is gated by arm, every placed display read the pilot's own package, and no display is warned as ungated. | Traceability | `study-model.test.js` | Verified |
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

## Third template object — post-text display package

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| RPT-PKG-001 | `library/templates/display-package/sections.yaml` is a structural restriction of the full ICH E3 model: every section it declares carries the number, title, slug and content declaration it has in `ich-e3`, unchanged, and it declares fewer of them. | Functional | `assemble-template-subsets.test.js` | Verified |
| RPT-PKG-002 | The package carries no prose: its assembly claims no text block, the assembled document places none, and every block in the shared Text Library is reported as ungated by this build rather than silently skipped. | Functional | `assemble-template-subsets.test.js` | Verified |
| RPT-PKG-003 | Every display carries the same assigned number in the package as in the full report — `Table 14.1.1` in both — because both assemblies declare the same post-text structure and neither writes a number down. Two documents that declare the same structure agree; the synopsis, which declares a different one, differs (design D6). | Functional | `assemble-template-subsets.test.js` | Verified |
| RPT-PKG-004 | The generated provenance appendix is E3's own Section 16.1.9, not a section invented for this document: E3 already reserves that appendix for the documentation of statistical methods. | Traceability | `assemble-template-subsets.test.js` | Verified |
| RPT-PKG-005 | Sections 14.2 (efficacy) and 14.3.4 (abnormal laboratory values) are declared and left unpopulated rather than dropped, because open.csr produces no efficacy or laboratory display for this study; Section 14.3.3 is omitted instead, because it is narrative and this document carries none. | Traceability | `assemble-template-subsets.test.js` | Verified |
| RPT-PKG-006 | The package assembles green against CDISCPILOT01 — every gate passes, no build error, all six displays resolve to a committed ARD. | Functional | `assemble-template-subsets.test.js` | Verified |

## Fourth template object — abbreviated clinical study report

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| RPT-ABR-001 | `library/templates/e3-abbreviated/sections.yaml` is a structural restriction of the full ICH E3 model under the same schema and the same validator: seventy-five sections against the full report's one hundred and nineteen, each unchanged in number, title, slug and content declaration. | Functional | `assemble-template-subsets.test.js` | Verified |
| RPT-ABR-002 | The efficacy-analysis apparatus is absent — Section 11.4 and all fifteen of its subsections, the discussion of design choice (9.2) and the efficacy-specific measurement sections (9.5.2 to 9.5.4) — while the analysis sets, the baseline characteristics, the safety evaluation and the discussion remain. That single cut is what makes the report abbreviated. | Functional | `assemble-template-subsets.test.js` | Verified |
| RPT-ABR-003 | The abbreviated report introduces no new prose: every text block its assembly names is one the full report already assembles, and the Text Library holds no block written for this document. | Traceability | `assemble-template-subsets.test.js` | Verified |
| RPT-ABR-004 | Every cross-reference in the reused prose resolves against the abbreviated model, because the model retains every section the retained prose points at — 16.2.1, 16.2.3, 16.2.4, 16.2.7, 16.1.9, 14.2 and 12.3.2 among them. | Functional | `assemble-template-subsets.test.js` | Verified |
| RPT-ABR-005 | The abbreviated report assembles green against CDISCPILOT01, populates only sections the full report also populates, and assigns every display they share the same number — the two documents differ in their document model, not in what they say. | Functional | `assemble-template-subsets.test.js` | Verified |
| RPT-ABR-006 | Every display the abbreviated report carries is the full report's display object — same slug, same committed ARD file, same assigned number — and every display it does not carry is absent because this model declares no section to put it in. A display withheld from a section the model *does* declare is reported, so "carries fewer displays" can never quietly become "disagrees about what to show". | Traceability | `assemble-template-subsets.test.js` | Verified |

## The library takes templates

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| RPT-LIB-005 | Every template object the library holds assembles green against the same study in one run, and each re-derives its named values against the committed ARDs. CI assembles them all with `--all`: a template that is never assembled is a directory, not a template. | Functional | `assemble-template-subsets.test.js` | Verified |
| RPT-LIB-006 | No file under `scripts/` names the third or fourth template object. A template object is discovered from disk by the assembler, the loader and the site build, or the framework is not generic — adding one costs two YAML files and no code. | Non-functional | `assemble-template-subsets.test.js` | Verified |
| RPT-LIB-007 | All four documents resolve the same named values, from the same store, to the same numbers. Four documents about one study cannot disagree about a quantity. | Traceability | `assemble-template-subsets.test.js` | Verified |
| RPT-LIB-008 | Every display the TFL Library holds is carried by at least one template object. A display specified, given a committed ARD and wired into nothing reaches no reader, and only a run over the whole library can see it — so `--all` fails on it, which is what CI runs. | Functional | `assemble-template-subsets.test.js` | Verified |
| RPT-LIB-009 | Each assembled document names the library displays it does not carry, in `gates.warnings` and on `gates.displayCoverage`. Carrying a subset is legitimate and stays a warning; being silent about it is not, for the same reason an unassembled text block is reported (RPT-LIB-004). | Functional | `assemble-template-subsets.test.js` | Verified |
| RPT-LIB-010 | The coverage comparison goes red on the case it exists for, not only green on the case that already passes. | Functional | `assemble-template-subsets.test.js` | Verified |

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
- The demo site follows the library rather than one member of it (#32), so a new template
  object acquires its pages without a site change. `site/config.json` supplies editorial
  metadata only and is a merge, never a gate: an undeclared template object still
  publishes, titled from its own model, with a warning naming it. `display-package` and
  `e3-abbreviated` are currently undeclared and raise that warning on every build.
- Four template objects share one flat Text Library. A block's `e3_section` is metadata
  only, so a synopsis block and a report block sit side by side with nothing but their id
  prefix distinguishing them. The third and fourth objects did not make this worse — the
  display package assembles no prose and the abbreviated report reuses the report's — but
  the first document model that needs its own prose will want a per-model index.
- The abbreviated report's section list is open.csr's judgment, not ICH E3's: E3's
  Introduction contemplates a reduced report but prints no section list for one. The rule
  the subset follows is stated in `library/templates/e3-abbreviated/sections.yaml`, in one
  place, so it can be disagreed with there rather than section by section. The clause most
  worth arguing with is the removal of E3's parameter-by-parameter laboratory (12.4) and
  vital-sign (12.5) evaluations.
- No template object in the library assembles another. An abbreviated report's Section 2
  is a synopsis, and this library holds a synopsis template object, but the assembler has
  no way to place one assembled document inside another; the two are built side by side.
