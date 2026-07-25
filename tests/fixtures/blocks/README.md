# Seeded-violation blocks

Deliberately broken (and deliberately correct) text blocks used to prove the three
CI gates in `scripts/text-lib.mjs` actually fail when they should. They are NOT part
of the Text Library and are never assembled — `scripts/assemble.mjs` only reads
`library/text/`.

| file | seeded defect | gate that must catch it |
|---|---|---|
| `good-parameterized.md` | none | all three pass |
| `bad-typed-number.md` | a hand-typed result in prose | numeric fidelity |
| `bad-orphan-binding.md` | binding to a statistic no ARD row provides | binding resolution |
| `bad-ambiguous-binding.md` | binding with no `group`, matching four rows | binding resolution |
| `bad-unapproved-generated.md` | `tier: generated`, `approval.state: draft` | approval |
| `good-approved-generated.md` | `tier: generated`, approved | approval (included) |
| `good-exemptions.md` | digits inside code, a link URL and `allow_digits` | numeric fidelity (passes) |
| `bad-undeclared-display.md` | binds a display absent from `displays:` | binding resolution |
