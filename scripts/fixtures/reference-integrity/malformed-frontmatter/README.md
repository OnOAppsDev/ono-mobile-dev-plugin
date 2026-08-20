# Fixture: malformed-frontmatter

Deliberately broken, two ways: an agent whose frontmatter block opens and never closes,
and a skill whose frontmatter name disagrees with its directory name.
Expected: exactly one A1-frontmatter-wellformed and one A4-name-matches-path defect.
