---
id: TXT-SYN-1102
e3_section: "11.2"
title: "Safety Results"
tier: parameterized
version: 1
displays: [t-ae-overview]
allow_digits: []
approval: { state: draft, by: null, at: null }
provenance: { model: null, prompt: null }
requirements: [TXT-SYN-001]
disclosure: { anonymisation_required: false, cci: false }
---

Treatment-emergent adverse events were reported by {{value:ae-any-n-total}}
patients in the safety analysis set overall. In the xanomeline high dose group they
were reported by {{value:ae-any-pct-high}}% of the {{value:safety-n-high}} patients
treated.

The proportion reporting at least one event rose with dose:
{{value:ae-any-n-placebo}} patients receiving placebo compared with
{{value:ae-any-n-xanomeline}} across the two xanomeline arms combined — an excess
of {{value:ae-excess-high-vs-placebo}} patients in the high dose arm relative to
placebo. An overview of treatment-emergent adverse events is given in
{{xref:display:t-ae-overview}}; events by system organ class and preferred term,
and the listing of deaths, serious adverse events and adverse events leading to
withdrawal, accompany this synopsis in {{xref:section:13}}.

The combined and difference figures above are *derived* values: the store declares
them as structural arithmetic over other named values rather than storing an
answer, so the assembler re-evaluates them at build time against the committed
analysis results datasets. A derived value that no longer reproduces is a build
failure, not a footnote.
