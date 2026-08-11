# SHARED-011 — Legacy Planning-Document Migration Framework

**Status:** Design Proposal — approved architecture, not yet implemented
**Date:** 2026-08-11
**Target release:** ono-mobile-dev-plugin 0.5.0
**Scope:** design only. No command, script, skill, template, or runtime behavior is changed by this document.

---

## 1. Problem statement

The YES+ AI demo failed when `/dev-design-start` loaded a Feature Analysis produced by an earlier version of this plugin. The document body was entirely valid; only its frontmatter predated the current contract.

The frontmatter contract has changed four times, and the history is recoverable from this repository:

| Shape | Commit | Change |
|---|---|---|
| v0 | `c77c75d` (initial import) | `feature`, `dd_link`, `figma_link`, `author`, `status`, `date`. Body section: `## Repo Conventions Detected`. |
| v1 | `6c56ec5` | Adds `platform` (**`mixed` permitted**) and `device_type`. |
| v2 | `c90c78c` | Replaces the `figma_link`-only design input with `design_reference_status`, `design_reference_type`, `design_reference`, `figma_link`. Forbids `platform: mixed`. |
| v3 | `2cadba7` | Adds the six `repo_knowledge_*` fields. Body section splits into `## Repo Knowledge Reference` + `## Repo Context`. |

Today the plugin tolerates exactly **one** of those three transitions, in exactly **one** place: a hand-written prose paragraph at `commands/dev-design-start.md:13` that accepts an analysis missing the `repo_knowledge_*` fields. Nothing anywhere handles a missing `device_type`, a missing `design_reference_*` block, or a `platform: mixed` value — so a v0/v1 document reaches a stage that reads fields which cannot exist.

Four commands read planning-document frontmatter today: `/analyze-feature` (writes it), `/dev-design-start` (reads the Feature Analysis), `/dev-feature-start` (reads the DD), and `/implement-task` (resolves and reads all four documents). Each reads it directly and independently.

**What SHARED-011 must deliver is not a fix for the v-something-to-v3 gap.** It is the compatibility layer that makes the *next* contract change a one-file addition instead of another cross-command edit.

## 2. Root cause

**A missing reader boundary, not a missing migration.**

Three specific defects follow from it:

1. **No single reader.** Every consumer parses frontmatter itself, in natural-language instructions. There is no component that answers "what shape is this document, and what does it mean in today's terms." Compare `.ono/repo-knowledge.json`, where exactly one component (`scripts/read-repo-knowledge.ts`) parses the format and every consumer receives normalized output — the discipline this repository already applies to structured data, but not to its own documents.

2. **No version marker.** A planning document does not record which contract it was written against. A reader therefore cannot distinguish *old* from *malformed*, and any tolerance must be written as heuristics over field presence, re-derived at each call site.

3. **Tolerance is prose, and prose is per-command.** `commands/dev-design-start.md:13` is a paragraph of English. It covers the one transition its author was thinking about. It is invisible to `/dev-feature-start` and `/implement-task`, cannot be tested, and must be re-authored — in every consumer — each time the contract moves.

The consequence is structural: the cost of a contract change is *O(consumers × historical shapes)* and is paid in unreviewable prose. Adding a fifth shape under today's design means editing four command files and two skills again, and hoping each author remembers all four prior shapes.

## 3. Proposed architecture

Three layers, deliberately mirroring the split this plugin already uses for repository knowledge (`scripts/read-repo-knowledge.ts` + `skills/repo-knowledge-consumer` + `docs/repo-knowledge-contract.md`).

| Layer | Artifact | Owns | Executed by |
|---|---|---|---|
| **Contract** | `docs/planning-doc-contract.md` *(new)* | The versioned frontmatter specification per document kind, and the rules a migration must obey. | Humans |
| **Framework** | `scripts/migrate-planning-doc.ts` *(new)* | Splitting, version detection, the migration registry, the sequential runner, serialization, idempotency, and the JSON/CLI contract. The **only** component in this plugin that understands historical document shapes. | Node — deterministic, never an LLM |
| **Loader** | `skills/planning-doc-migration/SKILL.md` *(new)* | When to invoke the framework, how to present `needs-input` questions, what to report to the developer, and the hard constraints. The single compatibility layer every command calls. | The model |

### The boundary this creates

Commands stop saying *"read the frontmatter — and, by the way, tolerate the old ones."* They say:

> Load the document through the `planning-doc-migration` skill, then read its frontmatter.

Everything downstream of the loader sees exactly one shape: current. That is the whole point — **migration becomes the single compatibility layer**, and a future contract change touches zero command files.

### Where migration lives — and why not the alternatives

Placed in a **document loader backed by a deterministic helper**:

- **Not inside `/dev-design-start`** — three other commands read planning frontmatter, and `/implement-task` reads all four document kinds. Putting it in one command guarantees the same bug reappears in the other three.
- **Not a shared prose helper** — a prose helper is still prose: untestable, and it re-introduces per-shape heuristics an LLM must re-derive on every run.
- **Not a pure contract layer** — a contract describes the shape; it cannot transform a document.
- **Loader + framework** — the loader is the one place every consumer already needs (they all must open the file), so it is the natural interception point; the framework behind it makes the structural work deterministic and testable.

