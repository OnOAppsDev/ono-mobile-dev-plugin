/**
 * figma-theme-tokens.test.ts
 *
 * Self-contained tests for scripts/figma-theme-tokens.ts — the deterministic
 * policy engine behind /rn-sync-figma-theme. Covers the safety-critical paths:
 * platform gating, classification priority (type > collection > explicit
 * keyword > generic-word-never-alone), color/font-weight normalization,
 * alias resolution (chains/cycles/missing/depth), diffing, approvals, JSON
 * rendering idempotency, and managed-block verification.
 *
 * No external test framework. Run with:
 *   node scripts/figma-theme-tokens.test.ts
 *   bun  scripts/figma-theme-tokens.test.ts
 */

import {
  applyApprovals,
  buildResult,
  buildTokenIR,
  buildTokenPath,
  classifyVariable,
  computeDiff,
  detectJSONIndent,
  detectPlatformSignal,
  extractLocalModuleReferences,
  findCandidateThemeModules,
  normalizeColor,
  normalizeFontWeight,
  normalizeTokenPath,
  renderJSONTokensModule,
  renderManagedBlockJS,
  resolveAlias,
  stripLeadingCollectionSegment,
  verifyManagedBlock,
  type DiffResult,
  type RawFigmaVariable,
} from "./figma-theme-tokens.ts";

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

// ===========================================================================
// Platform
// ===========================================================================

check(
  "platform: React Native detected via dependency",
  detectPlatformSignal({ files: ["ios/", "android/"], deps: ["react-native", "react"] }) === "react-native"
);
check(
  "platform: React Native detected via Expo",
  detectPlatformSignal({ files: ["app.json"], deps: ["expo", "expo-router", "react"] }) === "react-native"
);
check(
  "platform: iOS rejected (not react-native)",
  detectPlatformSignal({ files: ["App.xcodeproj", "AppDelegate.swift"], deps: [] }) === "ios"
);
check(
  "platform: Android rejected (not react-native)",
  detectPlatformSignal({ files: ["settings.gradle.kts", "app/src/main/AndroidManifest.xml", "Main.kt"], deps: [] }) === "android"
);
check(
  "platform: React web rejected (not react-native)",
  detectPlatformSignal({ files: ["vite.config.ts"], deps: ["react", "react-dom"] }) === "react"
);
check(
  "platform: ambiguous repository rejected",
  detectPlatformSignal({ files: ["App.xcodeproj", "settings.gradle.kts", "app/src/main/AndroidManifest.xml"], deps: [] }) === "ambiguous"
);
check("platform: no signals at all -> none", detectPlatformSignal({ files: ["README.md"], deps: [] }) === "none");
check(
  "platform: RN + native shells is still react-native, not ambiguous",
  detectPlatformSignal({ files: ["ios/App.xcodeproj", "android/settings.gradle"], deps: ["react-native", "react"] }) === "react-native"
);

// ===========================================================================
// Canonical theme-source discovery
// ===========================================================================

check(
  "theme source: extracts require() local module reference",
  extractLocalModuleReferences(`const tokens = require('./src/constants/theme-tokens.json');`).includes(
    "./src/constants/theme-tokens.json"
  )
);
check(
  "theme source: extracts ESM import local module reference",
  extractLocalModuleReferences(`import tokens from '@/constants/theme';`).includes("@/constants/theme")
);
check(
  "theme source: ignores non-local package imports",
  extractLocalModuleReferences(`import plugin from 'tailwindcss/plugin';`).length === 0
);
check(
  "theme source: finds candidate theme modules by name",
  JSON.stringify(findCandidateThemeModules(["src/constants/theme-tokens.json", "src/App.tsx", "src/theme.ts"]).sort()) ===
    JSON.stringify(["src/constants/theme-tokens.json", "src/theme.ts"].sort())
);

// ===========================================================================
// Color normalization
// ===========================================================================

