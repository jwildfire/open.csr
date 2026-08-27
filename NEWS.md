<!--
NEWS.md is the running release log and the draft of each release's notes
(obot.agent/skills/rc-release-notes/SKILL.md): newest section first; unreleased
work accumulates under a vX.Y.Z (Upcoming) heading that loses the suffix when
the release is cut; the GitHub release publishes from the section verbatim.
-->

# open.csr v0.3.0 (Upcoming)

- **The Report Template Library is plural.** A template object is a document model plus a per-report assembly, and the library now holds two: the full ICH E3 clinical study report, and a new ICH E3 Annex I study synopsis. Both are assembled against the same study, CDISCPILOT01, from the same analysis results datasets and the same store of named values — so where the two documents quote the same quantity they quote the same number, and the build fails if that stops being true. ([#28](https://github.com/jwildfire/open.csr/issues/28))
- The assembler takes `--template <id>` and `--all`, and CI assembles every template object rather than only the default. `npm run assemble` and every published link are unchanged.
- The synopsis makes the numbering rule visible: the six displays are `Table 14.1.1` to `Listing 14.3.2.1` in the report and `Table 13.1` to `Listing 13.6` in the synopsis, from the same specifications and the same prose, because display identity is the slug and the number is assigned at build time.
- Efficacy fields in both documents are declared and left unpopulated rather than dropped — no efficacy ADaM exists for this study in `pharmaverseadam`, and the reference report for the same dataset devotes thirteen tables to efficacy.
- **The demo site publishes both documents.** It reads the template library rather than one configured directory, so every assembled template object gets a reader page, a document-model page, a card on the front page and an entry in the demo's navigation tree. The report keeps `/reader/` and `/templates/`; the synopsis is at `/reader/e3-synopsis.html` and `/templates/e3-synopsis.html`. A third template object needs no change to the site build and none to `site/config.json`. ([#32](https://github.com/jwildfire/open.csr/issues/32))
- **Every document says whether its prose has been reviewed.** The approval gate holds generated-tier blocks only, so an unapproved boilerplate block still assembles — "assembled" is not "reviewed", and the site now states which one it is. The synopsis carries a notice above its first section saying all eighteen of its prose blocks are unapproved drafts that nobody has read; the report says its ten are approved. Both are read off the assembled document rather than set by hand.
- **Two more documents, and neither cost a sentence of prose.** The library now holds four template objects. The post-text display package is the report's tables and listings delivered on their own — what a statistician reviews before any narrative exists — and carries no prose at all. The abbreviated clinical study report is the reduced report ICH E3 contemplates for a study not intended to support a claim: the same fifteen text blocks and the same six displays as the full report, in a document model with the efficacy-analysis apparatus and the uncited appendices removed. ([#34](https://github.com/jwildfire/open.csr/issues/34))
- Both are expressed as restrictions of the full ICH E3 model — every section they declare keeps the number, title, slug and content declaration it has in the report, unchanged — and a test walks both against the full model section by section, so "subset" is a property of the files rather than a claim in a comment.
- The numbering rule now shows both of its faces. The synopsis renumbers the six displays because it declares a different structure; the display package and the abbreviated report keep `Table 14.1.1` because they declare the same one. Neither file writes a number down.
- Adding the two changed nothing outside `library/templates/`, `quality/` and `docs/`: no file under `scripts/` names either template id, and a test enforces that. The two new documents appear on the demo site with no site change at all — declaring their titles in `site/config.json` is the one thing still outstanding.

_The synopsis prose is drafted and not yet reviewed: its eighteen `TXT-SYN-*` blocks are `draft`, the site says so on the page, and the build says so on every block._

# Earlier releases

- [v0.2.0 — the editing release](https://github.com/jwildfire/open.csr/releases/tag/v0.2.0) — 2026-07-27.
- [v0.1.0 — early prototype](https://github.com/jwildfire/open.csr/releases/tag/v0.1.0) — 2026-07-26.