### Deterministic/model split

The framework does everything mechanical: locate the frontmatter, detect the version, apply the chain, serialize, verify, write. The model does exactly two things it is actually good at: **deciding to invoke the loader**, and **asking the developer the questions the framework reports it cannot answer**. No historical shape is ever parsed by an LLM.

### Scope boundary: frontmatter only

The framework migrates the **frontmatter contract only**. Body content is never touched — including the v2→v3 body change that split `## Repo Conventions Detected` into `## Repo Knowledge Reference` + `## Repo Context`. That rename is *not* performed. Consumers read the legacy heading tolerantly, which `/dev-design-start` already does. See §8 for why this boundary is load-bearing rather than merely convenient.

## 4. Alternatives considered

### 4.1 Where migration lives

| Option | Why rejected |
|---|---|
| Inline in `/dev-design-start` | The reported failure is in `/dev-design-start`, but the defect is in all four readers. Fixing one reproduces SHARED-011 three more times. |
| A prose "legacy tolerance" section in each consuming skill | This is the status quo, generalized. Still untestable, still per-consumer, still requires every author to remember every historical shape. |
| A migration step inside `/analyze-feature` (regenerate the document) | Regeneration destroys the human decisions and the approval the document carries, and re-derives repository context that has since moved. It is not a migration; it is a replacement. |

### 4.2 How migrations are structured

| Option | Trade-off | Verdict |
|---|---|---|
| **One migration, legacy → current** | Simplest to write once. But each new version requires re-editing the single function for *every* legacy shape it already handles — O(V²) authoring cost and a permanent regression risk to previously working paths. This is precisely the one-off the brief rules out. | Rejected |
| **Version graph with shortest-path resolution** | Handles branching histories and downgrades. Frontmatter evolution here is linear, forward-only, and single-producer; the graph solves a problem that does not exist and costs a path-finding implementation plus its failure modes. | Rejected (YAGNI) |
| **Unversioned pipeline of idempotent field normalizers** | Genuinely attractive: each rule (e.g. *"if `figma_link` is set and `design_reference_*` is absent, derive it"*) is order-independent and self-idempotent, with no version numbers at all. Rejected because rules accumulate invisibly with no record of which ones a given document needed; and, decisively, absence becomes ambiguous — you cannot distinguish *"this field is missing because the document is old"* from *"this field is missing because it is newly optional."* The document also loses any record of which contract it was authored against. | Rejected |
| **Sequential registry of single-step migrations** | Each step is small, independently testable, and frozen once released. Adding a version appends one entry and modifies nothing. | **Chosen** |

The chosen shape also matches an existing, proven precedent in the plugin family: `ono-project-inspector`'s `scripts/inspection-state.ts:290` runs `while (version < CURRENT) { apply }` with a recorded migration trail.

Note that the rejected normalizer pipeline is not wasted: individual migration *steps* are written internally as exactly those declarative rules — they are simply scoped to one version transition, which is what restores the missing provenance.

### 4.3 Write mode

| Option | Why rejected |
|---|---|
| In-memory projection, never write | Zero risk to approved documents, but every command pays the migration cost on every run forever, legacy documents never converge, and the brief's "identical documents after the first successful migration" becomes untestable because there is no document to compare. |
| Write, but require confirmation first | Safer, but directly contradicts "continue the workflow automatically whenever migration succeeds," and adds an approval gate to a change that alters no decision. |
| **Write in place, report the diff, continue** | Chosen. Converges once, satisfies the idempotency requirement literally, and pays for safety through the structural guarantees in §8 (protected operations, body-hash assertion) rather than through a prompt. Git is the undo. |

### 4.4 Inference evidence

| Option | Why rejected |
|---|---|
| Fall back to live repository evidence (`repo-analyst`, `.ono/repo-knowledge.json`) | Fills more fields automatically, but see §8.4 — it makes migration non-reproducible, anachronistic, and (for `device_type` specifically) confidently wrong in this org. |
| Never infer; ask for everything | Maximally safe and maximally interruptive. It would prompt even for the fully deterministic cases (`figma_link` set ⇒ `design_reference_type: figma`), training developers to click through migration prompts. |
| **Document-internal evidence only, ask once otherwise** | Chosen. |

### 4.5 Scope of the first implementation

Chosen: **framework general, Feature Analysis migrations only.** The registry, loader, detector, and runner are kind-agnostic from day one; only the Feature Analysis chain is authored and tested, because it is the only kind with a reported failure and a recoverable four-shape history. DD, Dev Plan, and Task Breakdown register with an empty chain. The cost of this choice is recorded honestly in §12.5.

## 5. Why the chosen design scales

Four properties, each traceable to a specific mechanism rather than an intention:

1. **Consumer count drops out of the cost equation.** Consumers call the loader; only the loader knows about versions. Contract-change cost falls from *O(consumers × shapes)* to *O(1) new migration step*.