{
  const r = normalizeColor("#4F46E5");
  check("color: 6-digit hex -> rgb triplet", r.ok && r.rgbTriplet === "79 70 229", JSON.stringify(r));
  check("color: 6-digit hex -> alpha defaults to 1", r.ok && r.alpha === 1);
}
{
  const r = normalizeColor("#fff");
  check("color: 3-digit hex shorthand expands", r.ok && r.rgbTriplet === "255 255 255", JSON.stringify(r));
}
{
  const r = normalizeColor("#4F46E580");
  check("color: 8-digit hex carries alpha", r.ok && r.alpha === 0.5, JSON.stringify(r));
}
{
  const r = normalizeColor("rgba(79, 70, 229, 0.5)");
  check("color: rgba() string parses", r.ok && r.rgbTriplet === "79 70 229" && r.alpha === 0.5, JSON.stringify(r));
}
{
  const r = normalizeColor({ r: 0.3098, g: 0.2745, b: 0.898, a: 1 });
  check("color: Figma 0-1 float object converts to 0-255 ints", r.ok && r.rgbTriplet === "79 70 229", JSON.stringify(r));
}
{
  const a = normalizeColor("#123456");
  const b = normalizeColor("#123456");
  check("color: identical input always produces identical output", JSON.stringify(a) === JSON.stringify(b));
}
{
  const r = normalizeColor("hsl(240, 60%, 50%)");
  check("color: unsupported color space (hsl) is rejected, not guessed", !r.ok && r.reason === "unsupported-color-space");
}
check("color: named CSS colors are unsupported", !normalizeColor("cornflowerblue").ok);

// ===========================================================================
// Font weight
// ===========================================================================

const WEIGHT_TABLE: Array<[string, number]> = [
  ["Thin", 100],
  ["ExtraLight", 200],
  ["Light", 300],
  ["Regular", 400],
  ["Medium", 500],
  ["SemiBold", 600],
  ["Bold", 700],
  ["ExtraBold", 800],
  ["Black", 900],
];
for (const [name, expected] of WEIGHT_TABLE) {
  const r = normalizeFontWeight(name);
  check(`font weight: "${name}" -> ${expected}`, r.ok && r.value === expected, JSON.stringify(r));
}
check("font weight: numeric 400 passes through", normalizeFontWeight(400).value === 400);
check("font weight: numeric 450 (not a valid step) is unknown", normalizeFontWeight(450).unknown === true);
check("font weight: unknown name is reported, not guessed", normalizeFontWeight("Chonky").unknown === true);

// ===========================================================================
// Classification — priority order and the generic-word trap
// ===========================================================================

check(
  "classify: COLOR type always wins regardless of name",
  classifyVariable({ type: "COLOR", collection: "Random", path: ["Weird", "Spacing", "Name"] }).category === "color"
);
check(
  "classify: BOOLEAN type is always unclassified",
  classifyVariable({ type: "BOOLEAN", collection: "Spacing", path: ["4"] }).category === "unclassified"
);
check(
  "classify: recognized Spacing collection",
  classifyVariable({ type: "FLOAT", collection: "Spacing", path: ["4"] }).category === "spacing"
);
check(
  "classify: recognized Radius collection",
  classifyVariable({ type: "FLOAT", collection: "Radius", path: ["Small"] }).category === "radius"
);
check(
  "classify: recognized Opacity collection",
  classifyVariable({ type: "FLOAT", collection: "Opacity", path: ["Disabled"] }).category === "opacity"
);
check(
  "classify: Typography/Font/Size -> fontSize (context sanctions bare \"size\")",
  classifyVariable({ type: "FLOAT", collection: "Typography", path: ["Font", "Size"] }).category === "fontSize"
);
check(
  "classify: Icon/Size/Small does NOT become spacing or fontSize (bare \"size\" outside context)",
  classifyVariable({ type: "FLOAT", collection: "Icon", path: ["Size", "Small"] }).category === "unclassified"
);
check(
  "classify: Button/Height/Small does NOT become spacing",
  classifyVariable({ type: "FLOAT", collection: "Button", path: ["Height", "Small"] }).category === "unclassified"
);
check(
  "classify: Border/Width/Default does NOT become spacing",
  classifyVariable({ type: "FLOAT", collection: "Border", path: ["Width", "Default"] }).category === "unclassified"
);
check(
  "classify: explicit \"spacing\" keyword outside a recognized collection still counts",
  classifyVariable({ type: "FLOAT", collection: "Foundations", path: ["Spacing", "4"] }).category === "spacing"
);
check(
  "classify: generic words alone (scale/default/large) never decide a category",
  classifyVariable({ type: "FLOAT", collection: "Foundations", path: ["Scale", "Default", "Large"] }).category === "unclassified"
);
check(
  "classify: STRING font-family under Typography",
  classifyVariable({ type: "STRING", collection: "Typography", path: ["Family", "Display"] }).category === "fontFamily"
);
check(
  "classify: FLOAT weight under Typography",
  classifyVariable({ type: "FLOAT", collection: "Typography", path: ["Heading", "Weight"] }).category === "fontWeight"
);
check(
  "classify: ambiguous typography leaf is reported, not guessed",
  classifyVariable({ type: "FLOAT", collection: "Typography", path: ["Heading", "Value"] }).category === "unclassified"
);

