# Tripletex1 vs Tripletex2 Current Solve Flow

Date: 2026-03-21

This report is based on direct code/doc reading in this repo, not prior summaries.

## 1. Concise Architecture Map: tripletex1

### Request entrypoint

- HTTP entrypoint is `Bun.serve(... fetch ...)` in `tasks/tripletex/src/main.ts:2539-2625`.
- Valid requests are parsed as `SolveRequest` in `parseSolveRequest(...)` and handed to `handleSolve(...)` in `tasks/tripletex/src/main.ts:2473-2516`.

### Task understanding / classification / extraction

- There is no explicit pre-runtime classifier/extractor module.
- The whole prompt, attachments, credentials, and a run-local scripts directory are packed into one Codex prompt by `buildCodexPrompt(...)` and written during `prepareRun(...)` in `tasks/tripletex/src/main.ts:1913-2003`.
- Actual task understanding is delegated to the Codex agent through `codex-environment/AGENTS.md`, which tells the agent to parse the task, choose the minimal Tripletex workflow, and use `trusted-standards/`, then `task-playbooks/`, then `openapi.json` (`tasks/tripletex/codex-environment/AGENTS.md:59-81`, `83-137`, `165-205`).
- In practice this means classification, extraction, planning, and execution are fused inside one freeform agent run.

### Execution / runtime strategy

- `prepareRun(...)` stages attachments, `request.json`, `codex-prompt.txt`, `launch-codex.zsh`, and `manifest.json` under `data/<mode>/runs/<runId>/` (`tasks/tripletex/src/main.ts:1913-2003`).
- `launchTmuxRun(...)` starts a tmux window that runs `codex -m gpt-5.4 ... --yolo --no-alt-screen "$(cat "$PROMPT_FILE")"` (`tasks/tripletex/src/main.ts:1901-1909`, `2016-2063`).
- The agent is required to solve by writing and running Bun TypeScript scripts against Tripletex, not by direct freehand HTTP calls (`tasks/tripletex/codex-environment/AGENTS.md:27-30`).
- Completion is detected by matching the Codex session and waiting for a `task_complete` event in `waitForSolveCompletion(...)` (`tasks/tripletex/src/main.ts:2065-2111`).

### Artifacts / logging

- Per-run operational artifacts are rich and tmux/Codex-oriented: `request.json`, `manifest.json`, `launch-codex.zsh`, run-local `scripts/`, plus later `codex-trace.*`, `codex-reflection.*`, `task-attribution.json`, and `submission-score.json`.
- `persistCodexTraceArtifacts(...)` writes `codex-trace.filtered.jsonl`, `codex-trace.snapshot.json`, and `codex-trace.readable.md` (`tasks/tripletex/src/main.ts:1212-1265`).

### Evaluation / attribution

- `attributeRunToLeaderboardTask(...)` polls the public leaderboard, diffs before/after snapshots, infers `tx_task_id`, and writes `task-attribution.json` plus `data/prompt-task-labels.jsonl` (`tasks/tripletex/src/main.ts:2172-2292`).
- `attributeRunToSubmissionScore(...)` polls the submissions endpoint and writes `submission-score.json` with correctness/normalized score when inferable (`tasks/tripletex/src/main.ts:2294-2470`).
- `continuePostRunProcessing(...)` also launches reflection and score-aware reflection passes after the main solve (`tasks/tripletex/src/main.ts:2113-2170`).

### External dependencies

- Hard dependencies: Bun server/runtime, Codex CLI, tmux, local Codex session files, Tripletex API/proxy, leaderboard API, submissions API (`tasks/tripletex/src/main.ts:200-216`, `1901-1909`, `2016-2063`, `2172-2470`).

## 2. Concise Architecture Map: tripletex2

### Request entrypoint

- HTTP entrypoint is `createSolveRequestHandler(...)` / `startSolveServer(...)` in `tasks/tripletex2/src/server.ts:72-310`.
- `server.ts` has two backends:
  - `tmux` for `sandbox` and `competition` modes (`tasks/tripletex2/src/server.ts:77`, `182-237`, `500-504`)
  - `deterministic` for `replay` and `dry-run`, or by explicit override (`tasks/tripletex2/src/server.ts:239-274`, `500-504`)

### Task understanding / classification / extraction

