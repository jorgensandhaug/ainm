# Tripletex2

Tripletex2 is the current NM i AI 2026 Tripletex runtime and research surface.

The current interpretation is:

- task understanding is **LLM-driven**, not deterministic,
- the classifier must reason over the **full canonical 30-task universe**,
- deterministic behavior begins **after** task understanding hands off one typed task input,
- live routing may exclude already-perfect / otherwise non-eligible tasks **after** truthful classification,
- old prompt labels, old solution prompts, and legacy playbooks are **offline research evidence**, not live runtime truth,
- checked-in strategies are the preferred production surface; tmux full-solve fallback still exists in code, but it is no longer the architectural center.

This README is operational. A new agent should be able to read it, understand the request flow, find the main extension points, and update the live classifier or runtime safely.

## Current Interpretation

### 1) Classifier truth vs live selection policy

These are two different layers and must never be conflated.

**Canonical semantic truth**
- The classifier sees the full canonical Tripletex2 task universe.
- Its first interpretation is the best semantic reading of the prompt.
- Perfect-score tasks stay in the universe as real targets and negative anchors.

**Live selection policy**
- After classification, runtime may reject a task because it is already perfect or otherwise non-eligible.
- That policy lives in [`configs/non-eligible-task-policy.json`](./configs/non-eligible-task-policy.json).
- Rejection does **not** mean the original interpretation was false.
- Runtime then re-prompts the classifier over the remaining canonical task ids until either:
  - an eligible task is found, or
  - the finite task universe is exhausted.

### 2) One-task / one-strategy interface

At every classifier attempt, the contract is still:
- return **one** task id,
- return **one** typed `inputJson` for that task,
- hand off only the **final accepted** task to strategy selection and execution.

No ranked lists. No multi-task payloads. No leaking fields from rejected interpretations into the final strategy input.

### 3) Prompt-corpus doctrine

Legacy prompt corpora from older Tripletex solutions are useful for:
- offline semantic routing research,
- corpus seeding,
- evaluation,
- and strategy development.

They are **not** live runtime truth.

The live classifier should rely on:
- [`codex-environment/AGENTS.md`](./codex-environment/AGENTS.md),
- registered canonical task specs under [`src/tasks/`](./src/tasks),
- and runtime retry context injected by the solve pipeline.

### 4) Legacy label hazard

The old corpus under `tasks/tripletex/data/prompt-task-labels.jsonl` uses a legacy task-id namespace that does **not** align with canonical Tripletex2 ids.

Confirmed examples:
- old `01 →` canonical `06`
- old `02 →` canonical `01`
- old `03 →` canonical `04`
- old `04 →` canonical `02`
- old `14 →` canonical `10`
- old `17 →` canonical `07`

Do **not** train or reason from raw legacy `tx_task_id` values without semantic remapping.

## Request Flow

`POST /solve` enters through [`src/server.ts`](./src/server.ts).

High-level flow:

1. The server authenticates the request, enforces concurrency, parses attachments, and assigns a request id.
2. [`src/runtime/solve-pipeline.ts`](./src/runtime/solve-pipeline.ts) resolves task understanding.
3. Task understanding normally runs through [`src/runtime/codex-task-understanding.ts`](./src/runtime/codex-task-understanding.ts), which launches Codex in tmux from [`codex-environment/`](./codex-environment/).
4. Codex reads [`codex-environment/AGENTS.md`](./codex-environment/AGENTS.md), classifies the request, extracts typed fields, and submits the JSON result by running [`codex-environment/submit-classification.ts`](./codex-environment/submit-classification.ts).
5. `submit-classification.ts` POSTs the result back to `POST /internal/classify-result?requestId=...`.
6. [`src/runtime/codex-task-understanding-callback.ts`](./src/runtime/codex-task-understanding-callback.ts) resolves the waiting in-memory promise for that request.
7. The solve pipeline validates the classification output against canonical task specs.
8. If the chosen task id is listed in [`configs/non-eligible-task-policy.json`](./configs/non-eligible-task-policy.json), runtime injects retry context and re-runs classification over the remaining canonical ids.
9. Once runtime has a final accepted task id, it selects the pinned strategy from [`configs/active-strategies.json`](./configs/active-strategies.json).
10. It either:
   - executes the deterministic strategy in-process, or
   - falls back to the tmux full-solve path when the active strategy pin is still `not-implemented`.
11. The runtime writes canonical artifacts, traces, retry/reflection sidecars, and stage files under `runs/` and `data/`.

## Classifier Harness

The classifier exists to answer one question:

> Which registered Tripletex2 task is this request, and what are the typed input fields for that task?

Key files:

- [`src/runtime/codex-task-understanding.ts`](./src/runtime/codex-task-understanding.ts): builds the classification prompt, registers the callback promise, stages the tmux launch, and parses the returned JSON.
- [`src/runtime/codex-task-understanding-callback.ts`](./src/runtime/codex-task-understanding-callback.ts): one-shot in-memory registry keyed by callback request id.
- [`codex-environment/AGENTS.md`](./codex-environment/AGENTS.md): the live classifier contract and semantic routing guide.
- [`prompts/classifier.md`](./prompts/classifier.md): wrapper prompt used when launching Codex.
- [`codex-environment/submit-classification.ts`](./codex-environment/submit-classification.ts): permanent callback entrypoint the classifier runs after classifying.

### How the classifier launches Codex

The classifier intentionally uses the same tmux-based invocation style as the full solver path:

- launches from `codex-environment/`,
- runs inside tmux,
- uses Codex with the configured model,
- relies on `./AGENTS.md` being readable from the working directory.

The important difference from the solver path is the prompt contract:

- **classifier**: read `./AGENTS.md`, classify one task, extract typed input, submit JSON. The classifier prompt also receives staged attachment metadata and on-disk attachment paths under the run directory, so Codex can inspect the original PDF or other file directly when needed.
- **solver fallback**: solve the full Tripletex task.

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

Validation is intentionally split:

- Codex produces the narrow JSON handoff.
- `parseCodexTaskUnderstandingResponse()` validates the JSON envelope and decodes `inputJson` / `partialInputJson`.
- `adaptCodexTaskUnderstandingResult()` validates task ids and allowed fields against the registered task specs.

That means the live routing prompt can evolve without weakening deterministic runtime validation.

## Exhaustive Non-Eligible Retry Policy

The non-eligible retry layer is additive. It does not replace task understanding; it constrains later attempts.

Source of truth:
- [`configs/non-eligible-task-policy.json`](./configs/non-eligible-task-policy.json)
- [`src/runtime/non-eligible-task-policy.ts`](./src/runtime/non-eligible-task-policy.ts)

Behavior:

1. Attempt 1 classifies over the full canonical task universe.
2. If the chosen task id is eligible, runtime accepts it.
3. If it is non-eligible, runtime adds it to the exclusion set and retries.
4. Retry context tells Codex:
   - which canonical ids are excluded,
   - which canonical ids remain,
   - that excluded ids are still semantically real,
   - and that it must choose a **different** remaining task id.
5. Runtime keeps retrying until:
   - an eligible task is accepted, or
   - every canonical task id has been exhausted.

Additional rules:
- There is **no small arbitrary retry cap**.
- An `unresolved` response after rejection is treated as invalid while canonical task ids still remain.
- Only the final accepted task reaches strategy execution.
- Retry chains are logged in trace/reflection sidecars and summarized in server logs.

## Live Classifier Instructions

The live classifier contract now lives primarily in [`codex-environment/AGENTS.md`](./codex-environment/AGENTS.md).

That file now encodes:
- canonical-id-only routing,
- the retry contract,
- the legacy label hazard,
- a family router,
- and the strongest contrastive cues for the high-confusion clusters.

If you change routing behavior, update `AGENTS.md` deliberately. The live classifier should not depend on old task playbooks or trusted standards being present in the Codex cwd.

## Semantic Routing Research

Wave-1 routing research now lives under [`research/semantic-routing/`](./research/semantic-routing/).

Important artifacts:

- [`research/semantic-routing/corpus-audit.md`](./research/semantic-routing/corpus-audit.md)
- [`research/semantic-routing/canonical-prompt-inventory.jsonl`](./research/semantic-routing/canonical-prompt-inventory.jsonl)
- [`research/semantic-routing/corpus-gaps.md`](./research/semantic-routing/corpus-gaps.md)
- [`research/semantic-routing/task-cards.md`](./research/semantic-routing/task-cards.md)
- [`research/semantic-routing/family-map.md`](./research/semantic-routing/family-map.md)
- [`research/semantic-routing/classifier-template.md`](./research/semantic-routing/classifier-template.md)
- [`research/semantic-routing/contrastive-routing.md`](./research/semantic-routing/contrastive-routing.md)
- [`research/semantic-routing/abstention-policy.md`](./research/semantic-routing/abstention-policy.md)
- [`research/semantic-routing/false-friends.md`](./research/semantic-routing/false-friends.md)
- [`research/semantic-routing/retry-routing.md`](./research/semantic-routing/retry-routing.md)

How to use them:
- use them to improve `AGENTS.md`,
- use them to audit routing mistakes,
- use them to grow a clean canonical corpus,
- do **not** treat them as live runtime task labels by themselves.