2. **Released migrations are frozen.** A step, once shipped, is never edited to accommodate a later contract change — that is the next step's job. So the number of files a change can break does not grow with history. This is a stated rule in the contract document and is enforced in review, not by the runtime; it is the single most important discipline in the design.

3. **Steps are pure functions of frontmatter.** Because inference draws only on document-internal evidence (§8.4), each step is `frontmatter → frontmatter`, testable with a fixture pair and no repository, filesystem, or network state.

4. **Detection is additive.** A new version adds one marker predicate. Existing predicates are unaffected, because detection resolves to *the highest version whose marker set is fully present* and unknown fields never participate. A document from the future is refused explicitly rather than mis-detected.

The counter-scaling force is fixture volume: every new version adds one fixture pair per prior version tested end-to-end. That is *O(V)* per release and *O(V²)* cumulative in test data — acceptable at the scale of a document contract that has moved four times in a year, and it is data, not logic.

## 6. Files that will change

None of these are modified by this proposal. They are the proposed implementation scope for a later, separately approved change.

| File | Change |
|---|---|
| `templates/feature-analysis-template.md` | Add `doc_schema_version: 3` to the frontmatter block, with a comment pointing at the contract document. |
| `templates/dd-template.md` | Add `doc_schema_version: 1`. |
| `templates/dev-plan-template.md` | Add `doc_schema_version: 1`. |
| `templates/task-breakdown-template.md` | Add `doc_schema_version: 1`. |
| `commands/analyze-feature.md` | Step 7: stamp `doc_schema_version` on generation. |
| `commands/dev-design-start.md` | Step 2: **delete** the ad-hoc legacy paragraph at line 13 and replace it with "load the analysis through the `planning-doc-migration` skill." Retain the existing instruction to record the embedded-snapshot situation in the DD's §23 Assumptions — that part is still correct and is now fed by the loader's report. |
| `commands/dev-feature-start.md` | Step 1: load the DD through the loader before reading its frontmatter. |
| `commands/implement-task.md` | Step 4: load each of the four resolved documents through the loader. |
| `skills/dev-design-start/SKILL.md` | Step 1 input gate (load-then-read); Step 6 frontmatter list gains `doc_schema_version`. |
| `skills/dev-feature-start/SKILL.md` | Steps 1–2 and step 4/7 frontmatter lists. |
| `README.md` | The `Documentation` section gains the contract doc; the `Plugin internals` tree gains the new skill and script. |
| `CHANGELOG.md` | A `0.5.0` entry, including an explicit "Unchanged (deliberately)" note that a current document takes a true no-op path. |
| `.claude-plugin/plugin.json` | `version`: `0.4.0` → `0.5.0`. |

**Not changed:** every `standards/**` file, all four review/QA/release templates (they carry no frontmatter), all hooks, all agents, `scripts/read-repo-knowledge.ts`, `scripts/resolve-target-repo-root.ts`, and the five commands that do not read planning frontmatter.

## 7. New files

| File | Purpose |
|---|---|
| `scripts/migrate-planning-doc.ts` | The framework. Splitter, detector ladder, migration registry, sequential runner, op validator, serializer, CLI. |
| `scripts/migrate-planning-doc.test.ts` | Self-contained tests, no external framework, run with `node scripts/migrate-planning-doc.test.ts` — same convention as `scripts/read-repo-knowledge.test.ts`. |
| `scripts/fixtures/planning-docs/**` | Input and expected-output fixture pairs: `fa-v0.md`, `fa-v1.md`, `fa-v2.md`, `fa-v3.md`, `fa-v1-mixed-platform.md`, `fa-v2-fenced.md`, `fa-v2-delimited.md`, plus expected outputs and two malformed cases. |
| `skills/planning-doc-migration/SKILL.md` | The loader. Invocation procedure, `needs-input` handling, reporting format, hard constraints. |
| `docs/planning-doc-contract.md` | The versioned frontmatter contract per document kind, the migration authoring rules, and the frozen-step discipline. |

## 8. Migration flow

### 8.0 End to end

```
command needs a planning document
        │
        ▼
planning-doc-migration skill
        │   node --no-warnings scripts/migrate-planning-doc.ts <path> --kind feature-analysis
        ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. SPLIT      file → (leading, frontmatterBlock, bodyBytes)  │  bodyBytes never parsed
│ 2. DETECT     doc_schema_version stamp, else marker ladder   │  stamp always wins
│ 3. SHORT-CIRCUIT  detected == current && stamped → "current" │  no parse, no write, no message
│ 4. DRY-RUN    run the whole chain, collect ALL questions     │  nothing written yet
│ 5. ASK        questions non-empty → "needs-input", stop      │  file byte-untouched
│ 6. APPLY      re-run chain with answers; validate every op   │
│ 7. VERIFY     sha256(body) unchanged, protected keys intact  │  mismatch → abort, write nothing
│ 8. WRITE      leading + newFrontmatter + bodyBytes           │
│ 9. REPORT     JSON: status, detected/current, diff, steps    │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
command reads current-shape frontmatter and continues automatically
```

Step 4 exists specifically so a v0 document asks its questions **once, batched**, rather than once per chain step.