- Deterministic path:
  - `runDeterministicSolvePipeline(...)` resolves task understanding first (`tasks/tripletex2/src/runtime/solve-pipeline.ts:145-199`, `367-419`).
  - Default extractor is `runCodexTaskUnderstanding(...)`, which calls `codex exec` with a JSON schema and the registered `task.ts` surfaces (`tasks/tripletex2/src/runtime/codex-task-understanding.ts:105-133`, `136-167`, `287-425`).
  - `tasks/tripletex2/AGENTS.md` narrows the LLM role to task classification + typed extraction only, explicitly forbidding solve plans and API sequencing (`tasks/tripletex2/AGENTS.md:3-18`, `20-41`).
- Actual competition path today:
  - The default `sandbox` / `competition` server path does not use the deterministic classifier at all; it goes straight to the tmux/Codex agent backend (`tasks/tripletex2/src/server.ts:77`, `182-237`, `500-504`).

### Execution / runtime strategy

- Tmux backend:
  - `runTmuxSolvePipeline(...)` is the extracted tripletex1-style runtime: stage run, launch tmux/Codex, wait for `task_complete`, then write `result.json` (`tasks/tripletex2/src/runtime/tmux-solve.ts:313-548`, `982-1020`).
  - Its prompt still tells Codex to use prose docs first: `./docs/trusted-standards/`, `./docs/task-playbooks/`, and even `../tripletex/codex-environment/openapi.json` (`tasks/tripletex2/src/runtime/tmux-solve.ts:228-285`).
- Deterministic backend:
  - After task understanding, it loads the pinned strategy from the registry/config (`tasks/tripletex2/src/runtime/solve-pipeline.ts:167-199`; `tasks/tripletex2/src/registry/tasks.ts:61-114`; `tasks/tripletex2/src/registry/active-strategy-selection.ts:87-139`).
  - Strategy code runs directly against `TripletexClient` (`tasks/tripletex2/src/runtime/solve-pipeline.ts:202-247`).
  - The one real implemented deterministic task is task `08` (`tasks/tripletex2/src/tasks/task-08/task.ts:24-100`), with two concrete strategy files (`tasks/tripletex2/src/tasks/task-08/strategies/order-then-invoice-send.ts:35-157`, `tasks/tripletex2/src/tasks/task-08/strategies/order-then-invoice-then-send.ts:48-189`).

### Artifacts / logging

- Tmux backend:
  - Writes staged run directories under `data/<storageMode>/runs/<runId>/` with `request.json`, `codex-prompt.txt`, `manifest.json`, `launch-codex.zsh`, attachments, scripts, snapshots, and `result.json` (`tasks/tripletex2/src/runtime/tmux-solve.ts:313-443`, `993-1014`).
  - Unlike tripletex1, its post-run path currently only does submissions polling + leaderboard attribution; there is no Codex trace capture or reflection pass in `tmux-solve.ts` (`tasks/tripletex2/src/runtime/tmux-solve.ts:936-979`).
- Deterministic backend:
  - Writes stage request/result files plus canonical `run-artifact.v1` JSON and a sanitized trace sidecar via `writeCanonicalRunArtifact(...)` (`tasks/tripletex2/src/runtime/solve-pipeline.ts:159-165`, `261-355`).

### Evaluation / attribution

- Tmux backend:
  - `pollAndMatchSubmission(...)` writes `submission-score.json` (`tasks/tripletex2/src/runtime/tmux-solve.ts:1150-1335`).
  - `attributeRunToLeaderboardTask(...)` writes `task-attribution.json` and `prompt-task-labels.jsonl` (`tasks/tripletex2/src/runtime/tmux-solve.ts:820-934`).
- Deterministic backend:
  - Initial artifacts only mark `attribution` / `evaluation` as `pending`, `not-needed`, or `not-available`; there is no live score enrichment path wired into `solve-pipeline.ts` itself (`tasks/tripletex2/src/runtime/solve-pipeline.ts:309-355`).
- Reporting layer:
  - Current combined reports are built from deterministic/native artifacts plus imported legacy tripletex1 outcomes.
  - The current report shows only one task with native runs and only one estimated native solve (`create-and-send-invoice`) (`tasks/tripletex2/reports/task-status.md:10-19`, `35-52`).

### External dependencies

