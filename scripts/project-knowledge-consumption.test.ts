/**
 * project-knowledge-consumption.test.ts
 *
 * Pins Stage B: the consumer side of generic Project Knowledge — surfaces, shared code,
 * surface-scoped conventions, capabilities and first-degree capability relationships,
 * produced by ono-project-inspector 0.11.0 (Stage A).
 *
 * The ownership model this suite protects:
 *
 *   Project Inspector   produces repository-specific knowledge, refreshes it
 *   Dev Plugin          consumes it, verifies stale facts against current code,
 *                       runs the generic SDLC methodology, keeps stable platform rules
 *   Current source      authoritative whenever the two disagree
 *
 * What it proves:
 *   1.  An old manifest (no surfaces/capabilities) still works — byte-identical base lists.
 *   2.  Trusted surface knowledge is reused as-is.
 *   3.  Stale surface knowledge enters verify-on-use, and is verified against source.
 *   4.  Human routing confirmation stays mandatory; surfaces never choose routing.
 *   5.  Capability lookup succeeds by deterministic identity: id, name, source root.
 *   6.  No capability is ever matched by semantic similarity.
 *   7.  Direct (first-degree) relationships are loaded.
 *   8.  Relationship evidence is re-checked when stale.
 *   9.  An invalid relationship falls back to live derivation.
 *   10. No recursive / transitive graph expansion happens.
 *   11. Planning consumes surface-specific overrides.
 *   12. Implementation does not rediscover resolved context.
 *   13. Review actually consumes Project Knowledge.
 *   14. Live discovery still works when knowledge is absent.
 *   15. Current code overrides conflicting Project Knowledge.
 *   16. The contract copy is the Stage A producer copy, byte for byte.
 *   17. Developer Testing, resume, QA handoff and routing behaviour are unchanged.
 *
 * OFFLINE. Builds throwaway git repositories under a temp directory.
 *
 *   node --no-warnings scripts/project-knowledge-consumption.test.ts
 */

import { execFileSync, spawnSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, rmSync, unlinkSync } from "fs";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join, dirname } from "path";
import * as Reader from "./read-repo-knowledge.ts";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), "utf-8");
const flat = (s: string): string => s.replace(/\s+/g, " ");
const sha = (s: string) => createHash("sha256").update(s, "utf-8").digest("hex");
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();

function write(root: string, rel: string, body: string): void {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body, "utf-8");
}

/* ------------------------------------------------------------------ fixture */

const CLAUDE_BODY = "# CLAUDE.md — Demo\n\n## Targets and Surfaces\n\n| Surface | Platform |\n|---|---|\n| mobile | android |\n| tv | android |\n";
const PATTERNS_BODY = [
  "# Patterns", "",
  "## State Management", "Redux Toolkit.", "",
  "## Input and Interaction", "Touch.", "",
  "### Input and Interaction (tv)", "D-pad focus through FocusManager.", "",
  "## Media and Playback", "Shared Player.", "",
].join("\n");
const COMPONENTS_BODY = "# Components\n\n## Screens\n\n| Screen | Surface |\n|---|---|\n| PlaybackScreen | all |\n";
const INTEGRATIONS_BODY = "# Integrations\n\n## Analytics\nSegment.\n";
const CAPABILITIES_BODY = "# Capabilities\n\n## Capability: playback\n\n## Capability: catalog\n\n## Capability: profile\n\n## Relationships\n";

const SOURCE: Record<string, string> = {
  "src/shared/player/Player.ts": "export class Player {}\n",
  "src/features/playback/PlaybackScreen.tsx": "import { Player } from '../../shared/player/Player';\nexport const PlaybackScreen = () => null;\n",
  "src/features/catalog/CatalogScreen.tsx": "export const CatalogScreen = () => navigate('Playback');\n",
  "src/features/profile/ProfileScreen.tsx": "export const ProfileScreen = () => null;\n",
  "src/features/catalog/useProfileBadge.ts": "import { ProfileStore } from '../profile/ProfileStore';\n",
  "src/features/profile/ProfileStore.ts": "export class ProfileStore {}\n",
  "src/mobile/App.tsx": "export const MobileApp = () => null;\n",
  "src/tv/App.tsx": "export const TvApp = () => null;\n",
  "app/src/tv/AndroidManifest.xml": "<manifest><uses-feature android:name=\"android.software.leanback\"/></manifest>\n",
  "app/src/main/AndroidManifest.xml": "<manifest/>\n",
  "package.json": '{ "name": "demo" }\n',
};

