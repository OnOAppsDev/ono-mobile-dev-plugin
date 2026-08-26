/**
 * reference-integrity.ts — the plugin's structural validator.
 *
 *   node scripts/reference-integrity.ts            validate this repository, print a report
 *   node scripts/reference-integrity.ts <root>     validate another root (used by the tests)
 *
 * This is a developer/repository quality capability, not a runtime workflow step. It
 * reads no environment variable, needs no network, and has no CI-only code path — a
 * repository that later opts into running it automatically runs this exact command.
 *
 * It answers four questions, in four groups:
 *
 *   A  Does every component declare itself correctly? (frontmatter, name↔filename)
 *   B  Does every plugin-internal path, anchor and link it cites actually resolve?
 *   C  Is every component's readiness honest, and does every active route respect it?
 *   D  Does README.md's description of readiness match the live repository?
 *
 * Group C is the reason this file exists. A command that names a placeholder target
 * with no readiness gate will route to it and produce confident, ungrounded output —
 * the failure mode is silence, which no other test in this repository can see.
 *
 * Three deliberate design decisions, each of which cost a false-failure iteration to
 * find, so please read before "simplifying":
 *
 *   1. A path candidate counts only when it is BOTH inside backticks (or a link
 *      target) AND matches one of the shapes in PATH_SHAPES. A bare regex over the
 *      corpus yields 17 unresolvable hits of which 15 are prose — "other
 *      agents/skills", "correctness/style/standards/performance", "(hooks/slices)" —
 *      plus target-repository paths (`docs/project/patterns.md`, `docs/qa/`) that are
 *      not this plugin's files at all. See PATH_SHAPES and TARGET_REPO_NAMESPACES.
 *
 *   2. Readiness is classified from the `## Status: Not yet authored` heading, never
 *      from a substring search for "placeholder". Six authored Android files contain
 *      the phrase inside a *runtime guard* ("A cited `standards/android/*` file is
 *      missing or is a structure-only placeholder") — searching for the phrase
 *      declares the entire authored Android lane unbuilt.
 *
 *   3. ghSlug implements GitHub's heading-slug rules exactly. Collapsing repeated
 *      hyphens breaks every em-dash heading (`...reach--what-you-may-claim`), and
 *      stripping `_` as emphasis breaks every `#14-device_type-handling` link. Both
 *      mistakes report healthy links as broken.
 *
 * No clock is read and no randomness is used: the same tree always produces the same
 * defect list, in the same order.
 */

import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { join, dirname, basename, relative } from "path";

const HERE = import.meta.dirname ?? __dirname;
export const REPO_ROOT = dirname(HERE);

/** The directories this validator owns. Anything else — notably scripts/fixtures — is
 *  outside by construction, so deliberately broken fixture corpora cannot be mistaken
 *  for defects in the repository that contains them. */
export const SCANNED_DIRS = ["commands", "agents", "skills", "standards", "templates", "docs"];

export type Readiness = "active" | "placeholder" | "deferred";
export type Kind = "command" | "agent" | "skill" | "standard";

export interface Component {
  kind: Kind;
  /** `rn-architect`, `rn-dev-planning`, `standards/ios/swift-standards.md` */
  name: string;
  /** repo-relative path */
  rel: string;
  readiness: Readiness;
  frontmatter: Frontmatter;
  /** the platform lane this component belongs to, or null for shared/cross-cutting */
  lane: string | null;
}

export interface Defect {
  group: "A" | "B" | "C" | "D";
  rule: string;
  file: string;
  message: string;
}

