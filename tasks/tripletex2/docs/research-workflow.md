# Tripletex2 Research Workflow

## Purpose

This document defines how strategy research should work in `tripletex2`.

The repo is not just a runtime system. It is a search process over candidate strategies for 30 fixed task types. The workflow should make that search deliberate, cumulative, and inspectable.

The durable operator surface for that loop now lives in `docs/research-os.md`, with the concrete sandbox operator commands documented in `docs/sandbox.md`. Use sandbox verification as the canonical proof mechanism for strategies instead of expanding per-strategy unit tests.

## Core idea

We are not trying to make one magical agent that keeps getting vaguely better.

We are trying to do this, repeatedly:

1. choose a task,
2. inspect what strategies already exist for that task,
3. pick one strategy to test,
4. run it in a controlled way,
5. ingest the result as evidence,
6. compare it against alternatives,
7. design the next better strategy.

That loop is the research engine.

## Units of work

The unit of optimization is the task.

The unit of experimentation is the strategy.

The unit of evidence is the run.

Keeping those three units distinct is important.

## Task states

Each task should conceptually be in one of these states:

- `unmapped`: we do not yet have a clear task folder or schema,
- `exploring`: we have some candidate strategies but no strong result,
- `improving`: we have a plausible baseline and are optimizing,
- `solved`: we believe we have reached a perfect score for the task,
- `watching`: solved for now, but still worth revisiting if efficiency benchmarks shift.

A solved task is not sacred forever. But it should drop in priority unless there is evidence that more efficiency headroom remains.

## Active strategy selection

Research should use an explicit active strategy config.

Example shape:

```json
{
  "schemaVersion": "tripletex2.active-strategy-selection.v1",
  "selectionConfigId": "active-strategies-2026-03-20-a",
  "taskStrategies": {
    "task01": "task01.direct-create",
    "task02": "task02.lookup-then-update",
    "task03": "task03.invoice-minimal",
    "task04": "task04.baseline"
  }
}
```

This config means that when the runtime classifies a submission as `task03`, it must run `task03.invoice-minimal`.

This is important because it makes experiments controlled. The LLM should not improvise between multiple strategies for the same task during a measured run.

## Standard loop for one iteration

### Step 1: pick the task intentionally

Choose the task because:

- it is unsolved,
- it is solved but inefficient,
- a new idea has emerged,
- nearby tasks suggest a transferable pattern.

Do not spread effort randomly across all 30 tasks at once unless there is a good reason.

### Step 2: inspect the existing frontier

Before proposing a new strategy, inspect:

- existing strategies for the task,
- run history for those strategies,
- best known score,
- best known API call count,
- failure modes,
- whether correctness or efficiency is the limiting factor.

This prevents duplicate work.

### Step 3: define the next hypothesis

A new strategy should be born from a concrete hypothesis, not from vague optimism.

Good hypotheses:

- “We can remove the customer lookup and create directly.”
- “We can reuse the invoice response instead of reading back the invoice.”
- “We can collapse the order creation and invoice creation path.”
- “We can preserve correctness under a hard budget of three calls.”

Bad hypotheses:

- “Try something smarter.”
- “Maybe Claude will know.”

### Step 4: implement the new strategy as code

The strategy should be added as a new TypeScript file in the task folder under the standardized contract.

Do not overwrite an old strategy just because the new idea feels better. Keep the lineage visible.

### Step 5: select it explicitly

Update the active strategy config so that this task points to the new strategy for the next experiment.

This makes the resulting run interpretable later.

### Step 6: execute the run

Run the submission or replay.

The runtime should:

- classify the task,
- extract structured inputs,
- load the configured strategy for that task,
- execute it,
- emit a run artifact.

### Step 7: ingest the evaluation result

Once scoring or evaluation feedback is available, enrich the canonical run artifact's `evaluation` block and optionally attach sanitized evaluation sidecars with:

- score,
- correctness outcome,
- task tier,
- API-call efficiency clues,
- whether we consider the task solved.

### Step 8: compare and decide next action

After the run, decide whether the strategy is:

- the new best-known baseline,
- a useful alternative but not the best,
- a dead end,
- incomplete because extraction failed,
- limited by correctness rather than efficiency.

Then choose the next move deliberately.

## Ongoing operator loop

The practical operator loop should now be command-driven and anchored on one verified local example: `create-and-send-invoice`.