const cap = (id: string, name: string, roots: string[], extra: Record<string, any> = {}) => ({
  id,
  name,
  anchor: `docs/project/capabilities.md#capability-${id}`,
  surfaceScope: "all",
  surfaces: ["mobile", "tv"],
  sourceRoots: roots.map((path) => ({ path, surface: null })),
  entryPoints: [],
  components: [],
  services: [],
  routes: [],
  dataDependencies: [],
  stateOwnership: [],
  tests: [],
  evidence: roots,
  relationships: [],
  ...extra,
});

const REL_CATALOG_PLAYBACK = {
  id: "catalog:navigates_to:playback",
  from: "catalog",
  type: "navigates_to",
  to: "playback",
  evidenceKind: "navigation-route",
  evidence: ["src/features/catalog/CatalogScreen.tsx::navigate('Playback')"],
  anchor: "docs/project/capabilities.md#relationships",
};
const REL_CATALOG_PROFILE = {
  id: "catalog:reads_from:profile",
  from: "catalog",
  type: "reads_from",
  to: "profile",
  evidenceKind: "import",
  evidence: ["src/features/catalog/useProfileBadge.ts::ProfileStore"],
  anchor: "docs/project/capabilities.md#relationships",
};
const REL_PLAYBACK_PLAYER = {
  id: "playback:depends_on:profile",
  from: "playback",
  type: "depends_on",
  to: "profile",
  evidenceKind: "import",
  evidence: ["src/features/playback/PlaybackScreen.tsx::Player"],
  anchor: "docs/project/capabilities.md#relationships",
};

function baseManifest(gitHead: string | null, knowledgeHead: string | null): any {
  return {
    repoKnowledgeSchemaVersion: 1,
    producedBy: { plugin: "ono-project-inspector", version: "0.10.0" },
    generatedAt: "2026-09-29T00:00:00.000Z",
    fingerprint: {
      gitHead,
      knowledgeHead,
      artifacts: {
        "CLAUDE.md": sha(CLAUDE_BODY),
        "AUDIT.md": null,
        "docs/project/overview.md": null,
        "docs/project/components.md": sha(COMPONENTS_BODY),
        "docs/project/patterns.md": sha(PATTERNS_BODY),
        "docs/project/integrations.md": sha(INTEGRATIONS_BODY),
      },
    },
    coverage: {
      stack: "populated", commands: "partial", structure: "populated", inventory: "populated",
      conventions: "populated", integrations: "populated", auditTopics: "populated",
    },
    stack: { languages: ["Kotlin"], frameworks: [], platformHints: ["Android"], runtimeTooling: ["Gradle"], packageManagers: [] },
    commands: { install: null, run: null, test: "./gradlew test", build: null },
    structure: { repositoryTree: "CLAUDE.md#repository-structure", keyModules: "CLAUDE.md#key-modules", entryPoints: "CLAUDE.md#entry-points" },
    documents: {
      claudeMd: { path: "CLAUDE.md", exists: true, anchors: [] },
      auditMd: { path: "AUDIT.md", exists: false, anchors: [] },
      overview: { path: "docs/project/overview.md", exists: false, anchors: [] },
      inventory: { path: "docs/project/components.md", exists: true, anchors: ["#screens"] },
      conventions: { path: "docs/project/patterns.md", exists: true, anchors: ["#state-management", "#input-and-interaction", "#input-and-interaction-tv", "#media-and-playback"] },
      integrations: { path: "docs/project/integrations.md", exists: true, anchors: ["#analytics"] },
    },
    auditTopics: [],
  };
}

