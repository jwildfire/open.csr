# Requirement matrix — Text Library (`TXT-`)

Requirements for the ICH E3-aligned prose library and the three CI gates that make
design decision **D7** — *text blocks bind numbers, never state them* — an enforced
build property rather than a review convention.

Scope: [`library/text/`](../../library/text) (the blocks themselves) and
[`scripts/text-lib.mjs`](../../scripts/text-lib.mjs) (parsing, binding resolution,
rendering and the gates). Placement of blocks into E3 sections is
[`templates.md`](templates.md); production of the ARDs the blocks bind is
[`tfl-engine.md`](tfl-engine.md); the trace panel that renders a binding on the site is
[`traceability.md`](traceability.md).

## Requirement context

- **D7** — every number in prose is a `{{ard:…}}` reference resolved at assembly; CI
  fails any digit in rendered prose that did not come from one.
- **D8** — three reuse tiers (`boilerplate` / `parameterized` / `generated`), each block
  carrying version, approval state, source ARD references and — for `generated` — the
  model and prompt that produced it.
- **D9** — agents write source, humans approve; a `generated` block is draft until a
  human approval lands in its frontmatter.
- [Contracts §5](../../docs/design/contracts.md) fixes the binding address grammar;
  [contracts §6](../../docs/design/contracts.md) fixes the block format and the gates.

**Verification** names the vitest file whose test titles carry the requirement ID.
Seeded-violation fixtures live in
[`tests/fixtures/blocks/`](../../tests/fixtures/blocks/README.md); every gate is proved
by at least one test that makes it fail.

## Block model

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| TXT-BLOCK-001 | A block file parses into frontmatter fields (`id`, `e3_section`, `title`, `tier`, `displays`, `allow_digits`, `approval`, `provenance`, `requirements`, `disclosure`) and a prose body, with the frontmatter never leaking into the body. | Functional | `text-blocks.test.js` | Verified |
| TXT-BLOCK-002 | Validation rejects an unknown tier, an unknown approval state, and a `generated`-tier block that does not name the model and prompt that produced it. | Functional | `text-blocks.test.js` | Verified |
| TXT-BLOCK-003 | The shipped library loads with unique block ids and no structural errors; every `.md` file in `library/text/` is a block. | Functional | `text-blocks.test.js` | Verified |
| TXT-BLOCK-004 | Every block declares at least one requirement ID matching `^[A-Z]{2,4}-[A-Z]+-\d+[A-D]?$`, and the library exercises all three reuse tiers. | Traceability | `text-blocks.test.js` | Verified |
| TXT-BLOCK-005 | Every `generated`-tier block records `provenance.model` and a substantive `provenance.prompt`, so agent-drafted prose is attributable. | Traceability | `text-blocks.test.js` | Verified |
| TXT-BLOCK-006 | A block's file name is its id, so a block referenced from an assembly or an evidence page is addressable on disk without a lookup. | Functional | `text-blocks.test.js` | Verified |

## Binding addresses and resolution

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| TXT-BIND-001 | A binding address parses into display, analysis and statistic name, plus the qualifiers `group`, `group2`, `variable`, `variable_level`, `digits` and `scale`. | Functional | `text-bindings.test.js` | Verified |
| TXT-BIND-002 | A malformed address, an empty component, an unknown qualifier, a non-integer `digits` or a non-numeric `scale` raises rather than degrading to a silent empty value. | Functional | `text-bindings.test.js` | Verified |
| TXT-BIND-003 | A binding resolves only when exactly one ARD row matches; the resolved row is returned alongside the value so the chain back to the ARD is never lost. | Functional | `text-bindings.test.js` | Verified |
| TXT-BIND-004 | A binding matching more than one ARD row fails as ambiguous, reporting the match count — an under-specified address never silently takes the first row. | Functional | `text-bindings.test.js` | Verified |
| TXT-BIND-005 | A binding matching no ARD row fails as orphaned, so a regenerated ARD that drops a statistic breaks the build instead of shipping a stale sentence. | Functional | `text-bindings.test.js` | Verified |
| TXT-BIND-006 | A binding to a display with no ARD at all fails with the display named, rather than rendering an empty string. | Functional | `text-bindings.test.js` | Verified |
| TXT-BIND-007 | The `variable`, `variable_level` and `group2` qualifiers select a single row within a hierarchical (SOC/PT) ARD. | Functional | `text-bindings.test.js` | Verified |
| TXT-BIND-008 | The whole-library gate run aggregates every resolution failure, block by block, instead of stopping at the first. | Functional | `text-gates.test.js` | Verified |