// ===========================================================================
// Naming / token-path normalization
// ===========================================================================

check("naming: normal path", normalizeTokenPath(["Primary", "Text"]) === "primary.text");
check("naming: numeric leaf kept as scale step", normalizeTokenPath(["Primary", "500"]) === "primary.500");
check("naming: spaces become kebab-case", normalizeTokenPath(["Brand Blue"]) === "brand-blue");
check("naming: already-kebab-case is stable", normalizeTokenPath(["brand-blue"]) === "brand-blue");
check(
  "naming: strips a leading collection-duplicate segment",
  JSON.stringify(stripLeadingCollectionSegment(["Color", "Primary", "500"], "Color")) === JSON.stringify(["Primary", "500"])
);
check(
  "naming: doesn't strip when the leading segment isn't the collection",
  JSON.stringify(stripLeadingCollectionSegment(["Brand", "Primary", "500"], "Color")) === JSON.stringify(["Brand", "Primary", "500"])
);
check(
  "naming: Color/Primary/500 -> colors.primary.500 (pluralized Tailwind namespace)",
  buildTokenPath("color", ["Primary", "500"]) === "colors.primary.500"
);
check("naming: Spacing/4 -> spacing.4", buildTokenPath("spacing", ["4"]) === "spacing.4");
check(
  "naming: Typography/Heading/Weight -> fontWeight.heading (signal segment consumed)",
  buildTokenPath("fontWeight", ["Heading", "Weight"], 1) === "fontWeight.heading"
);
check(
  "naming: two variables normalizing to the same key are a caller-level collision, not silently merged",
  normalizeTokenPath(["Primary"]) === normalizeTokenPath(["primary"]) // same key from different casing
);

// ===========================================================================
// Alias resolution
// ===========================================================================

function byIdOf(vars: RawFigmaVariable[]): Map<string, RawFigmaVariable> {
  return new Map(vars.map((v) => [v.id, v]));
}

{
  const vars: RawFigmaVariable[] = [
    { id: "1", name: "Text/Primary", collection: "Semantic", type: "COLOR", modes: { Light: { aliasId: "2" } } },
    { id: "2", name: "Semantic/Text/Primary", collection: "Semantic", type: "COLOR", modes: { Light: { aliasId: "3" } } },
    { id: "3", name: "Brand/900", collection: "Color", type: "COLOR", modes: { Light: "#123456" } },
  ];
  const r = resolveAlias("Text/Primary", vars[0].modes.Light, "Light", byIdOf(vars));
  check("alias: multi-hop chain resolves to primitive", r.ok && r.value === "#123456", JSON.stringify(r));
  check(
    "alias: chain preserves the semantic path walked",
    JSON.stringify(r.chain) === JSON.stringify(["Text/Primary", "Semantic/Text/Primary", "Brand/900"])
  );
}
{
  const r = resolveAlias("Direct/Color", "#abcdef", "Light", byIdOf([]));
  check("alias: non-alias value has an empty chain", r.ok && r.chain.length === 0 && r.value === "#abcdef");
}
{
  const vars: RawFigmaVariable[] = [
    { id: "a", name: "A", collection: "X", type: "COLOR", modes: { Light: { aliasId: "b" } } },
    { id: "b", name: "B", collection: "X", type: "COLOR", modes: { Light: { aliasId: "a" } } },
  ];
  const r = resolveAlias("A", vars[0].modes.Light, "Light", byIdOf(vars));
  check("alias: cycle is detected and reported, never invented", !r.ok && r.error === "cycle");
}
{
  const vars: RawFigmaVariable[] = [{ id: "a", name: "A", collection: "X", type: "COLOR", modes: { Light: { aliasId: "missing" } } }];
  const r = resolveAlias("A", vars[0].modes.Light, "Light", byIdOf(vars));
  check("alias: missing target is detected and reported", !r.ok && r.error === "missing-target");
}
{
  // A long but non-cyclic chain that exceeds maxDepth.
  const N = 5;
  const vars: RawFigmaVariable[] = Array.from({ length: N + 1 }, (_, i) => ({
    id: String(i),
    name: `V${i}`,
    collection: "X",
    type: "COLOR" as const,
    modes: { Light: i === N ? "#000000" : { aliasId: String(i + 1) } },
  }));
  const r = resolveAlias("V0", vars[0].modes.Light, "Light", byIdOf(vars), { maxDepth: 3 });
  check("alias: excessive recursion is detected and reported", !r.ok && r.error === "max-depth-exceeded");
}

