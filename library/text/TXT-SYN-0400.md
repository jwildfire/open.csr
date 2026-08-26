---
id: TXT-SYN-0400
e3_section: "4"
title: "Number of Patients (Planned and Analysed)"
tier: parameterized
version: 1
displays: [t-disposition]
allow_digits: []
approval: { state: draft, by: null, at: null }
provenance: { model: null, prompt: null }
requirements: [TXT-SYN-001]
disclosure: { anonymisation_required: false, cci: false }
---

The planned sample size is not carried in the ADaM extract this demonstration is
built from. Of the patients actually enrolled, {{value:randomised-n}} were
randomised and {{value:treated-n}} were treated and form the safety analysis set,
which is the population analysed throughout this synopsis.

{{value:completed-n}} patients ({{value:completed-pct}}%) completed the study and
{{value:discontinued-n}} discontinued prematurely. Disposition by treatment group
is given in {{xref:display:t-disposition}}.

Every figure in this paragraph is a binding into the named values store, not a
typed number. The same store supplies the same figures to the disposition section
of the full clinical study report, so the two documents cannot disagree: if the
underlying analysis results dataset changes, both change together, and if a value
in the store no longer re-derives from the committed dataset the build fails
before either document is written.