export interface Frontmatter {
  present: boolean;
  /** false when the block opens but never closes, or a line is not `key: value` */
  wellFormed: boolean;
  keys: Record<string, string>;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Lanes
// ---------------------------------------------------------------------------

/**
 * The four platform lanes. `shared` is deliberately absent: it is not a platform, and
 * its README bullet legitimately discusses "not-yet-authored gaps" in *other*
 * platforms' rule text, which a lane mapping would read as a claim about itself.
 *
 * `display` is the bold heading README uses for the lane. This is the only
 * hand-written table in the file; it maps prose to structure and nothing else.
 */
export const LANES: Array<{ lane: string; prefix: string; standardsDir: string; display: string }> = [
  { lane: "react-native", prefix: "rn-", standardsDir: "react-native", display: "React Native" },
  { lane: "ios", prefix: "ios-", standardsDir: "ios", display: "Native iOS" },
  { lane: "android", prefix: "android-", standardsDir: "android", display: "Native Android" },
  { lane: "react", prefix: "react-", standardsDir: "react", display: "React (web)" },
];

/**
 * How a command must refer to a lane for its readiness gate to count as covering it.
 * The `react` pattern must not match "React Native" — every command mentions that.
 */
export const LANE_MENTION: Record<string, RegExp> = {
  "react-native": /React Native|\bRN\b|`react-native`/,
  ios: /\biOS\b|`ios`/,
  android: /\bAndroid\b|`android`/,
  react: /\bReact\b(?! Native)|`react`/,
};

function laneOf(name: string): string | null {
  // Longest prefix wins so `react-` never claims an `rn-` component and vice versa.
  const hit = [...LANES].sort((a, b) => b.prefix.length - a.prefix.length).find((l) => name.startsWith(l.prefix));
  return hit ? hit.lane : null;
}

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

export function parseFrontmatter(text: string): Frontmatter {
  const empty: Frontmatter = { present: false, wellFormed: true, keys: {}, error: null };
  const lines = text.split("\n");
  if (lines[0] !== "---") return empty;

  const close = lines.indexOf("---", 1);
  if (close === -1) {
    return { present: true, wellFormed: false, keys: {}, error: "frontmatter opens with --- but never closes" };
  }

  const keys: Record<string, string> = {};
  let key: string | null = null;
  for (let i = 1; i < close; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    const m = /^([A-Za-z][A-Za-z0-9_-]*):\s?(.*)$/.exec(line);
    if (m) {
      key = m[1];
      keys[key] = m[2].trim();
      continue;
    }
    // A continuation line (indented) belongs to the previous key. Anything else is malformed.
    if (/^\s+\S/.test(line) && key !== null) {
      keys[key] = `${keys[key]} ${line.trim()}`.trim();
      continue;
    }
    return { present: true, wellFormed: false, keys, error: `line ${i + 1} is not \`key: value\`: ${line.slice(0, 60)}` };
  }
  return { present: true, wellFormed: true, keys, error: null };
}

// ---------------------------------------------------------------------------
// Readiness classification
// ---------------------------------------------------------------------------

/** Agents and skills: an authored file never carries this heading. */
const PLACEHOLDER_HEADING = /^## Status: Not yet authored\s*$/m;
/** Standards carry no frontmatter, so they declare themselves in the body instead. */
const PLACEHOLDER_STANDARD = /^\*\*Not yet authored\.\*\*/m;
/** Authored, deliberately unrouted. Declared in the component's own description. */
const DEFERRED_DESCRIPTION = /NOT YET (WIRED|INVOKED)/;
/** What a description must say when the body says placeholder. */
const PLACEHOLDER_DESCRIPTION = /not yet authored|structure-only placeholder/i;

export function classify(kind: Kind, text: string, fm: Frontmatter): Readiness {
  const marker = kind === "standard" ? PLACEHOLDER_STANDARD : PLACEHOLDER_HEADING;
  if (marker.test(text)) return "placeholder";
  if (DEFERRED_DESCRIPTION.test(fm.keys.description ?? "")) return "deferred";
  return "active";
}

// ---------------------------------------------------------------------------
// Loading the component inventory
// ---------------------------------------------------------------------------

function walk(dir: string, out: string[]): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir).sort()) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (entry.endsWith(".md")) out.push(p);
  }
  return out;
}

