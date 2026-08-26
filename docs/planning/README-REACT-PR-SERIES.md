# README — the React lane PR series (REACT-001 → 002 → 003)

**Read this before reviewing any of the three React PRs.** It explains what each one
contains, the order they must merge in, and one honest defect in how the history is
partitioned that reviewers need to know about up front.

## The three PRs

| # | Branch | Delivers | Merge target |
|---|---|---|---|
| 1 | `feat/react-001-standards` | **REACT-001** — the six React (web) standards. 111 `REACT-*` rules, lane ID skeleton frozen 2026-08-16. | `main` |
| 2 | `feat/react-002-agents-skills` | **REACT-002** — four React agents and three React skills. Thin agent / thick skill, mirroring the RN and Android lanes. | `main`, after #1 |
| 3 | `feat/react-003-smart-tv` | **REACT-003** — Smart TV via `device_type: tv`. A seventh standard, `react-smart-tv.md`, adding 54 `REACT-TV-*` rules. Plus the REACT-002 review fixes (see below). | `main`, after #2 |

They are **stacked**: each branch contains all commits of the ones before it. Merge them
in order. Until #1 merges, #2's diff against `main` will also show #1's files; that
resolves itself as each lands.

**165 React rules total** (111 base + 54 TV). Repository-first and framework-neutral
throughout — no assumed bundler, framework, router, state or data library.

## The partitioning defect, stated plainly

**PR #2 does not contain REACT-002's own review fixes. PR #3 does.**

The three epics were authored as one continuous chain, and the work did not happen in
epic order. The commit that fixes REACT-002's independent adversarial review
(`2a75e92`) lands *after* all of REACT-003, because that review was run late — and its
fixes add nine `REACT-TV-*` citations, rules that only exist because of REACT-003.

So the cut points are forced:

- Cutting PR #2 to include its fixes would pull REACT-003 in with them, collapsing #2
  and #3 into one PR.
- Cutting PR #2 where it is ships the **pre-review** version of the agents and skills.
  Those fixes then arrive, correctly, inside PR #3.

**Consequence for reviewers:** PR #2 is a real, self-consistent, mergeable state — every
ID it cites resolves, and no file references anything absent from its tree. But it is
**not the reviewed version of REACT-002**. Do not treat #2's agents and skills as the
final text, and do not re-file findings against #2 that #3 already fixes; the
`docs/planning/REACT-002-independent-review-findings.md` record (added in #3) is the
authoritative list of what was found and closed.

**Why this was not fixed by rewriting history:** reordering would rebase roughly twenty
commits and force the `REACT-TV-*` citations to conflict in exactly the files the review
had just corrected — reopening the class of defect the review closed, in exchange for a
tidier log. The entanglement is disclosed here and in each PR description instead.

## Review records

Each epic carries an adversarial review with its findings fixed. The REACT-002 and
REACT-003 reviews were run by independent agents and are recorded in:

- `docs/planning/REACT-002-independent-review-findings.md` (~55 findings)
- `docs/planning/REACT-003-independent-review-findings.md` (~45 findings)

Both land in PR #3, since both records postdate REACT-003 in the chain.
`docs/planning/BORIS-REACT-TASKS.md` holds the plan, the progress log, and the lane-wide
decisions that must not be re-decided.

## Known gap, recorded not resolved

Testing and logging have **no `REACT-TEST-*` / `REACT-LOG-*` family**, so a test-quality
or logging defect fits none of the review filing gate's four categories and cannot be
filed at all. iOS has `IOS-ARCH-TEST-*`; Android has both families. Both React skills
state this explicitly and forbid inventing an ID — authoring those families would add IDs
to a frozen lane and is a separate standards decision, not something to settle inside
this series.

## Not yet done

**Nobody has run this plugin on a real React feature.** Every review examined the
instructions; none examined an outcome. One end-to-end dry run on a real React repository
would be worth more than another review pass.

## One benign forward reference, so an ID check does not alarm you

`standards/react/react-coding-standards.md` illustrates the **ID format** with a list of
example shapes that includes `REACT-TV-FOCUS-1`. In PRs #1 and #2 that rule does not yet
exist — `react-smart-tv.md` arrives in #3 — so an automated "every cited ID resolves"
sweep will report it as missing.

It is not a citation. It is one item in a parenthesised list of ID *shapes* demonstrating
the `REACT-` prefix convention, and nothing branches on it. The text is frozen REACT-001
content and is identical in all three PRs, so it has deliberately **not** been edited to
make the sweep quiet — changing frozen standards text to satisfy a checker would be the
wrong trade. Everything else resolves in every PR.
