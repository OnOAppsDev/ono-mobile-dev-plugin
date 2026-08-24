/**
 * release-metadata.test.ts
 *
 * Asserts the release metadata this repository owns is internally consistent.
 *
 * The gap this closes: two scripts already pin their `PLUGIN_VERSION` constant to
 * `.claude-plugin/plugin.json` (see task-state.test.ts §11 and
 * migrate-planning-doc.test.ts §16), but nothing checked the CHANGELOG. A release
 * whose manifest and changelog disagree is a release nobody can date.
 *
 * OFFLINE BY CONSTRUCTION. This suite never reads the ono-plugin-marketplace
 * repository, and must not learn how to. `plugin.json` is the authoritative source for
 * this plugin's version — Claude Code's own docs state that when both a marketplace
 * entry and `plugin.json` declare a version, `plugin.json` wins, silently — so the
 * marketplace declares none, and there is nothing left to compare across repositories.
 * The marketplace-facing `description` duplicate is a documented manual obligation
 * (README § Metadata ownership), deliberately not a network check: adding one would
 * cost `scripts/check.ts` its offline determinism and couple this suite to another
 * repository's default branch. Cross-repository enforcement is SHARED-012, opt-in.
 *
 * No external test framework. Run with:
 *   node --no-warnings scripts/release-metadata.test.ts
 * or through the aggregator:
 *   node scripts/check.ts --only release-metadata
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
const MANIFEST = join(REPO_ROOT, ".claude-plugin", "plugin.json");
const CHANGELOG = join(REPO_ROOT, "CHANGELOG.md");
const README = join(REPO_ROOT, "README.md");

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
/** `## [0.5.0] - 2026-08-12`. An `## [Unreleased]` heading deliberately does not match. */
const RELEASE_HEADING = /^## \[(\d+\.\d+\.\d+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?\s*$/gm;

interface Release {
  version: string;
  date: string | undefined;
  triple: [number, number, number];
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf-8")) as Record<string, unknown>;
const changelog = readFileSync(CHANGELOG, "utf-8");
const readme = readFileSync(README, "utf-8");

const releases: Release[] = [...changelog.matchAll(RELEASE_HEADING)].map((m) => {
  const [a, b, c] = m[1].split(".").map(Number);
  return { version: m[1], date: m[2], triple: [a, b, c] as [number, number, number] };
});

// --- 1. The manifest ------------------------------------------------------
{
  check("1 plugin.json parses", typeof manifest === "object" && manifest !== null);
  check("1 plugin.json declares a name", manifest.name === "ono-mobile-dev-plugin", String(manifest.name));
  const version = manifest.version;
  check("1 plugin.json declares a version", typeof version === "string" && version.length > 0);
  check("1 the version is valid semver", SEMVER.test(String(version)), String(version));
}

// --- 2. The CHANGELOG has parseable releases -----------------------------
{
  check("2 the CHANGELOG has at least one release heading", releases.length > 0, `${releases.length}`);
  check("2 every release heading is valid semver", releases.every((r) => SEMVER.test(r.version)),
    releases.filter((r) => !SEMVER.test(r.version)).map((r) => r.version).join(", "));
  check("2 every release heading carries an ISO date", releases.every((r) => r.date !== undefined),
    releases.filter((r) => r.date === undefined).map((r) => r.version).join(", "));
  check("2 no release version is listed twice",
    new Set(releases.map((r) => r.version)).size === releases.length,
    releases.map((r) => r.version).join(", "));
}

// --- 3. THE POINT: manifest version == newest release heading ------------
{
  const newest = releases[0];
  check("3 plugin.json version matches the newest CHANGELOG release",
    newest !== undefined && newest.version === manifest.version,
    `plugin.json=${manifest.version} vs CHANGELOG=${newest?.version ?? "none"}`);

  // Newest-first ordering, so releases[0] really is the newest. A release inserted in
  // the wrong place would otherwise make the assertion above compare the wrong heading.
  let descending = true;
  for (let i = 1; i < releases.length; i++) {
    const [pa, pb, pc] = releases[i - 1].triple;
    const [ca, cb, cc] = releases[i].triple;
    if (pa * 1_000_000 + pb * 1_000 + pc <= ca * 1_000_000 + cb * 1_000 + cc) descending = false;
  }
  check("3 releases are listed newest-first", descending, releases.map((r) => r.version).join(" > "));

  // Dates must not move backwards down the list either.
  let datesDescend = true;
  for (let i = 1; i < releases.length; i++) {
    const prev = releases[i - 1].date;
    const cur = releases[i].date;
    if (prev !== undefined && cur !== undefined && prev < cur) datesDescend = false;
  }
  check("3 release dates do not move backwards", datesDescend,
    releases.map((r) => `${r.version}@${r.date}`).join(" > "));
}

// --- 4. Marketplace-owned fields stay out of plugin.json ----------------
{
  // `source` is the marketplace's to own: it says where to fetch this plugin from, which
  // this repository cannot know. If it ever appears here, the ownership split has broken.
  for (const field of ["source", "ref", "sha", "plugins"]) {
    check(`4 plugin.json does not declare marketplace-owned \`${field}\``, !(field in manifest));
  }
  check("4 plugin.json declares an author", typeof manifest.author === "object" && manifest.author !== null);
}

// --- 5. The ownership rule is documented, not just practised ------------
{
  check("5 README documents metadata ownership", /^## Metadata ownership$/m.test(readme));
  check("5 README names plugin.json as the version authority", /`plugin\.json` wins/.test(readme));
  check("5 README records that the marketplace declares no version",
    /marketplace entry therefore declares no version/.test(readme));
  check("5 README explains the description duplicate is not authoritative",
    /it is not authoritative/.test(readme));
  check("5 README states a version bump is a release action",
    /release action, not bookkeeping/.test(readme));
  check("5 README states cross-repository enforcement is out of scope",
    /Cross-repository enforcement is\s*\n?deliberately out of scope|deliberately out of scope/.test(readme));
}

// --- 6. This suite stays offline ---------------------------------------
{
  const src = readFileSync(join(HERE, "release-metadata.test.ts"), "utf-8");

  // Every needle is assembled from fragments, so the literal it forbids never appears
  // in this file — otherwise the assertion below would match its own checklist and fail.
  // Same reason hooks.test.ts builds its credential fixtures from fragments.
  const FORBIDDEN: Array<[string, string]> = [
    ["network fetch", `fet${"ch("}`],
    ["raw githubusercontent", `https://${"raw."}githubusercontent.com`],
    ["child process module", `child${"_process"}`],
    ["synchronous exec", `execFile${"Sync"}`],
    ["process spawn", `spawn${"Sync"}`],
    ["sibling marketplace repo", `ono-plugin-${"marketplace/"}`],
  ];
  for (const [label, needle] of FORBIDDEN) {
    check(`6 stays offline — no ${label}`, !src.includes(needle), needle);
  }
  check("6 reads only this repository's own files",
    [...src.matchAll(/readFileSync\(([^)]*)\)/g)].every((m) => /MANIFEST|CHANGELOG|README|HERE/.test(m[1])));
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures > 0 ? 1 : 0);
