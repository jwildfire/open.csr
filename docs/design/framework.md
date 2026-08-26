# The data design framework

How open.csr turns study data into a Clinical Study Report. This is the orientation
document: what the four kinds of source file are, how they connect, and what happens at
build time. [`contracts.md`](contracts.md) is the normative version of everything here —
read that before changing a format. [`design.md`](design.md) is the why, with the twelve
design decisions.

A published walkthrough of the same material, with a diagram and one display followed end
to end, is on the roadmap hub:
[open.csr — the data design framework](https://jwildfire.github.io/obot.roadmap/reports/open-csr-data-framework-2026-08-26/).

## The one idea

Numbers and words are not kept consistent by checking them against each other. They are
kept consistent because the words never contain a number in the first place — only a
pointer to one. Consistency stops being a QC activity and becomes a property of the file
format.

## The four parts

Everything a contributor edits lives under [`library/`](../../library), in four
directories.

| Part | Directory | Declares |
|---|---|---|
| Displays | `library/tfl/<slug>/` | What to compute, and how to show it |
| Values | `library/values/values.yaml` | Numbers the report reuses, given a name once |
| Text | `library/text/TXT-E3-<section>.md` | Prose keyed to an ICH E3 section, binding numbers rather than stating them |
| Templates | `library/templates/ich-e3/` | What an E3 report is, and what this report puts in it |

Everything else in the repository is either the machinery that reads them (`pipeline/`,
`scripts/`), or generated output that is never hand-edited (`outputs/`, `docs/assembled/`,
`docs/evidence/`, `docs/requirements/`, `site/_build/`).

```
 ADaM study data (pharmaverseadam · CDISCPILOT01)
        │  prepare_data()
        ▼
 ┌──────────────────────────────┐  build_ard()   ┌──────────┐  render_display()  ┌───────────────┐
 │ 1 · DISPLAY SPEC             │ ─────────────▶ │ ard.json │ ─────────────────▶ │ table.html    │
 │   analysis.yaml  what        │                │ one row  │                    │ table.rtf     │
 │   display.yaml   how         │                │ per stat │                    │ manifest.json │
 │   iterations.yaml every run  │                └────┬─────┘                    └───────────────┘
 │   library/tfl/<slug>/        │                     │ addressed as
 └──────────────────────────────┘                     │ display:analysis:stat
        │                              ┌──────────────┴──────────────┐
        │                              ▼                             ▼
        │                   ┌────────────────────┐  cited   ┌────────────────────┐
        │                   │ 2 · VALUES         │ ───────▶ │ 3 · TEXT           │
        │                   │  source: address   │ by name  │  {{ard:…}}         │
        │                   │  derived: arithmetic│         │  {{value:…}}       │
        │                   │  library/values/   │          │  {{xref:…}}        │
        │                   └─────────┬──────────┘          └─────────┬──────────┘
        │                             │                               │
        ▼                             ▼                               ▼
 ┌────────────────────────────────────────────────────────────────────────────────┐
 │ 4 · TEMPLATE   library/templates/ich-e3/                                        │
 │    sections.yaml   what an ICH E3 report IS — 119 sections and their content    │
 │    assembly.yaml   what THIS report puts in them — prose, displays, 14.x slots  │
 └────────────────────────────────────┬───────────────────────────────────────────┘
                                      │ assemble.mjs
                                      ▼
                        docs/assembled/csr.html · the site
```

The R pipeline owns the top band, from study data to a rendered table. The Node build owns
everything from the first binding down. They meet at one file per display, `ard.json`, and
at one address format.

---

## 1 · Displays

### What an ARD is here

An Analysis Results Dataset is the table of numbers before it is a table: a long dataset
with one row per computed statistic, and enough columns on each row to say exactly which
statistic it is. open.csr computes them with [`{cards}`](https://insightsengineering.github.io/cards/)
and serializes them to a JSON file it owns, so the shape is fixed and the JavaScript half
of the build can rely on it. Every row carries the same thirteen keys.

Three real rows, from 236 in the demographics display:

```json
{"analysis":"age","group1":"TRT01A","group1_level":"Total","group2":null,"group2_level":null,
 "variable":"AGE","variable_level":null,"context":"continuous",
 "stat_name":"N","stat_label":"N","stat":254,"warning":null,"error":null}

{"analysis":"age", ... "variable":"AGE","stat_name":"mean","stat":75.0866141732284, ...}

{"analysis":"sex", ... "variable":"SEX","variable_level":"F","context":"categorical",
 "stat_name":"p","stat_label":"%","stat":0.562992125984252, ...}
```

Two properties matter more than they look:

- **Nothing is rounded.** Means are stored to full precision and percentages as proportions
  in `[0, 1]`. Rounding and scaling are decisions the display or the sentence makes, so the
  same stored number can appear as `75.1` in a table and `75.09` in a sentence without
  either being a different number.
- **Every row is addressable.**
  `t-demographics:sex:p;variable_level=F;group=Total` selects exactly one of those 236
  rows. That address is the only way a number ever leaves the file, and it must match
  exactly one row or the build fails.

Alongside the rows sits a provenance envelope: the hash of each spec that produced the
file, the hash and row count of every input dataset with the package version it came from,
the R and package versions of the session, and the git commit — or `null` where the tree
was dirty and the artifact cannot honestly name one.

### The three files that declare a display

A display lives in one directory named for its slug and holds three files. The split is
the point: a statistician changes the first, a shell reviewer or a writer changes the
second, and neither has to read the other to work.

- [`analysis.yaml`](../../library/tfl/t-demographics/analysis.yaml) — the prepared dataset
  and analysis population, the column that defines the treatment columns, whether a total
  column is added, and an ordered list of analyses each naming a method.
- [`display.yaml`](../../library/tfl/t-demographics/display.yaml) — title, study,
  population label, cut-off, footnotes, source line, column and row order, labels,
  indentation, section headers, number formats, decimal places, and the variants.
- [`iterations.yaml`](../../library/tfl/t-demographics/iterations.yaml) — one entry per
  regeneration: version, timestamp, actor, the change request in plain words, and the
  hashes of both specs and of the ARD produced.

The demographics display asks for six analyses and nothing else:

```yaml
id: t-demographics
regulatory_id: DMT01
type: table
dataset: adsl
analysis_set: safety
denominator: adsl
group: [TRT01A]
total: true
analyses:
  - { name: age,    method: continuous,  label: "Age (years)", variables: [AGE] }
  - { name: sex,    method: categorical, label: "Sex",         variables: [SEX] }
  # … agegr, race, ethnic, baseline
```

Six methods are built in — `continuous`, `categorical`, `subject_count`,
`hierarchical_count`, `listing`, `figure`. Anything they cannot express is written as an R
function in a `custom.R` file beside the two YAML files and named from the analysis; it
receives the data and the spec and hands back an ARD like any other analysis. One of the
six demo displays uses that escape hatch.

`display.yaml` then says how those numbers become a page. Its `rows` block is a printing
plan, not a computation:

```yaml
columns:
  order: [Placebo, "Xanomeline Low Dose", "Xanomeline High Dose", Total]
format:
  digits: { p: 1, mean: 1, sd: 2, median: 1, min: 0, max: 0 }
rows:
  - { label: "Age (years)", section: true }
  - { analysis: age, variable: AGE, pattern: mean_sd, label: "Mean (SD)", indent: 1 }
  - { analysis: sex, variable: SEX, levels: all, pattern: n_pct, indent: 1,
      level_order: [F, M] }
variants:
  post_text: {}
  in_text:
    title: "Demographic Characteristics (Summary)"
```

`pattern` names a cell template. Eleven are built in — `n`, `N`, `n_pct`, `pct`,
`continuous`, `mean_sd`, `median`, `median_range`, `range`, `q1_q3`, `value` — and the
display's own `format` block adds to or overrides any of them with a template such as
`"{n} ({p}%)"`. There are no functions in a spec, which is what makes a spec reviewable as
a diff.

> An unquoted `pattern: n` parses as boolean `false` under YAML 1.1. Spec validation
> rejects a non-string row key with an explicit message rather than rendering a silently
> wrong table — but quote it.

A variant is a second rendering of the same ARD. `post_text` is the full Section 14 table;
`in_text` is the reduced one placed in the narrative. A variant may override the `title`,
add `footnotes`, and set `filter: { min_pct: N }` to threshold rows.

### How a display becomes an output

`regenerate("t-demographics")` reads both specs, validates them, checks they agree with
each other, prepares only the datasets this display asks for, computes the ARD, allocates
the next version directory, and writes eight files into it:

```
outputs/t-demographics/v002/
  analysis.yaml       a byte copy of the spec that produced this, not a reference to it
  display.yaml        likewise
  ard.json            236 rows + the provenance envelope
  table.html          the Section 14 variant, rendered
  table.rtf           the same rendered cells as a submission artifact
  table-in-text.html  the reduced variant used inside the narrative
  table-in-text.rtf
  manifest.json       who, why, when, which hashes, how many rows, which variants
```

- Versions accumulate; they do not replace. `v001` stays as it was when `v002` is written,
  and `current.json` is a one-line pointer at whichever is live.
- The specs are copied in, not referenced, so an iteration can be read years later without
  resolving a commit — and the copy is what the manifest's hashes are taken over.
- One render, two formats: the RTF and the HTML come from the same rendered cells in the
  same loop, so the submission artifact and the on-screen table cannot disagree. The
  manifest stores the SHA-256 of the RTF as written, and a test re-hashes every committed
  RTF against it.
- The change request travels with the version, in the author's words, in `iterations.yaml`.

Everything downstream binds against the *current* iteration's ARD. Regenerating a display
is therefore the event that can move a number in a sentence, and it is a single, dated,
attributed, hashed act.

---

## 2 · Values

An address is precise but unfriendly. A writer who wants the randomised N in four sentences
would otherwise retype `t-disposition:randomised:n;group=Total` four times, and re-derive
it if the disposition display were restructured.

[`library/values/values.yaml`](../../library/values/values.yaml) gives such a number a name,
once, centrally. It is source: humans and agents edit it, and `regenerate_values()`
rebuilds `outputs/values/values.json`. Exactly one of two kinds per value:

| Kind | Declares | Example | Resolves to |
|---|---|---|---|
| `source` | An ARD address, display included | `randomised-n` → `t-disposition:randomised:n;group=Total` | 254 |
| `derived` | An operation over other named values | `ae-any-n-xanomeline` → `sum` of the low- and high-dose counts | 152 |

```yaml
values:
  - id: randomised-n
    label: "Subjects randomised"
    source: t-disposition:randomised:n;group=Total
    format: { digits: 0 }
    notes: "The denominator for every disposition percentage in section 10.1."

  - id: ae-any-n-xanomeline
    label: "Subjects with at least one adverse event, both xanomeline arms"
    derived: { op: sum, inputs: [ae-any-n-low, ae-any-n-high] }
    format: { digits: 0 }
```

### Why the arithmetic is declared rather than written

The derivation vocabulary is closed: `sum`, `difference`, `ratio`, `percent`, and nothing
else. A free-text expression would have been easier. The reason it is a fixed list is that
two programs have to agree about the answer without running each other's code — the R
pipeline evaluates the derivation when it builds the store, and the JavaScript build
re-evaluates it independently at assembly. Four operators mean both sides can implement it
correctly and a disagreement is a build failure rather than a silently different number. A
derived value's inputs are themselves named values, so the chain back to an ARD row never
breaks.

### Why the generated store is never edited

Each entry in `outputs/values/values.json` carries the resolved number, the formatted
string, and the citation: the address, the display, the iteration, the ARD file it was read
from, and that file's hash.

```json
{ "id": "randomised-n", "label": "Subjects randomised", "kind": "ard",
  "value": 254, "formatted": "254", "format": { "scale": 1, "digits": 0 },
  "source": { "address": "t-disposition:randomised:n;group=Total",
              "display": "t-disposition", "iteration": "v002",
              "ard_file": "outputs/t-disposition/v002/ard.json", "ard_hash": "sha256:…" } }
```

Editing that by hand would produce a number citing an ARD it did not come from — a citation
false in exactly the way the framework exists to prevent. So the build re-derives every
value from the same committed ARDs the report is built from, and fails when an address
resolves to zero rows or several, when the ARD row no longer equals the stored value, when
the cited hash is not the committed one, when the formatted string does not match its own
declared format, or when a derived value no longer equals its own arithmetic.

The same rule covers every generated directory. Agents write source and only source; the
pipeline is the only thing that regenerates (design D9).

---

## 3 · Text

A text block is a markdown file with a YAML header, named for the ICH E3 section it fills.
The header carries what a reviewer needs to know about the block rather than about its
prose: the E3 section, the displays it depends on, the requirements it satisfies, its
approval state and who granted it, whether it was model-generated and with what prompt, and
any digits it is explicitly allowed to state.

```markdown
---
id: TXT-E3-1102
e3_section: "11.2"
tier: parameterized
displays: [t-demographics]
allow_digits: []
approval: { state: approved, by: "@jwildfire", at: "2026-07-25" }
provenance: { model: null, prompt: null }
requirements: [TXT-DEMO-001]
---

Women accounted for {{ard:t-demographics:sex:n;variable_level=F;group=Total}} patients
({{ard:t-demographics:sex:p;variable_level=F;group=Total;scale=100;digits=1}}%) overall.
```

At build time that becomes `Women accounted for 143 patients (56.3%) overall.`

Three tokens can appear in prose, and all three are the same idea — the sentence names
something the build owns rather than stating it:

| Token | Names | Fails the build when |
|---|---|---|
| `{{ard:…}}` | One row of one display's current ARD | It matches zero rows, or more than one |
| `{{value:…}}` | An entry in the named-value store | The name is unknown, or the store disagrees with the ARD |
| `{{xref:…}}` | A display's assigned table number, or another section | The target does not exist in this report |

Two kinds of qualifier ride on an address, and only one can change which number you get:

- **Selection** — `group`, `group2`, `variable`, `variable_level` narrow which row is meant.
- **Presentation** — `scale` multiplies (0.563 → 56.3) and `digits` rounds. Neither touches
  the stored value, so one row can be quoted to different precision in different sentences
  without any of them being inconsistent.

### The gate that makes it stick

After the bindings are substituted, the build scans the *rendered* prose for digits and
requires every digit run to have come from a resolved binding, a cross-reference, or a
short explicit `allow_digits` list for things that genuinely are text — an E3 section
number, a protocol identifier, a threshold like "30 days" in a block about exposure
windows. Digits inside inline code and markdown links are exempt.

The consequence is the thing worth telling a colleague: a typed number does not become a QC
finding weeks later. It becomes a red build, in the pull request that typed it.

### Tiers and approval

A block declares one of three tiers — `boilerplate` (standing text), `parameterized` (prose
written once, numbers bound), `generated` (drafted by a model). A generated block without an
approval record is not a failure; it is excluded from the assembled report and reported as
pending review. In the current demo, 10 of 15 blocks are in the report and 5 generated-tier
drafts are held out, each named with the reason.

---

## 4 · Templates

Two files, and the division between them is the useful part.

- [`sections.yaml`](../../library/templates/ich-e3/sections.yaml) — what an ICH E3 report
  *is*. 119 sections, each with a number, a title, a stable slug, and the kind of content it
  may hold. Written once for the standard, reusable by any study, encoded from E3 itself.
- [`assembly.yaml`](../../library/templates/ich-e3/assembly.yaml) — what *this* report puts
  in them. The study's own facts, the narrative slots (which text blocks and in-text
  displays fill which section), and the Section 14 slots (which displays sit under which
  post-text heading, in order).

A section declares its content model from a four-word vocabulary: `text`,
`in_text_display`, `post_text_index`, `generated_provenance`. An empty list is a structural
heading. Across the 119 sections that is 62 text-only, 20 text plus an in-text display, 15
post-text containers, 21 structural headings, and one provenance appendix.

```yaml
# sections.yaml — the standard
- number: "11.2"
  title: "Demographic and Other Baseline Characteristics"
  slug: demographics
  content: [text, in_text_display]

# assembly.yaml — this report
slots:
  - section: "11.2"
    text: [TXT-E3-1102]
    displays: [t-demographics]     # rendered here as the in_text variant
post_text:
  - section: "14.1"
    displays: [t-disposition, t-demographics]
```

### What a section actually pulls in

Section 11.2 of the demo report, assembled, is:

- The E3 heading and number, from `sections.yaml`.
- The block `TXT-E3-1102`, with its 16 bindings resolved against the current demographics
  ARD, rendered from markdown, carrying its own approval state and fidelity result beside
  the prose.
- The demographics display, `in_text` variant — the same ARD as Section 14, under the
  shorter title the display declares for narrative use.
- A cross-reference in the last sentence that resolves to *Table 14.1.2*, because
  `t-demographics` is second in the 14.1 slot.

> No file in the repository contains the string "Table 14.1.2". A display's identity is its
> slug; the number is assigned from the order of the `post_text` lists at build time, and
> any sentence that mentions the table asks for it by slug. Reordering Section 14 is a
> one-line diff, and every cross-reference follows. A number colliding with a real E3
> section number is a build failure.

The assembler also writes a provenance appendix into Section 16.1.9 with no human
involvement: per display, its number, both spec hashes, the input datasets with versions and
hashes, the R environment, and the commit.

`node scripts/assemble.mjs` does all of it and exits non-zero on any gate failure. CI runs
it on every pull request.

---

## What CI enforces

| Gate | Requires |
|---|---|
| Structure | Every section the assembly references exists; no assigned number collides with a section number |
| Binding resolution | Every `{{ard:…}}` matches exactly one row of the display's current ARD |
| Named values | Every value re-derives from the committed ARDs, hash checked, format re-applied, arithmetic re-evaluated |
| Numeric fidelity | Every digit in rendered prose traces to a binding, a cross-reference, or a declared exemption |
| Cross-references | Every `{{xref:…}}` resolves within this report |
| Approval | Model-generated blocks without an approval record are excluded and reported |

Alongside those, the R suite is re-run from scratch and compared against its committed
results so the evidence in the repository can never be stale, and the site build fails on a
broken internal link or any reference to an external host.

## Known gaps between this framework and its documentation

Recorded 2026-08-26 while writing this document. None is a defect in the framework; all are
things a reviewer would otherwise trip over.

1. **No committed artifact names its commit.** Provenance is honest by design — `null` when
   the tree is dirty. The consequence, undocumented until now, is that every artifact
   currently committed was generated from a dirty tree: all 13 ARDs record a null commit,
   all 13 iteration-ledger entries record an empty string, and so does the values store. The
   README's "reproducible from its commit" is true as a design property and unevidenced in
   the files. One regeneration from a clean tree would close it. Separately, the ARD and
   manifest write `null` where the ledger writes `""` — two spellings of the same absence,
   neither documented.
2. **The named-value store reaches no approved sentence.** 15 values declared, 7 cited, all
   7 in a single generated-tier draft that is correctly excluded from assembly. The gate runs
   and passes; the assembled report contains no resolved `{{value:}}` token.
3. **`iterations.yaml` has no schema section in `contracts.md`** — it appears only as a
   filename in the layout listing, though it is one of the three files that define a display.
4. **Three smaller contract gaps.** The `pattern` vocabulary is referenced but never
   enumerated (there are eleven built-ins); variant configuration documents `filter` only,
   while the renderer also honours `title` and `footnotes` (five of six displays use
   `title`); and the assembler's header comment lists five gates on `csr.json` where the code
   emits six, omitting the values gate.

---

Drafted by Claude Code using Opus 5 (worker `W0130`).