// ===========================================================================
// Diff
// ===========================================================================

function ir(tokenPath: string, mode: string | null, value: string | number, ok = true, category: "color" | "spacing" | "unclassified" = "spacing") {
  return {
    id: tokenPath,
    name: tokenPath,
    collection: "X",
    path: [tokenPath],
    type: "FLOAT" as const,
    mode: mode ?? "",
    aliasChain: [],
    category,
    confidence: "high" as const,
    reason: "test",
    tokenPath,
    value,
    raw: value,
    ok,
  };
}

{
  const diff = computeDiff([ir("spacing.4", null, 16)], {});
  check("diff: brand-new token is added", diff.added.length === 1 && diff.added[0].tokenPath === "spacing.4");
}
{
  const diff = computeDiff([ir("spacing.4", null, 16)], { "spacing.4": { value: 16 } });
  check("diff: identical existing value is unchanged", diff.unchanged.length === 1 && diff.overridden.length === 0);
}
{
  const diff = computeDiff([ir("spacing.4", null, 24)], { "spacing.4": { value: 16 } });
  check("diff: different existing value is an override, not silently applied", diff.overridden.length === 1);
}
{
  const diff = computeDiff([ir("spacing.4", null, 16), ir("radius.sm", null, 4)], { "spacing.4": { value: 8 } });
  check(
    "diff: mixed add + override in one pass",
    diff.added.length === 1 && diff.added[0].tokenPath === "radius.sm" && diff.overridden.length === 1
  );
}
{
  const a = ir("spacing.4", null, 16);
  const b = ir("spacing.4", null, 24);
  const diff = computeDiff([a, b], {});
  check("diff: two entries normalizing to the same key with different values is a collision", diff.collisions.length === 1);
}
{
  const diff = computeDiff([ir("icon.size.small", null, null as any, true, "unclassified")], {});
  check("diff: unclassified/failed entries are routed to unresolved, never written", diff.unresolved.length === 1);
}
{
  const diff = computeDiff([ir("colors.primary.500", null, null as any, false)], {});
  check("diff: an alias/serialization failure (ok:false) is also routed to unresolved", diff.unresolved.length === 1);
}

// ===========================================================================
// Approvals
// ===========================================================================

{
  const diff: DiffResult = computeDiff([ir("spacing.4", null, 24)], { "spacing.4": { value: 16 } });
  const declined = applyApprovals(diff, { decisions: { "spacing.4": "skip" } });
  check("approvals: declined override is not written", declined.toWrite.length === 0 && declined.skipped.length === 1);

  const approved = applyApprovals(diff, { decisions: { "spacing.4": "approve" } });
  check("approvals: approved override is written", approved.toWrite.length === 1);

  const pending = applyApprovals(diff, {});
  check("approvals: undecided override blocks the write", pending.blocked === true && pending.toWrite.length === 0);

  const all = applyApprovals(diff, { approveAll: true });
  check("approvals: approve-all writes every override", all.toWrite.length === 1 && all.blocked === false);
}
{
  const diff: DiffResult = computeDiff([ir("spacing.4", null, 16)], {});
  const r = applyApprovals(diff, {});
  check("approvals: pure additions never require confirmation", r.toWrite.length === 1 && r.blocked === false);
}
{
  // Two Figma variables, different names, same normalized key, different values.
  const vars: RawFigmaVariable[] = [
    { id: "1", name: "Color/Primary", collection: "Color", type: "COLOR", modes: { Value: "#ff0000" } },
    { id: "2", name: "Color/primary", collection: "Color", type: "COLOR", modes: { Value: "#00ff00" } },
  ];
  const diff = computeDiff(buildTokenIR(vars), {});
  check(
    "collision: differently-cased names collapse to one key with both candidates recorded",
    diff.collisions.length === 1 && diff.collisions[0].collisionCandidates?.length === 2
  );

  const [first, second] = diff.collisions[0].collisionCandidates!;
  check(
    "collision: each candidate keeps its own source name and value",
    first.source === "Color/Primary" && second.source === "Color/primary" && first.value !== second.value
  );

  const entry = diff.collisions[0];
  const key = entry.mode ? `${entry.tokenPath}@${entry.mode}` : entry.tokenPath;

  const pending = applyApprovals(diff, {});
  check("approvals: undecided collision blocks the write", pending.blocked === true && pending.toWrite.length === 0);

  const approveAllIgnoresCollisions = applyApprovals(diff, { approveAll: true });
  check("approvals: approve-all never auto-resolves a collision", approveAllIgnoresCollisions.blocked === true);

  const skipped = applyApprovals(diff, { decisions: { [key]: "skip" } });
  check("approvals: skipped collision is not written", skipped.blocked === false && skipped.skipped.length === 1);

  const resolved = applyApprovals(diff, { decisions: { [key]: second.source } });
  check(
    "approvals: naming the winning source writes that candidate's value",
    resolved.blocked === false && resolved.toWrite.length === 1 && resolved.toWrite[0].incomingValue === second.value
  );

  const unknownSource = applyApprovals(diff, { decisions: { [key]: "not-a-real-source" } });
  check("approvals: an unrecognized source name still blocks", unknownSource.blocked === true);
}

