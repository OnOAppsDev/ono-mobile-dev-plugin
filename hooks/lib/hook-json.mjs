// hook-json.mjs — the Node.js reader behind hooks/lib/hook-json.sh, used only when jq is not
// installed (Windows 11 / Git Bash ships without jq; Node.js is already required by the plugin).
//
//   node hook-json.mjs <spec>      JSON document on stdin; prints the value the spec selects
//
// The spec language is the one hooks/lib/hook-json.sh translates for jq, so both runtimes give
// the same answer (scripts/hook-json.test.ts runs every spec through both and compares):
//
//   .a.b               the value at that path
//   .a.b // .c.d       the first alternative whose value is not null
//   @edits             the MultiEdit edits' new_string values, joined with "\n"
//
// Output: a string as is; true, false and numbers as JSON text; an object or array as compact
// JSON; null or a missing field as nothing. Exit 0 on success.
//
// Fails — exit 1 — on anything it cannot read with certainty: input that is not JSON, a path
// that indexes into a string, number, boolean or array (jq: "Cannot index"), a malformed spec,
// edits that are not an array of objects. A caller treats every failure as "the call cannot be
// read" and fails closed. Plain ES module, no dependency, no TypeScript: it runs on any Node.js
// that starts, independent of the plugin's own Node.js version requirement.

const SEGMENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function fail() {
  process.exit(1);
}

function parsePath(path) {
  if (!path.startsWith(".")) fail();
  const segments = path.slice(1).split(".");
  if (segments.some((s) => !SEGMENT.test(s))) fail();
  return segments;
}

function at(doc, segments) {
  let v = doc;
  for (const s of segments) {
    if (v === null || v === undefined) return null;
    if (typeof v !== "object" || Array.isArray(v)) fail(); // jq: Cannot index <type> with "<s>"
    v = Object.prototype.hasOwnProperty.call(v, s) ? v[s] : null;
  }
  return v === undefined ? null : v;
}

function text(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

function edits(doc) {
  const list = at(doc, ["tool_input", "edits"]);
  if (list === null) return "";
  if (!Array.isArray(list)) fail();
  return list
    .map((e) => {
      if (e === null) return "";
      if (typeof e !== "object" || Array.isArray(e)) fail();
      return text(Object.prototype.hasOwnProperty.call(e, "new_string") ? e.new_string : null);
    })
    .join("\n");
}

const spec = process.argv[2];
if (typeof spec !== "string" || spec === "") fail();

const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("error", fail);
process.stdin.on("end", () => {
  let doc;
  try {
    doc = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    fail();
  }
  let out = "";
  if (spec === "@edits") out = edits(doc);
  else {
    let found = null;
    for (const alt of spec.split(" // ")) {
      const v = at(doc, parsePath(alt.trim()));
      if (v !== null) {
        found = v;
        break;
      }
    }
    out = text(found);
  }
  process.stdout.write(out, () => process.exit(0));
});
