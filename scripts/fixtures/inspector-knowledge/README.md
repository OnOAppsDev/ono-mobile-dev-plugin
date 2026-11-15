# Inspector knowledge fixtures

Real `.ono/repo-knowledge.json` manifests emitted by the Ono Project Inspector's own
`scripts/repo-knowledge.ts emit`, one per release (0.10.0, 0.11.0, 0.11.1, 0.11.2), all
against the same project in `app/` (built with Inspector 0.11.2's `writeApp` test fixture).
`read-repo-knowledge.test.ts` copies `app/` into a throwaway repository — at the Git root and
nested below it — and reads every manifest, so a change to this plugin's reader that breaks
an existing Inspector manifest fails the suite.

`app/CLAUDE.fixture.md` is the project's `CLAUDE.md`, renamed so Claude Code never loads it
as instructions while working in this repository; the test writes it back as `CLAUDE.md`.

Regenerate only when a new Inspector release changes the manifest. Never edit a manifest by
hand: its artifact hashes must match `app/` byte for byte.
