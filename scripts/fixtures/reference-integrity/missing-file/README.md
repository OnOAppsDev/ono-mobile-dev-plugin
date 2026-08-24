# Fixture: missing-file

Deliberately broken. A command cites an agent file that does not exist on disk.
Expected: exactly one B1-cited-path-resolves defect. Nothing else.

Do not write plugin-shaped paths in backticks in this file — the validator would
read them as citations from this document and the expected defect count would move.