/** A Stage A (0.11.0) manifest: the base plus the generic surface and capability model. */
function stageAManifest(gitHead: string | null, knowledgeHead: string | null, tweak: (m: any) => void = () => {}): any {
  const m = baseManifest(gitHead, knowledgeHead);
  m.producedBy.version = "0.11.0";
  m.fingerprint.artifacts["docs/project/capabilities.md"] = sha(CAPABILITIES_BODY);
  m.coverage.surfaces = "populated";
  m.coverage.capabilities = "populated";
  m.structure.surfaces = "CLAUDE.md#targets-and-surfaces";
  for (const d of Object.values(m.documents) as any[]) d.surfaceAnchors = {};
  m.documents.conventions.surfaceAnchors = { tv: [{ section: "#input-and-interaction", anchor: "#input-and-interaction-tv" }] };
  m.documents.capabilities = { path: "docs/project/capabilities.md", exists: true, anchors: ["#capability-catalog", "#capability-playback", "#capability-profile", "#relationships"], surfaceAnchors: {} };
  m.surfaces = [
    { id: "mobile", platform: "android", formFactor: "handheld", buildSelector: ":app:assembleMobileDebug", sourceRoots: ["src/mobile"], sharedWith: ["tv"], packaging: "apk", minimumRuntime: null, evidence: ["app/src/main/AndroidManifest.xml"] },
    { id: "tv", platform: "android", formFactor: "tv", buildSelector: ":app:assembleTvDebug", sourceRoots: ["src/tv"], sharedWith: ["mobile"], packaging: "apk", minimumRuntime: null, evidence: ["app/src/tv/AndroidManifest.xml::android.software.leanback"] },
  ];
  m.sharedCode = [{ root: "src/shared", sharedBy: ["mobile", "tv"], mechanism: "source set", evidence: ["src/shared/player/Player.ts"] }];
  m.capabilities = [
    cap("catalog", "Content Catalog", ["src/features/catalog"], { relationships: [REL_CATALOG_PLAYBACK.id, REL_CATALOG_PROFILE.id] }),
    cap("playback", "Video Playback", ["src/features/playback"], {
      entryPoints: ["src/features/playback/PlaybackScreen.tsx"],
      relationships: [REL_CATALOG_PLAYBACK.id, REL_PLAYBACK_PLAYER.id],
    }),
    cap("profile", "User Profile", ["src/features/profile"], { relationships: [REL_CATALOG_PROFILE.id, REL_PLAYBACK_PLAYER.id] }),
  ];
  m.capabilityRelationships = [REL_CATALOG_PLAYBACK, REL_CATALOG_PROFILE, REL_PLAYBACK_PLAYER];
  tweak(m);
  return m;
}

const tmp = mkdtempSync(join(realpathSync(tmpdir()), "pk-consume-"));
let seq = 0;

/** A repository with source and knowledge committed; returns [dir, knowledgeHead]. */
function seed(): [string, string] {
  const dir = join(tmp, `r${++seq}`);
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@t");
  git(dir, "config", "user.name", "t");
  for (const [rel, body] of Object.entries(SOURCE)) write(dir, rel, body);
  write(dir, "CLAUDE.md", CLAUDE_BODY);
  write(dir, "docs/project/patterns.md", PATTERNS_BODY);
  write(dir, "docs/project/components.md", COMPONENTS_BODY);
  write(dir, "docs/project/integrations.md", INTEGRATIONS_BODY);
  write(dir, "docs/project/capabilities.md", CAPABILITIES_BODY);
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "knowledge");
  return [dir, git(dir, "rev-parse", "HEAD")];
}

function commit(dir: string, rel: string, body: string | null): string {
  if (body === null) unlinkSync(join(dir, rel));
  else write(dir, rel, body);
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", `change ${rel}`);
  return git(dir, "rev-parse", "HEAD");
}

const put = (dir: string, m: any) => write(dir, ".ono/repo-knowledge.json", JSON.stringify(m, null, 2));
const R = (dir: string): any => Reader.readRepoKnowledge(dir);
const api = Reader as any;

/* ── 1. an old manifest still works exactly as before ─────────────────── */
{
  const [dir, head] = seed();
  put(dir, baseManifest(head, head));
  const old = R(dir);
  check("1 old manifest: still available", old.available === true, old.summary);
  check("1 old manifest: surfaces are derive-live, never an error",
    old.extendedCategories?.surfaces?.status === "deriveLive" && old.surfaces === null, JSON.stringify(old.extendedCategories));
  check("1 old manifest: capabilities are derive-live", old.extendedCategories?.capabilities?.status === "deriveLive" && old.capabilities === null);
  check("1 old manifest: the one-line summary is exactly what it always was", !/Surfaces and capabilities/.test(old.summary), old.summary);
  check("1 old manifest: absence is explained as an older producer", /absent|older producer|not produced/i.test(old.extendedCategories?.surfaces?.reason ?? ""));

  put(dir, stageAManifest(head, head));
  const next = R(dir);
  for (const k of ["usableCategories", "trustedCategories", "verifyOnUse", "deriveLive"]) {
    check(`1 the base ${k} are identical with and without the additive model`, JSON.stringify(old[k]) === JSON.stringify(next[k]), `${JSON.stringify(old[k])} vs ${JSON.stringify(next[k])}`);
  }
  const lookup = api.lookupCapability?.(old, { capability: "playback" });
  check("1 old manifest: capability lookup reports derive-live, not a miss", lookup?.status === "derive-live", JSON.stringify(lookup));

  // A malformed additive block degrades that category only.
  put(dir, stageAManifest(head, head, (m) => { m.capabilities = "nope"; }));
  const bad = R(dir);
  check("1 a malformed capability model is derive-live, not a failed manifest",
    bad.available === true && bad.extendedCategories.capabilities.status === "deriveLive" && bad.extendedCategories.surfaces.status === "trusted");
  rmSync(dir, { recursive: true, force: true });
}

