# Demo application layout — options and decision

Written 2026-07-25. Requirement: [obot.roadmap#113](https://github.com/jwildfire/obot.roadmap/issues/113). Supersedes the v0 tab-strip layout shipped in [PR #3](https://github.com/jwildfire/open.csr/pull/3).

**The demo page is not a page about the application. It is the application.** This document picks the shell it lives in.

---

## 1. What changed and why

The first Demo surface put the four views in a tab strip *below* a page title and a paragraph explaining what you were about to see:

```
  ┌────────────────────────────────────────────────────────┐
  │ open.csr        Home  Demo  Quality  Design & Research │
  ├────────────────────────────────────────────────────────┤
  │ DEMO                                                   │
  │ CDISCPILOT01 — a Clinical Study Report you can open    │  ← 340px of
  │ One report, four ways in. Read the document, inspect…  │    preamble
  │                                                        │
  │ ┌────────┬────────┬──────┬───────────┐                 │
  │ │ Reader │ Tables │ Text │ Templates │                 │  ← the app,
  │ └────────┴────────┴──────┴───────────┘                 │    below the fold
  │ …content…                                              │
  └────────────────────────────────────────────────────────┘
```

That is a brochure wrapper around a tool. Three things were wrong with it:

1. **The explanation outranked the thing.** A visitor read a paragraph about the four views before seeing any of them. If the app is legible, it does not need a paragraph; if it needs a paragraph, the paragraph will not save it.
2. **The views were not navigation.** A tab strip inside the content area reads as a filter on the page you are already on. Reader / Tables / Text / Templates are not filters — they are the four places you can be.
3. **Nothing told you where you were.** Select the AE table, scroll into a 3,000-row ARD, and the page no longer says which display, which iteration, or which ARD you are looking at. In a regulated document that is the *first* question, not a detail.

## 2. What this application actually is

A CSR is a document where **everything has a number and a provenance**. Section 12.2.1. Table 14.3.1.3. `adae`, cut-off 2014-07-01. Iteration `v002`. ARD `sha256:1a2b…`. The vernacular of the subject is identification: every artifact states what it is, what produced it, and when.

So the design principle for the shell:

> **Identity and provenance live in the chrome, not in a dialog.**

Every other tool in this category puts provenance behind a properties panel or an audit export. open.csr's entire claim is that the chain from dataset to sentence is always available — the shell should behave that way too. That is the one place this design spends its boldness; everything else stays quiet.

## 3. The three options

### Option 1 — Two-tier header ("document toolbar")

A site strip over an application strip. The four views are the application's primary navigation; the right-hand side of the app strip is a live context readout.

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │ ▪ open.csr                        Home  Quality  Design   ◐  GitHub  │  site strip
  ├──────────────────────────────────────────────────────────────────────┤
  │ Reader  Tables  Text  Templates    CDISCPILOT01 · 14.3.1.3 ·  v001   │  app strip
  ├──────────────────────────────────────────────────────────────────────┤
  │                                                                      │
  │  content, full width                                                 │
  │                                                                      │
  └──────────────────────────────────────────────────────────────────────┘
```

- **For:** full horizontal width, which is the scarcest resource in a TFL viewer — the AE table by SOC and preferred term is six columns of hierarchy and already scrolls. Simplest of the three. Each view stays a real URL, so it degrades to working navigation with no JavaScript.
- **Against:** two horizontal bands cost roughly 100px of vertical space. The context readout has to collapse on narrow screens.

### Option 2 — Left rail ("workbench")

A persistent vertical rail carries the four views; one top bar carries context.

```
  ┌────┬─────────────────────────────────────────────────────────────────┐
  │ ▪  │ CDISCPILOT01 · Table 14.3.1.3 · v001         Quality  Design ◐  │
  ├────┼─────────────────────────────────────────────────────────────────┤
  │ 📖 │                                                                 │
  │ ▦  │  content, ~200px narrower                                       │
  │ ¶  │                                                                 │
  │ ⧉  │                                                                 │
  └────┴─────────────────────────────────────────────────────────────────┘
```

- **For:** view switching is always visible without competing for the same row as context. Scales past four views.
- **Against:** it spends 200px of *horizontal* width to save 50px of vertical — the wrong trade for wide tables. Icon rails also need labels to be legible to an occasional visitor, at which point the rail is 200px, not 56px.

### Option 3 — Header nav + persistent inspector ("editor")

Option 1's header, plus a right-hand inspector that replaces today's pop-over trace panel. Provenance, the matched ARD row, the spec, and the iteration ledger stay open beside whatever is selected.

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │ ▪ open.csr                        Home  Quality  Design   ◐  GitHub  │
  ├──────────────────────────────────────────────────────────────────────┤
  │ Reader  Tables  Text  Templates    CDISCPILOT01 · 14.3.1.3 ·  v001   │
  ├────────────────────────────────────────┬─────────────────────────────┤
  │                                        │ TRACE                       │
  │  document / table                      │  adae  sha256:7d42…         │
  │                                        │  analysis.yaml   v001       │
  │                                        │  ARD row: any_ae / n / …    │
  │                                        │  ─────────────────────      │
  │                                        │  [ edit spec ]  [ diff ]    │
  └────────────────────────────────────────┴─────────────────────────────┘
```

- **For:** this is what the application becomes once spec editing lands (#113 increment B). The inspector is the natural home for an edit and its regenerated ARD diff, and it makes the trace permanent rather than modal.
- **Against:** costs the same horizontal width as the rail, and it is premature — there is nothing to edit yet, and a pop-over trace panel is adequate for a reader. Building it now would design the editor before we know what the editor needs.

## 4. Decision

**Ship Option 1. Treat Option 3 as the target once the spec editor exists.**

Horizontal width is the constraint that decides it. A CSR's widest artifacts — the SOC/PT adverse-event table, the serious-AE listing, a 13-column ARD — are the things a statistician came to look at, and both Option 2 and Option 3 take width away from them to buy chrome that is not yet earning its place. Option 1 gives the content everything and still fixes all three faults in §1.

Option 3 is not rejected, only sequenced: when an edit produces a diff that needs somewhere to live, the inspector earns its width, and Option 1's header survives into it unchanged. That is why the recommendation is Option 1 *and* Option 3 rather than Option 1 *or* Option 3 — they are the same header with one panel added.

Option 2 is rejected outright.

## 5. What Option 1 specifies

**The site strip** keeps the brand, the documentation surfaces (Home, Quality, Design & Research), the theme toggle and the source link. It is site furniture and it does not change between pages.

**The app strip** is new and appears only on the demo:

- **Views, left.** Reader · Tables · Text · Templates. Each one is a real link to its standalone page (`../reader/index.html`, `../gallery/index.html`, `../text/index.html`, `../templates/index.html`), upgraded by the client into an in-place pane switch through the same link-interception rule the panes already use. With JavaScript off they are four working links to four working pages. The current view is marked with `aria-current` and a rule under the label, not a filled tab — this is navigation, not a control.
- **Context, right.** A monospace readout of the current selection, updated live: study, then the assigned display number and slug, then the iteration and the short ARD hash when a display is selected. Monospace because these are identifiers, not prose. It collapses to the study alone below 900px.

**No page title, no lede.** The content starts at the top of the pane. The Reader pane opens on the assembled document; the Tables pane opens on a display; there is nothing to explain first.

**Density.** The app strip is 44px, the site strip 56px. Content gets everything below.

## 6. What this does not change

The panes themselves, the shared selection, the link-interception rule, and the standalone permalinks are all unchanged — this is a shell replacement, not a rewrite. `/gallery/`, `/reader/`, `/text/` and now `/templates/` remain the addressable permalinks and the destinations the evidence pages and trace panels link to.

---

*This document was drafted by Claude Code using Opus 5 and not yet reviewed by @jwildfire.*