// ===========================================================================
// Modes (single vs. multi-mode via Token IR)
// ===========================================================================

{
  const vars: RawFigmaVariable[] = [
    { id: "1", name: "Color/Primary", collection: "Color", type: "COLOR", modes: { Light: "#4F46E5", Dark: "#818CF8" } },
  ];
  const entries = buildTokenIR(vars);
  check("modes: Light/Dark produces two IR entries for the same token path", entries.length === 2);
  check(
    "modes: each mode keeps its own resolved value",
    entries.find((e) => e.mode === "Light")?.value === "79 70 229" && entries.find((e) => e.mode === "Dark")?.value === "129 140 248"
  );
}
{
  const vars: RawFigmaVariable[] = [{ id: "1", name: "Spacing/4", collection: "Spacing", type: "FLOAT", modes: { Value: 16 } }];
  const entries = buildTokenIR(vars);
  check("modes: single-mode variable produces one IR entry", entries.length === 1 && entries[0].value === 16);
}
{
  // Three brand modes on one variable — all three must independently resolve.
  const vars: RawFigmaVariable[] = [
    { id: "1", name: "Color/Accent", collection: "Color", type: "COLOR", modes: { BrandA: "#ff0000", BrandB: "#00ff00", BrandC: "#0000ff" } },
  ];
  const entries = buildTokenIR(vars);
  check("modes: multiple brand modes all resolve independently", entries.length === 3 && entries.every((e) => e.ok));
}

// ===========================================================================
// Idempotency — the core guarantee
// ===========================================================================

{
  const entries = [ir("spacing.4", null, 16).ok && { tokenPath: "spacing.4", mode: null, case: "added" as const, incomingValue: 16, existingValue: null }].filter(Boolean) as any;
  const first = renderManagedBlockJS(entries);
  const second = renderManagedBlockJS(entries);
  check("idempotency: rendering the same entries twice is byte-identical", first === second);

  const verification = verifyManagedBlock(`prelude\n${first}\nepilogue`, entries);
  check("idempotency: verify recognizes its own render as valid", verification.ok);
}
{
  const existing = { colors: { light: { text: "19 19 26" } }, spacing: { four: 24 } };
  const updates = [{ tokenPath: "colors.text", mode: "Light", value: "255 255 255" }];
  const a = renderJSONTokensModule(existing, updates);
  const b = renderJSONTokensModule(existing, updates);
  check("idempotency: JSON re-render from the same inputs is byte-identical", a.text === b.text);

  const noop = renderJSONTokensModule(existing, []);
  check("idempotency: an empty update set leaves the JSON textually unchanged", noop.text === JSON.stringify(existing, null, 2) + "\n");
}
check("idempotency: detects 2-space indent", detectJSONIndent('{\n  "a": 1\n}') === 2);
check("idempotency: detects 4-space indent", detectJSONIndent('{\n    "a": 1\n}') === 4);

// ===========================================================================
// JSON tokens-module rendering preserves unrelated keys
// ===========================================================================