/* ── 2. trusted surface knowledge is reused ───────────────────────────── */
{
  const [dir, head] = seed();
  put(dir, stageAManifest(head, head));
  const r = R(dir);
  check("2 fresh: surfaces trusted", r.extendedCategories?.surfaces?.status === "trusted", JSON.stringify(r.extendedCategories));
  check("2 fresh: capabilities trusted", r.extendedCategories?.capabilities?.status === "trusted");
  check("2 fresh: the normalized surfaces are exposed", r.surfaces?.map((s: any) => s.id).join(",") === "mobile,tv");
  const tv = api.querySurface?.(r, dir, "tv");
  check("2 the surface context is returned without re-verification", tv?.status === "found" && tv.verification?.status === "trusted", JSON.stringify(tv?.verification));
  check("2 it names the surface's build selector and source roots", tv?.surface?.buildSelector === ":app:assembleTvDebug" && tv.surface.sourceRoots.join(",") === "src/tv");
  check("2 it names the shared code the surface builds from", tv?.sharedCode?.map((s: any) => s.root).join(",") === "src/shared");
  const missing = api.querySurface?.(r, dir, "watch");
  check("2 an undeclared surface is not-found, never invented", missing?.status === "not-found");
  rmSync(dir, { recursive: true, force: true });
}

/* ── 3. stale surface knowledge enters verify-on-use ──────────────────── */
{
  const [dir, kh] = seed();
  const head = commit(dir, "app/src/tv/AndroidManifest.xml", "<manifest><uses-feature android:name=\"android.software.leanback\"/><!-- banner --></manifest>\n");
  put(dir, stageAManifest(head, kh));
  const r = R(dir);
  check("3 a changed surface-evidence file puts surfaces in verify-on-use", r.extendedCategories?.surfaces?.status === "verifyOnUse", JSON.stringify(r.extendedCategories));
  check("3 the change is attributed to the surface it falls under", (r.sourceDrift?.affectedSurfaces ?? []).join(",") === "tv", JSON.stringify(r.sourceDrift));
  check("3 surface-evidence drift is an analysis signal, as the producer defines it",
    (r.sourceDrift?.analysisSignals ?? []).some((s: string) => /AndroidManifest\.xml/.test(s)));
  const tv = api.querySurface?.(r, dir, "tv");
  check("3 the stale surface is verified against current source", tv?.verification?.status === "verified", JSON.stringify(tv?.verification));
  check("3 and the refresh recommendation is the existing /inspect path", /\/inspect\b/.test(r.refreshRecommendation ?? "") && /Refresh Project Knowledge/.test(r.refreshRecommendation ?? ""));

  const head2 = commit(dir, "app/src/tv/AndroidManifest.xml", "<manifest/>\n");
  put(dir, stageAManifest(head2, kh));
  const tv2 = api.querySurface?.(R(dir), dir, "tv");
  check("15 when current source contradicts the surface, verification fails and names the ref",
    tv2?.verification?.status === "failed" && tv2.verification.failed.some((f: any) => /leanback/.test(f.ref)), JSON.stringify(tv2?.verification));
  rmSync(dir, { recursive: true, force: true });
}

/* ── 4. human routing confirmation remains mandatory ──────────────────── */
{
  const [dir, head] = seed();
  put(dir, stageAManifest(head, head));
  const r = R(dir);
  check("4 the reader flags surfaces as advisory", r.surfacesAreAdvisory === true && r.platformHintsAreAdvisory === true);
  check("4 the reader never emits a device_type or a routing decision",
    !/"(device_?type|deviceType|routing|platformDecision)"/.test(JSON.stringify(r)));
  const af = flat(read("commands/analyze-feature.md"));
  check("4 analyze-feature still asks the confirmation question", /Is the current feature intended for this context\?/.test(af));
  check("4 analyze-feature: surfaces may prefill but never replace the gate",
    /surface/i.test(af) && /never (replaces?|skips?|answers?) (the )?(confirmation|this gate)/i.test(af));
  check("4 analyze-feature: formFactor is never device_type", /`formFactor`[^.]*never[^.]*`device_type`/.test(af));
  const consumer = flat(read("skills/repo-knowledge-consumer/SKILL.md"));
  check("4 the consumer: surfaces may corroborate and scope, never choose routing",
    /corroborate/i.test(consumer) && /scope/i.test(consumer) && /never (silently )?choose[s]? routing|may not silently choose routing/i.test(consumer));
  rmSync(dir, { recursive: true, force: true });
}

