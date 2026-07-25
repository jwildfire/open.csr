# Text-decision fixture library

A miniature `library/text/` used by `tests/unit/text-decision-*.test.js`. Each test
copies this directory into a temporary repository root, applies a decision there, and
throws the copy away — the real `library/text/` is never opened for writing by a test.

ARDs are not duplicated here: the tests point the gate runner at `tests/fixtures/ard/`,
which is read-only for them.

| Block | Tier / state | Why it exists |
| --- | --- | --- |
| `TXT-FIX-1001` | parameterized, approved | A block that must never be touched by a decision about another block. |
| `TXT-FIX-1002` | generated, draft | The happy path: approve it and the gates stay green. |
| `TXT-FIX-1003` | generated, draft, **orphaned binding** | The seeded failure. As a draft it is excluded from assembly, so the orphan is *deferred*; approving it promotes the orphan to a gate failure, which must revert the edit and fail the run. |
| `TXT-FIX-1004` | generated, approved | The revocation path: a change request on approved prose returns it to `in_review`. |
| `TXT-FIX-1005` | generated, draft, block-style `approval:` | The frontmatter editor must handle a block mapping as well as the library's inline flow map. |