### 8.1 Splitting — and a finding about the encoding

The templates in this repository encode frontmatter as a fenced ` ```yaml ` block following an `# H1` heading (see `templates/feature-analysis-template.md:3` and `templates/dd-template.md:3`), while every command refers to it as "frontmatter," which conventionally means a `---`-delimited block at byte 0. **Generated documents in the wild may therefore use either form.**

The splitter recognizes both and preserves whichever the document uses:

- `delimited` — a `---` block starting at byte 0.
- `fenced-yaml` — the first ` ```yaml ` fenced block appearing before any `## ` heading.
- Anything else → `unsupported`, reported, never guessed.

This is exactly the class of detail a model editing the file by hand would silently normalize, and a second independent argument for the deterministic helper.

### 8.2 Detection

A `doc_schema_version` stamp always wins; the marker ladder runs only for unstamped documents. Detected version = **the highest version whose marker set is fully present**; unknown or extra fields never participate, which is what gives forward tolerance.

| v | Marker fields |
|---|---|
| 3 | `repo_knowledge_status` |
| 2 | `design_reference_status` |
| 1 | `platform` or `device_type` |
| 0 | `feature` and `status`, and none of the above |

A stamp above the current version is refused as `schema-too-new` — the same posture `scripts/read-repo-knowledge.ts:240` already takes for the knowledge manifest. A hand-edited hybrid document resolves to the highest satisfied marker set, and remains safe because each step tolerates missing inputs from its own version (filling them or reporting `needs-input`) and because no step may modify a pre-existing value except through a declared op (§8.5).

### 8.3 Declared operations per step

Each step returns a list of typed operations rather than a rewritten frontmatter object. The runner validates every op before applying any:

| Op | Meaning | Constraint |
|---|---|---|
| `add(field, value, provenance)` | Introduce a field | Fails if the field already exists |
| `rename(from, to)` | Carry a value to a new key | Value copied verbatim; no transformation |
| `resolve(field, value, provenance)` | Replace an invalid legacy value | Permitted only for fields in the step's declared `resolvable` list, and only when the current value is in its declared `invalidValues` set |

There is no delete op. `feature`, `status`, `author`, and `date` are excluded from every op at the runner level (§8.6).

The full Feature Analysis chain:

| Step | Operations |
|---|---|
| v0 → v1 | `add(platform)` — **ask**; `add(device_type)` — **ask** (§8.4) |
| v1 → v2 | `add(design_reference_status/_type/design_reference)` — derive or ask (§8.4); `resolve(platform)` when the value is `mixed` — **ask** |
| v2 → v3 | `add` the six `repo_knowledge_*` fields — fully deterministic (§8.7) |
| runner | `add(doc_schema_version)`, `add(migrated_from_version)`, `add(migrated_at)`, `add(migrated_by)`, and `add(migration_inputs)` when any field was human-answered |

`platform: mixed` was not named in the SHARED-011 brief; it was found in the v1 contract at commit `6c56ec5` and is unresolvable without a human. It is included here because a v1 document carrying it would otherwise reach a v2-forbidden state.

### 8.4 Deterministic inference — three outcomes only

Every field resolves to exactly one of **carry** (a value is already present — never overwritten), **derive** (document-internal evidence is conclusive), or **ask** (`needs-input`; nothing is written). There is no fourth "best guess" outcome.

| Field | Rule |
|---|---|
| `design_reference_*` | `figma_link` present and non-placeholder ⇒ **derive**: `status: provided`, `type: figma`, `design_reference: null`, `figma_link` carried unchanged. `figma_link` absent or empty ⇒ **ask**: v0/v1 had no way to distinguish *"this feature needs no design reference"* from *"this is a UI feature whose reference was never recorded,"* and `/analyze-feature` treats those two outcomes very differently. |
| `device_type` | Present ⇒ **carry**. Absent ⇒ **derive** only from a literal, unambiguous statement of the target device in the document's own text; otherwise **ask**. |
| `platform` (v0) | **Ask** — v0 had no platform concept and the document cannot supply one. |
| `platform: mixed` (v1) | **Ask** — the developer selects one of `react-native` / `react` / `ios` / `android`. |
| `repo_knowledge_*` | Fully deterministic; no inference, and specifically **not** filled from the repository. See §8.7. |

#### Why `device_type` inference is document-internal only

**SHARED-011 is a planning-document compatibility layer, not a repository re-analysis flow.** The migrator's entire evidence universe is the bytes of the document being migrated. It never invokes `repo-analyst`, never reads `.ono/repo-knowledge.json`, and never inspects source. Three reasons, in order of weight:

1. **Reproducibility.** A migration whose output depends on repository state at migration time is not a function of its input. Idempotency (§8.8) and fixture testing both collapse: the same legacy document migrated on two machines, or on two days, could produce different documents.

2. **Anachronism.** Repository state today is not the state the human approved against. Inferring `device_type` from today's repository silently re-decides a field of an approved document using evidence its approver never saw — which is a content change wearing a format change's clothes.