/** Every markdown file this validator considers part of the plugin's corpus. */
export function corpus(root: string): string[] {
  const files: string[] = [];
  for (const d of SCANNED_DIRS) walk(join(root, d), files);
  const readme = join(root, "README.md");
  if (existsSync(readme)) files.push(readme);
  return files;
}

export function loadComponents(root: string): Component[] {
  const out: Component[] = [];

  const add = (kind: Kind, name: string, abs: string): void => {
    const text = readFileSync(abs, "utf-8");
    const fm = parseFrontmatter(text);
    out.push({
      kind,
      name,
      rel: relative(root, abs).split("\\").join("/"),
      readiness: classify(kind, text, fm),
      frontmatter: fm,
      lane: kind === "standard" ? laneOfStandard(name) : laneOf(name),
    });
  };

  const cmdDir = join(root, "commands");
  if (existsSync(cmdDir)) {
    for (const f of readdirSync(cmdDir).sort().filter((f) => f.endsWith(".md"))) {
      add("command", basename(f, ".md"), join(cmdDir, f));
    }
  }
  const agentDir = join(root, "agents");
  if (existsSync(agentDir)) {
    for (const f of readdirSync(agentDir).sort().filter((f) => f.endsWith(".md"))) {
      add("agent", basename(f, ".md"), join(agentDir, f));
    }
  }
  const skillDir = join(root, "skills");
  if (existsSync(skillDir)) {
    for (const d of readdirSync(skillDir).sort()) {
      const abs = join(skillDir, d, "SKILL.md");
      if (existsSync(abs)) add("skill", d, abs);
    }
  }
  const stdDir = join(root, "standards");
  if (existsSync(stdDir)) {
    for (const abs of walk(stdDir, [])) {
      add("standard", relative(root, abs).split("\\").join("/"), abs);
    }
  }
  return out;
}

function laneOfStandard(rel: string): string | null {
  const m = /^standards\/([a-z-]+)\//.exec(rel);
  if (!m) return null;
  const hit = LANES.find((l) => l.standardsDir === m[1]);
  return hit ? hit.lane : null;
}

// ---------------------------------------------------------------------------
// Group A — component identity and frontmatter
// ---------------------------------------------------------------------------

/** Optional keys that are recognised. Unknown keys are IGNORED, never rejected —
 *  rejecting them would block a legitimate future field in the plugin format. */
export const KNOWN_OPTIONAL: Record<string, string[]> = {
  command: ["argument-hint", "allowed-tools", "model", "disable-model-invocation"],
  agent: ["skills", "tools", "disallowedTools", "model"],
  skill: ["allowed-tools", "license"],
  standard: [],
};

export function checkIdentity(root: string, components: Component[]): Defect[] {
  const defects: Defect[] = [];
  const skills = new Set(components.filter((c) => c.kind === "skill").map((c) => c.name));

  for (const c of components) {
    if (c.kind === "standard") continue; // standards carry no frontmatter by design
    const { frontmatter: fm } = c;

    if (!fm.present) {
      defects.push({ group: "A", rule: "A1-frontmatter-present", file: c.rel, message: `${c.kind} has no frontmatter block` });
      continue;
    }
    if (!fm.wellFormed) {
      defects.push({ group: "A", rule: "A1-frontmatter-wellformed", file: c.rel, message: fm.error ?? "malformed frontmatter" });
      continue;
    }
    if (c.kind !== "command" && !(fm.keys.name ?? "").trim()) {
      defects.push({ group: "A", rule: "A2-name-required", file: c.rel, message: `${c.kind} frontmatter has no \`name\`` });
    }
    if (!(fm.keys.description ?? "").trim()) {
      defects.push({ group: "A", rule: "A3-description-required", file: c.rel, message: `${c.kind} frontmatter has no \`description\`` });
    }
    if (c.kind !== "command" && fm.keys.name !== undefined && fm.keys.name !== c.name) {
      const what = c.kind === "skill" ? "its directory name" : "its filename";
      defects.push({
        group: "A",
        rule: "A4-name-matches-path",
        file: c.rel,
        message: `frontmatter \`name: ${fm.keys.name}\` does not match ${what} (${c.name})`,
      });
    }
    // A5 — the only machine-readable route declaration in the repository.
    const declared = fm.keys.skills;
    if (declared !== undefined) {
      for (const s of declared.replace(/^\[|\]$/g, "").split(",").map((x) => x.trim()).filter(Boolean)) {
        if (!skills.has(s)) {
          defects.push({ group: "A", rule: "A5-declared-skill-resolves", file: c.rel, message: `frontmatter \`skills:\` names ${s}, which has no skills/${s}/SKILL.md` });
        }
      }
    }
  }
  return defects;
}

