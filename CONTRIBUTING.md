# Contributing to open.csr

Thanks for your interest. open.csr is early — the design is settled enough to build against, and the surface area where contributions help most is displays, text blocks, and template coverage.

## The one rule

**Source is edited; outputs are generated.** A change to a table is a change to its specs (`library/tfl/<slug>/analysis.yaml`, `display.yaml`, or `custom.R`), never to the rendered artifact. Everything under `outputs/`, `docs/assembled/`, `docs/evidence/`, `docs/requirements/`, and `site/_build/` is produced by the pipeline and will be overwritten.

This is what makes the project's central claim true: every number in the report traces to the code and data that produced it, and every iteration is reproducible from its commit.

## Setup

```bash
# R side
Rscript -e 'install.packages(c("cards","cardx","gtsummary","gt","tfrmt","pharmaverseadam","r2rtf","digest","yaml","jsonlite","testthat","pkgload"))'
# JS side
npm install
```

## The loop

```bash
Rscript -e 'pkgload::load_all("pipeline"); regenerate("t-ae-overview")'  # rebuild a display
Rscript qc/run-tests.R      # R tests
npx vitest run              # JS tests
node scripts/assemble.mjs   # assemble the CSR
node scripts/site.mjs       # build the demo site
```

## Adding a display

1. Create `library/tfl/<slug>/analysis.yaml` and `display.yaml` following [`docs/design/contracts.md`](docs/design/contracts.md) §2–§3. Use a `t-`/`l-`/`f-` prefix and cite a regulatory ID (FDA Standard Safety Tables and Figures, or a chevron ID like `AET01`) where one applies.
2. Add requirement rows to `quality/requirements/displays.md` with `DSP-` IDs.
3. Write testthat tests in `pipeline/tests/testthat/` that assert ARD values against independently computed results — not just that the code runs. Test titles must read `"DSP-XXX-001: description (#<issue>)"`; a guard test enforces this.
4. `regenerate("<slug>")`, then add the display to `site/config.json`.

## Adding a text block

Text blocks live in `library/text/` with YAML frontmatter (contracts §6). **Never type a number into prose** — bind it: `{{ard:t-ae-overview:any_ae:n;group=Placebo}}`. CI fails on any digit in rendered prose that doesn't resolve to a binding, and on any binding orphaned by a regenerated ARD.

Agent-drafted blocks use `tier: generated` with `approval.state: draft` and honest `provenance` (model, prompt). Draft blocks are excluded from assembly until a human approves them.

## Data

Demo data is CDISCPILOT01 — the CDISC SDTM/ADaM pilot's xanomeline Alzheimer's study — from two packagings, chosen per dataset by `data_sources()` (design D12). Population flags are derived or asserted in `prepare_data()`; don't assume a flag exists on the raw dataset.

**The rule: never commit study data.** Everything must be regenerable from public packages. That is the default, and it has exactly one exception.

**The exception: the CDISCPILOT01 ADaM extracts under `pipeline/inst/extdata/phuse-cdiscpilot01/`.** They are committed deliberately, because they are public test data published under the MIT licence and no equivalent exists in `{pharmaverseadam}` — which is precisely what made the efficacy and laboratory displays impossible to build at all (design D12). They are not regenerable from any R package, so the alternative to committing them was not having them.

What makes the exception safe rather than merely convenient:

- The licence was established first-hand, not assumed. [`phuse-org/phuse-scripts`](https://github.com/phuse-org/phuse-scripts) ships an MIT `LICENSE.md`, reproduced verbatim at [`LICENSE-phuse-scripts.md`](pipeline/inst/extdata/phuse-cdiscpilot01/LICENSE-phuse-scripts.md) beside the data it covers and attributed in [`NOTICE`](NOTICE), as Apache-2.0 §4 requires of a redistribution.
- Provenance is verified, not asserted. `qc/vendor-phuse-data.R` fetches the upstream commit's tree, recomputes git's blob SHA-1 from the downloaded bytes, and refuses to write a file whose SHA does not match; `--check` re-verifies the committed files and CI runs it. A vendored file is therefore provably the upstream file, not merely something that parses.
- Every file's origin — repository, commit, path, digest — is recorded in [`PROVENANCE.json`](pipeline/inst/extdata/phuse-cdiscpilot01/PROVENANCE.json).

**What the exception does not cover.** Real study data from any trial, ever. Anything whose licence has not been established first-hand. And anything from the RConsortium submission-pilot repositories, which are GPL-3.0 or carry no licence at all, and are incompatible with this repository either way. Widening the exception is a design change: raise it before writing the file, not after.

Recorded 2026-08-27 (#39, #41) on @jwildfire's decision — *"the never commit study data rule is ok to violate here since it's public data under MIT."* Amended rather than broken silently, so that the repository's rules and its contents describe the same thing.

## Pull requests

Keep changes scoped, include the tests, and make sure `npx vitest run`, `Rscript qc/run-tests.R`, and the site build all pass. If your change alters an interface in `docs/design/contracts.md`, say so explicitly — that's a design change and needs discussion first.

## Site previews

The demo site is published from the `gh-pages` branch in three tiers, so what a change looks like is reviewable before it merges:

| Tier | URL | Built from |
| --- | --- | --- |
| Release | https://jwildfire.github.io/open.csr/ | pushes to `main` |
| Development | https://jwildfire.github.io/open.csr/dev/ | pushes to `dev` |
| Preview | `https://jwildfire.github.io/open.csr/pr/{N}/` | same-repo pull requests |

Every same-repo PR gets a preview at its own path plus a sticky comment linking it; the link is refreshed on each push and the preview pages become redirects to the dev site when the PR closes. PRs from forks get no preview — their token cannot write to `gh-pages`. Because previews are served from a nested path, the site build must stay relative-URL only; `node scripts/site.mjs` fails on a broken internal link or any external resource reference, which keeps that property honest.