3. **The detection is genuinely hard here, and would fail quietly.** This organization's Android TV surface uses a custom in-house framework, so the conventional signals (Leanback, `androidx.tv`, Compose for TV) are absent or actively misleading. A keyword heuristic over the document or the repository would not be uncertain — it would be confidently wrong, and it would write that wrong value into an approved document.

If the document does not contain deterministic evidence, the correct behavior is `needs-input`: **ask once, and leave the file byte-untouched until answered.** That is cheaper than being wrong, and it is the only outcome that keeps the human in the position the approval gate assumed they were in.

### 8.5 Body preservation — how it is enforced

Three mechanisms, none of which is a promise:

1. **The body is never parsed.** The file is split once, lexically, and `bodyBytes` is held as an opaque byte slice. No markdown parse, no normalization, no re-serialization. Headings, whitespace, evidence, links, timestamps, and generated content are physically incapable of changing because nothing ever reads them.
2. **Write is concatenation.** `output = leading + newFrontmatterBlock + bodyBytes`.
3. **A hash assertion gates the write.** The runner computes `sha256(bodyBytes)` before and asserts the slice at the same offset in the composed output is byte-identical. Any mismatch aborts the migration and writes nothing.

The frontmatter block itself is edited **line-oriented, not round-tripped through a YAML serializer**: existing lines (including their inline `#` comments and their order) are preserved verbatim, and only added or resolved keys are written — inserted at their canonical position for the target version, with unknown extra keys preserved at the end. A YAML round-trip would silently discard the templates' explanatory comments.

The v2→v3 body-section rename is out of scope for exactly this reason: it is a body change, and the guarantee above admits no exceptions. §8.7 shows this is also the *semantically* correct choice, not merely the convenient one.

### 8.6 Approval preservation — how it is enforced

Migration must never revoke, grant, reset, or require re-approval. Four mechanisms:

1. **`status` is structurally unwritable.** `feature`, `status`, `author`, and `date` are on a protected-key list. A step returns operations, and the runner **rejects the entire migration** — writing nothing — if any operation targets a protected key. This is a runtime check with a test that feeds the runner a deliberately misbehaving step, not a convention.
2. **No step may modify a pre-existing value.** The only op that can change an existing field is `resolve`, which requires the field to be pre-declared `resolvable` *and* its current value to be in a declared `invalidValues` set (in practice: `platform: mixed`). Every other field is add-only or carried verbatim.
3. **No consumer gates on migration metadata.** `doc_schema_version`, `migrated_*`, and `migration_inputs` are inert. The loader skill's hard constraints forbid any consumer from treating them as approval-relevant, and the input gates in `skills/dev-design-start/SKILL.md` and `skills/dev-feature-start/SKILL.md` continue to check `status` alone.
4. **Human-supplied answers are labelled, not laundered.** A field answered during migration records its provenance in `migration_inputs` (e.g. `device_type=human@migration`). The approval still stands — the human approved the document's content, and the content is bit-identical or carried — but a reviewer can see precisely which values were supplied after that approval rather than before it. Recording this is honest; hiding it would let migration quietly add unreviewed information under an approved banner.

Taken together: the human approved the *content*, and every byte of that content is either unchanged or carried verbatim. Only the encoding moved.

### 8.7 The `repo_knowledge_*` values — verified, not assumed

The brief required these values be checked against the current contract before being made normative. They were checked against `skills/repo-knowledge-consumer/SKILL.md` (Step 6) and `scripts/read-repo-knowledge.ts`.

**Syntactic verification.** The proposed values are not merely valid — they are the exact block the consumer skill already specifies for the unavailable case (`skills/repo-knowledge-consumer/SKILL.md:120-127`):

| Field | Value for a migrated legacy document | Verification |
|---|---|---|
| `repo_knowledge_status` | `unavailable` | ✅ The enum is exactly `available \| unavailable`. Note `unknown` is **not** a valid `status` — it is a *freshness* verdict only, and using it here would be invalid. |
| `repo_knowledge_schema` | `null` | ✅ "the contract schema version, or null when unavailable." Must be the bare YAML keyword, never the string `"null"` and never empty. |
| `repo_knowledge_fingerprint` | `null` | ✅ Same rule. |
| `repo_knowledge_freshness` | `null` | ✅ The enum is `fresh \| stale-head \| stale-artifacts \| unknown \| null`. `unknown` is reserved for a manifest that *is* available but whose HEAD cannot be established, so `null` is the only correct value here. |
| `repo_knowledge_reused` | `none` | ✅ "write `none` only when the list is genuinely empty"; `unavailable()` returns `usableCategories: []` (`scripts/read-repo-knowledge.ts:98`). |
| `repo_knowledge_derived` | `stack, commands, structure, inventory, conventions, integrations, auditTopics` | ✅ Must mirror `deriveLive` **verbatim — no summarizing, reordering, or abbreviating**. `unavailable()` sets `deriveLive: [...ALL_CATEGORIES]`, and `ALL_CATEGORIES` declares exactly this order at `scripts/read-repo-knowledge.ts:45-53`. |