## Value formatting

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| TXT-FMT-001 | Rounding in prose is half-up, not R's half-to-even, so a number in a sentence matches the same number rounded by SAS or by the display layer. | Functional | `text-bindings.test.js` | Verified |
| TXT-FMT-002 | Integers render with no decimal point; `digits` fixes the number of decimal places; a null statistic renders as an empty string and a character statistic renders verbatim. | Functional | `text-bindings.test.js` | Verified |
| TXT-FMT-003 | The `scale` qualifier converts the ARD's proportion in [0,1] to a percentage for prose without altering the resolved ARD value recorded on the binding. | Functional | `text-bindings.test.js` | Verified |

## Rendering and cross-references

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| TXT-REND-001 | Rendering substitutes every token in the body and records the character span each substituted value occupies; those spans are the only evidence the numeric-fidelity gate accepts. | Functional | `text-bindings.test.js` | Verified |
| TXT-REND-002 | An unresolved binding renders as a visible, non-numeric marker and is reported as an error — a stale or guessed number is never substituted in its place. | Functional | `text-bindings.test.js` | Verified |
| TXT-XREF-001 | `{{xref:display:<slug>}}` renders the label and number assigned at build time (Table / Listing / Figure), and `{{xref:section:<number>}}` renders "Section N" or "Appendix N" — so prose never types a 14.x number the assembler owns. | Functional | `text-bindings.test.js` | Verified |
| TXT-XREF-002 | A cross-reference to a display or section that does not exist fails the build, exactly like an orphaned binding. | Functional | `text-bindings.test.js` | Verified |
| TXT-XREF-003 | Every cross-reference in the assembled CSR resolves. | Functional | `assemble-document.test.js` | Verified |

## Gate: numeric fidelity

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| TXT-NUM-001 | Prose whose every digit run originates in a resolved binding or cross-reference passes the gate. | Functional | `text-gates.test.js` | Verified |
| TXT-NUM-002 | A hand-typed result in prose fails the gate, reporting the block, the offending value and its surrounding context. | Functional | `text-gates.test.js` | Verified |
| TXT-NUM-003 | Digits inside inline code and fenced code blocks are exempt. | Functional | `text-gates.test.js` | Verified |
| TXT-NUM-004 | Digits inside a markdown link destination are exempt; digits in the link *text* are not, so a link is not a route around the gate. | Functional | `text-gates.test.js` | Verified |
| TXT-NUM-005 | The frontmatter `allow_digits` list exempts the literal strings it names — E3 section numbers, guideline references, analysis thresholds — and the gate reports how many times each exemption was used, so an allowlist is auditable rather than invisible. | Functional | `text-gates.test.js` | Verified |
| TXT-NUM-006 | An `allow_digits` entry exempts only the digit runs it literally covers; a partial match does not exempt the surrounding number. | Functional | `text-gates.test.js` | Verified |
| TXT-NUM-007 | The gate reads the *rendered* prose and attributes digits by span, so withholding the spans turns every bound value into a violation — the gate cannot be satisfied by prose that merely looks resolved. | Functional | `text-gates.test.js` | Verified |
| TXT-NUM-008 | Every block in the shipped Text Library passes the numeric-fidelity gate against the current ARDs. | Functional | `text-gates.test.js` | Verified |

## Gate: approval

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| TXT-APPR-001 | A `generated`-tier block whose approval state is not `approved` is excluded from assembly, with the reason recorded. | Functional | `text-gates.test.js` | Verified |
| TXT-APPR-002 | An approved `generated`-tier block is included. | Functional | `text-gates.test.js` | Verified |
| TXT-APPR-003 | The exclusion applies to the `generated` tier only; a non-approved `boilerplate` or `parameterized` block is included but flagged, because its content is not model-authored. | Functional | `text-gates.test.js` | Verified |
| TXT-APPR-004 | Every excluded block is listed in the gate report, so an exclusion is visible on the evidence pages rather than a silent omission from the document. | Traceability | `text-gates.test.js` | Verified |
| TXT-APPR-005 | The assembled CSR marks every draft generated block as excluded and reproduces the reason, and no such block is presented as part of the report. | Functional | `assemble-document.test.js` | Verified |