/* ── 5–6. capability lookup: deterministic identity only ──────────────── */
{
  const [dir, head] = seed();
  put(dir, stageAManifest(head, head));
  const r = R(dir);
  const L = (q: any) => api.lookupCapability?.(r, q);
  const byId = L({ capability: "playback" });
  check("5 lookup by capability id", byId?.status === "found" && byId.matches.map((m: any) => m.id).join(",") === "playback" && byId.matches[0].matchedBy === "id", JSON.stringify(byId));
  const byName = L({ capability: "  video   PLAYBACK " });
  check("5 lookup by exact name (case and whitespace insensitive)", byName?.status === "found" && byName.matches[0].id === "playback" && byName.matches[0].matchedBy === "name");
  const byPath = L({ paths: ["src/features/playback/PlaybackScreen.tsx"] });
  check("5 lookup by a known source root", byPath?.status === "found" && byPath.matches[0].id === "playback" && byPath.matches[0].matchedBy === "source-root", JSON.stringify(byPath));
  const two = L({ paths: ["src/features/playback/x.ts", "src/features/catalog/y.ts"] });
  check("5 several matches are ambiguous — the human picks", two?.status === "ambiguous" && two.matches.length === 2);

  for (const q of ["video", "Playback screen", "playbak", "media", "play"]) {
    const miss = L({ capability: q });
    check(`6 "${q}" is not matched by similarity`, miss?.status === "not-found" && miss.matches.length === 0, JSON.stringify(miss));
  }
  check("6 a path outside every recorded root matches nothing", L({ paths: ["src/features/search/Search.tsx"] })?.status === "not-found");
  rmSync(dir, { recursive: true, force: true });
}

/* ── 7, 10. direct relationships only — never transitive ──────────────── */
{
  const [dir, head] = seed();
  put(dir, stageAManifest(head, head));
  const r = R(dir);
  const ctx = api.capabilityContext?.(r, dir, "playback");
  const ids = (ctx?.relationships ?? []).map((x: any) => x.id).sort();
  check("7 the capability's direct relationships are loaded", ids.join(",") === "catalog:navigates_to:playback,playback:depends_on:profile", ids.join(","));
  const nav = ctx?.relationships?.find((x: any) => x.id === REL_CATALOG_PLAYBACK.id);
  check("7 each relationship carries its direction, type, evidence kind and evidence",
    nav?.direction === "incoming" && nav.type === "navigates_to" && nav.evidenceKind === "navigation-route" && nav.evidence.length === 1);
  check("7 the neighbour is summarised by identity and anchor only", nav?.other?.id === "catalog" && nav.other.anchor === "docs/project/capabilities.md#capability-catalog");
  check("10 the neighbour's own relationships are NOT loaded", nav?.other && !("relationships" in nav.other));
  check("10 a second-degree edge (catalog → profile) is never included", !ids.includes(REL_CATALOG_PROFILE.id));
  check("10 no impact score or transitive list is produced", !/score|impact|transitive|depth/i.test(JSON.stringify(Object.keys(ctx ?? {}))));
  check("7 while trusted, relationship evidence is not re-derived", ctx?.relationships?.every((x: any) => x.verification.status === "trusted"));
  rmSync(dir, { recursive: true, force: true });
}

