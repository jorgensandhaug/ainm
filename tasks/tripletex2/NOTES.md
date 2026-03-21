# NOTES

## TODO Spec — unify live tmux/Codex runs with canonical tripletex2 strategy evidence

### Why this exists

`tripletex2` already has the right conceptual architecture for the research loop we want:

- Codex-in-tmux does the fuzzy front-end work
- a run should ultimately resolve to a task
- strategies should be comparable per task
- scores should accumulate into a searchable optimization history

But today the live tmux path and the canonical run-artifact/reporting path are still partially split.

The deterministic path already writes canonical `tripletex2.run-artifact.v1` records with:

- `task.taskId`
- `strategy.strategyId`
- selection metadata
- execution trace
- evaluation / attribution slots

The live tmux path already captures:

- request/run staging
- Codex session linkage
- leaderboard before/after
- submission before/after
- inferred task attribution
- inferred submission score

The missing bridge is that a **live tmux/Codex solve does not yet reliably collapse into one canonical record that says:**

- which task Codex actually resolved
- which concrete strategy/variant was used
- what score/correctness it achieved
- what evidence supports that conclusion

That is the load-bearing gap.

---

## Desired end state

After every live `sandbox` or `competition` tmux/Codex solve, the system should emit a canonical `tripletex2.run-artifact.v1` artifact that is rich enough for strategy optimization work.

The canonical object for a live run should let us answer questions like:

- "task 15, strategy 3 scored 2 — what should we optimize next?"
- "show me all strategies tried for task 15"
- "which strategy currently leads for task 15?"
- "spawn a new coding agent to improve the current leader or challenger"

The point is **not** to remove Codex from execution.
The point is to force live agentic execution to crystallize into durable structured evidence.

---

## Architectural position

### Keep

- Codex-in-tmux as the live task-understanding / execution engine
- LLM-driven task resolution from prompt + files
- LLM freedom to choose/instantiate the concrete solve path when needed
- post-run leaderboard/submission polling and attribution

### Add / tighten

- first-class strategy identity for live tmux runs
- canonical artifact emission for live tmux runs
- canonical ingestion of attribution + score into the same artifact
- reporting that treats live runs as first-class optimization evidence rather than side data

### Non-goal

Do **not** force the live system into a deterministic-only execution model if that weakens the actual competition solve path.

The north star is:

> let Codex do the fuzzy task-understanding / execution work, but make every run durable as a task/strategy/evidence record so strategy search becomes systematic.

---

## Current state summary

### Already true

- deterministic path writes canonical run artifacts
- deterministic artifacts support task + strategy + evaluation fields
- report derivation already ranks strategies by task from canonical artifacts
- tmux path already captures leaderboard/submission evidence and Codex session linkage

### Not yet true

- live tmux path does not currently guarantee canonical `run-artifact.v1` emission
- live tmux path does not currently expose first-class `strategyId` in the canonical research loop
- live score / attribution data is stored in side files, but not fully joined into one canonical artifact consumed by reports

---

## Required capabilities

### 1. First-class live strategy identity

For every live tmux/Codex solve, record a stable strategy identity.

Open design question:

- if the strategy comes from a checked-in strategy file, record that `strategyId`
- if Codex synthesizes or mutates a strategy on the fly, mint a durable run-scoped or promoted strategy identity that still allows lineage tracking

Minimum requirement:

A future session must be able to distinguish:

- task 15 / strategy 1
- task 15 / strategy 2
- task 15 / strategy 3

rather than seeing only “a Codex run happened”.

### 2. Canonical artifact for live tmux runs

After tmux solve completion and post-run polling, emit one canonical `tripletex2.run-artifact.v1` artifact for the live run.

That artifact should include at least:

- run identity
- mode (`sandbox` / `competition`)
- declared task id and/or attributed task id
- strategy id / strategy lineage id
- request fingerprint
- execution status
- any available normalized call summary
- score / correctness / solved status when available
- attribution evidence pointers
- evaluation evidence pointers
- linkage back to the tmux/Codex session and run dir via sidecars or analysis notes

### 3. Merge live evidence into reports