## Library integrity

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| TXT-LIB-001 | A block that binds a display absent from its frontmatter `displays` list is reported, keeping the declared dependency graph honest for the evidence pages. | Traceability | `text-gates.test.js` | Verified |
| TXT-LIB-002 | Every binding in the shipped Text Library resolves, and no block carries a structural error. | Functional | `text-gates.test.js` | Verified |
| TXT-LIB-003 | A binding that would render more decimal places than a display convention allows is surfaced as a precision warning rather than shipped silently. | Quality | `text-gates.test.js` | Verified |
| TXT-TRACE-001 | Every resolved binding in the assembled document carries the ARD row it came from, so a sentence traces to a statistic without a second lookup. | Traceability | `assemble-document.test.js` | Verified |

## Content — the sections the demonstration CSR fills

These requirements are about *what the prose says*, not about the machinery. Their
verification is the block's own gate result plus the recorded human approval in its
frontmatter — an automated suite cannot verify medical-writing judgement, so
`generated`-tier content stays **Draft** until @jwildfire approves it.

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| TXT-ETH-001 | ICH E3 sections 5.2 and 5.3 carry approved boilerplate covering GCP and Declaration of Helsinki conformance, ethics committee review, and informed consent including consent by a legally acceptable representative for a cognitively impaired population. | Content | `text-blocks.test.js` | Verified |
| TXT-DESIGN-001 | Sections 9.1 and 9.8 describe the design, randomisation, blinding and treatment groups, state the number of patients randomised per group as bound values, and record that no change was made to the planned analyses outside the documented amendments. | Content | `text-blocks.test.js` | Verified |
| TXT-DISP-001 | Section 10.1 reports completion and discontinuation by treatment group from the disposition ARD, and states plainly that the analysis dataset records no reason for the majority of discontinuations rather than attributing them. | Content | `text-blocks.test.js` | Verified |
| TXT-POP-001 | Section 11.1 defines the safety analysis set, states its size by treatment group, and records that no efficacy analysis set exists for this study (design D12). | Content | `text-blocks.test.js` | Verified |
| TXT-DEMO-001 | Section 11.2 summarises age, sex and race by treatment group from the demographics ARD and notes the generalisability limit that the population's composition implies. | Content | `text-blocks.test.js` | Verified |
| TXT-EXP-001 | Section 12.1 reports duration of exposure and the cumulative exposure thresholds by treatment group, and states the exposure imbalance as a caveat on crude adverse event frequencies. | Content | `text-blocks.test.js` | Verified |
| TXT-AE-001 | Section 12.2.1 summarises treatment-emergent adverse events overall and by treatment group — any event, related events, maximum severity, serious events and fatal outcomes — with every quantity bound to the AE overview ARD. | Content | `text-blocks.test.js` | Verified |
| TXT-AE-002 | Section 12.2.2 describes the system organ class and preferred term pattern in frequency order, identifies the dose gradient where one exists, and does not assert a gradient where the ARD does not show one. | Content | `text-blocks.test.js` | Draft (generated tier, pending approval) |
| TXT-AE-003 | Section 12.2.4 points to the by-patient adverse event listing and the serious adverse event listing, and records the header and anonymisation requirements that apply to them. | Content | `text-blocks.test.js` | Verified |
| TXT-SAE-001 | Section 12.3.1 reports deaths, serious adverse events and severe adverse events by treatment group and states explicitly where the event count is too small to support inference. | Content | `text-blocks.test.js` | Draft (generated tier, pending approval) |
| TXT-CONC-001 | Section 12.6 ranks the safety findings by importance, separates local tolerability from systemic serious toxicity, states the exposure caveat, and draws no benefit-risk conclusion in the absence of efficacy data. | Content | `text-blocks.test.js` | Draft (generated tier, pending approval) |
| TXT-DISC-001 | Section 13 integrates disposition, exposure and adverse event findings into one argument and states the limitations — exposure imbalance, missing discontinuation reasons, population composition and the absence of efficacy data — without introducing any fact absent from the referenced ARDs. | Content | `text-blocks.test.js` | Draft (generated tier, pending approval) |

