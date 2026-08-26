---
id: TXT-SYN-0700
e3_section: "7"
title: "Duration of Treatment"
tier: parameterized
version: 1
displays: [t-exposure]
allow_digits: []
approval: { state: draft, by: null, at: null }
provenance: { model: null, prompt: null }
requirements: [TXT-SYN-001]
disclosure: { anonymisation_required: false, cci: false }
---

Mean duration of exposure to study drug was
{{ard:t-exposure:duration:mean;group=Placebo;digits=1}} days in the placebo group,
{{ard:t-exposure:duration:mean;group=Xanomeline Low Dose;digits=1}} days in the
xanomeline low dose group and
{{ard:t-exposure:duration:mean;group=Xanomeline High Dose;digits=1}} days in the
xanomeline high dose group.

Exposure differed substantially between the groups, which matters for the reading
of the safety results below: crude proportions of patients reporting an event are
not exposure-adjusted. The extent of exposure is summarised in
{{xref:display:t-exposure}}.