// ---------------------------------------------------------------------------
// Group B — cited paths, anchors and links
// ---------------------------------------------------------------------------

/**
 * The eight unambiguous shapes of a plugin-internal path. `docs/` is restricted to the
 * contract documents and the planning folder because everything else under `docs/`
 * belongs to the TARGET repository's namespace, not this plugin's.
 */
export const PATH_SHAPES: RegExp[] = [
  /^agents\/[a-z0-9-]+\.md$/,
  /^skills\/[a-z0-9-]+(\/SKILL\.md)?$/,
  /^standards\/(shared|ios|android|react|react-native)\/([a-z0-9.-]+\.md|\*)$/,
  /^templates\/[a-z0-9-]+\.md$/,
  /^scripts\/[a-z0-9.-]+\.ts$/,
  /^hooks\/[a-z0-9-]+\.(sh|json)$/,
  /^docs\/[a-z0-9-]+-contract\.md$/,
  /^docs\/planning\/[A-Za-z0-9_.-]+$/,
];

/** Documented for humans; these are the namespaces PATH_SHAPES deliberately excludes. */
export const TARGET_REPO_NAMESPACES = ["docs/project/", "docs/qa/", "docs/tasks/", "docs/<FEATURE>-DD.md"];

/**
 * Paths belonging to a DIFFERENT plugin, cited by name in this plugin's contract docs.
 * The list must stay exactly this size unless a new foreign citation is added
 * deliberately — see the test that pins it.
 */
export const FOREIGN_PATHS: Array<{ path: string; reason: string }> = [
  { path: "scripts/repo-knowledge.ts", reason: "ono-project-inspector's producer script, cited by docs/repo-knowledge-contract.md as the authoritative type" },
  { path: "skills/repo-knowledge", reason: "ono-project-inspector's producing skill, cited by docs/repo-knowledge-contract.md" },
  { path: "scripts/inspection-state.ts", reason: "ono-project-inspector's migration-trail precedent, cited by docs/planning/SHARED-011-legacy-document-migration-design.md" },
];

/**
 * `skills/agents`, `agents/skills`, `standards/scripts` — prose enumerations like
 * "invoked by other agents/skills" that happen to match a path shape. A candidate
 * whose second segment is itself one of this plugin's top-level directories is a
 * slash-separated word pair, not a path. Found by the prose-false-positives fixture.
 */
const PLUGIN_DIRS = new Set([...SCANNED_DIRS, "scripts", "hooks"]);

function isProseWordPair(candidate: string): boolean {
  const parts = candidate.split("/");
  return parts.length === 2 && PLUGIN_DIRS.has(parts[0]) && PLUGIN_DIRS.has(parts[1]);
}

export function isShapedPath(candidate: string): boolean {
  if (isProseWordPair(candidate)) return false;
  return PATH_SHAPES.some((r) => r.test(candidate));
}

/** Every backticked span and every markdown link target in a document. */
export function citedTokens(text: string): string[] {
  const raw: string[] = [];
  for (const m of text.matchAll(/`([^`\n]+)`/g)) raw.push(m[1]);
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) raw.push(m[1]);

  const out: string[] = [];
  for (const r of raw) {
    for (const tok of r.split(/\s+/)) {
      const clean = tok.replace(/^[`*"'([]+/, "").replace(/[`*"')\],.;:]+$/, "");
      if (clean.includes("/")) out.push(clean);
    }
  }
  return out;
}