Canonical doctrine from these artifacts:
- attempt 1 is the canonical semantic truth,
- later retries are runtime policy choices,
- solved/non-eligible tasks remain in the semantic universe,
- forced retries must never contaminate corpus/training as if they were ground truth.

## Strategy System

Tripletex2 does not execute directly from the classifier result. It routes through the task registry and active strategy selection.

### Registry

- [`src/registry/tasks.ts`](./src/registry/tasks.ts) is the registry root.
- It wires each canonical task id to a `task.ts` module under [`src/tasks/`](./src/tasks).
- `taskSpecs` from the registry are what the classifier sees.
- Task registrations must stay aligned with canonical ids and the legacy bridge expectations in [`src/registry/legacy-tripletex1-task-bridge.ts`](./src/registry/legacy-tripletex1-task-bridge.ts).

Each task module defines:
- task id and name,
- required and optional classifier fields,
- implementation status,
- one or more strategies.

### Active strategy pins

[`configs/active-strategies.json`](./configs/active-strategies.json) is the runtime switchboard.

It pins one `strategyId` per task id. The solve pipeline uses that file to decide which strategy is active at runtime.

This matters because:
- a task can have multiple strategies,
- promotions can be rolled out by config change,
- and some tasks still intentionally pin `*.not-implemented.v1`.

Loader + validation logic live in:
- [`src/registry/active-strategy-selection.ts`](./src/registry/active-strategy-selection.ts)
- [`src/runtime/solve-pipeline.ts`](./src/runtime/solve-pipeline.ts)

## Deterministic Execution

If the active strategy for the final accepted task is implemented, the solve pipeline executes it in-process.

Main pieces:

- [`src/runtime/solve-pipeline.ts`](./src/runtime/solve-pipeline.ts): orchestration, retry loop, selection, artifact writing.
- [`src/runtime/tripletex-client.ts`](./src/runtime/tripletex-client.ts): Tripletex API client with captured call logs.
- [`src/runtime/run-artifact-writer.ts`](./src/runtime/run-artifact-writer.ts): canonical artifact + sidecar persistence.

Pattern:

1. classifier resolves task id + typed input,
2. runtime may apply the non-eligible retry layer,
3. active strategy selection picks one strategy id,
4. the strategy executes a deterministic API sequence,
5. runtime records canonical outputs and traces.

## tmux Full-Solve Fallback

The codebase still contains a tmux full-solve fallback in [`src/runtime/tmux-solve.ts`](./src/runtime/tmux-solve.ts).

Current interpretation:
- it is a **compatibility path**, not the architectural center,
- it exists for task ids whose active strategy pin is still placeholder / not implemented,
- the preferred long-term surface is checked-in strategy routing plus explicit research/promotion.

Responsibilities of the fallback path:
- stage full run directories under `data/<storage-mode>/runs/<runId>/`,
- persist attachments, prompt text, request metadata, and launch scripts,
- launch Codex in tmux from `codex-environment/`,
- continue post-run enrichment such as leaderboard/submission attribution.

## Research OS

Tripletex2 is also the durable operator surface for strategy research.

The current research loop is:

1. maintain a prioritized queue of tasks worth improving,
2. build one task packet per target task from historical runs, scores, failure modes, and sandbox evidence,
3. run exactly one challenger after a best-effort sandbox cleanup,
4. judge it by resulting Tripletex state plus `apiCallCount` against a known baseline budget,
5. store promising challengers in the candidate queue instead of promoting them immediately.

See:
- [`docs/research-os.md`](./docs/research-os.md)
- [`docs/sandbox.md`](./docs/sandbox.md)
- [`docs/research-workflow.md`](./docs/research-workflow.md)
- [`docs/strategy-contract.md`](./docs/strategy-contract.md)

Important constraints:
- sandbox verification is the canonical proof surface for strategies,
- per-strategy unit tests are useful but not the main correctness mechanism,
- the research OS itself does not launch or manage external agents,
- candidate strategies should stay out of live pins until deliberately promoted.

For manual coding-agent launches, the durable interface is:

- packet = context surface
- [`research/AGENTS.md`](./research/AGENTS.md) = instruction surface

Do not reuse [`codex-environment/AGENTS.md`](./codex-environment/AGENTS.md) for research strategy work. That file remains classifier-only.

## Sandbox CLI

[`scripts/sandbox.ts`](./scripts/sandbox.ts) is now the canonical sandbox interface.

Use it to:

- clean the sandbox with best-effort evidence-driven cleanup,
- apply deterministic fixture/setup plans,
- run one strategy in sandbox mode,
- verify one strategy against live sandbox state,
- inspect or mutate the sandbox directly with explicit requests.

Core commands:

```bash
bun scripts/sandbox.ts reset
bun scripts/sandbox.ts apply --plan research/sandbox/plans/example-three-employees.json
bun scripts/sandbox.ts run --task 06 --strategy 06.create-employee.v1 --input-file research/proofs/task-06/task-06-proof-input.json
bun scripts/sandbox.ts verify --task 06 --strategy 06.create-employee.v1 --input-file research/proofs/task-06/task-06-proof-input.json
bun scripts/sandbox.ts inspect get /employee/123 --query fields=*
```

The old `scripts/reset_research_sandbox.ts` and `scripts/research_os.ts verify` entrypoints still work, but they are compatibility paths. New operator flows and agent instructions should start from [`docs/sandbox.md`](./docs/sandbox.md).

## How To Update the Classifier Safely

When changing semantic routing:

1. Update the research artifacts first if the change is semantic, not just wording.
2. Preserve the separation between:
   - canonical semantic truth,
   - and live non-eligible retry policy.
3. Update [`codex-environment/AGENTS.md`](./codex-environment/AGENTS.md).
4. Keep ids canonical-only.
5. Never teach the live classifier from raw old `tx_task_id` labels.
6. Re-run the focused runtime tests:

```bash
bun test tasks/tripletex2/src/server.test.ts \
  tasks/tripletex2/src/runtime/codex-task-understanding.test.ts \
  tasks/tripletex2/src/runtime/non-eligible-task-policy.test.ts \
  tasks/tripletex2/src/runtime/solve-pipeline.test.ts
```

If you changed broader runtime/research plumbing, also run:

```bash
bun test tasks/tripletex2/src/**/*.test.ts
```

## How To Add a New Task or Strategy

### Add a new task

1. Create [`src/tasks/task-XX/task.ts`](./src/tasks/_template/task.ts).
2. Define the task spec carefully:
   - `taskId`
   - human name
   - required fields
   - optional fields
   - implementation status
3. Export at least one strategy, even if it is initially `not-implemented`.
4. Register the task in [`src/registry/tasks.ts`](./src/registry/tasks.ts).
5. Keep the canonical mapping aligned with [`src/registry/legacy-tripletex1-task-bridge.ts`](./src/registry/legacy-tripletex1-task-bridge.ts).
6. Update [`codex-environment/AGENTS.md`](./codex-environment/AGENTS.md) if the classifier needs new domain knowledge.
7. If the task changes routing semantics materially, update the relevant files in [`research/semantic-routing/`](./research/semantic-routing/).

### Add or change a strategy

1. Add the strategy file under `src/tasks/task-XX/strategies/`.
2. Export the strategy from that task’s `task.ts`.
3. Give it a stable `strategyId`.
4. If it is experimental, store it in the research candidate queue instead of pinning it live immediately.
5. Verify it in the clean sandbox.
6. Only then consider promoting it in [`configs/active-strategies.json`](./configs/active-strategies.json).

### Promote a placeholder task to deterministic execution

1. Replace or supplement the placeholder strategy.
2. Update implementation status if needed.
3. Change the active pin in [`configs/active-strategies.json`](./configs/active-strategies.json).
4. Confirm the task still classifies cleanly through [`codex-environment/AGENTS.md`](./codex-environment/AGENTS.md).
5. Run the relevant verification path and runtime tests.

## Data and Artifacts

By default the runtime writes:
- staging data under `data/<mode>/runs/<runId>/`
- canonical artifacts under `runs/<YYYY-MM-DD>/`

Important artifact categories:
- request payloads,
- prompt files,
- launch scripts,
- runtime result files,
- retry/reflection sidecars,
- leaderboard/submission enrichment for tmux runs,
- semantic routing research under `research/semantic-routing/`.

These matter because they keep classifier decisions, retries, deterministic execution, fallback runs, and strategy-research decisions inspectable after the fact.

Deterministic runs now stage attachments under the same `attachments/NN-filename` convention as tmux runs. The staged `request.json` may include a per-file `path`, and `textContent` is only preserved for genuinely textual attachments. Binary inputs such as PDFs keep their raw bytes and staged path, but do not get synthetic UTF-8 `textContent`.

## Local Development

Start the server:

```bash
TRIPLETEX_STORAGE_MODE=production bun run src/server.ts
```

Focused runtime tests:

```bash
bun test tasks/tripletex2/src/server.test.ts \
  tasks/tripletex2/src/runtime/codex-task-understanding.test.ts \
  tasks/tripletex2/src/runtime/non-eligible-task-policy.test.ts \
  tasks/tripletex2/src/runtime/solve-pipeline.test.ts
```

Full source test sweep:

```bash
bun test tasks/tripletex2/src/**/*.test.ts
```

If you need external access during development, expose the local port with your tunnel of choice and point the webhook at `/solve`.