**Semantic verification — the check that actually matters.** The block's defined meaning is *"All repository context in this document was derived live at authoring time and is a point-in-time observation."* That is precisely what a pre-v3 document contains: the v0 template described its `## Repo Conventions Detected` section as *"repo-analyst's structured findings, verbatim."* So the migration is not choosing a convenient default — it is recording an accurate fact about the document. The values are normative for this reason, and would not be if they merely happened to typecheck.

**Three consequences that follow, and are normative:**

1. **Only the frontmatter half of the Step 6 block is written.** The block also specifies a `## Repo Knowledge Reference` body section. That is a body change, so it is **not** written (§8.5). The migrated document is deliberately frontmatter-valid and body-incomplete; the loader reports this, and `commands/dev-design-start.md:13` already instructs recording it in the DD's §23 Assumptions.

2. **The migrator cannot supply a valid `reason`, and must not invent one.** The Step 6 unavailable body text interpolates a reason drawn from the reader's enum — `absent`, `unparseable`, `invalid`, `schema-too-new`, `worktree`, `root-not-found`. **None of those means "authored before the contract existed."** Because `reason` appears only in body prose and is not a frontmatter field, this creates no invalid frontmatter — but it is a second, independent reason not to write that body section, and a gap worth reporting to the contract's owner.

3. **The blast radius is small by design.** `commands/dev-design-start.md:11` and `skills/dev-design-start/SKILL.md` Step 6 both require the DD's six fields to be resolved from **this run's** knowledge resolution, explicitly *not* copied from the analysis. The migrated values are therefore self-description only and are never propagated downstream. Even if this verification were later found wrong, no generated document inherits the error.

**Two alternatives rejected.** *Omit the six fields and leave the document at v2* — defeats convergence and strands the document permanently mid-chain. *Resolve knowledge live at migration time and write real values* — violates the document-internal-evidence rule, makes migration non-reproducible, and would assert that repository knowledge informed a document written before the manifest existed. That is a fabrication, not a migration.

### 8.8 Idempotency

Guaranteed by three independent mechanisms:

1. **Stamp-first short-circuit.** The runner's first action after splitting: if `doc_schema_version` is present and equals the current version, return `{status: "current", changed: false}` — no chain, no serialization, no write, and no message beyond the structured result. The no-op is a true no-op.
2. **Detection never re-runs on a migrated document.** The stamp always wins over the marker ladder, so a migrated document cannot be re-detected as legacy even though its old marker fields are still present (a v3 document still contains `platform` and `design_reference_status`).
3. **Steps are pure.** Because evidence is document-internal only (§8.4), each step is a pure function of the frontmatter it receives, so replaying the chain from any earlier state produces byte-identical output.

Tested directly: migrate → migrate again → the second run reports `changed: false` and the file is byte-identical to the first result.

### 8.9 Backward compatibility

A current document bypasses migration entirely, via mechanism 1 above — before any chain logic is reachable.

One deliberate exception is worth stating plainly: a document already *shaped* as current but written before stamping existed will be detected as current-shaped with an empty chain, and will receive **a one-line write to add the stamp**. That is a write on a document nothing was wrong with. The alternative — treat "detected == current" as a no-op without writing — means those documents never converge and re-enter the detector ladder on every single command run, forever. Converging once, with a one-line reported diff and a byte-identical body, is the better trade. It is called out here because "no-op must truly be no-op" is a stated requirement, and this is the one case where the honest answer is "after the first run."

### 8.10 The helper's CLI contract

```
node --no-warnings scripts/migrate-planning-doc.ts <path> --kind <kind> [--check] [--answers '<json>']
```

`--no-warnings` is part of the canonical invocation, not optional — Node emits an `ExperimentalWarning` on stderr for direct `.ts` execution, and a caller merging stderr into stdout would otherwise be handed non-JSON. This mirrors `scripts/read-repo-knowledge.ts` exactly.

**Always exits 0, always prints one JSON object.** Callers branch on `status`, never on the exit code — the same posture as `read-repo-knowledge.ts` and deliberately *unlike* `resolve-target-repo-root.ts`, because the caller here is a skill that must distinguish six outcomes, and a rich status field does that more reliably than exit codes an LLM must remember.

```jsonc
{
  "path": "...", "kind": "feature-analysis",
  "encoding": "fenced-yaml" | "delimited",
  "detectedVersion": 0, "currentVersion": 3, "stamped": false,
  "status": "current" | "migrated" | "would-migrate" | "needs-input"
          | "unsupported" | "schema-too-new" | "kind-mismatch" | "unreadable",
  "changed": true,
  "steps": [{ "from": 0, "to": 1, "ops": [...] }],
  "questions": [{ "field": "device_type", "reason": "...", "options": ["mobile", "tv"] }],
  "frontmatterDiff": "...",
  "bodySha256": { "before": "...", "after": "..." },
  "summary": "one line for the developer"
}
```

`--check` performs everything except the write (`would-migrate`). `--kind` is required and is cross-checked against the document's marker fields; a mismatch reports `kind-mismatch` rather than running the wrong chain.

### 8.11 Migration metadata written to the document

