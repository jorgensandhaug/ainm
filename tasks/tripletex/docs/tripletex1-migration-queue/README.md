# Tripletex1 Migration Queue

## Purpose

This folder is a **non-live proposal queue** for improving the Tripletex1 markdown prompt system.

It exists to import **net-new, evidence-backed insights** from `tasks/tripletex2/` into Tripletex1 **without editing the live runtime prompt surface directly**.

The live Tripletex1 control surface remains:

- `tasks/tripletex/codex-environment/AGENTS.md`
- `tasks/tripletex/codex-environment/trusted-standards/*.md`
- `tasks/tripletex/codex-environment/task-playbooks/*.md`

This queue is for humans and review agents. It is **not** read by the Tripletex1 runtime.

## Hard rules

1. **Do not edit `codex-environment/` from this queue workflow.**
2. Only write proposal docs inside this folder unless explicitly told otherwise.
3. Import only **new** insights that Tripletex1 does not already contain.
4. Prefer **proved / verified** findings over speculative theories.
5. If task identity or mapping is ambiguous, say so explicitly instead of guessing.
6. Cite concrete source files whenever possible.

## Folder contract

- One file per task:
  - `task-06.md`
  - `task-11.md`
  - `task-23.md`
  - etc.
- Each task file should only cover that task's proposed Tripletex1 markdown improvements.
- To avoid merge conflicts in parallel waves, each agent should own a disjoint set of task files.

## Required structure for each task file

Use this structure unless there is a strong reason not to:

```md
# Task XX — <short label>

## Snapshot
- Tripletex1 current best score:
- Priority:
- Target Tripletex1 surface:
- Source Tripletex2 materials reviewed:

## Current Tripletex1 coverage
- What AGENTS / trusted standard / playbook already says
- Important gaps, contradictions, or stale guidance

## Candidate imports from Tripletex2
### Import 1
- Insight:
- Why it seems new:
- Evidence:
- Confidence:

### Import 2
- Insight:
- Why it seems new:
- Evidence:
- Confidence:

## Proposed markdown deltas
### AGENTS.md
- Proposed addition/change:
- Reason:

### Trusted standard
- Target file:
- Proposed addition/change:
- Reason:

### Playbook
- Target file:
- Proposed addition/change:
- Reason:

## Risks / caveats
- Mapping ambiguity:
- Conflicting evidence:
- Not safe to port yet:

## Recommendation
- Adopt now / hold / needs verification
- Short rationale
```

## Review standard

A proposal is useful only if it answers all of these:

- **Is it new?**
- **Is it true?**
- **Where should it land in Tripletex1?**
- **Why would it improve score or reduce errors?**
- **What should a human avoid blindly copying?**

## Evidence standard

Strong evidence:

- verified `RESEARCH.md` conclusions
- strategy files that encode a clearer workflow
- packet artifacts with proof notes / verification summaries
- production or sandbox findings with stable conclusions

Weak evidence:

- one-off speculation
- stale notes contradicted later
- strategy drafts without proof

If evidence is weak, mark it clearly.

## Suggested workflow for migration agents

1. Read the current Tripletex1 markdown for the assigned task.
2. Read the relevant Tripletex2 research and strategy artifacts.
3. Compare them for **net-new** guidance only.
4. Write a proposal file in this folder.
5. Do **not** modify live Tripletex1 runtime files.

## Parallelism rule

Parallel agents should not touch the same queue file.

Good:
- one agent writes `task-23.md`
- another writes `task-29.md`

Bad:
- two agents both editing `task-23.md`
- every agent touching a shared index file

The orchestrator should own any shared summary or consolidation step.

## Status model

Suggested status words inside task files:

- `draft`
- `review-ready`
- `blocked`
- `superseded`
- `applied-by-human`

## Scope reminder

This folder is a **migration queue**, not a dumping ground.

The goal is not to mirror all Tripletex2 lore.
The goal is to produce a **small, high-signal, human-reviewable backlog of markdown improvements** for Tripletex1.
