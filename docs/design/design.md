# open.csr — Design

**An open-source Clinical Study Report builder: versioned numbers, versioned words, one traceable loop.**

Status: v0 design, 2026-07-25. Grounded in the landscape research in [`research/`](../../research/README.md). Requirement: [obot.roadmap#111](https://github.com/jwildfire/obot.roadmap/issues/111).

---

## 1. The problem and the gap

Research across the CSR-automation landscape ([sections/01](../../research/sections/01_existing-tools.md)) found the field split into two halves that never meet:

- **Open source** (pharmaverse, Roche NEST, R Consortium pilots) owns *number generation* — and stops at the output object. No open-source CSR builder exists as of July 2026.
- **Commercial** (Certara CoAuthor, Yseop, TriloDocs, Narrativa) owns *document assembly and prose* — and treats the TFL package as an opaque, already-final input.

Every tool on both sides breaks the same seam: prose quotes numbers the authoring tool did not compute. Clinion sells number-vs-narrative cross-checking; Narrativa sells click-to-trace. Both are patches over a broken loop.

**open.csr's differentiator is the closed loop:** a change request becomes a code edit, which regenerates the number, which updates the sentence — as *one versioned transaction*. The numbers and the words share a single source of truth, so consistency is a build property, not a QC activity.

Four public gaps open.csr occupies (none has an incumbent):

1. The closed change-request → regeneration loop across TFLs *and* text.
2. A machine-readable ICH E3 document model (ICH M11 did this for protocols in Nov 2025; nothing has done it for the CSR — E3 is unrevised since 1995).
3. A public CDISC ARS → display → document reference implementation.
4. A published requirements → tests → evidence framework for a report generator (the safety.viz pattern, applied to documents).

## 2. Architecture overview

```
                      ┌────────────────────────────────────────────────┐
                      │                 quality/                       │
                      │  requirement matrices · test evidence · guards │
                      └───────────────▲────────────────▲───────────────┘
                                      │                │
 pharmaverseadam ──► data-prep ──► ARDs ──► displays ──► assembled CSR ──► demo site
      (ADaM)          (R, tested)  (cards)  (gt/tfrmt/    (Node, from       (GitHub
                                            r2rtf)        E3 model)         Pages)
                                      ▲            ▲            ▲
                              library/tfl/   library/tfl/  library/text/ + library/templates/
                              analysis specs display specs text blocks     E3 document model
```

Three libraries, one spine:

| Component | What it holds | Source of truth |
|---|---|---|
| **TFL Builder + Library** | One directory per display: analysis spec + display spec + custom code, plus every saved iteration | `library/tfl/<slug>/` |
| **Text Library** | ICH E3-aligned prose blocks with ARD-bound numbers | `library/text/<block-id>.md` |
| **Report Template Library** | Machine-readable ICH E3 skeleton + assembly slots | `library/templates/ich-e3/` |

The spine is the **R pipeline** (`pipeline/`, an R package) that turns ADaM → ARD → display, and the **Node assembler** (`scripts/`) that turns E3 model + text blocks + displays → CSR document + demo site. R owns statistics; JS owns documents and publishing. Each side is tested in its own idiom (testthat / vitest) and both feed one evidence stream.

## 3. Design decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **ARD-first stack**: `{cards}`/`{cardx}` → `{gtsummary}`/`{gt}`, `{r2rtf}` for submission outputs. Not rtables/tern. | Only stack aligned with CDISC ARS v1.0; per-statistic warning/error columns give quality evidence for free; it's what FDA-adjacent `{cardinal}` chose. ([sections/02](../../research/sections/02_ars-ard-standards.md), [03](../../research/sections/03_tlg-pharmaverse-practice.md)) |
| D2 | **ARS-aligned spec dialect, not full ARS v1.0**. Specs are a documented YAML profile using ARS vocabulary (analysis sets, groupings, methods/operations, output displays); full ARS JSON import/export is roadmap. | ARS v1.0 is a heavy LinkML model; nobody has shipped the full chain. A profiled subset keeps specs human-diffable — the property the closed loop depends on. `{siera}` is prior art for ARS→code. |
| D3 | **Two diffable artifacts per display**: `analysis.yaml` (what to compute) + `display.yaml` (how to show it). Custom statistics drop to R functions in the display's directory. | Separating WHAT from HOW is ARS's core insight and makes most change requests a small spec diff — mechanical to apply, trivial to review, safe to regenerate. |
| D4 | **The ARD is the primary QC evidence artifact** — committed, diffable, snapshot-tested. Rendered outputs (HTML/PNG/RTF) are secondary evidence beside it. | ARD equality is stronger than pixel equality and immune to renderer noise. This replaces document-level double programming with value-level regression. |
| D5 | **Persist ARDs in an owned JSON schema** with a provenance envelope (data hash, spec hash, package versions, git commit). | `{cards}` has no lossless serializer (`as_nested_list()` is experimental; format closures don't serialize). The envelope is what makes every number auditable. |
| D6 | **Machine-readable ICH E3 document model** with stable display slugs (`t-ae-overview`), 14.x numbers assigned at build time. In-text and post-text variants render from the same ARD, with consistency enforced by test. | E3 explicitly permits renumbering, and real SAPs drift by design — so identity must live in the slug, not the number. One-ARD-two-variants is the cleanest demonstration of "regenerate, don't re-author". ([sections/04](../../research/sections/04_csr-document-standards.md)) |
| D7 | **Text blocks bind numbers, never state them.** Prose uses `{{ard:...}}` references resolved at assembly; CI fails any digit in rendered prose that doesn't resolve to a bound ARD value (numeric-fidelity gate). | The Pfizer six-vendor challenge found factual accuracy is the differentiator; EMA/FDA demand "quality review mechanisms". Binding makes stale numbers structurally impossible, not just detectable. |
| D8 | **Three text-block tiers** — `boilerplate` (fixed), `parameterized` (bindings only), `generated` (agent-drafted, human-approved) — each block carrying version, approval state, source ARD refs, and (for generated) model + prompt provenance. | Bounds the LLM to assembling and phrasing curated content rather than free-generating facts — the constraint the AutoIND benchmark shows carries the value — and gives regulators the audit trail they've converged on. |
| D9 | **Every agent action lands as a code change** (spec edit, block edit, template edit) in git, regenerated by the same deterministic pipeline, behind human approval gates. Agents never edit outputs. | The audit trail *is* the version history. This is the mechanism that satisfies EMA reflection-paper §2.3.5 / FDA credibility-framework expectations for human oversight and provenance. |
| D10 | **Iteration ledger per display**: each regeneration writes `outputs/<slug>/vNNN/` (spec snapshot + ARD + rendered output + manifest: who/why/when/commit). The demo surfaces iteration timelines. | "All iterations saved and reproducible" as a filesystem contract, browsable on the site, not a git-archaeology exercise. |
| D11 | **Quality framework ported from safety.viz**, in-repo: matrices in `quality/requirements/`, ID scheme `TFL- / DSP- / TXT- / RPT- / TRC- / QC-` (regex `^[A-Z]{2,4}-[A-Z]+-\d+[A-D]?$` unchanged), test titles carry IDs, testthat + vitest results normalize into one `evidence.json` per module, published as evidence pages. | Proven loop, documented porting guide ([sections/05](../../research/sections/05_safetyviz-evidence-framework.md)); in-repo matrices match the direction already chosen for safety.viz (hub#64). Text blocks additionally carry *human review* evidence (`reviewedBy`/`reviewedAt`) — a suite automation can't provide. |
| D12 | **Demo data = `{pharmaverseadam}` CDISCPILOT01, safety-focused**, with a tested `data-prep` layer deriving what's missing (ITTFL/EFFFL, screen-failure exclusion). Efficacy displays are roadmap (no CDISCPILOT01 efficacy ADaM exists; derivation from `{pharmaversesdtm}` QS is the planned path). | Honest handling of a known data gap beats mixing the oncology-shaped datasets into an Alzheimer's study. Population flags derived, documented, and tested rather than assumed. |

## 4. The TFL Builder + Library

### 4.1 Display anatomy

```
library/tfl/t-ae-overview/
  analysis.yaml     # ARS-aligned: dataset, analysis set, groupings, variables, statistics
  display.yaml      # titles, footnotes, layout, precision, column plan, variants
  custom.R          # optional: display-specific statistics the generic engine lacks
  iterations.yaml   # ledger: v001..vNNN — date, actor, change request, git commit
outputs/t-ae-overview/
  v001/ … vNNN/     # spec snapshot + ard.json + table.html + manifest.json
  current.json      # pointer to the live iteration
```

Every display has a **stable slug** (`t-`/`l-`/`f-` prefix for table/listing/figure), a **regulatory ID** where one exists (FDA ST&F number, chevron ID like `AET01`), and an **assigned position** (e.g. 14.3.1.1) that lives in the template model, not the display.

### 4.2 Engine

`pipeline/` is an R package (`opencsr`):

1. **data-prep** — reads `{pharmaverseadam}`, derives documented population flags, excludes screen failures, stamps a data manifest (row counts, hashes, dataset versions).
2. **ARD generation** — interprets `analysis.yaml` into `{cards}`/`{cardx}` calls (`ard_stack`, `ard_stack_hierarchical`); serializes to `ard.json` (owned schema: tidy rows + provenance envelope). Per-statistic warnings/errors are retained as data.
3. **Rendering** — `ard.json` + `display.yaml` → `gt` HTML (site + in-text variants) and `{r2rtf}` RTF (submission path) for a demonstration subset. Precision is declarative (`tfrmt_sigdig` conventions; half-up rounding is a required regression test — R's banker's rounding is a known R-vs-SAS trap).

Headers/footers require study number, analysis set, and data cut-off on every display — an ICH E3 requirement and the top TransCelerate-template critique.

### 4.3 The change-request loop

```
request ("add a risk-difference column to the AE overview")
  → agent proposes a diff to analysis.yaml/display.yaml (or custom.R)
  → human approves the diff
  → pipeline regenerates: new outputs/<slug>/vNNN/ + iterations.yaml entry
  → assembler re-resolves every text binding that references the display
  → CI: ARD snapshot diff is surfaced, numeric-fidelity gate re-checks prose
```

One transaction, fully versioned, every artifact reproducible from the commit.

## 5. The Text Library

Blocks are markdown files with YAML frontmatter:

```yaml
id: TXT-E3-1202          # keyed to ICH E3 section numbering
e3_section: "12.2.1"     # Brief Summary of Adverse Events
tier: parameterized       # boilerplate | parameterized | generated
displays: [t-ae-overview] # ARDs this block may bind
approval: { state: approved, by: "@jwildfire", at: 2026-07-25 }
provenance: { model: null, prompt: null }   # populated for tier: generated
```

Body prose binds every number: `Overall, {{ard:t-ae-overview:pop=safety;stat=n_ae_pct;group=Xanomeline High Dose}} of subjects experienced at least one adverse event…`

Rules enforced in CI:

- **Numeric fidelity (TXT gate):** any digit sequence in *rendered* prose must originate from a binding (allowlist for section numbers/citations). No hand-typed results, ever.
- **Reference resolution:** every binding must resolve against the display's current ARD; a regenerated ARD that orphans a binding fails the build loudly instead of shipping a stale sentence.
- **Review evidence:** `generated`-tier blocks are draft until a human approval lands in frontmatter; approval state renders on the evidence pages alongside automated results.

## 6. The Report Template Library

`library/templates/ich-e3/` encodes ICH E3 as data:

- `sections.yaml` — the full 16-section skeleton + appendices (from E3, seeded with TransCelerate CSR Template V005 + CORE Reference structure), each section: number, title, slug, content model (prose / in-text displays / post-text index).
- `assembly.yaml` — per-CSR configuration: which displays fill which slots, 14.x position assignment, which text blocks populate which sections, study metadata (study number, cut-off).
- Section 14 carries the post-text displays; Section 16.1.9 is **auto-generated provenance** (package versions, ARD hashes, data manifests, session info) — E3 reserved that slot in 1995; open.csr fills it mechanically.

The Node assembler (`scripts/assemble.mjs`) walks the model, resolves text bindings against `ard.json` files, places display variants, assigns numbering, and emits the CSR as navigable HTML (demo) — RTF/DOCX whole-document assembly via `r2rtf::assemble_rtf/assemble_docx` is the roadmap submission path.

## 7. Agentic assistance

Three agent roles, all constrained to the same contract — *agents write source, never outputs; humans approve; the pipeline is the only thing that regenerates*:

| Role | Acts on | Typical request | Gate |
|---|---|---|---|
| **TFL programmer** | `analysis.yaml`, `display.yaml`, `custom.R` | "split the AE table by severity" | spec diff review |
| **Medical writer** | text blocks (`generated` tier), bindings | "draft the 12.2.1 brief summary from the current ARDs" | block approval + numeric-fidelity gate |
| **QC reviewer** | requirement matrices, tests, evidence | "verify the demographics table against DSP-DEMO-00x" | evidence pages |

Regulatory posture (per EMA reflection paper 2024, FDA draft credibility framework Jan 2025, joint FDA-EMA Good AI Practice principles Jan 2026): documented context of use, close human supervision, traceable provenance, system-level performance evidence. D7–D9 are the concrete mechanisms; the evidence site is the performance record.

## 8. Traceability and quality evidence

Every number on the site can answer five questions — *which dataset, which spec, which ARD row, which display, which sentence*:

```
adam (pkg version + hash) → data-prep manifest → ard.json (rows + envelope)
  → display vNNN (manifest: spec hash, commit) → CSR slot (assembly.yaml) → text binding
```

The quality framework is the safety.viz loop with one extension:

- `quality/requirements/*.md` — one matrix per component (TFL engine, each display family, text, templates, traceability, QC itself).
- Test titles carry requirement IDs; guard tests enforce the convention in both testthat and vitest suites.
- `qc/run-tests.R` emits testthat results as JSON; `scripts/evidence.mjs` normalizes testthat + vitest into per-module `evidence.json` (with a build-time report of unresolved IDs — a known safety.viz blind spot).
- Evidence artifacts: **committed ARD snapshots** (primary), rendered display HTML/PNG (secondary), and human review records for text blocks.
- Evidence pages publish per module on the demo site; the done-gate for any display is *on the site with evidence*, matching the safety.viz renderer done-gate.

## 9. The demo application

Static site on GitHub Pages (no server — everything precomputed by the pipeline), safety.viz-style shell:

1. **Home** — the concept, the closed loop, architecture diagram.
2. **TFL Gallery** — card per display: live preview, regulatory ID, status; detail page tabs: rendered table · ARD (searchable) · specs · **iteration timeline** (the change-request story, diffs included).
3. **CSR Reader** — the assembled document; click any bound number or display → trace panel showing the full data→ARD→display→sentence chain.
4. **Text Library** — blocks with tier, approval state, bindings.
5. **Quality** — requirement matrices, evidence pages, coverage.
6. **Design & Research** — this document and the research series.

## 10. Delivery phases

- **v0 (this session):** repo + research + this design; pipeline with data-prep + ARD engine; ~6 displays (demographics `DMT01`, disposition `DST01`, exposure `EXT01`, AE overview `AET01`, common AEs `AET02`, SAE listing, one lab figure); text blocks for disposition/demographics/AE summary; E3 skeleton + assembled demo sections (title, 10.1, 11.2, 12.1–12.2, 14.x, 16.1.9); at least one real iteration ledger on a display; evidence framework live; Pages deployed.
- **v0.2:** full FDA ST&F-aligned safety TFL set (track `{cardinal}`); RTF outputs across the library; ADRG-fragment generation per display; agent-assisted change-request workflow demonstrated end-to-end in CI.
- **v0.3:** efficacy — derive ADADAS-class dataset from `{pharmaversesdtm}` QS; full E3 section coverage; whole-CSR RTF/DOCX assembly; ARS v1.0 JSON import/export.
- **v1:** interactive agent loop on the live site (request → PR → preview); multi-study support; validation dossier generated from the evidence stream.

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| `{cards}` serialization gap | Owned `ard.json` schema from day one (D5); revisit when upstream ships a serializer |
| `{tfrmt}` pre-1.0 churn | Keep display.yaml as our stable dialect; tfrmt is a rendering target, not the spec |
| pharmaverseadam efficacy gap | Scoped out of v0 explicitly; derivation plan documented (D12) |
| Numbers in prose sneaking past the gate | Binding syntax + digit lint + orphan-binding failures (D7); gate tested against seeded violations |
| Evidence framework drift from safety.viz upstream | Port is vendored + documented; sync opportunistically, not automatically |

## 12. Deferred: in-app review workflow (2026-07-25)

In-app text review and sign-off was built and then removed on the same day. The built version let a reviewer connect a GitHub token in the browser, approve or request changes on a block, and have a `text-decision` repository dispatch applied by a workflow that edited the frontmatter, re-ran the gates and committed. It worked; it was premature.

**Why it was removed.** A platform gap analysis of this portfolio (`obot.roadmap`, 2026-07-25) found the whole review-workflow layer — review state, change-since-last-review, annotation, issue tracking, alerting — missing across every repo and present on nearly every competing platform. That makes review workflow a large cross-cutting platform build, not a feature of one report builder. The intended shape is a **study-level GitHub configuration repository** as the project-management surface for CSR tasks and decisions, which would own review across displays, prose and specs rather than only prose. Shipping a bespoke sign-off lane inside open.csr first would have committed the design to the wrong surface. The code is in git history (commit `cc85b81`) and can be retrieved when that build starts.

**What remains, and is not affected.** Approval state stays exactly where it was: `approval.state` / `by` / `at` in each block's frontmatter (D8), with `provenance.model` and `provenance.prompt` on generated blocks. The **assembler gate stays** — a `generated`-tier block that is not `approved` is excluded from the assembled report and the exclusion is recorded (D8, contracts §6 gate c). Approving a block is a source edit, applied by the pipeline like any other. Status is surfaced read-only in the Demo app's Text pane: tier, state, provenance, resolved prose, resolved bindings, and which blocks are blocking assembly.

Until the platform layer exists, this is the honest position: **status is tracked in the data and shown in the UX; there are no users, no roles and no in-app sign-off.**

---

*This design was drafted by Claude Code using Fable 5 in an unattended ultracode session and not yet reviewed by @jwildfire.*
