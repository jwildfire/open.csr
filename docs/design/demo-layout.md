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

## 6. Revision: the explorer (2026-07-25, same day)

@jwildfire reviewed §4 and **overrode it**: the application gets a persistent
left sidebar listing the contents of the study, file-explorer style. That is
closer to Option 2 than to Option 1, and the recommendation in §4 was wrong
about one thing — it weighed width against a *nav rail*, when what the product
actually needs on the left is a **content tree**, which is a different and far
more valuable use of the same pixels. A rail that only switches four views does
not earn 200px. A tree that lists every document, display and text block does,
because it replaces navigation *and* the in-pane display picker, and it is the
surface a second study or a second document would extend.

The shape, from his direction:

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │ ▪ open.csr                        Home  Quality  Design   ◐  GitHub  │
  ├──────────────────────────────────────────────────────────────────────┤
  │ CDISCPILOT01 · 14.3.1.3 · t-ae-common · v002        Templates │Read│Edit│
  ├──────────────────┬───────────────────────────────────────────────────┤
  │ CDISCPILOT01     │                                                   │
  │ cut-off 2014-…   │                                                   │
  │ ▾ DOCUMENTS   2  │  content                                          │
  │   Clinical Stu…  │                                                   │
  │   Statistical…   │                                                   │
  │        PLANNED   │                                                   │
  │ ▸ DISPLAYS    6  │                                                   │
  │ ▸ TEXT       14  │                                                   │
  └──────────────────┴───────────────────────────────────────────────────┘
```

Four decisions this encodes:

1. **The study is the root.** Everything under it belongs to it. A second study
   becomes a second root, not a second application.
2. **Documents is a collection, not a page.** The CSR is one document; the ICH E3
   Annex I synopsis is another; a SAP would be a third. The registry is
   `library/templates/` itself (#32): every template object the assembler has
   built becomes a document here, with its own reader page, its own document-model
   page and its own entry in this tree, without being named anywhere in the site
   build. `site/config.json` → `documents` carries editorial metadata — a nicer
   title, an abbreviation, a blurb — and the documents that are *planned* and so
   have no template object to discover. It is a merge, never a gate: a template
   object the config has never heard of still publishes, titled from its own
   model, with a build warning naming it. Planned documents are listed and marked
   rather than hidden, because the point is to show the shape.

   The app renders one document at a time. The document on screen keeps its
   section tree and its in-app selection; every other document is an ordinary
   link to its own reader page, so it works with JavaScript off and never offers
   a selection that would resolve to nothing.
3. **Displays sit beside documents, not inside one.** The same display can be
   referenced by more than one document — the AE overview belongs in the CSR and
   would belong in an ISS. So a display records *which documents use it* instead
   of living under one of them.
4. **Templates stays in the header.** A template describes what a report of that
   kind *is*, across every study, so it does not hang off one study in the tree.

**Vocabulary:** *Reader* → **Documents**, *Tables* → **Displays** (tables,
figures and listings). The emitted directories keep their v0 names — `/reader/`
and `/gallery/` are what the evidence pages and the trace panel already link to,
and renaming them would break every one of those links to change a label.

**Read / Edit** sits at the right of the application strip. Edit is genuinely
disabled, not merely styled that way: there is nothing to edit until the spec
editor lands (#113 increment B), and a control that looks live but does nothing
is worse than one that says so.

**The width objection from §4 still stands and is handled**, not dismissed: the
explorer collapses below 950px, where wide tables need the room more than a
permanently visible tree does, and the app page drops the 74rem measure the
documentation pages read at.

**The document's own contents moved into the tree too.** The reader carried a
separate table of contents beside the explorer — two navigation columns asking
the same question on different axes. A document's top-level sections are now the
level below the document, so there is one place to navigate from. A section that
E3 models but this report does not fill is still listed and still navigable: the
heading really is in the document, saying so. A top-level section counts as
populated when *anything beneath it* is, because E3 puts the content in
subsections — 12.2.1 carries the AE summary, not section 12.

One thing this exposed: jumping between sections of a ~35,000px document with
`scrollIntoView({behavior: 'smooth'})` **stalls in Chrome** — the page never
arrives. Distance now decides the behaviour, so a nearby target animates and a
jump across the document lands immediately, which reads better anyway.

Option 3's inspector is unaffected by this revision — it remains the target for
when spec editing produces a diff that needs somewhere to live.

## 7. What this does not change

The panes themselves, the shared selection, the link-interception rule, and the standalone permalinks are all unchanged — this is a shell replacement, not a rewrite. `/gallery/`, `/reader/`, `/text/` and now `/templates/` remain the addressable permalinks and the destinations the evidence pages and trace panels link to.

---

*This document was drafted by Claude Code using Opus 5 and not yet reviewed by @jwildfire.*
