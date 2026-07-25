---
id: FIX-BAD-DRAFT
e3_section: "13"
title: "Unapproved generated block"
tier: generated
version: 1
displays: [t-ae-overview]
allow_digits: []
approval: { state: draft, by: null, at: null }
provenance:
  model: claude-opus-5
  prompt: "Draft a one-sentence safety conclusion from the AE overview ARD."
  generated_at: "2026-07-25"
requirements: [TXT-APPR-001]
---

Adverse events were reported by
{{ard:t-ae-overview:any_ae:p;group=Total;scale=100;digits=1}}% of patients.
