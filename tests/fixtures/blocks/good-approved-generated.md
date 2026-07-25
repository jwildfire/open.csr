---
id: FIX-GOOD-DRAFT
e3_section: "13"
title: "Approved generated block"
tier: generated
version: 2
displays: [t-ae-overview]
allow_digits: []
approval: { state: approved, by: "@jwildfire", at: "2026-07-25" }
provenance:
  model: claude-opus-5
  prompt: "Draft a one-sentence safety conclusion from the AE overview ARD."
  generated_at: "2026-07-25"
requirements: [TXT-APPR-002]
---

Adverse events were reported by
{{ard:t-ae-overview:any_ae:p;group=Total;scale=100;digits=1}}% of patients.
