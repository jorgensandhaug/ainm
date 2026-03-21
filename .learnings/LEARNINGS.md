## [LRN-20260321-001] correction

**Logged**: 2026-03-21T19:27:00Z
**Priority**: high
**Status**: pending
**Area**: backend

### Summary
Tripletex sandbox strategy iteration should be challenger-centric, not baseline-comparison- or promotion-centric.

### Details
User corrected the proposed workflow. The desired recurring loop is: keep task surface fixed, allow many unpromoted candidate strategies, restore a clean sandbox, run the challenger alone, judge success on correctness plus API-call count, and compare the challenger's call count against the known baseline budget without requiring a fresh baseline rerun or promotion ceremony. Legacy sandbox scripts are valuable as live probes and reset helpers, but the workflow definition should center on clean-sandbox challenger verification rather than config promotion or two-strategy compare reports.

### Suggested Action
When discussing Tripletex strategy iteration, default to: reset sandbox -> pin challenger locally/ephemerally -> run challenger in clean sandbox -> inspect achieved state and apiCallCount -> compare against known baseline call count -> only then consider whether to keep or discard the strategy. Do not frame comparison reports or promotion as required parts of the main loop.

### Metadata
- Source: conversation
- Related Files: tasks/tripletex/src/reset-sandbox.ts, tasks/tripletex/scripts/sandbox-task11-investigate.ts, tasks/tripletex2/docs/research-workflow.md
- Tags: tripletex, sandbox, strategy-iteration, correction

---
## [LRN-20260321-002] beads dependency direction

**Logged**: 2026-03-21T19:47:00Z
**Priority**: medium
**Status**: pending
**Area**: tooling/beads

`br dep add <issue> <depends-on>` means the first issue depends on the second. For umbrella planning, use `br dep add <feature> <subtask>`, not the reverse. Reversing it makes subtasks blocked by the umbrella and prevents moving them to in_progress.

---
## [LRN-20260321-003] Tripletex strategy verification must be sandbox-first

**Logged**: 2026-03-21T20:00:00Z
**Priority**: high
**Status**: pending
**Area**: tripletex

Anders explicitly corrected the workflow: for Tripletex strategy work, the sandbox is the test. Do not drift into writing per-strategy unit tests as the main verification mode. The canonical verification surface is the clean-sandbox challenger verifier plus end-state inspection and API-call-count judgment.

**Operational rule:** only add local tests for shared research-OS plumbing when they materially protect non-sandbox logic; do not treat task strategy unit tests as the default deliverable.

---
