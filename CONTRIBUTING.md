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

Demo data is [`{pharmaverseadam}`](https://pharmaverse.github.io/pharmaverseadam/) CDISCPILOT01 only. **Never commit study data** — everything must be regenerable from public packages. Population flags are derived in `prepare_data()`; don't assume a flag exists on the raw dataset.

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
