# Traceability — Requirements

Every number on the open.csr site must answer five questions: which dataset, which spec, which ARD row, which display, which sentence. These requirements cover the machinery that makes that a lookup rather than a claim — the provenance envelope, the iteration ledger, the binding resolver, and the trace panel that renders the chain.

## Requirement context

Design decisions **D5** (owned ARD serialization with a provenance envelope), **D6** (stable display slugs, derived numbers), **D7** (text binds numbers, never states them) and **D10** (iteration ledger per display) converge here. [Contracts §5](../../docs/design/contracts.md) fixes the ARD schema and the binding address; [contracts §8](../../docs/design/contracts.md) fixes the `traceability` object on every evidence set.

## Scope

In scope: the provenance envelope as consumed downstream, iteration-ledger reconstruction, binding parsing and resolution, the build-time trace index, and the trace panel behaviour.

Out of scope: producing the envelope (that is the R pipeline, `tfl-engine.md`), the numeric-fidelity digit gate on prose (`text.md`), and 14.x number assignment (`templates.md`).

## Source inventory

- `scripts/evidence-lib.mjs` — `buildTraceability`
- `scripts/site-lib.mjs` — `loadDisplayOutputs`, `normalizeIterations`, `pickCurrentVersion`, `parseBinding`, `resolveBinding`, `buildTraceIndex`, `normalizeCsr`
- `outputs/<slug>/vNNN/manifest.json`, `outputs/<slug>/current.json`, `library/tfl/<slug>/iterations.yaml`

## Requirements

| ID | Area | Requirement | Source | Evidence Type | Test/Evidence Link | Status | AI Review | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TRC-ARD-001 | Provenance | The evidence set's `traceability` object is assembled from the display's current output manifest and the ARD's provenance envelope, carrying ADaM datasets, ARD file and hash, display spec, spec hash, iteration and source commit. | contracts §8 | js-unit | evidence-traceability.test.js | draft | ai-drafted | |
| TRC-ARD-002 | Provenance | A missing manifest, a missing ARD, or an ARD with no provenance yields a traceability object of nulls and empty lists rather than an exception. | open.csr | js-unit | evidence-traceability.test.js | draft | ai-drafted | Evidence sets are produced while displays are still being built. |
| TRC-ARD-003 | Provenance | Every ADaM dataset named in the ARD provenance is surfaced with its content hash, so the data behind a number is identifiable. | D5 | js-unit | evidence-traceability.test.js | draft | ai-drafted | |
| TRC-ARD-004 | Provenance | When the output manifest records no ARD hash, one is computed from the committed `ard.json` so the chain is never hash-less. | open.csr | js-unit | site-render.test.js | draft | ai-drafted | |
| TRC-ITER-001 | Iterations | The iteration timeline merges `iterations.yaml` entries with the manifests found under `outputs/<slug>/`, so it renders from either source alone. | D10 | js-unit | site-render.test.js | draft | ai-drafted | |
| TRC-ITER-002 | Iterations | The live iteration is the one named by `outputs/<slug>/current.json`; with no pointer, or a pointer to a version that does not exist, the highest `vNNN` present is used. | contracts §1 | js-unit | site-render.test.js | draft | ai-drafted | |
| TRC-ITER-003 | Iterations | A ledger entry with no corresponding output directory is rendered and flagged rather than dropped. | open.csr | js-unit | site-render.test.js | draft | ai-drafted | |
| TRC-BIND-001 | Bindings | A binding address parses into display, analysis, statistic name and qualifiers per contracts §5, including `group=` and `variable_level=`. | contracts §5 | js-unit | site-binding.test.js | draft | ai-drafted | |
| TRC-BIND-002 | Bindings | A binding resolves only when exactly one ARD row matches; zero matches and multiple matches are both unresolved, with the reason recorded. | contracts §6 | js-unit | site-binding.test.js | draft | ai-drafted | Gate (a): resolving to "one row" is the whole guarantee. |
| TRC-BIND-003 | Bindings | An unresolved binding renders as a visibly marked, non-numeric placeholder carrying its reason — a stale number is never displayed in its place. | D7 | js-unit | site-binding.test.js | draft | ai-drafted | Loud failure beats a plausible wrong number. |
| TRC-BIND-004 | Bindings | A resolved binding renders as a clickable element carrying its display, address, analysis and statistic, so the trace panel needs no lookup service. | D7 | js-unit | site-binding.test.js | draft | ai-drafted | |
| TRC-CHAIN-001 | Trace | The build emits a trace index keyed by display slug carrying datasets, dataset hashes, both spec files, the ARD file and hash, the iteration, and the source commit. | design §8 | js-unit | site-render.test.js | draft | ai-drafted | |
| TRC-CHAIN-002 | Trace | Every trace index entry links to that display's gallery page and its evidence page, closing the loop from a sentence back to the requirement. | design §9 | js-unit | site-render.test.js | draft | ai-drafted | |
| TRC-DOC-001 | Document | The CSR reader normalizes the assembled document tolerantly — sections, nested sections, text blocks and display placements — and renders a documented empty state when no assembly exists. | open.csr | js-unit | site-render.test.js | draft | ai-drafted | The assembler's exact output shape is settled in `templates.md`. |
| TRC-DOC-003 | Document | A `{{xref:section:…}}` reference resolves to an in-page link and a `{{xref:display:…}}` reference to a trace handle carrying the display's assigned number; an unresolved reference degrades to readable text and never leaks the marker. | design §6 | js-unit | site-binding.test.js | draft | ai-drafted | Cross-reference resolution is a stated CI gate; rendering it is the visible half. |
| TRC-DOC-002 | Document | Prose that still carries `{{ard:…}}` markers at render time is resolved against the committed ARDs, so the trace panel works whether or not the assembler pre-resolved the bindings. | open.csr | js-unit | site-binding.test.js | draft | ai-drafted | |
