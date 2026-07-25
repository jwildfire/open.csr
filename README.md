# open.csr

**An open-source Clinical Study Report builder: versioned numbers, versioned words, one traceable loop.**

Clinical Study Reports are assembled by hand across two disconnected worlds. Statisticians produce tables in one system; medical writers paste results into document shells in another. Every revision cycle re-breaks the link between the numbers and the narrative, and consistency becomes a QC activity rather than a property of the system.

The tooling reflects the same split. Open-source pharma tooling (pharmaverse, NEST, the R Consortium pilots) owns *number generation* and stops at the output object. Commercial CSR platforms own *document assembly and prose* and treat the table package as an opaque input. **No open-source CSR builder exists** ([landscape research](research/README.md)).

open.csr closes the loop: **a change request becomes a code edit, which regenerates the number, which updates the sentence — as one versioned transaction.**

## The three components

| | What it is |
|---|---|
| **TFL Builder + Library** | Tables, listings and figures generated from ARDs ([`{cards}`](https://insightsengineering.github.io/cards/)/`{cardx}` → `{gtsummary}`/`{gt}`/`{r2rtf}`), aligned to CDISC's Analysis Results Standard. Each display is two diffable specs: what to compute, and how to show it. |
| **Text Library** | ICH E3-aligned prose blocks in three tiers — boilerplate, parameterized, agent-generated — where every number is a binding to an ARD value, never typed. |
| **Report Template Library** | ICH E3 encoded as a machine-readable document model, assembling displays and text into a complete CSR with numbering derived at build time. |

## What makes it different

- **The closed loop.** Requests become source-code edits with live regeneration. Every iteration is saved (`outputs/<display>/vNNN/`) and reproducible from its commit.
- **Numbers that can't go stale.** Prose binds ARD values; CI fails any digit in the narrative that doesn't resolve to a computed result, and any binding orphaned by a regeneration.
- **Agents that write source, not output.** Agent assistance for TFL programming, medical writing, and QC — every action lands as a reviewable diff behind a human approval gate, so the audit trail is the version history.
- **Evidence as a product.** Requirements → tests → published evidence pages, with committed ARD snapshots as the primary QC artifact — value-level regression rather than pixel comparison or document-level double programming.

## Documentation

- [Design](docs/design/design.md) — architecture, twelve design decisions, delivery phases
- [Interface contracts](docs/design/contracts.md) — schemas and file formats
- [Research](research/README.md) — the CSR-automation landscape, CDISC ARS/ARD, pharmaverse TLG practice, ICH E3 / CORE Reference, evidence frameworks

## Status

v0 in progress: pipeline, six safety displays, text and template libraries, evidence framework, and a GitHub Pages demo. Demo data is [`{pharmaverseadam}`](https://pharmaverse.github.io/pharmaverseadam/) CDISCPILOT01 — public, regenerable, no proprietary data anywhere in the repo.

Tracking: [open.csr#1](https://github.com/jwildfire/open.csr/issues/1) · [obot.roadmap#111](https://github.com/jwildfire/obot.roadmap/issues/111)

## License

Apache-2.0