```yaml
doc_schema_version: 3
migrated_from_version: 0
migrated_at: 2026-08-11
migrated_by: ono-mobile-dev-plugin 0.5.0
migration_inputs: device_type=human@migration, platform=human@migration
```

Flat scalars only — greppable, line-editable, and compatible with the line-oriented frontmatter editor. `migration_inputs` is omitted entirely when nothing was human-answered. Unlike `ono-project-inspector`'s `migrations.history` array, only the most recent run is recorded: these documents are committed to git, so full history already exists somewhere better, and an unbounded array in a reviewed document is noise.

## 9. Versioning strategy

**Where it lives:** `doc_schema_version`, an integer in the document's own frontmatter. In the document because the document is the thing that travels — it can be copied between repositories, and a sidecar or a central registry would desynchronize the moment someone moved a file.

**Numbering:** per document kind, independently. The Feature Analysis is at v3 (four shapes, per §1). The DD, Dev Plan, and Task Breakdown are declared v1 — "the shape as of 0.5.0" — because no migration chain is authored for them (§4.5).

**When it is written:** by the generating command at creation (`/analyze-feature`, `/dev-design-start`, `/dev-feature-start`), and by the runner at the end of a successful migration. Never by hand.

**Who owns it:** `docs/planning-doc-contract.md` declares the current version per kind and what each version means. `scripts/migrate-planning-doc.ts` holds the machine-readable `CURRENT_SCHEMA_VERSION` per kind, and the two must be changed together — the same "duplicated deliberately, changed in the same release" discipline `docs/repo-knowledge-contract.md` already documents for the knowledge contract.

**How it is upgraded:** only by the runner, only as the final operation of a fully successful chain, and only after the body-hash assertion passes. A partially applied chain never stamps.

**Unstamped documents:** resolved by the marker ladder (§8.2). Stamped documents skip detection entirely. A stamp above current is refused, never downgraded.

## 10. Testing strategy

Same conventions as `scripts/read-repo-knowledge.test.ts`: no external framework, self-contained fixtures, run with `node scripts/migrate-planning-doc.test.ts`.

**Chain correctness** — one fixture pair per starting version: v0→v3, v1→v3, v2→v3, and v3 (no-op). Each asserts the full resulting frontmatter, not just the changed fields.

