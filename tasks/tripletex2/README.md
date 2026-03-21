# Tripletex2

Tripletex2 is a hybrid runtime for the NM i AI 2026 Tripletex tasks. It combines:

- a Codex-based task-understanding classifier,
- pinned deterministic TypeScript strategies for implemented tasks,
- and a tmux-based Codex fallback for tasks whose active strategy is still `not-implemented`.

This document is meant to be operational, not aspirational. A new agent should be able to read this file, understand the request flow, locate the main extension points, and update `codex-environment/AGENTS.md` safely.

## Request Flow

`POST /solve` enters through [`src/server.ts`](./src/server.ts).

The high-level flow is:

1. The server authenticates the request, enforces concurrency, parses attachments, and assigns a request id.
2. [`src/runtime/solve-pipeline.ts`](./src/runtime/solve-pipeline.ts) resolves task understanding.
3. Task understanding normally runs through [`src/runtime/codex-task-understanding.ts`](./src/runtime/codex-task-understanding.ts), which launches Codex in tmux from `codex-environment/`.
4. Codex reads [`codex-environment/AGENTS.md`](./codex-environment/AGENTS.md), classifies the request, extracts typed fields, and submits the JSON result by running [`codex-environment/submit-classification.ts`](./codex-environment/submit-classification.ts).
5. `submit-classification.ts` POSTs the JSON back to `POST /internal/classify-result?requestId=...`.
6. [`src/runtime/codex-task-understanding-callback.ts`](./src/runtime/codex-task-understanding-callback.ts) resolves the waiting in-memory promise for that request.
7. The solve pipeline validates the classification output, picks the pinned strategy for the task, and either:
   - executes the deterministic strategy in-process, or
   - falls back to the tmux solver when the selected strategy id is still a placeholder.
8. The runtime writes canonical artifacts and stage files under `runs/` and `data/`.

## Classifier Harness

The classifier exists to answer one question: “Which registered Tripletex2 task is this request, and what are the typed input fields for that task?”

The key files are:

- [`src/runtime/codex-task-understanding.ts`](./src/runtime/codex-task-understanding.ts): builds the classification prompt, registers the callback promise, stages a tmux launch script, and parses the returned JSON.
- [`src/runtime/codex-task-understanding-callback.ts`](./src/runtime/codex-task-understanding-callback.ts): one-shot in-memory registry keyed by callback request id.
- [`codex-environment/AGENTS.md`](./codex-environment/AGENTS.md): the classifier’s knowledge base and response contract.
- [`codex-environment/submit-classification.ts`](./codex-environment/submit-classification.ts): the permanent callback entrypoint Codex runs after classifying.

### How the classifier launches Codex

The classifier intentionally uses the same tmux-based Codex invocation style as the fallback solver:

- it launches from `codex-environment/`,
- it runs inside tmux,
- it uses `codex -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen`,
- and it relies on `./AGENTS.md` being readable from the working directory.

The difference from the fallback solver is only the prompt content:

- classifier prompt: read `./AGENTS.md`, classify, extract typed fields, then submit JSON with `bun submit-classification.ts`.
- fallback solver prompt: read `./AGENTS.md`, then solve the full Tripletex task.

### Classification contract

The classifier output schema is fixed:

```json
{
  "status": "resolved | unresolved",
  "taskId": "string | null",
  "inputJson": "stringified object | null",
  "code": "ambiguous-task | no-task-match | missing-required-field | ambiguous-field-value | conflicting-field-values | invalid-field-value | unreadable-file | unsupported-request | null",
  "message": "string | null",
  "partialInputJson": "stringified object | null",
  "notes": ["string"]
}
```

Validation is deliberately split:

- Codex produces a narrow JSON handoff.
- `parseCodexTaskUnderstandingResponse()` validates the JSON envelope and decodes `inputJson` / `partialInputJson`.
- `adaptCodexTaskUnderstandingResult()` validates task ids and allowed fields against the registered task specs.

That means the classifier can be swapped or re-prompted without rewriting deterministic runtime validation.

## Strategy System

Tripletex2 does not execute directly from the classifier result. It routes through the task registry and active strategy selection.

### Registry

- [`src/registry/tasks.ts`](./src/registry/tasks.ts) is the registry root.
- It wires every canonical task id to a `task.ts` module under [`src/tasks/`](./src/tasks).
- `taskSpecs` from the registry are what the classifier sees.
- Task registrations must remain aligned with the canonical ids from [`src/registry/legacy-tripletex1-task-bridge.ts`](./src/registry/legacy-tripletex1-task-bridge.ts).

Each task module defines:

- the task id and task name,
- the required and optional classifier fields,
- the implementation status,
- and one or more strategies exported by that task.

### Active strategy pins

[`configs/active-strategies.json`](./configs/active-strategies.json) is the runtime switchboard.

It pins one `strategyId` per task id. The solve pipeline uses that file to decide which strategy is active for a given task at runtime. This is important because:

- a task can have multiple strategies,
- strategy migrations can be rolled out by changing the config,
- and some tasks still intentionally pin `*.not-implemented.v1` as the active strategy.

The loader and validation logic live in:

- [`src/registry/active-strategy-selection.ts`](./src/registry/active-strategy-selection.ts)
- [`src/runtime/solve-pipeline.ts`](./src/runtime/solve-pipeline.ts)

## Deterministic Execution

If the active strategy for the classified task is implemented, the solve pipeline executes it in-process.

The main pieces are:

- [`src/runtime/solve-pipeline.ts`](./src/runtime/solve-pipeline.ts): orchestration, stage file writing, artifact writing, and fallback decisions.
- [`src/runtime/tripletex-client.ts`](./src/runtime/tripletex-client.ts): Tripletex API client with captured call logs.
- [`src/runtime/run-artifact-writer.ts`](./src/runtime/run-artifact-writer.ts): canonical artifact and sidecar persistence.

Strategies live under task folders such as:

- [`src/tasks/task-08/task.ts`](./src/tasks/task-08/task.ts)
- [`src/tasks/task-08/strategies/`](./src/tasks/task-08/strategies)

The pattern is:

1. classifier resolves task id + typed input,
2. active strategy selection picks one strategy id,
3. the strategy executes a deterministic API sequence,
4. the runtime records canonical outputs and traces.

## tmux Fallback Solver

If the classified task resolves to a pinned strategy that is still `not-implemented`, the server falls back to the tmux solver instead of failing the request.

The tmux solver lives in [`src/runtime/tmux-solve.ts`](./src/runtime/tmux-solve.ts).

Responsibilities:

- stage a full run directory under `data/<storage-mode>/runs/<runId>/`,
- persist attachments, request metadata, prompt text, and a launch script,
- launch Codex in tmux from `codex-environment/`,
- wait for Codex session completion,
- and continue post-run enrichment such as leaderboard/submission attribution.

This fallback is intentionally separate from the classifier:

- classifier returns a validated task understanding result,
- deterministic runtime decides whether the selected strategy can run,
- tmux fallback handles only the full-task solve path for not-yet-implemented strategy pins.

## codex-environment/

[`codex-environment/`](./codex-environment) is the shared working directory for both Codex entrypoints.

Its purpose is to give Codex a stable cwd with:

- [`AGENTS.md`](./codex-environment/AGENTS.md): task-understanding and domain knowledge,
- [`submit-classification.ts`](./codex-environment/submit-classification.ts): callback entrypoint for classifier runs,
- and any future checked-in helper scripts that should be executable from the Codex cwd.

Why this directory exists:

- `codex exec` could not reliably read local files from the repo cwd for the classifier use case.
- tmux-launched Codex can read `./AGENTS.md` normally when started from `codex-environment/`.
- the same environment shape is now used by both the classifier and the full solver fallback.

## How To Add a New Task or Strategy

### Add a new task

1. Create [`src/tasks/task-XX/task.ts`](./src/tasks/_template/task.ts) using the template as a starting point.
2. Define the task spec carefully:
   - `taskId`
   - human name
   - required classifier fields
   - optional classifier fields
   - implementation status
3. Export at least one strategy, even if the first active one is a `not-implemented` placeholder.
4. Register the task in [`src/registry/tasks.ts`](./src/registry/tasks.ts).
5. Keep the canonical mapping aligned with [`src/registry/legacy-tripletex1-task-bridge.ts`](./src/registry/legacy-tripletex1-task-bridge.ts).
6. Update [`codex-environment/AGENTS.md`](./codex-environment/AGENTS.md) task patterns or gotchas if the classifier needs new domain knowledge.
7. Add tests.

### Add or change a strategy

1. Add the strategy file under `src/tasks/task-XX/strategies/`.
2. Export the strategy from that task’s `task.ts`.
3. Give it a stable `strategyId`.
4. Pin it in [`configs/active-strategies.json`](./configs/active-strategies.json) if it should become the active runtime path.
5. Add or update strategy tests.

### Promote a placeholder task to deterministic execution

1. Replace or supplement the `not-implemented` strategy with a real one.
2. Change the task’s implementation status if needed.
3. Update `configs/active-strategies.json` so the active strategy id points at the real implementation.
4. Confirm the task still classifies cleanly through `AGENTS.md`.
5. Run `bun test`.

## Data and Artifacts

By default the runtime writes:

- staging data under `data/<mode>/runs/<runId>/`
- canonical artifacts under `runs/<YYYY-MM-DD>/`

Common staged files include:

- request payloads,
- prompt files,
- launch scripts,
- runtime result files,
- leaderboard/submission enrichment sidecars for tmux runs.

These artifacts matter because they make deterministic runs, tmux fallback runs, and classifier decisions inspectable after the fact.

## Local Development

Start the server:

```bash
TRIPLETEX_STORAGE_MODE=production bun run src/server.ts
```

Run tests:

```bash
bun test
```

If you need external access during development, expose the local port with your tunnel of choice and point the webhook at `/solve`.
