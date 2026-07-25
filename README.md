# open.csr

**An open-source Clinical Study Report builder for clinical trials.**

`open.csr` assembles FDA-submission-quality Clinical Study Reports from three connected components:

1. **TFL Builder + Library** — Tables, Listings, and Figures built on [pharmaverse](https://pharmaverse.org) best practices: Analysis Results Datasets (ARDs) via `{cards}`/`{gtsummary}`, rendered to submission-quality outputs, sourced from `{pharmaverseadam}` ADaM data.
2. **Text Library** — reusable, ICH E3-aligned prose blocks that interpret TFL results, maintained by medical writers with agentic assistance.
3. **Report Template Library** — CSR shell templates (ICH E3 / CORE Reference structure) that place TFLs and text into a complete, traceable report.

Every TFL is generated from version-controlled source code. Requested changes become code edits with live regeneration — every iteration saved and reproducible, with end-to-end traceability and quality evidence for all CSR components.

## Status

🚧 Early scaffold — research and design phase. See `research/` and `docs/design/`.

## Repository layout

```
research/    Landscape research: existing tools, standards, best practices
docs/        Design documentation
pipeline/    R pipeline: ADaM → ARD → TFL generation
library/     TFL, text, and template libraries
site/        Static demo application (GitHub Pages)
quality/     Requirements matrix + test evidence
```

## License

Apache-2.0