## Text status view — the surface

The approval gate above (`TXT-APPR-*`) decides what assembles. These requirements
are about the surface that *shows* where every block stands: the Text pane of the
Demo app — tier, approval state, provenance, resolved prose and resolved bindings,
and which blocks the gate is currently holding out of the report.

The view is **read-only**. In-app sign-off (a browser-dispatched decision applied by
a workflow) was built on 2026-07-25 and removed the same day: review workflow belongs
to the study-level GitHub configuration repos rather than to a point solution inside
one report (see [design §12](../../docs/design/design.md)). Approval is recorded in a
block's frontmatter and applied by the pipeline; `TXT-REVIEW-007` is the requirement
that the surface says so rather than offering a control that does nothing.

Scope: [`scripts/text-status-lib.mjs`](../../scripts/text-status-lib.mjs), rendered
as the Demo app's Text pane by [`scripts/site.mjs`](../../scripts/site.mjs). The
catalogue view of the same blocks — the per-block permalink at `/text/#<block-id>` —
is `site-lib.mjs` and is covered by [`quality.md`](quality.md) (`QC-SITE-*`).

| ID | Requirement | Type | Verification | Status |
|---|---|---|---|---|
| TXT-REVIEW-001 | The block list puts draft `generated`-tier blocks first — the blocks the assembly gate is holding out of the report — then every other block in ICH E3 section order. | Functional | `text-status.test.js` | Verified |
| TXT-REVIEW-002 | Each block is shown as *resolved prose*: every binding replaced by its value from the committed ARD, each value visually distinguished from the writer's words and linked to the binding row it came from. An unresolved binding renders a marker, never a number. | Functional | `text-status.test.js` | Verified |
| TXT-REVIEW-003 | A `generated`-tier block shows its provenance prominently — model, generation date and the **full** prompt — beside the prose rather than below the bindings; a human-written block says so explicitly; a generated block with no prompt is called out as unauditable. | Traceability | `text-status.test.js` | Verified |
| TXT-REVIEW-004 | Every binding is resolved into a table giving the address, the ARD row it selects (analysis, statistic, group and level) and the value as the sentence shows it — scale and digits included — so a number can be checked without opening another page. A repeated address is one counted row; an unresolved one carries its reason. | Functional | `text-status.test.js` | Verified |
| TXT-REVIEW-005 | Each block links its source file on GitHub, every display it binds, and the display detail page behind each binding row. | Traceability | `text-status.test.js` | Verified |
| TXT-REVIEW-006 | Each block shows its tier, its current approval state and its E3 section, and a block excluded from assembly is labelled as blocking. | Functional | `text-status.test.js` | Verified |
| TXT-REVIEW-007 | The view is a status view and nothing else: it emits no button, form, input or script, names no credential, token or API host, and states where approval is recorded and what enforces it — without describing or promising a sign-off workflow. | Functional | `text-status.test.js` | Verified |
| TXT-REVIEW-008 | The view references no external resource, derives its source links from `repoUrl` when no branch is configured, and renders in full for a repository with no source configuration at all. | Functional | `text-status.test.js` | Verified |

## Known limitations

- The numeric-fidelity gate catches **digits**. A number spelled as a word ("three
  patients") is invisible to it. The shipped library spells out only quantities that are
  properties of the design (three treatment groups, five percent), never results.
- `allow_digits` is a human decision recorded in the block. It is auditable — every use
  is counted and reported — but it is not itself verified against the data. Prefer a
  literal that includes its unit (`"180 days"`) over a bare number, so the exemption
  cannot accidentally cover a result.
- Analysis thresholds quoted in prose (30 / 90 / 180 days) are allowlisted literals
  rather than bound values, because the ARD carries the statistic but not the analysis
  label. Binding the label is roadmap.