/* ── 8–9. stale relationship evidence is re-checked; invalid falls back ── */
{
  const [dir, kh] = seed();
  const head = commit(dir, "src/features/catalog/CatalogScreen.tsx", "export const CatalogScreen = () => navigate('Playback'); // v2\n");
  put(dir, stageAManifest(head, kh));
  const r = R(dir);
  check("8 source drift puts capabilities in verify-on-use", r.extendedCategories?.capabilities?.status === "verifyOnUse");
  check("8 the drift is attributed to the capability and relationship it touches",
    (r.sourceDrift?.affectedCapabilities ?? []).includes("catalog") && (r.sourceDrift?.affectedRelationships ?? []).includes(REL_CATALOG_PLAYBACK.id), JSON.stringify(r.sourceDrift));
  const ctx = api.capabilityContext?.(r, dir, "playback");
  const nav = ctx?.relationships?.find((x: any) => x.id === REL_CATALOG_PLAYBACK.id);
  check("8 a stale relationship's evidence is re-checked and still holds", nav?.verification?.status === "verified", JSON.stringify(nav?.verification));
  check("8 the capability's own evidence is re-checked too", ctx?.verification?.status === "verified", JSON.stringify(ctx?.verification));

  const head2 = commit(dir, "src/features/catalog/CatalogScreen.tsx", "export const CatalogScreen = () => go('/watch');\n");
  put(dir, stageAManifest(head2, kh));
  const ctx2 = api.capabilityContext?.(R(dir), dir, "playback");
  const nav2 = ctx2?.relationships?.find((x: any) => x.id === REL_CATALOG_PLAYBACK.id);
  check("9 a relationship whose source edge disappeared is invalid", nav2?.verification?.status === "invalid", JSON.stringify(nav2?.verification));
  check("9 it names the ref that no longer resolves", nav2?.verification?.failed?.some((f: any) => /navigate\('Playback'\)/.test(f.ref)));
  check("9 and it is handed back for live derivation", (ctx2?.deriveLive ?? []).includes(REL_CATALOG_PLAYBACK.id), JSON.stringify(ctx2?.deriveLive));
  check("15 current code overrides the stored edge — the invalid edge is never presented as context",
    !(ctx2?.relatedCapabilities ?? []).some((c: any) => c.id === "catalog" && c.via.includes(REL_CATALOG_PLAYBACK.id)));

  // Structurally invalid edges are dropped individually, never trusted.
  put(dir, stageAManifest(head2, kh, (m) => {
    m.capabilityRelationships.push({ ...REL_CATALOG_PLAYBACK, id: "playback:inspired_by:profile", from: "playback", to: "profile", type: "inspired_by" });
    m.capabilityRelationships.push({ ...REL_CATALOG_PLAYBACK, id: "playback:used_by:ghost", from: "playback", to: "ghost", type: "used_by" });
    m.capabilityRelationships.push({ ...REL_CATALOG_PLAYBACK, id: "playback:covered_by:profile", from: "playback", to: "profile", type: "covered_by", evidence: [] });
  }));
  const r3 = R(dir);
  const bad = (r3.invalidRelationships ?? []).map((x: any) => x.id).sort().join(",");
  check("9 relationships with an unknown type, a missing endpoint or no evidence are rejected",
    bad === "playback:covered_by:profile,playback:inspired_by:profile,playback:used_by:ghost", bad);
  check("9 the valid ones remain", r3.capabilityRelationships?.some((x: any) => x.id === REL_CATALOG_PLAYBACK.id));
  const ctx3 = api.capabilityContext?.(r3, dir, "playback");
  check("9 rejected edges are listed for live derivation, not as context",
    !(ctx3?.relationships ?? []).some((x: any) => x.id === "playback:inspired_by:profile") && (ctx3?.deriveLive ?? []).includes("playback:inspired_by:profile"), JSON.stringify(ctx3?.deriveLive));
  rmSync(dir, { recursive: true, force: true });
}

/* ── 15. current code overrides a trusted capability when checked ─────── */
{
  const [dir, head] = seed();
  put(dir, stageAManifest(head, head));
  unlinkSync(join(dir, "src/features/playback/PlaybackScreen.tsx"));
  const ctx = api.capabilityContext?.(R(dir), dir, "playback", { verify: true });
  check("15 an explicit check of trusted knowledge still consults current source", ctx?.verification?.status === "failed", JSON.stringify(ctx?.verification));
  check("15 an evidence ref may never point into Inspector-owned knowledge",
    api.verifyEvidenceRef?.(dir, "docs/project/capabilities.md")?.ok === false && api.verifyEvidenceRef?.(dir, ".ono/repo-knowledge.json")?.ok === false);
  check("15 a token ref resolves only when the literal token occurs", api.verifyEvidenceRef?.(dir, "src/shared/player/Player.ts::class Player")?.ok === true &&
    api.verifyEvidenceRef?.(dir, "src/shared/player/Player.ts::class Recorder")?.ok === false);
  rmSync(dir, { recursive: true, force: true });
}

/* ── 11, 13. surface overrides and path scope feed planning and review ── */
{
  const [dir, head] = seed();
  put(dir, stageAManifest(head, head));
  const r = R(dir);
  const tv = api.querySurface?.(r, dir, "tv");
  check("11 a confirmed surface gets its convention overrides", tv?.conventions?.path === "docs/project/patterns.md" &&
    tv.conventions.overrides.some((o: any) => o.section === "#input-and-interaction" && o.anchor === "#input-and-interaction-tv"), JSON.stringify(tv?.conventions));
  const mobile = api.querySurface?.(r, dir, "mobile");
  check("11 a surface without overrides inherits every shared section", mobile?.conventions?.overrides?.length === 0 && /inherit/i.test(mobile.conventions.note ?? ""));

  const scope = api.pathScope?.(r, ["src/tv/App.tsx", "src/shared/player/Player.ts", "src/features/catalog/CatalogScreen.tsx", "README.md"]);
  const at = (p: string) => scope?.find((s: any) => s.path === p);
  check("13 a changed file is attributed to its surface", at("src/tv/App.tsx")?.surfaces.join(",") === "tv", JSON.stringify(scope));
  check("13 shared code is attributed to every surface that shares it", at("src/shared/player/Player.ts")?.surfaces.join(",") === "mobile,tv" && at("src/shared/player/Player.ts")?.sharedCode === "src/shared");
  check("13 a changed file is attributed to its capability", at("src/features/catalog/CatalogScreen.tsx")?.capabilities.join(",") === "catalog");
  check("13 an unattributed file is reported as such", at("README.md")?.surfaces.length === 0 && at("README.md")?.capabilities.length === 0);

  // The CLI is the one invocation path, through the consumer skill.
  const run = (...args: string[]) => JSON.parse(spawnSync(process.execPath, ["--no-warnings", join(HERE, "read-repo-knowledge.ts"), dir, ...args], { encoding: "utf-8" }).stdout);
  const cli = run("--surface", "tv", "--capability", "playback", "--path", "src/tv/App.tsx");
  check("13 CLI: one call answers surface, capability and path scope", cli.query?.surface?.status === "found" && cli.query?.capability?.status === "found" &&
    cli.query?.capability?.context?.relationships?.length === 2 && cli.query?.paths?.[0]?.surfaces?.join(",") === "tv", JSON.stringify(cli.query ?? {}).slice(0, 300));
  const plain = run();
  check("13 CLI: without query flags the output carries no query block", plain.query === undefined);
  rmSync(dir, { recursive: true, force: true });
}

