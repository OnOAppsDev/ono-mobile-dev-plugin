# Design Proposal: Adaptive Multi-Stage Detailed Design Generation

## Status

**Proposed**

Deferred until after the YES+ AI Demo.

---

# Background

The current `dev-design-start` command generates a single Detailed Design (DD) document.

Even after improving the methodology, large and technically complex features (such as the Media3 migration) still tend to produce very large DD documents.

The root cause is not only prompt wording but also the fact that a single LLM is expected to simultaneously understand the feature, repository architecture, design decisions, UX behavior, technical architecture, impacted modules, risks, and downstream artifacts.

---

# Current Pipeline

```text
Feature Analysis
        ↓
dev-design-start
        ↓
Single Detailed Design
        ↓
dev-feature-start
        ↓
Task Breakdown
```

---

# Proposed Pipeline

```text
Feature Analysis
        ↓
Complexity Assessment
        ├─ Low / Medium → Single DD
        └─ High → Partitioned DD
                         ↓
                  DD Orchestrator
                         ↓
              Consolidated DD Package
                         ↓
                dev-feature-start
```

---

# Design Goals

- Reduce context size for each generation step
- Improve architectural reasoning quality
- Reduce duplicated information
- Prevent oversized DD documents
- Keep the user workflow unchanged

---

# Partitioned DD Generation

## Foundation

- Overview
- Scope
- Out of Scope
- Assumptions

## Behavior

- User Flows
- Navigation
- UI Behaviour
- Data Flow

## Technical

- Architecture
- Technical Design
- Module Boundaries
- Service Dependencies

## Quality

- Risks
- Open Questions
- Acceptance Mapping
- Definition of Ready

---

# DD Consolidator

Merge generated artifacts into one logical DD package.

## Responsibilities

- Remove duplication
- Resolve contradictions
- Enforce terminology
- Validate cross references
- Execute contraction pass
- Produce the final DD package

---

# Adaptive Generation

The system should automatically determine whether partitioned generation is required based on:

- repository impact
- architectural complexity
- number of affected modules
- user-facing surface area
- expected design size

Small and medium features continue using a single DD.

---

# Integration with dev-feature-start

`dev-feature-start` should consume a DD Package rather than assuming a single DD file.

The package may internally contain multiple documents or a single document while exposing the same logical interface.

---

# Expected Benefits

- Smaller reasoning windows
- Better architectural decisions
- Improved separation of concerns
- Easier review
- Reduced duplication
- Better scalability
- Improved maintainability

---

# Deferred Decision

This proposal is intentionally deferred until after the YES+ AI demonstration.

The current DD improvements are considered sufficient for the demo.

After the demo, this proposal should be evaluated as the next architectural evolution of the design-generation pipeline.
