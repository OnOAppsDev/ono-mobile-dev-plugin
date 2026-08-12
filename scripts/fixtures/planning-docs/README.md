# Planning-document migration fixtures

Inputs and golden outputs for `scripts/migrate-planning-doc.test.ts`.

These are **on disk rather than built in a temp directory**, unlike
`read-repo-knowledge.test.ts`'s fixtures. That is deliberate: these documents
must be compared byte-for-byte, and they contain ` ```yaml ` fences, CRLF line
endings, and trailing whitespace — none of which survives being embedded in a
TypeScript template literal without escaping every backtick, which is exactly
the corruption the tests exist to catch. See `docs/planning-doc-contract.md`.

`*.expected.md` is the golden output for its input. A fixture with no
`.expected.md` is a case where the framework must write nothing.

| Fixture | Covers |
|---|---|
| `fa-v0.md` | v0 (initial import), fenced. Batches three questions; migrates fully with `--answers`. |
| `fa-v1.md` | v1, fenced. Figma link carrying a `#fragment`. Fully deterministic v1→v3. |
| `fa-v1-mixed.md` | `platform: mixed` — legal in v1, forbidden from v2. One question. |
| `fa-v1-nofigma.md` | v1 with no Figma link — the design-reference outcome is unrecoverable. One question. |
| `fa-v2.md` | v2, `---` delimited encoding. Deterministic v2→v3. |
| `fa-v3-unstamped.md` | Already current-shaped but unstamped — stamp-only write. |
| `fa-v3-stamped.md` | Stamped at current — true no-op, nothing written. |
| `fa-hazards.md` | CRLF, blank template values needing `fill`, and a body containing `---`, a ` ```yaml ` fence, and trailing whitespace. |
| `fa-device-labeled.md` | A labelled `Device Type:` line in the body — the one permitted body-derived inference. |
| `fa-schema-too-new.md` | `doc_schema_version` above current — refused. |
| `dd-v1-stamped.md` | A DD passed as `--kind feature-analysis` — kind mismatch. |
| `malformed-no-frontmatter.md` | No recognizable frontmatter block. |
| `malformed-unclosed-fence.md` | Opening fence with no closing fence. |