**Body preservation** — for every fixture: `sha256(body_before) === sha256(body_after)`. Plus a fixture whose body deliberately contains `---`, a ` ```yaml ` fence, and trailing whitespace, to prove the splitter does not over-match.

**Idempotency** — migrate, migrate again; assert `changed: false` and byte-identical files.

**True no-op** — a stamped current document produces `status: "current"`, `changed: false`, and an unmodified file mtime-and-bytes.

**Approval preservation** — `status: approved` survives every chain; a synthetic step that attempts to write `status` causes the runner to reject the whole migration and write nothing.

**Operation validation** — `add` on an existing field, `resolve` on a non-`resolvable` field, and `resolve` on a value not in `invalidValues` each abort the run.

**Both encodings** — the same logical document in `fenced-yaml` and `delimited` form migrates to equivalent frontmatter and retains its original encoding.

**`needs-input` paths** — missing `device_type`, `platform: mixed`, and absent `figma_link` each produce `status: "needs-input"`, a populated `questions` array, and **an unmodified file**. A follow-up run with `--answers` completes and stamps.

**Question batching** — a v0 fixture reports all its questions in a single result rather than one per step.

**Refusal paths** — `schema-too-new`, `kind-mismatch`, no recognizable frontmatter, and unparseable frontmatter each report and write nothing.

**CLI contract** — every case above exits 0 and prints parseable JSON; a `--no-warnings`-less invocation is checked to confirm the stderr-merge hazard is real and documented.

**Manual end-to-end (required before release, and explicitly tracked as manual):** run `--check` and then a real `/dev-design-start` against the actual YES+ legacy Feature Analysis that triggered SHARED-011, and confirm the workflow continues automatically without re-approval. The CHANGELOG's 0.4.0 entry sets the precedent of recording an unperformed manual verification honestly rather than implying coverage; the same applies here.

## 11. Rollout plan

Single release, `0.5.0`, in this order:

1. `docs/planning-doc-contract.md` — the contract first, so the implementation has something to conform to.
2. `scripts/migrate-planning-doc.ts` + fixtures + tests. Green before anything else moves.
3. `--check` dry run against the YES+ repository's real legacy documents; review the reported diffs by hand before any writer exists in a command path.
4. `skills/planning-doc-migration/SKILL.md`.
5. Template stamping (four templates) and generator stamping (`/analyze-feature` and the two planning commands).
6. Consumer rewiring: `/dev-design-start` (including deleting the ad-hoc paragraph at line 13), `/dev-feature-start`, `/implement-task`, and their two skills.
7. `README.md`, `CHANGELOG.md`, `plugin.json`.
8. Manual end-to-end against YES+.

No feature flag. The no-op path is the default for every current document, and steps 1–3 complete before any command can write anything. Rollback is a plugin version pin plus `git revert` of the migrated documents in the target repository — which is exactly why the write mode chose git as the undo mechanism.

## 12. Risks

**12.1 Frontmatter encoding ambiguity — highest-likelihood risk.** The templates use fenced YAML; the commands say "frontmatter." Real generated documents may use either. *Mitigation:* support both, preserve the original, refuse anything else, and test both encodings. *Residual:* a document using a third form is refused rather than migrated — a stop, not a corruption.

**12.2 Detection misfires on a hand-edited hybrid.** A partially hand-edited document could satisfy a marker set that does not match its real shape. *Mitigation:* highest-satisfied-marker-set resolution; steps tolerate missing inputs from their own version; `--check` available; the detected version is always reported. *Residual:* low, and bounded — a mis-detection cannot corrupt anything, because no step may modify a pre-existing value or a protected key.

**12.3 Writing to an approved document.** Accepted deliberately (§4.3). *Mitigation:* body-hash assertion, protected-key rejection, add-only operations, reported diff, git as undo, `--check` first during rollout.

**12.4 Ambiguity fatigue on v0 documents.** A v0 Feature Analysis asks for `platform`, `device_type`, and the design-reference outcome. *Mitigation:* dry-run-then-batch (§8.0 step 4) asks all of them once. *Residual:* accepted — these are genuinely unrecoverable facts, and the alternative is guessing.

**12.5 Unmigrated document kinds.** DD, Dev Plan, and Task Breakdown are stamped v1 with no chain, so a pre-0.5.0 document of those kinds is *assumed* current. This is not a regression — it is exactly today's behavior — but it defers work: when the DD contract next changes, its v1→v2 step must be written to tolerate the pre-0.5.0 variants that exist in the wild, and their detector markers must be authored retroactively from git history the way §1 does for the Feature Analysis. This is the honest cost of the scope decision in §4.5 and should be recorded in the contract document, not discovered later.

**12.6 A consumer bypasses the loader.** Nothing structurally prevents a command from reading frontmatter directly. *Mitigation:* delete the ad-hoc tolerance paragraph so no competing instruction remains; state the rule as a hard constraint in the loader skill; keep the consumer list short and enumerated in the contract document. *Residual:* real — this is a prose-enforced boundary, the same class of guarantee as `repo-knowledge-consumer`'s "never parse the manifest yourself," which has held.

**12.7 Two writers on one document.** Migration writes documents that generating commands also write. *Mitigation:* a hard constraint that migration runs only on **load**, never inside a generation step. A command that is about to overwrite a document does not migrate it first.

**12.8 Contract-doc drift.** `CURRENT_SCHEMA_VERSION` in the script and the version table in the contract doc can diverge. *Mitigation:* a test that asserts the script's current versions match the values parsed out of `docs/planning-doc-contract.md` — cheap, and it converts a documentation risk into a failing test.

## 13. Future extensibility

### Adding v4, one year from now

Concretely, when the Feature Analysis contract gains a field:

1. Update `templates/feature-analysis-template.md` and `docs/planning-doc-contract.md` with the new field and a v4 row.
2. Bump `CURRENT_SCHEMA_VERSION["feature-analysis"]` from `3` to `4`.
3. **Append** one entry to the Feature Analysis chain: `{ from: 3, to: 4, ops: [...] }`. Touch no existing step.
4. Confirm v3 has a distinguishing marker for the ladder — it does (`repo_knowledge_status`); a new version only needs one if the *previous* version lacked one.
5. Add one fixture pair (`fa-v3.md` → `fa-v4.md`), plus a `needs-input` fixture if the new field can be ambiguous.
6. `/analyze-feature` stamps `4`.

**No command file changes. No skill changes. No existing migration edited.** That is the property SHARED-011 exists to buy, and step 3's "touch no existing step" is the rule that makes it durable — a step edited after release silently breaks every document that already passed through it.

### Extending to another document kind

Register the kind with its current version, its marker ladder, and its chain. The splitter, runner, op validator, protected keys, body guarantee, and CLI are all kind-agnostic already, so a new kind is data plus fixtures — no framework change. This is what makes the §4.5 scope decision safe to have made.

### What this design deliberately does not support

Stated so a future author does not assume otherwise: **downgrades** (no reason to move a document backward, and it would discard information); **branching version histories** (single-producer, linear evolution — a graph would be added if that ever stopped being true); **body migrations** (§8.5 — a body transformation would be a separate, separately-approved mechanism with its own guarantees, not an extension of this one); and **cross-document migrations** (a change requiring a Feature Analysis and its DD to move together is a workflow concern, not a document-loader concern).

---

## Open decisions

None blocking. Two items deferred deliberately and recorded above rather than resolved here:

- **§12.5** — the detector ladders for DD / Dev Plan / Task Breakdown are not authored in 0.5.0. To be written when those contracts first change, using the same git-history recovery §1 used.
- **§8.7, consequence 2** — the `repo-knowledge-consumer` contract has no `reason` value meaning *"authored before the contract existed."* Not a blocker (the field is body-only prose and the migration writes no body), but it is a real gap in that contract and should be raised with its owner separately from SHARED-011.