/* ── 14. absent knowledge: live discovery is unchanged ───────────────── */
{
  const [dir] = seed();
  const r = R(dir);
  check("14 absent manifest: still unavailable, still derives the seven base categories", r.available === false && r.deriveLive.length === 7);
  check("14 absent manifest: surfaces and capabilities derive live", r.extendedCategories?.surfaces?.status === "deriveLive" && r.extendedCategories?.capabilities?.status === "deriveLive");
  check("14 absent manifest: lookup reports derive-live", api.lookupCapability?.(r, { capability: "playback" })?.status === "derive-live");
  check("14 absent manifest: surface query reports derive-live", api.querySurface?.(r, dir, "tv")?.status === "derive-live");
  rmSync(dir, { recursive: true, force: true });
}

/* ── prose: the SDLC stages consume what the reader resolves ─────────── */
{
  const consumer = read("skills/repo-knowledge-consumer/SKILL.md");
  const c = flat(consumer);
  check("5 consumer: capability lookup names id, name and source roots only", /capability id/i.test(c) && /name/.test(c) && /source root/i.test(c));
  check("6 consumer: never by semantic similarity", /never[^.]{0,60}(semantic )?similarity/i.test(c));
  check("7 consumer: first-degree relationships as context", /first-degree/i.test(c));
  check("10 consumer: never traverses beyond first degree or scores", /never[^.]{0,80}(recursive|transitive|beyond first degree)/i.test(c) && /scor/i.test(c));
  check("10 consumer: related_to is never proof of impact", /`related_to`[^.]*never[^.]*(proof|impact)/i.test(c));
  check("8 consumer: stale relationships are re-checked", /verif/i.test(c) && /relationship/i.test(c));
  check("14 consumer: absent capability keeps live discovery", /not found[^.]{0,120}live/i.test(c));
  check("15 consumer: current code wins", /current (source|code)[^.]{0,40}(wins|authoritative)/i.test(c));
  check("13 consumer: the helper's query flags are invoked only here",
    /read-repo-knowledge\.ts" "<TARGET_ROOT>"[^\n]*--surface/.test(consumer) || /--capability/.test(consumer));

  const af = read("commands/analyze-feature.md");
  check("5 analyze-feature looks the capability up", /capability/i.test(af) && /repo-knowledge-consumer/.test(af));
  check("10 analyze-feature: related capabilities are context, not scope", /not (an? )?(automatic )?scope|never expand/i.test(flat(af)));
  const fa = read("templates/feature-analysis-template.md");
  check("analysis template: records the confirmed surface and capability", /^surface:/m.test(fa) && /^capability:/m.test(fa));
  check("analysis template: has a Project Knowledge Context section", /^## Project Knowledge Context$/m.test(fa));
  check("analysis template: related capabilities say why each is relevant", /why it is relevant|relevance/i.test(fa));

  const pp = flat(read("skills/platform-planning/SKILL.md"));
  check("11 platform-planning consumes surface overrides", /surfaceAnchors|override/i.test(pp) && /confirmed surface/i.test(pp));
  check("11 platform-planning states the authority order", /current source[^.]*→[^.]*verified Project Knowledge[^.]*→[^.]*standards[^.]*→[^.]*(external|vendor)/i.test(pp));
  check("11 platform-planning: no rediscovery of a trusted category without a reason",
    /verify-on-use|verifyOnUse/i.test(pp) && /contradict/i.test(pp) && /outside the stored scope|beyond the stored/i.test(pp));
  const dds = flat(read("commands/dev-design-start.md"));
  check("11 dev-design-start reads the analysis's surface and capability context", /surface/i.test(dds) && /capability/i.test(dds));

  const impl = flat(read("skills/platform-implementation/SKILL.md"));
  check("12 implementation takes Project Knowledge through the planning artifacts", /through the approved planning (artifacts|documents)/i.test(impl));
  check("12 implementation does not run a second discovery pass", /(never|do not)[^.]{0,40}(second|re-?resolve|resolve Project Knowledge again)/i.test(impl));
  check("12 implementation: a contradiction is reported, never written back", /contradict/i.test(impl) && /never[^.]{0,40}(overwrite|write)[^.]{0,40}(Inspector|knowledge)/i.test(impl));
  check("12 implement-task still does not resolve knowledge itself", !/repo-knowledge-consumer/.test(read("commands/implement-task.md")));

  const rc = flat(read("commands/review-code.md"));
  check("13 review-code resolves Project Knowledge through the consumer", /repo-knowledge-consumer/.test(rc));
  check("13 review-code scopes it to the changed files", /changed (file|path)/i.test(rc) && /surface/i.test(rc));
  check("13 review-code: the diff and current code are judged first", /(diff|current code)[^.]{0,60}first/i.test(rc));
  const pr = flat(read("skills/platform-review/SKILL.md"));
  check("13 platform-review rung 2 names the resolved Project Knowledge", /\| 2 \| Repository knowledge[^|]*\|/.test(read("skills/platform-review/SKILL.md")) && /repo-knowledge-consumer|resolved by `\/review-code`/.test(pr));
  check("13 platform-review: knowledge never outranks the source", /never (outranks?|overrides?|a higher authority)[^.]{0,40}(source|code)/i.test(pr));

  for (const lane of ["android-dev-planning", "ios-dev-planning", "react-dev-planning"]) {
    const s = read(`skills/${lane}/SKILL.md`);
    const tv = s.slice(s.indexOf("### `device_type: tv`"), s.indexOf("## Standards citation"));
    check(`9 ${lane}: TV discovery consults Project Knowledge first`, /Project Knowledge first/i.test(tv), tv.slice(0, 80));
    check(`9 ${lane}: verify-on-use when stale`, /verify/i.test(tv) && /stale|verifyOnUse/i.test(tv));
    check(`9 ${lane}: live discovery is kept as the fallback`, /(derive|discover)[^.]{0,40}live|run (the|this) discovery/i.test(flat(tv)));
    check(`9 ${lane}: the discovery pass is still there`, /discovery pass/i.test(tv) && /Focus/i.test(tv));
    check(`9 ${lane}: no TV knowledge was added to the lane`, !/Leanback is|uses Leanback|Compose for TV is used/.test(tv));
  }
}

/* ── 16. the contract copy is the Stage A producer copy ──────────────── */
{
  // sha256 of ono-project-inspector 6fa811d:docs/repo-knowledge-contract.md (Stage A, 0.11.0).
  // When the producer changes the contract, update the copy AND this pin in the same release.
  const STAGE_A_CONTRACT_SHA256 = "b9822771b19460eadf32440bec562cc2508612a41700e399e6be9b8632413957";
  const contract = read("docs/repo-knowledge-contract.md");
  check("16 contract copy is byte-identical to the Stage A producer copy", sha(contract) === STAGE_A_CONTRACT_SHA256, sha(contract));
  check("16 contract carries the Stage A obligation on surfaces and capabilities", /Surfaces and capabilities are advisory too/.test(contract));
  const producerList = /ANALYSIS_MANIFEST_BASENAMES = new Set\(\[([\s\S]*?)\]\)/.exec(read("scripts/read-repo-knowledge.ts"))?.[1] ?? "";
  check("16 the reader mirrors the producer's surface-declaring files", ["AndroidManifest.xml", "app.json", "appinfo.json", "config.xml", "project.yml"].every((f) => producerList.includes(`"${f}"`)));
}

/* ── 17. unrelated behaviour is unchanged ─────────────────────────────── */
{
  const impl = read("commands/implement-task.md");
  check("17 implement-task still records developer testing", /"developerTesting"/.test(impl));
  check("17 implement-task still resumes deterministically", /task-state\.ts" resume/.test(impl));
  check("17 implement-task still routes from the row's platform", /Read the `platform` value from the selected task row/.test(impl));
  check("17 QA handoff still reads the persisted record", /scripts\/task-state\.ts/.test(read("commands/create-dev-qa-notes.md")));
  check("17 analyze-feature still routes on the confirmed platform only", /Exactly one planning lane is ever loaded/.test(read("commands/analyze-feature.md")));
}

rmSync(tmp, { recursive: true, force: true });

if (failures > 0) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nall project-knowledge consumption checks passed");