{
  const existing = { colors: { light: { text: "19 19 26", background: "255 255 255" } }, fontWeights: { regular: "400" } };
  const { json } = renderJSONTokensModule(existing, [{ tokenPath: "colors.text", mode: "Light", value: "10 10 10" }]);
  check(
    "render: only the targeted key changes",
    (json as any).colors.light.text === "10 10 10" && (json as any).colors.light.background === "255 255 255"
  );
  check("render: untouched top-level keys survive", JSON.stringify((json as any).fontWeights) === JSON.stringify({ regular: "400" }));
}

// ===========================================================================
// Result schema / status mapping
// ===========================================================================

{
  const diff: DiffResult = { added: [], unchanged: [], overridden: [], collisions: [], unresolved: [] };
  const result = buildResult({
    platform: "react-native",
    figmaScope: { file: "f", page: "p", node: "n" },
    totalRead: 0,
    diff,
    applied: null,
    filesChanged: [],
    warnings: [],
  });
  check("result: nothing to do is still success", result.status === "success");
}
{
  const diff: DiffResult = { added: [], unchanged: [], overridden: [ir("spacing.4", null, 24) as any], collisions: [], unresolved: [] };
  const pendingApplied = applyApprovals(diff, {});
  const result = buildResult({
    platform: "react-native",
    figmaScope: { file: "f", page: "p", node: "n" },
    totalRead: 1,
    diff,
    applied: pendingApplied,
    filesChanged: [],
    warnings: [],
  });
  check("result: unresolved override -> needs_confirmation", result.status === "needs_confirmation");
}
{
  const diff: DiffResult = {
    added: [],
    unchanged: [],
    overridden: [],
    collisions: [
      { tokenPath: "x", mode: null, case: "collision", incomingValue: null, existingValue: null, collisionCandidates: [{ source: "a", value: 1 }, { source: "b", value: 2 }] },
    ],
    unresolved: [],
  };
  const result = buildResult({ platform: "react-native", figmaScope: { file: null, page: null, node: null }, totalRead: 1, diff, applied: null, filesChanged: [], warnings: [] });
  check(
    "result: an undecided collision asks for confirmation rather than dead-ending, and reports no files changed",
    result.status === "needs_confirmation" && result.filesChanged.length === 0
  );

  const resolved = applyApprovals(diff, { decisions: { x: "b" } });
  const resolvedResult = buildResult({
    platform: "react-native",
    figmaScope: { file: null, page: null, node: null },
    totalRead: 1,
    diff,
    applied: resolved,
    filesChanged: ["theme.ts"],
    warnings: [],
  });
  check("result: a resolved collision reaches success", resolvedResult.status === "success" && resolvedResult.counts.collisions === 0);
}
{
  const diff: DiffResult = { added: [], unchanged: [], overridden: [], collisions: [], unresolved: [{ tokenPath: "y", mode: null, case: "unresolved", incomingValue: null, existingValue: null }] };
  const result = buildResult({ platform: "react-native", figmaScope: { file: null, page: null, node: null }, totalRead: 1, diff, applied: null, filesChanged: [], warnings: [] });
  check(
    "result: a run with nothing usable but unresolved entries blocks (no decision fixes it here)",
    result.status === "blocked" && result.filesChanged.length === 0
  );
}
{
  // A routine unclassified variable (e.g. Icon/Size/Small) alongside otherwise-successful
  // output must NOT withhold the report of what was actually written.
  const diff: DiffResult = {
    added: [{ tokenPath: "spacing.4", mode: null, case: "added", incomingValue: 16, existingValue: null }],
    unchanged: [],
    overridden: [],
    collisions: [],
    unresolved: [{ tokenPath: "icon.size.small", mode: null, case: "unresolved", incomingValue: null, existingValue: null }],
  };
  const result = buildResult({
    platform: "react-native",
    figmaScope: { file: "f", page: "p", node: "n" },
    totalRead: 2,
    diff,
    applied: { toWrite: diff.added, skipped: [], blocked: false, blockedEntries: [] },
    filesChanged: ["theme.ts"],
    warnings: [],
  });
  check(
    "result: a routine unclassified variable doesn't block an otherwise-successful write",
    result.status === "success" && result.filesChanged.length === 1 && result.counts.unresolved === 1
  );
}
{
  const diff: DiffResult = { added: [], unchanged: [], overridden: [], collisions: [], unresolved: [] };
  const result = buildResult({ platform: null, figmaScope: { file: null, page: null, node: null }, totalRead: 0, diff, applied: null, filesChanged: [], warnings: [], failedReason: "not react native" });
  check("result: platform gate failure -> failed", result.status === "failed");
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures > 0 ? 1 : 0);
