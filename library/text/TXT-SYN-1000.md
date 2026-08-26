---
id: TXT-SYN-1000
e3_section: "10"
title: "Statistical Methods"
tier: boilerplate
version: 1
displays: []
allow_digits: []
approval: { state: draft, by: null, at: null }
provenance: { model: null, prompt: null }
requirements: [TXT-SYN-001]
disclosure: { anonymisation_required: false, cci: false }
---

Descriptive statistics only. Continuous measures are summarised as number of
patients, mean, standard deviation, median, quartiles, minimum and maximum;
categorical measures as counts and percentages of the analysis population. No
hypothesis test is performed and no confidence interval is presented, so nothing
in this synopsis should be read as a statistical comparison between groups.

Each summary is produced once, as an analysis results dataset, and every rendering
of it — the in-text table, the post-text table, and each number quoted in this
prose — is read back from that one dataset. The generated provenance appendix
records, for each display, which dataset the numbers came from.
