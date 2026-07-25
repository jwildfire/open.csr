---
id: FIX-GOOD-EXEMPT
e3_section: "16.1.9"
title: "Block exercising every documented digit exemption"
tier: boilerplate
version: 1
displays: []
allow_digits: ["ICH E3", "16.1.9"]
approval: { state: approved, by: "@jwildfire", at: "2026-07-25" }
provenance: { model: null, prompt: null }
requirements: [TXT-NUM-003, TXT-NUM-004, TXT-NUM-005]
---

Statistical methods are documented in Appendix 16.1.9, as required by ICH E3.

The pipeline is invoked as `regenerate("t-ae-overview", version = 7)` and the
guideline is published at [ICH](https://database.ich.org/sites/default/files/E3_Guideline.pdf).