export function resolvesOnDisk(root: string, candidate: string): boolean {
  if (candidate.endsWith("/*")) {
    const dir = join(root, candidate.slice(0, -2));
    return existsSync(dir) && readdirSync(dir).length > 0;
  }
  if (candidate.startsWith("skills/") && !candidate.endsWith("SKILL.md")) {
    return existsSync(join(root, candidate, "SKILL.md"));
  }
  return existsSync(join(root, candidate));
}

/** GitHub's heading-slug algorithm. Read the header comment before changing this. */
export function ghSlug(heading: string): string {
  let t = heading.trim();
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"); // links -> their text
  t = t.replace(/`/g, "").replace(/\*\*/g, "").replace(/\*/g, "");
  t = t.toLowerCase();
  t = t.replace(/[^\w\s-]/g, ""); // \w keeps `_`, so device_type survives
  return t.replace(/\s/g, "-"); // 1:1, never collapsed
}

export function headingSlugs(text: string): Set<string> {
  const out = new Set<string>();
  let inFence = false;
  for (const line of text.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^#{1,6}\s+(.*)$/.exec(line);
    if (m) out.add(ghSlug(m[1]));
  }
  return out;
}

export function checkReferences(root: string, files: string[]): Defect[] {
  const defects: Defect[] = [];
  const foreign = new Set(FOREIGN_PATHS.map((f) => f.path));

  for (const abs of files) {
    const rel = relative(root, abs).split("\\").join("/");
    const text = readFileSync(abs, "utf-8");

    // B1 — cited plugin-internal paths resolve.
    for (const cand of new Set(citedTokens(text))) {
      if (!isShapedPath(cand) || foreign.has(cand)) continue;
      if (!resolvesOnDisk(root, cand)) {
        defects.push({ group: "B", rule: "B1-cited-path-resolves", file: rel, message: `cites \`${cand}\`, which does not exist` });
      }
    }

    // B3 — intra-document anchors resolve against this document's own headings.
    const own = headingSlugs(text);
    for (const m of text.matchAll(/\]\((#[^)\s]+)\)/g)) {
      const anchor = m[1].slice(1).toLowerCase();
      if (!own.has(anchor)) {
        defects.push({ group: "B", rule: "B3-anchor-resolves", file: rel, message: `links to \`#${anchor}\`, which is not a heading in this file` });
      }
    }

    // B4 — relative markdown links resolve.
    for (const m of text.matchAll(/\]\(([^)\s#]+\.md)(#[^)\s]*)?\)/g)) {
      const target = m[1];
      if (/^(https?:|mailto:)/.test(target)) continue;
      if (!existsSync(join(dirname(abs), target))) {
        defects.push({ group: "B", rule: "B4-relative-link-resolves", file: rel, message: `links to \`${target}\`, which does not exist` });
      }
    }
  }
  return defects;
}

// ---------------------------------------------------------------------------
// Group C — readiness and route gating
// ---------------------------------------------------------------------------

/** A line that instructs the reader to check readiness before invoking. */
const GATE_LINE = /not yet authored|structure-only placeholder|check readiness/i;

export interface Route {
  command: string;
  target: Component;
}

/** Commands name their targets as backticked identifiers; that is the route graph. */
export function buildRoutes(root: string, components: Component[]): Route[] {
  const routable = components.filter((c) => c.kind === "agent" || c.kind === "skill");
  const routes: Route[] = [];
  for (const cmd of components.filter((c) => c.kind === "command")) {
    const text = readFileSync(join(root, cmd.rel), "utf-8");
    for (const target of routable) {
      if (new RegExp("`" + target.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "`").test(text)) {
        routes.push({ command: cmd.name, target });
      }
    }
  }
  return routes;
}

export function checkReadiness(root: string, components: Component[], routes: Route[]): Defect[] {
  const defects: Defect[] = [];

  // C2 — a body marker and a frontmatter description must tell the same story.
  for (const c of components) {
    if (c.kind === "standard" || c.kind === "command") continue;
    const claimsPlaceholder = PLACEHOLDER_DESCRIPTION.test(c.frontmatter.keys.description ?? "");
    if (c.readiness === "placeholder" && !claimsPlaceholder) {
      defects.push({ group: "C", rule: "C2-marker-consistent", file: c.rel, message: "body is marked `## Status: Not yet authored` but the description does not say so" });
    }
    if (c.readiness !== "placeholder" && claimsPlaceholder) {
      defects.push({ group: "C", rule: "C2-marker-consistent", file: c.rel, message: "description claims placeholder status but the body carries no `## Status: Not yet authored` heading" });
    }
  }

  // C3 — the core rule. An active route must never reach a placeholder ungated.
  const commandText = new Map<string, string>();
  for (const c of components.filter((x) => x.kind === "command")) {
    commandText.set(c.name, readFileSync(join(root, c.rel), "utf-8"));
  }
  for (const r of routes) {
    if (r.target.readiness !== "placeholder") continue;
    const lane = r.target.lane;
    const text = commandText.get(r.command) ?? "";
    const mention = lane !== null ? LANE_MENTION[lane] : null;
    const gated = text
      .split("\n")
      .some((line) => GATE_LINE.test(line) && (mention === null || mention.test(line)));
    if (!gated) {
      defects.push({
        group: "C",
        rule: "C3-placeholder-route-gated",
        file: `commands/${r.command}.md`,
        message: `routes to placeholder \`${r.target.name}\` with no readiness gate naming the ${lane ?? "unknown"} lane`,
      });
    }
  }

  // C4 — "intentionally deferred" means nothing routes to it. Enforce that.
  for (const r of routes) {
    if (r.target.readiness === "deferred") {
      defects.push({
        group: "C",
        rule: "C4-deferred-unrouted",
        file: `commands/${r.command}.md`,
        message: `routes to \`${r.target.name}\`, which declares itself NOT YET WIRED/INVOKED`,
      });
    }
  }
  return defects;
}

// ---------------------------------------------------------------------------
// Group D — README readiness claims
// ---------------------------------------------------------------------------

/**
 * Aggregate readiness of a lane: `placeholder` only when every component in it is a
 * placeholder, `active` only when none is. A half-authored lane is `mixed` and no
 * blanket claim about it can be checked, so none is enforced.
 */
export function laneReadiness(components: Component[], lane: string): "active" | "placeholder" | "mixed" | "empty" {
  const own = components.filter((c) => c.lane === lane);
  if (own.length === 0) return "empty";
  const ph = own.filter((c) => c.readiness === "placeholder").length;
  if (ph === 0) return "active";
  if (ph === own.length) return "placeholder";
  return "mixed";
}

function verdictOf(line: string): "active" | "placeholder" | null {
  if (/placeholder|not yet authored|not-yet-authored/i.test(line)) return "placeholder";
  if (/\bauthored\b/i.test(line)) return "active";
  return null;
}

/**
 * README is the plugin's front door: a lane documented as a placeholder while it is
 * authored understates the plugin, and the reverse overstates it. Both are defects.
 *
 * Two claim sites are checked, and only two. In prose, a claim counts only when the
 * lane is named in **bold** or as a bold backticked `standards/<lane>/` path — plain
 * prose that happens to mention a platform is not a status claim. Inside the fenced
 * "Plugin internals" block, an annotated line's `(authored)` / `(placeholders)` tag
 * applies to the component names on that same line. A continuation line carrying no
 * annotation is not checked, which is a known and accepted limit.
 *
 * CHANGELOG.md and docs/planning/* are excluded on purpose: a history must be allowed
 * to describe what was once true.
 */
export function checkReadmeClaims(root: string, components: Component[]): Defect[] {
  const abs = join(root, "README.md");
  if (!existsSync(abs)) return [];
  const defects: Defect[] = [];
  const lines = readFileSync(abs, "utf-8").split("\n");

  const byName = new Map<string, Component>();
  for (const c of components) {
    byName.set(c.name, c);
    if (c.kind === "standard") byName.set(basename(c.name), c);
    if (c.kind === "agent") byName.set(`${c.name}.md`, c);
  }

  let inFence = false;
  lines.forEach((line, i) => {
    const at = `README.md:${i + 1}`;
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return;
    }
    const verdict = verdictOf(line);
    if (verdict === null) return;

    if (!inFence) {
      // Prose: bold lane display name, or bold backticked standards lane path.
      for (const l of LANES) {
        const named =
          line.includes(`**${l.display}**`) ||
          line.includes(`**\`standards/${l.standardsDir}/\`**`);
        if (!named) continue;
        const actual = laneReadiness(components, l.lane);
        if (actual === "mixed" || actual === "empty") continue;
        if (actual !== verdict) {
          defects.push({
            group: "D",
            rule: "D1-readme-lane-claim",
            file: at,
            message: `describes the ${l.lane} lane as ${verdict}, but on disk it is ${actual}`,
          });
        }
      }
      return;
    }

    // Fenced internals block: the annotation applies to names on this line.
    const annotated = /\((authored|placeholders)[^)]*\)/.exec(line);
    if (!annotated) return;
    const tag = annotated[1] === "placeholders" ? "placeholder" : "active";
    for (const tok of line.replace(/\([^)]*\)/g, " ").split(/[\s,]+/).filter(Boolean)) {
      const key = tok.replace(/\/$/, "");
      const c = byName.get(key);
      if (c === undefined) continue;
      if (c.readiness !== tag) {
        defects.push({
          group: "D",
          rule: "D2-readme-component-claim",
          file: at,
          message: `annotates \`${key}\` as ${tag}, but it is ${c.readiness}`,
        });
      }
    }
  });
  return defects;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface Report {
  root: string;
  components: Component[];
  routes: Route[];
  defects: Defect[];
}