Use that one-task flow as the default pattern until more tasks have the same level of evidence. The canonical sequence is:

1. add or refine the task surface
2. add a strategy without changing the task-local schema
3. replay one stored request fixture through the real deterministic pipeline
4. derive reports from the resulting canonical artifacts
5. promote the winning strategy by editing the active config
6. smoke the promoted config through `/solve`

### Add a task surface

The repo does not have a generator. Copy the frozen template mechanically:

```bash
cp -R src/tasks/_template src/tasks/task-<slug>
```

Then make the minimum required repo-wide edits:

- replace placeholders in `src/tasks/task-<slug>/task.ts`
- replace the example strategy with at least one real strategy file under `src/tasks/task-<slug>/strategies/`
- return all task-local strategies from `loadTaskModule()`
- register the new `taskRegistration` in `src/registry/tasks.ts`
- pin the task in `configs/active-strategies.json`

The reason to keep this mechanical is simple: future sessions should be able to diff one task folder and one registry entry without guessing where the real surface lives.

### Add a strategy

Adding a strategy is not the same as changing the task surface.

Keep these boundaries fixed:

- same `taskId`
- same `inputSchemaId`
- same field names and meanings
- new `strategyId`
- new strategy file under `strategies/`

For the backbone example, the two comparable strategies are:

- `create-and-send-invoice.order-then-invoice-send.v1`
- `create-and-send-invoice.order-then-invoice-then-send.v1`

This is the right shape for iteration because the task contract stays fixed while only the call graph changes.

### Replay and inspect

The replay harness is the first-line research tool because it exercises the same deterministic runtime and writes the same canonical artifact shape as normal solve runs.

```bash
bun scripts/replay_request_fixture.ts --fixture prod-2026-03-19-202404144Z-b7918145
```

Interpret the outputs as follows:

- `runs/<date>/run-*.json` is the canonical evidence record
- `runs/<date>/run-*.trace.json` is the sanitized API-call sidecar
- `data/replay/runs/<run-id>/request.json` captures the normalized stage request
- `data/replay/runs/<run-id>/result.json` tells you which canonical artifact path was written

When inspecting a replay, verify four things before you move on:

- the task id is the task you intended to test
- the selected `strategyId` is the one you meant to compare
- the API call count matches the expected call profile
- the analysis notes make it clear whether task understanding came from replay metadata, live extraction, or a manual override

### Compare and promote

Strategy comparison should happen in an isolated output root so the experiment is easy to review and regenerate.

```bash
mkdir -p tmp/strategy-compare
bun scripts/replay_request_fixture.ts \
  --fixture prod-2026-03-19-202404144Z-b7918145 \
  --output-root tmp/strategy-compare \
  --selection-config configs/active-strategies.json
bun scripts/replay_request_fixture.ts \
  --fixture prod-2026-03-19-202404144Z-b7918145 \
  --output-root tmp/strategy-compare \
  --selection-config tmp/compare-config.json
node scripts/derive_run_reports.mjs \
  --runs-dir tmp/strategy-compare \
  --reports-dir tmp/strategy-compare/reports
```

Then inspect:

- `tmp/strategy-compare/reports/strategy-comparison.md` for the human summary
- `tmp/strategy-compare/reports/strategy-comparison.json` for exact ranking inputs
- `tmp/strategy-compare/reports/task-frontiers/create-and-send-invoice.json` for the per-task frontier and evidence class

Promotion is a config change, not a code-generation event. Update `configs/active-strategies.json` only after the evidence says the challenger is better. If you promote, also change `selectionConfigId` so the artifact history makes the promotion boundary obvious.

### Smoke `/solve`

The smoke server is the operator check that the current active config still works through the HTTP boundary:

```bash
PORT=3101 API_KEY=smoke-token \
SMOKE_RUN_ID="sandbox-smoke-run-$(date -u +%Y%m%dT%H%M%SZ)" \
  bun scripts/smoke_solve_server.ts
```

Send one request to `/solve`, then inspect:

- the newest `data/sandbox/runs/<run-id>/request.json`
- the newest `data/sandbox/runs/<run-id>/result.json`
- the canonical artifact path referenced by that `result.json`

If this smoke path fails, fix it before doing deeper strategy work. A better strategy is irrelevant if the promoted config no longer runs through the server boundary.

