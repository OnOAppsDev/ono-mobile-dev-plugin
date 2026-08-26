Fixture target repository: a legacy feature. Its Feature Analysis predates the
repo_knowledge_* fields (schema v1 shape, unstamped), there is no .ono/repo-knowledge.json,
and there is no task-state file.

Used by scripts/document-chain.test.ts to prove the chain degrades correctly on a feature
authored before the current contracts existed: the migrator brings the analysis forward,
repo-knowledge reports absent, and task-state reports every task unknown so dependency
completeness falls back to asking a human.