- Tmux backend depends on Bun, Codex CLI, tmux, Codex session files, Tripletex API/proxy, leaderboard API, submissions API (`tasks/tripletex2/src/runtime/tmux-solve.ts:228-310`, `446-548`, `820-1335`).
- Deterministic backend removes tmux from the execution path, but still depends on Codex CLI for default task-understanding unless a custom extractor is injected (`tasks/tripletex2/src/runtime/codex-task-understanding.ts:105-133`, `287-381`).

## 3. Direct Diff: What Is The Same vs Different

### Same

- Both expose `POST /solve` over Bun with bearer auth and concurrency limiting (`tasks/tripletex/src/main.ts:2539-2625`, `tasks/tripletex2/src/server.ts:72-180`).
- Both currently have a tmux/Codex solve path that stages a run dir, launches `codex -m gpt-5.4`, waits for `task_complete`, and returns `{"status":"completed"}` before post-run polling finishes (`tasks/tripletex/src/main.ts:2473-2516`; `tasks/tripletex2/src/server.ts:182-237`; `tasks/tripletex2/src/runtime/tmux-solve.ts:982-1020`).
- Both rely on leaderboard diffing and submissions polling for post-hoc attribution/evaluation of live competition runs (`tasks/tripletex/src/main.ts:2172-2470`; `tasks/tripletex2/src/runtime/tmux-solve.ts:820-1335`).
- Both still depend on Codex CLI + tmux for the path that is actually used in live `sandbox` / `competition` modes (`tasks/tripletex/src/main.ts:1901-1909`, `2016-2063`; `tasks/tripletex2/src/server.ts:500-504`; `tasks/tripletex2/src/runtime/tmux-solve.ts:294-310`, `446-548`).

### Different

- `tripletex1` fuses task understanding, extraction, planning, and execution inside one solving agent guided by prose docs (`tasks/tripletex/codex-environment/AGENTS.md:59-81`, `165-205`).
- `tripletex2` has a real classifier/extractor boundary and deterministic strategy runtime on paper and in code (`tasks/tripletex2/docs/architecture.md:17-30`, `54-68`, `94-126`; `tasks/tripletex2/src/runtime/solve-pipeline.ts:145-355`).
- But `tripletex2` does not use that deterministic path for actual `sandbox` / `competition` requests; it defaults back to tmux/Codex there (`tasks/tripletex2/src/server.ts:77`, `182-237`, `500-504`).
- `tripletex1` captures richer operational evidence on live runs: Codex trace plus reflection and score-aware reflection (`tasks/tripletex/src/main.ts:1212-1265`, `2113-2170`).
- `tripletex2` tmux live path currently skips trace/reflection and only records staging + polling outputs (`tasks/tripletex2/src/runtime/tmux-solve.ts:936-979`, `993-1014`).
- `tripletex2` deterministic artifacts are much better standardized than `tripletex1` run dirs: task id, strategy id, structured input, API-call trace, sidecars (`tasks/tripletex2/src/runtime/solve-pipeline.ts:261-355`).
- `tripletex2` deterministic coverage is still tiny:
  - active config pins one real strategy (`08`) and 17 `not-implemented` stubs (`tasks/tripletex2/configs/active-strategies.json:1-24`)
  - example stub task `01` is marked `implementationStatus: "implemented"` but loads a throwing strategy (`tasks/tripletex2/src/tasks/task-01/task.ts:23-75`; `tasks/tripletex2/src/tasks/task-01/strategies/not-implemented.ts:8-27`)
  - reports say only one task has native runs and only one native estimated solve (`tasks/tripletex2/reports/task-status.md:10-19`, `35-52`)
- `tripletex2` documentation says the old runbook-driven agent is the wrong abstraction, but the live `/solve` backend still uses that style for competition (`tasks/tripletex2/docs/architecture.md:17-30`; `tasks/tripletex2/src/server.ts:182-237`, `500-504`).

## 4. Which Path Is Actually Production-Capable Right Now

The only production-capable path right now is the tmux/Codex agent path.

- In `tripletex1`, that is the whole system (`tasks/tripletex/src/main.ts:2473-2516`).
- In `tripletex2`, that same style is still the real `sandbox` / `competition` backend (`tasks/tripletex2/src/server.ts:182-237`, `500-504`).

The deterministic `tripletex2` path is not production-capable yet.

Why:

- it is not the default live backend for `sandbox` / `competition` (`tasks/tripletex2/src/server.ts:500-504`)
- the active strategy config is mostly stubs (`tasks/tripletex2/configs/active-strategies.json:1-24`)
- only task `08` has real deterministic strategies (`tasks/tripletex2/src/tasks/task-08/task.ts:24-100`)
- current reports show native coverage for only one task (`tasks/tripletex2/reports/task-status.md:17-19`, `52`)

One important nuance: the tmux backend inside `tripletex2` is more production-usable than the deterministic backend, but it still is not the architecture that `tripletex2` claims as its end state.

## 5. Most Important Open Gaps / Risks

1. `tripletex2` live `/solve` path and `tripletex2` architectural north star are still split.
   - Docs say the goal is classifier/extractor + deterministic strategies (`tasks/tripletex2/docs/architecture.md:23-30`, `54-68`, `94-111`).
   - Code still routes live competition traffic to tmux/Codex (`tasks/tripletex2/src/server.ts:182-237`, `500-504`).

2. Deterministic strategy coverage is far from competition-ready.
   - Competition docs say there are 30 task types (`tasks/tripletex/docs/README.md:29-35`).
   - `tripletex2` code registers only tasks `01`-`18` (`tasks/tripletex2/src/registry/tasks.ts:15-32`), and only task `08` has real strategies (`tasks/tripletex2/src/tasks/task-08/task.ts:24-100`; `tasks/tripletex2/configs/active-strategies.json:1-24`).

3. Stub tasks are advertised as implemented enough for extraction, but not for execution.
   - Example: task `01` has `implementationStatus: "implemented"` (`tasks/tripletex2/src/tasks/task-01/task.ts:23-56`) while its selected strategy just throws (`tasks/tripletex2/src/tasks/task-01/strategies/not-implemented.ts:8-27`).
   - That means the deterministic pipeline can classify/extract successfully and still fail immediately at runtime.

4. `tripletex2`'s actual live backend does not currently emit canonical `run-artifact.v1` evidence.
   - The canonical artifact writer is only used by `solve-pipeline.ts` (`tasks/tripletex2/src/runtime/solve-pipeline.ts:319-355`).
   - The live tmux backend only writes staged files plus `result.json` and polling outputs (`tasks/tripletex2/src/runtime/tmux-solve.ts:313-443`, `936-1020`).
   - So production traffic is still operationally logged in one format while research evidence lives in another.

5. `tripletex2` tmux backend has worse live-run introspection than `tripletex1`.
   - `tripletex1` captures Codex trace and reflection passes (`tasks/tripletex/src/main.ts:1212-1265`, `2113-2170`).
   - `tripletex2` tmux post-processing currently stops at submissions + leaderboard polling (`tasks/tripletex2/src/runtime/tmux-solve.ts:936-979`).

6. `tripletex2` deterministic task-understanding still depends on Codex CLI.
   - It narrows the LLM role correctly, but it is not model-free: default extraction is still `codex exec` with a local authenticated CLI install (`tasks/tripletex2/src/runtime/codex-task-understanding.ts:105-133`, `287-381`).

7. `tripletex2` tmux backend still depends on legacy/shared prompt assets.
   - Its tmux prompt points to `./docs/trusted-standards/`, `./docs/task-playbooks/`, but also `../tripletex/codex-environment/openapi.json` (`tasks/tripletex2/src/runtime/tmux-solve.ts:234-248`).
   - So the "new" live path is not yet self-contained.

8. Legacy evidence imported into `tripletex2` is useful but lossy.
   - Imported canonical artifacts do not reconstruct real API-call traces or structured extracted input (`tasks/tripletex2/runs/2026-03-20/run-legacy-tripletex1-prod-2026-03-20-201702224Z-93727a4a.json:28-53`).
   - That is enough for task/status reporting, but not enough for precise deterministic strategy comparison.

## Bottom line

- `tripletex1` is the current real solver: one Codex agent, guided by trusted standards/playbooks/openapi, executed through tmux, with strong live-run operational logging and post-run attribution.
- `tripletex2` is two systems at once:
  - a live tmux solver that is basically a cleaned-up extraction of the old path
  - an experimental deterministic pipeline that has the right shape, but only one genuinely runnable task
- If the question is "what would I trust to submit broadly today?", the answer is the tmux/Codex path, not the deterministic `tripletex2` path.