`derive_run_reports` should be able to consume live-run canonical artifacts the same way it consumes deterministic artifacts.

That means live runs should participate in:

- task frontiers
- best strategy per task
- open-task prioritization
- “optimize the current leader/challenger” workflows

### 4. Agent-optimization handoff

Once task + strategy + score are canonical, the next workflow should become first-class:

- identify current best or challenger strategy for a task
- spawn coding agent with prior strategy evidence
- ask it to improve under explicit constraints
- run again
- record new evidence

This is the actual strategy optimization loop.

---

## Concrete implementation work

### A. Decide how live strategy identity is surfaced

Need a concrete mechanism for tmux/Codex runs to declare:

- resolved `taskId`
- concrete `strategyId`
- optional parent/derived-from strategy lineage

Possible implementation directions:

1. **Codex writes a small structured metadata file in the run dir**
   - e.g. `strategy-selection.json` or `solve-decision.json`
   - includes `taskId`, `strategyId`, optional `parentStrategyId`, optional notes

2. **Codex emits a strict machine-readable trailer in session output**
   - post-processed into run metadata

3. **Wrapper script / contract file**
   - Codex must update a known JSON file as part of the run contract

Constraint:

The strategy identity must be durable and parseable without reading whole chat transcripts.

### B. Add canonical live-artifact writer

Implement a bridge after tmux completion + attribution + scoring that writes a canonical `tripletex2.run-artifact.v1` for live runs.

Potential shape:

- stage 1: tmux run produces raw operational files under `data/.../runs/<runId>/`
- stage 2: post-processing resolves task attribution + submission score
- stage 3: canonicalizer writes `runs/YYYY-MM-DD/run-<runId>.json`
- stage 4: optional sidecars reference raw operational evidence safely

### C. Normalize score + attribution into canonical fields

Map existing tmux files into canonical artifact fields:

- `task-attribution.json` -> `artifact.attribution`
- `submission-score.json` -> `artifact.evaluation`
- Codex/tmux metadata -> `artifact.analysis` or sidecars
- normalized API summary if recoverable -> `artifact.execution.apiCalls` or sidecar note

Important rule:

If some fields are unavailable for live runs, record that honestly rather than silently omitting the run from the research system.

### D. Make strategy lineage explicit

Need a way to support both:

- checked-in reusable strategies
- Codex-generated experimental variants

Suggested minimum metadata:

- `strategyId`
- `strategyStatus`
- `strategyPath` if checked in
- optional `parentStrategyId`
- optional `generationMode` (`checked-in`, `generated`, `mutated`, `promoted`)

This does not need to over-engineer versioning, but it must support iteration history.

### E. Verify report compatibility

After canonical live-artifact writing lands, verify that report derivation can answer:

- which strategies have been tried for task X
- which one currently leads
- which evidence is direct vs estimated
- what the next optimization target is

---

## Acceptance tests

The work is done when all of the following are true.

### Test 1 — live run becomes canonical

Run one real tmux/Codex solve.

Expected:

- tmux operational files are written
- post-run attribution / score files are written
- a canonical `tripletex2.run-artifact.v1` is written for the same run

### Test 2 — task/strategy/score is queryable

For a known run, we should be able to answer with one canonical artifact:

- task id
- strategy id
- score / correctness
- runtime status
- artifact path

### Test 3 — reports see the live run

After running report derivation, the live run should affect:

- task status
- strategy comparison
- task frontier

### Test 4 — optimization handoff is possible

Given a task with at least two canonical strategies, a future coding agent prompt should be able to say:

> Improve strategy 3 for task 15. It scored 2. Inspect its prior evidence and propose a better challenger.

without requiring oral context from Discord history.

---

## Suggested first milestone

If we want to do this incrementally, the first milestone should be:

1. make tmux runs emit machine-readable `taskId` + `strategyId`
2. write one canonical artifact for tmux runs using existing score/attribution files
3. confirm those artifacts show up in derived reports

That gets the whole optimization loop onto one spine fast.

---

## One-sentence summary

`tripletex2` should keep Codex/tmux for live solving, but every live run must collapse into a canonical task/strategy/score artifact so strategy optimization becomes a real system instead of a pile of successful sessions.
