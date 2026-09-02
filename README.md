# open.csr

**An open-source Clinical Study Report builder: versioned numbers, versioned words, one traceable loop.**

Clinical Study Reports are assembled by hand across two disconnected worlds. Statisticians produce tables in one system; medical writers paste results into document shells in another. Every revision cycle re-breaks the link between the numbers and the narrative, and consistency becomes a QC activity rather than a property of the system.

The tooling reflects the same split. Open-source pharma tooling (pharmaverse, NEST, the R Consortium pilots) owns *number generation* and stops at the output object. Commercial CSR platforms own *document assembly and prose* and treat the table package as an opaque input. **No open-source CSR builder exists** ([landscape research](research/README.md)).

open.csr closes the loop: **a change request becomes a code edit, which regenerates the number, which updates the sentence — as one versioned transaction.**

## The four components

| | Where it lives | What it is |
|---|---|---|
| **TFL Builder + Library** | `library/tfl/<slug>/` | Tables, listings and figures generated from ARDs ([`{cards}`](https://insightsengineering.github.io/cards/)/`{cardx}` → `{gtsummary}`/`{gt}`/`{r2rtf}`), aligned to CDISC's Analysis Results Standard. Each display is two diffable specs: what to compute, and how to show it. |
| **Values Store** | `library/values/values.yaml` | A number the report reuses, named once and cited everywhere. Either an address into a committed ARD, or a declared arithmetic over other named values from a closed four-operator vocabulary. |
| **Text Library** | `library/text/<ID>.md` | ICH E3-aligned prose blocks in three tiers — boilerplate, parameterized, agent-generated — where every number is a binding to an ARD value, never typed. |
| **Report Template Library** | `library/templates/<id>/` | Document standards encoded as machine-readable models, assembling displays and text with numbering derived at build time. Four objects today, sharing one display library and one text library: the full ICH E3 report, its Annex I synopsis, the post-text display package, and the abbreviated report E3's Introduction contemplates. The last two are restrictions of the first. |

## How they connect

The whole framework rests on one idea: the words never contain a number, only a pointer to one. Consistency stops being a QC activity and becomes a property of the file format.

1. **A display is declared twice.** `analysis.yaml` says what to compute — the dataset, the population, the treatment columns, and an ordered list of analyses each naming a method. `display.yaml` says how to show it — column and row order, labels, patterns, decimal places, and the variants (the full Section 14 table and a reduced in-text one).
2. **The pipeline turns that pair into an ARD, then into a table.** `regenerate("<slug>")` writes a new `outputs/<slug>/vNNN/`: byte copies of both specs, `ard.json` (one row per computed statistic, nothing rounded, percentages as proportions), the rendered HTML and the submission RTF from the same cells, and a manifest of who, why, when and which hashes. `iterations.yaml` records the change request in the author's words.
3. **Every statistic has an address.** `t-demographics:sex:p;variable_level=F;group=Total` selects exactly one ARD row — one row, or the build fails. Selection qualifiers (`group`, `variable_level`, …) choose the row; presentation qualifiers (`scale`, `digits`) affect only how it prints.
4. **Values give a reused number a name.** `randomised-n` beats retyping the address in four sentences, and a `derived` value states its arithmetic structurally so the R builder and the JavaScript gate can each evaluate it and agree. `outputs/values/values.json` is generated and never hand-edited: each entry cites the ARD file and hash it came from.
5. **Text binds; it does not quote.** A block keyed to an E3 section writes `{{ard:…}}`, `{{value:…}}` or `{{xref:…}}` where a number or a table number belongs, and carries its tier, approval state and requirements in its frontmatter.
6. **A template object assembles all four.** `sections.yaml` says what a document of this kind is; `assembly.yaml` says what this study puts in each section. Table numbers are assigned from slot order at build time — no file contains the string "Table 14.1.2" — and the 16.1.9 provenance appendix is generated. The same display specification serves every document: `t-disposition` is Table 14.1.1 in the report, Table 14.1.1 in the display package because it declares the same structure, and Table 13.1 in the synopsis because it declares a different one — and wherever any of the four quote the same quantity they quote it through the same named value, so they cannot disagree.

Full walkthrough, with a diagram and one display followed end to end from the dataset to the sentence that quotes it: **[the data design framework](docs/design/framework.md)** ([published version](https://jwildfire.github.io/obot.roadmap/reports/open-csr-data-framework-2026-08-26/)).

## What makes it different

- **The closed loop.** Requests become source-code edits with live regeneration. Every iteration is saved (`outputs/<display>/vNNN/`) and reproducible from its commit.
- **Numbers that can't go stale.** Prose binds ARD values; CI fails any digit in the narrative that doesn't resolve to a computed result, and any binding orphaned by a regeneration.
- **Agents that write source, not output.** Agent assistance for TFL programming, medical writing, and QC — every action lands as a reviewable diff behind a human approval gate, so the audit trail is the version history.
- **Evidence as a product.** Requirements → tests → published evidence pages, with committed ARD snapshots as the primary QC artifact — value-level regression rather than pixel comparison or document-level double programming.

## Documentation

- [The data design framework](docs/design/framework.md) — how the four parts connect, start here
- [Design](docs/design/design.md) — architecture, twelve design decisions, delivery phases
- [Interface contracts](docs/design/contracts.md) — schemas and file formats
- [Research](research/README.md) — the CSR-automation landscape, CDISC ARS/ARD, pharmaverse TLG practice, ICH E3 / CORE Reference, evidence frameworks

## Status

v0 in progress: pipeline, six safety displays, text and template libraries, evidence framework, and a GitHub Pages demo. Demo data is the CDISC pilot's own ADaM package (every display since v0.4.0), with [`{pharmaverseadam}`](https://pharmaverse.github.io/pharmaverseadam/) CDISCPILOT01 — public, regenerable, no proprietary data anywhere in the repo.

Tracking: [open.csr#1](https://github.com/jwildfire/open.csr/issues/1) · [obot.roadmap#111](https://github.com/jwildfire/obot.roadmap/issues/111)

## License

Apache-2.0