### Honest evidence notes

The current one-task loop is locally verified, not live verified end to end.

- replay runs are fixture-backed; they do not prove live Tripletex sandbox behavior
- smoke runs prove the `/solve` boundary, but they still use fixture task understanding and fixture HTTP responses
- **live sandbox evidence now exists** for `create-and-send-invoice`: on 2026-03-20, the 3-call `order-then-invoice-send.v1` strategy successfully created invoice 2147551798 against the persistent Tripletex sandbox at `kkpqfuj-amager.tripletex.dev/v2` using real Codex task understanding and real API calls
- scored competition feedback is the remaining gap: the current `reports/task-frontiers/create-and-send-invoice.json` still shows `bestVerifiedRun: null` because no competition-scored result has been attributed yet
- a full production claim should still require scored competition feedback recorded back into the canonical artifact

The important upgrade from earlier: we are no longer entirely fixture-backed. The live sandbox canary proves the API shape, auth, and strategy correctness against real Tripletex infrastructure.

## How to ask coding agents for new strategies

When using a coding agent to synthesize a new strategy, do not hand-write a vague brief.

The durable manual-launch surface is:

- packet = context
- `research/AGENTS.md` = instructions
- `src/tasks/task-XX/RESEARCH.md` = task-local memory

The agent should read the packet first, identify the current frontier to beat, inspect the task-local `RESEARCH.md`, and only then touch code.

The request should still be optimization-shaped.

The packet should already include:

- the task definition,
- the existing best strategies,
- the relevant run results,
- the explicit optimization target,
- the verification command,
- hard constraints such as call budget or forbidden extra reads,
- routes to `openapi.json`, task-local files, and offline evidence.

Examples:

- “Compare these two Task 12 strategies and propose a third that preserves correctness with at most 3 API calls.”
- “Task 4 is already correct at 6 calls. Find a 4-call variant. Inspect the current strategy and run history before proposing changes.”
- “Use the best parts of these two Task 9 strategies, but remove the redundant verification GET.”

That is much better than saying “make the agent better.”

## Strategy promotion policy

A strategy becomes the preferred baseline for a task when it has the strongest available evidence, not merely the prettiest code.

Preferred should mean something like:

- best score so far,
- or equal score with fewer calls,
- or equal score and calls with simpler or more reliable behavior.

Promotion should be based on evidence in run logs.

## Strategy retirement policy

A strategy should be retired or superseded when:

- it is clearly dominated by another strategy,
- it encodes a bad assumption that has been disproven,
- it is only kept for historical reference.

Retirement should not mean deletion. Keep the artifact of the idea unless it was junk.

## Solved tasks

When a task reaches a perfect score, the default behavior should be:

- mark it solved,
- lower its priority,
- preserve the winning strategy and evidence,
- only revisit it if we have a credible path to better efficiency or if benchmarks change.

The point is to stop wasting attention on already conquered ground.

## Cross-task reuse

Standardization should make transfer easier.

When two tasks share structural patterns, we should be able to say:

- this strategy pattern already worked for customer creation,
- this order-to-invoice pattern already worked elsewhere,
- this direct-create-without-lookup idea is portable,
- this verification step is probably unnecessary across a whole family of tasks.

Cross-task reuse is a major benefit, but it should be grounded in explicit strategy structure, not vague intuition.

## What to persist after each research session

A good research session should leave behind:

- new or refined strategy code,
- updated active strategy config if relevant,
- at least one run artifact or a clear note about why no run happened,
- updated derived task summaries,
- an updated project memory summary when the decision affects future sessions.

If a session ends with only chat messages and no durable artifacts, it has not fully paid off.

## Failure analysis

When a strategy underperforms, diagnose the failure in the right bucket.

Was it:

- wrong task classification,
- bad slot extraction,
- correct task but wrong call graph,
- unnecessary reads hurting efficiency,
- avoidable 4xx errors,
- missing prerequisite creation,
- misunderstanding of the evaluator?

This matters because the next action depends on the failure class.

## Success condition for the workflow

The workflow is healthy if a future session can open the repo cold and quickly answer:

- what each task currently uses,
- which tasks are solved,
- which tasks are the highest-value open problems,
- what strategies have already been tried,
- what the next promising optimization step is.

If that answer still depends on oral tradition from old chats, the workflow needs tightening.
