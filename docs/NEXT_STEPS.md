# open.csr — proposed next steps

Written 2026-07-25, at the end of the kickoff session; revised the same day when in-app review was deferred (design §12). v0 is live: [demo site](https://jwildfire.github.io/open.csr/), [research](../research/README.md), [design](design/design.md), [contracts](design/contracts.md).

## What v0 proved

The closed loop works end to end on real data. A change request to the AE table became a spec edit, regenerated as `v002` with a recorded actor and rationale, and the site renders the two-iteration history. Every number in the assembled CSR is a binding, and clicking one shows the dataset, the spec, the ARD file and its hash, the display, and the iteration that produced it. 70 testthat + 227 vitest tests, 210 reviewed requirements, 99% requirement coverage, published as evidence pages.

What v0 did *not* prove: that a human medical writer finds this workflow usable, that the outputs survive contact with a real submission format, or that an agent can drive the loop without a human wiring each change by hand. Those are the next three questions, and they order the work below.

## Decisions needed from @jwildfire

These change what gets built, so they come before the work:

1. **Is open.csr a keynote asset or a side project?** It is a genuinely novel public artifact — the first open-source CSR builder, and the first machine-readable ICH E3 model — and it demonstrates the agentic-development story on unfamiliar ground rather than on safety.viz's home turf. But it is also a fourth workstream competing with charts, the app, and autonomy. If it is a keynote asset it needs its own goal issue and a slot in the arc; if not, it should be parked as a public artifact with a clear "research prototype" framing.
2. **Approve or reject the four draft text blocks** (`TXT-E3-1206`, `-1222`, `-1231`, `-1300`). They are agent-drafted prose in the `generated` tier, currently excluded from the assembled report by the approval gate. Read them in the Demo's Text view, which shows the prompt behind each one and every number resolved to its ARD row; approving one is an edit to `approval.state` in the block's frontmatter, and the next build assembles it. Reading them is the fastest way to judge whether agent-drafted CSR prose is any good.
3. **Install the obotclaw GitHub App on open.csr.** The selected-repositories installation doesn't cover it, so this session's commits are authored by `jwildfire` rather than the bot, breaking the attribution convention.
4. **Does this repo adopt the standard merge policy** (`obot-merge`, dev/main branch model)? v0 went straight to `main` because the repo was empty; that shouldn't continue by default.

## Priority 1 — make it credible to a statistician

- **Submission-format output.** `{r2rtf}` RTF for all six displays, with the page/pagination/footnote grammar the research identified as the real submission contract. Today's `gt` HTML is preview-quality only. This is the single biggest gap between "nice demo" and "a statistician would take this seriously."
- **A figure.** All six v0 displays are tables or listings; the `figure` method is dispatch-only and untested in practice. A KM plot or an AE-frequency figure exercises it and fills an obvious hole in a *T-F-L* builder.
- **Track `{cardinal}`.** It implements ~26 of FDA's Standard Safety Tables and Figures on the same `{cards}` stack. Either adopt it as the display library or document precisely why open.csr's specs differ — being the odd stack out is a real adoption risk.
- **Upgrade the pinned packages.** The build runs `cards` 0.6.1 / `gtsummary` 2.3.0 / `tfrmt` 0.1.3 locally against much newer CRAN releases. The versions are recorded honestly in every ARD, which makes the drift visible — and worth closing.

## Priority 2 — make it usable by a medical writer

- **A writing surface.** Editing markdown with `{{ard:...}}` bindings by hand is a programmer's workflow. The Demo's Text view now shows a writer the prose, its provenance and the displays it references, but only as status — there is no way to act on it from the page, and deliberately so (design §12). A change request from the browser lands with the review-workflow platform build, not before it.
- **Bind the analysis vocabulary.** Prose still hard-codes analysis constants ("30 days", "180 days") as `allow_digits` literals because the ARD carries statistics but not analysis labels. Extending the ARD to carry its own analysis metadata closes the last hole in the numeric-fidelity gate.
- **Section 16.2 patient listings and 14.3.3 narratives.** These are where medical writers spend real effort, and 14.3.3 is the flagship agentic section: per-patient narratives generated from listings with human approval.

## Priority 3 — close the agentic loop

- **A change-request agent** that takes a plain-language request ("split the AE table by severity"), edits the specs, regenerates, and opens a PR with the before/after ARD diff in the body. The pipeline is deterministic and every artifact is hashed, so the diff is reviewable — this is the demo that makes the whole concept legible in thirty seconds.
- **ARD-diff review.** A regenerated display's changed values should be surfaced as a table in the PR, not buried in a JSON diff. This is also the QC mechanism that replaces double programming.
- **Live request on the deployed site** (the v1 vision): request → dispatch → PR → preview. The audit-page pattern from hub#109 is the mechanism, but it is now blocked on the same decision as text review: which surface owns requests and decisions (design §12). Build the agent and the ARD diff first; they are useful with no browser lane at all.

## Priority 4 — reach

- **Efficacy displays**, which requires deriving an ADADAS-class dataset from `{pharmaversesdtm}` QS (design D12). Until then open.csr demonstrates safety reporting only, which undersells it.
- **ARS v1.0 JSON import/export**, making open.csr the public reference implementation of the CDISC standard → display → document chain that the research found nobody has published.
- **Tell people it exists.** The pharmaverse community, the R Consortium submission working group (Pilots 6 and 7 launched in January 2026 on exactly this territory), and R/Pharma are the natural audiences. This is the cheapest high-leverage step on the list, and it is blocked only on decision 1.

## Deferred

- **In-app review and sign-off** was built on 2026-07-25 and removed the same day: review workflow belongs to a study-level GitHub configuration repo covering displays, prose and specs, not to a bespoke lane inside one report ([design §12](design/design.md), platform gap analysis 2026-07-25). Approval state and the assembler's approval gate are unchanged; the Demo's Text view surfaces status read-only. The removed code is in git history at commit `cc85b81`.

## Known defects carried from v0

- `assemble.mjs` has no `--check` freshness mode, so a stale `docs/assembled/csr.json` would render silently. CI sidesteps this by always re-assembling; a guard is the real fix.
- `l-ae-serious` has no numeric ARD rows (listing passthrough), so numeric regression can't cover it.
- `QC-CI-001`/`QC-CI-002` are evidenced by workflow runs rather than tests, and show as uncovered on the Quality page.
- Placebo has no `ADEX` dose-intensity records, and ADSL has no `DCSREAS` — both surfaced as footnotes and asserted by tests rather than hidden, but both are honest data limitations of the demo dataset.
