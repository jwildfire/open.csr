# webR spike — can the real pipeline regenerate a display in the browser?

Run 2026-07-25 against `dev` @ `fa51269`. Requirement: [obot.roadmap#113](https://github.com/jwildfire/obot.roadmap/issues/113), task *"webR spike: can the real pipeline regenerate a display in the browser?"*. Goal: [#112](https://github.com/jwildfire/obot.roadmap/issues/112).

**Answer: yes — and it is numerically faithful. But it must not be the authority.**

The spike selects a **hybrid**: webR regenerates in the browser for *preview*, GitHub Actions regenerates in the pinned environment for the *committed iteration*. Neither of the two candidates in #113 wins outright; the reason is provenance, not capability, and it is set out in §5.

---

## 1. What was tested

The question was deliberately narrow: **can webR run the real `opencsr` pipeline — `{cards}` on `{pharmaverseadam}` — well enough to regenerate a display from an edited `analysis.yaml`?** Not "does webR work", which is already known, but "does *our* pipeline work, on *our* data, producing *our* numbers".

Four harnesses, all reproducible:

| Harness | Environment | What it answered |
|---|---|---|
| `spike.mjs` | webR 0.6.0 under Node 24 | availability, install cost, first breakages |
| `spike3.mjs` | same | all six displays' ARDs, exported and diffed against the committed ARDs |
| `spike4.mjs` | same | `render_display()` and full `regenerate()` end to end |
| `local.html` / `persist.html` | Chrome, local HTTP server with **no COOP/COEP headers** | real browser boot time, exact bytes over the wire, package persistence |

The browser harness deliberately served the runtime from a plain static server sending no cross-origin-isolation headers — that is the GitHub Pages condition, and it constrains which webR channel is usable (§4).

## 2. Dependency availability — no gaps

`repo.r-wasm.org` serves **22,741** WebAssembly package builds for R 4.6. Every `opencsr` dependency is present, and so is the full transitive closure:

- Direct `Imports`: `cards`, `cardx`, `dplyr`, `digest`, `gt`, `jsonlite`, `rlang`, `tibble`, `yaml` — all present.
- `Suggests` that matter: `pharmaverseadam`, `gtsummary`, `testthat` — all present.
- Transitive closure of the nine runtime deps: **58 packages, 56.0 MB** of tarballs.

There is no missing-package blocker. `{pharmaverseadam}` — the one that could plausibly have been absent, being a data package — ships a wasm build.

## 3. Does the pipeline actually run? Yes, all of it

Mounting `pipeline/R/*.R` plus `library/tfl/<slug>/*` into the webR virtual filesystem and sourcing the package:

| Step | Result | Time |
|---|---|---|
| `prepare_data()` | `adsl` 254 rows, `adae` 1191 rows — matches the committed manifest | 4.4 s |
| `build_ard()` × 6 displays | 88 / 236 / 84 / 176 / 3048 / 33 rows — **every count matches the committed ARDs** | 1.7–3.7 s each |
| `render_display()`, both variants | valid `gt` HTML, real values (AE event counts 281 / 427 / 414 / 1122) | 1.0–2.2 s |
| `regenerate("t-ae-overview")` | wrote `v002/` with `analysis.yaml`, `display.yaml`, `ard.json`, `manifest.json`, `table.html`, `table-in-text.html` | 1.9 s |
| **spec edit → rebuild** | `t-ae-common` 3048 rows → 504 rows after adding `filter: AESEV == 'SEVERE'` | 2.2 s |

The last row is the product question, and it passes: a real change request applied to `analysis.yaml` in the browser produced a different, correct ARD. **A warm spec-edit round trip is ~2–4 seconds.** That is interactive.

### 3.1 Numeric fidelity — the decisive result

Each display's ARD was built in webR, serialised through the repo's own `write_ard()`, exported, and diffed row-by-row against the committed ARD that local R 4.3.3 produced.

**3,665 statistics across six displays. Zero value differences. Zero missing rows. Zero extra rows.**

```
t-ae-overview   (v001)   88 rows   shared 88     value diffs 0
t-demographics  (v001)  236 rows   shared 236    value diffs 0
t-disposition   (v001)   84 rows   shared 84     value diffs 0
t-exposure      (v001)  176 rows   shared 176    value diffs 0
t-ae-common     (v002) 3048 rows   shared 3048   value diffs 0
l-ae-serious    (v001)   33 rows   shared 33     value diffs 0
```

This held **despite a materially different package set**:

| | committed (local) | webR |
|---|---|---|
| R | 4.3.3 | 4.6.0 |
| `cards` | 0.6.1 | 0.8.0 |
| `dplyr` | 1.1.4 | 1.2.1 |
| `gt` | 1.0.0 | 0.11.1 |
| `pharmaverseadam` | 1.1.0 | 1.3.0 |

Two minor-version jumps in the statistical engine and a data-package jump, and not one number moved. That is a strong signal both for webR *and* for the pipeline's determinism — and it is the reason a browser preview can be trusted to show the truth.

## 4. Cost, measured in a real browser

Chrome, PostMessage channel, runtime served from a header-less static server (the Pages condition):

| | |
|---|---|
| webR runtime download | **12.66 MB gzipped, 5 files** (`R.wasm` alone 11.75 MB) |
| Boot to R prompt | **1.5 – 2.9 s** |
| Install the 58-package closure | **7.7 – 12.8 s** (56.0 MB; ~13 s cold) |
| First rendered table | **18 s warm, 24 s cold** |
| R heap after the six-display pipeline | ~200 MB |

Two things worth knowing:

- **The base R library is embedded in `R.wasm`** — only five files are fetched at boot, not a 26 MB virtual-filesystem tree. Boot is cheaper than the on-disk distribution size suggests.
- **Package install repeats on every page load.** Attempting to fix this with an IndexedDB-backed library (`FS.mount('IDBFS')` + `syncfs`) mounted cleanly and reported all 57 packages installed — but after a reload **only 1 of 57 survived**. Persistence is *available in principle and not working in practice*; the HTTP cache still shortens the reinstall to ~8 s, but "load once, use forever" is not on the table today without more work.

**Deployment consequence:** 12.66 MB + 56 MB cannot be loaded eagerly. webR has to be lazy — fetched only when a visitor opens the spec editor, behind an explicit "start the R engine" affordance that names the cost.

## 5. What breaks

Four findings, in ascending seriousness.

**(a) `gt::as_raw_html(inline_css = TRUE)` is hard-unsupported under webR.** It is the *only* call in the pipeline that fails, at `pipeline/R/render.R:473` in `standalone_html()`. `inline_css = FALSE` works and produces valid HTML. In-browser, inline CSS is unwanted anyway — the fragment renders into the app's own styled DOM. One argument, and the browser wants the other value.

**(b) `Sys.which()` does not exist in webR.** The git-commit probe warns and `git_commit` degrades to `null` — which contracts §10 already permits by design ("an artifact that cannot name its commit says so instead of guessing"). No fix needed; the contract anticipated this.

**(c) GitHub Pages cannot send COOP/COEP headers**, so `SharedArrayBuffer` is unavailable (`crossOriginIsolated: false`, verified). The SharedArrayBuffer channel is therefore out; the **PostMessage channel works** and was used for every browser measurement above. The cost is `webr::interrupt()` and stdin — neither of which a regenerate-on-click app needs.

**(d) The wasm repo is a rolling snapshot with no version pinning — this is the real problem.** `repo.r-wasm.org` serves one version per package per R release, and it moves. The consequence is not wrong numbers (§3.1 settles that) but a **divergent provenance envelope**:

```
committed:  adsl 254 × 60 cols  sha256:f9a1c360…  pharmaverseadam 1.1.0
webR:       adsl 254 × 61 cols  sha256:31c804e9…  pharmaverseadam 1.3.0
```

Row counts agree; column counts and therefore data hashes do not. So **ARD *value* equality holds while ARD *snapshot* equality (D4) breaks.** A browser-generated `ard.json` is not byte-identical to a CI-generated one, and its `provenance.environment` records a package set that no CI run will ever reproduce. D5's envelope stops being an audit record and becomes a description of one visitor's browser.

**Mitigation found:** old tarballs stay served after the index moves on — `pharmaverseadam_1.1.0.tgz` still returns 200 from the R 4.4 and 4.5 trees even though both indexes now list 1.3.0. A **pinned, self-hosted wasm repo is feasible**: mirror the exact 58 tarballs (~56 MB) as a release asset and point `webr::install(repos = …)` at it. That is real work and a real hosting cost, and it should not be done speculatively — see §6.

## 6. Recommendation

Not option (a) or option (b) from #113, but both, with a clean division of authority:

> **The browser previews. CI commits.**

- **webR is a preview engine.** It regenerates faithfully and fast enough to feel live (~2–4 s warm). It renders the edited display next to the current one so a visitor sees their change take effect, on a static Pages site, with no server. This is what makes the spec editor real rather than a mock, and it is the honest answer to "what makes an edit live".
- **webR is not a provenance authority.** It must not write to `iterations.yaml` or `outputs/<slug>/vNNN/`. Its output is labelled a preview and carries no hash claim.
- **The commit path is the GitHub Actions round trip.** "Propose this change" dispatches the workflow; the pipeline regenerates in the pinned environment; a PR opens with the ARD diff. D4, D5, D9 and D10 stay intact, and the audit trail remains the version history.

Sequencing that follows:

1. Change `render.R:473` to take `inline_css` from an argument defaulting to `TRUE`, so the browser can ask for `FALSE`. One-line change, no behaviour change for CI.
2. Build the spec editor against the round trip **first** — it is the path that satisfies the invariant, and it needs no new runtime.
3. Add the webR preview behind a lazy "start the R engine" affordance once the round trip works. It is an enhancement to a correct loop, not the loop itself.
4. Pin the wasm repo only if the preview proves it earns its 69 MB. Do not pay for pinning to make a preview auditable — the preview is not the audit record.

**Option (c) from #113 — precomputed variants — is rejected**, as #113 anticipated. It is unnecessary: genuine regeneration in the browser is demonstrated above.

## 7. Reproducing this

The harnesses are not committed (they carry a 47 MB `node_modules`). To rebuild:

```bash
mkdir webr-spike && cd webr-spike && npm init -y && npm i webr
# then the four harnesses from this session; each mounts pipeline/R/*.R and
# library/tfl/<slug>/* into the webR VFS and sources the package by hand,
# because webR has no compiler and cannot R CMD INSTALL a source package.
```

The load shim that made it work, and which any future webR integration needs:

```r
e <- new.env(parent = globalenv())
for (f in sort(list.files("/csr/pipeline/R", full.names = TRUE))) {
  src <- readLines(f, warn = FALSE)
  src <- gsub("inline_css = TRUE", "inline_css = FALSE", src, fixed = TRUE)
  eval(parse(text = src), envir = e)
}
e$csr_root <- function(path = NULL) "/csr"
for (nm in ls(e, all.names = TRUE)) if (is.function(e[[nm]])) environment(e[[nm]]) <- e
attach(e, name = "opencsr", warn.conflicts = FALSE)
```

`build_ard()` needs `custom_env = "/csr/library/tfl/<slug>"` — the display's `custom.R` is not found otherwise, which is what produced the first harness's misleading failure.

---

*This spike was run and written by Claude Code using Opus 5 in an unattended session and not yet reviewed by @jwildfire.*