export function validate(root: string): Report {
  const components = loadComponents(root);
  const files = corpus(root);
  const routes = buildRoutes(root, components);
  const defects = [
    ...checkIdentity(root, components),
    ...checkReferences(root, files),
    ...checkReadiness(root, components, routes),
    ...checkReadmeClaims(root, components),
  ];
  return { root, components, routes, defects };
}

function main(): void {
  const arg = process.argv[2];
  const root = arg !== undefined && !arg.startsWith("-") ? arg : REPO_ROOT;
  const report = validate(root);

  const counts = { command: 0, agent: 0, skill: 0, standard: 0 };
  for (const c of report.components) counts[c.kind]++;
  const placeholders = report.components.filter((c) => c.readiness === "placeholder");
  const deferred = report.components.filter((c) => c.readiness === "deferred");

  console.log("reference integrity");
  console.log(
    `  ${counts.command} commands · ${counts.agent} agents · ${counts.skill} skills · ${counts.standard} standards · ${report.routes.length} routes`,
  );
  console.log(`  ${placeholders.length} placeholder · ${deferred.length} deferred · rest active`);

  if (report.defects.length === 0) {
    console.log("\nNo defects.");
    process.exit(0);
  }
  for (const g of ["A", "B", "C", "D"]) {
    const own = report.defects.filter((d) => d.group === g);
    if (own.length === 0) continue;
    console.log(`\nGroup ${g} — ${own.length} defect(s)`);
    for (const d of own) console.log(`  ${d.file}: ${d.message}  [${d.rule}]`);
  }
  console.log(`\n${report.defects.length} defect(s).`);
  process.exit(1);
}

const invokedDirectly =
  process.argv[1] !== undefined && /reference-integrity\.ts$/.test(process.argv[1]);
if (invokedDirectly) main();
