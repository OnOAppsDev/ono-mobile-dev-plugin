Fixture target repository: a feature whose planning chain is complete and current.

Used by scripts/document-chain.test.ts. Copied to a temp dir and `git init`-ed by the
suite, because a committed fixture cannot carry a nested .git. Content is minimal on
purpose: the chain exercises frontmatter contracts and the seams between stages, not
document prose.
