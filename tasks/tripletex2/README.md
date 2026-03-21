# Tripletex 2

`tripletex2` is the current working environment for the NM i AI Tripletex task.

This repo is not oriented around building a flexible accounting agent. It is oriented around finding the best-known solution for each of the 30 fixed Tripletex task types.

The core architectural move is to treat each task as a strategy optimization problem:

1. classify the submission into one of the 30 tasks,
2. extract the task-specific structured inputs,
3. execute a deterministic strategy implementation for that task,
4. record the run as evidence,
5. compare strategies and iterate.

## Read these first

- `docs/architecture.md` — the north star and system model
- `docs/strategy-contract.md` — what a strategy is and how it must be standardized
- `codex-environment/trusted-standards/` — copied Tripletex1 low-risk reference flows for strategy implementation
- `codex-environment/task-playbooks/` — copied Tripletex1 broader task-flow references for strategy work
- `docs/run-log-spec.md` — canonical run evidence format
- `docs/research-workflow.md` — how strategy search and iteration should work

If a future session needs the big picture fast, start with `docs/architecture.md`.

## Competition frame

The competition sends us a JSON payload with:

- `prompt`
- optional `files`
- `tripletex_credentials` containing a per-run proxy `base_url` and `session_token`

We must expose an HTTPS `POST /solve` endpoint, complete the accounting task inside a fresh Tripletex sandbox account, and return:

```json
{"status":"completed"}
```

Important constraints:

- 30 task types
- 56 variants per task (7 languages × 8 data sets)
- 5 minute timeout
- Tripletex v2 API via authenticated proxy
- scoring based on correctness first, then efficiency bonus
- best score per task is what matters

That is why deterministic per-task strategies are the center of gravity.

## Current status (2026-03-20)

- **Live sandbox verified** for `create-and-send-invoice` (3-call strategy, invoice 2147551798)
- **30/30 tests green**
- **Codex/`codex-environment/AGENTS.md` task understanding** wired into the real solve pipeline
- **`POST /solve` endpoint** with bearer auth, concurrency limiting, request-id logging, run staging, canonical artifact + trace sidecar writing
- **Two deterministic strategies** for `create-and-send-invoice` (3-call auto-send vs 4-call explicit-send)
- **Replay harness**, **strategy comparison tooling**, and **combined live/native reporting** all operational
- **Operator workflow documented** in this README and `docs/research-workflow.md`
- **18 registered tasks** with typed task-understanding surfaces wired into the deterministic runtime

## Current source material

- `train_requests/` — flattened request corpus used for prompt analysis and replay shape understanding
- `docs/` — the canonical architectural and process doctrine for this repo
- `codex-environment/` — Codex runtime assets for task understanding (`AGENTS.md`) plus `openapi.json`, trusted standards, and playbooks
- `scripts/` — importers, replay harness, reporting CLI, and smoke tools
- `src/` — the deterministic runtime, task registry, strategies, and `/solve` server
- `configs/` — active strategy selection configs
- `runs/` — canonical append-only run artifacts
- `reports/` — derived task status, strategy comparison, and open-tasks reports
- `data/` — mutable per-run staging (request snapshots, result pointers)

## Repository shape

```text
tripletex2/
  codex-environment/         # Codex tmux cwd and prompt reference material
    AGENTS.md                # Codex scenario knowledge + task-understanding contract
    openapi.json             # Runtime-only Tripletex API spec (gitignored)
    trusted-standards/       # Low-risk reference flows copied from Tripletex1
    task-playbooks/          # Broader task-flow references copied from Tripletex1
  docs/                      # Canonical architecture and process doctrine
  src/
    server.ts                # POST /solve endpoint (auth, concurrency, staging)
    runtime/                 # Solve pipeline, task understanding, artifact writer, Tripletex client
    registry/                # Task registry, active strategy selection
    tasks/
      task-create-and-send-invoice/   # First implemented task (live-verified)
      _template/                      # Frozen copyable scaffold for new tasks
  configs/
    active-strategies.json            # Pinned strategy per implemented task
    # Create additional configs for A/B comparison runs as needed
  runs/                      # Canonical append-only run artifacts + trace sidecars
  reports/                   # Derived task-status, strategy-comparison, open-tasks
  data/                      # Mutable per-run staging (request.json, result.json)
  scripts/                   # Replay harness, reporting CLI, smoke server, importers
  train_requests/            # Raw stored request corpus from production
```

## Practical takeaway

When working in this repo, do not ask “how do we make the agent smarter in general?”

Ask:

- what task is this,
- what is the current best strategy for that task,
- what evidence do we have,
- what is the next better candidate under explicit constraints.

## Replay Loop

For the current local development loop, replay one stored request fixture through the real solve pipeline:

```bash
bun scripts/replay_request_fixture.ts --list
bun scripts/replay_request_fixture.ts --fixture prod-2026-03-19-202404144Z-b7918145
```

The replay harness reads the raw request from `train_requests/`, runs `runCompetitionSolvePipeline(...)`, and writes canonical artifacts under `runs/<date>/`.

Current limitation: only fixtures with explicit replay metadata are runnable. The harness states that metadata source explicitly in the artifact notes instead of pretending the raw corpus already contains task labels or structured inputs.

To compare two strategies locally against the same fixture, create a temporary alternate config and run both:

```bash
mkdir -p tmp/strategy-compare

# Run with the active (promoted) config
bun scripts/replay_request_fixture.ts \
  --fixture prod-2026-03-19-202404144Z-b7918145 \
  --output-root tmp/strategy-compare \
  --selection-config configs/active-strategies.json

# Create a temporary config pointing at the challenger strategy, then run it
cat configs/active-strategies.json | \
  jq '.selectionConfigId = "compare-explicit-send" | .taskStrategies["create-and-send-invoice"] = "create-and-send-invoice.order-then-invoice-then-send.v1"' \
  > tmp/compare-config.json
bun scripts/replay_request_fixture.ts \
  --fixture prod-2026-03-19-202404144Z-b7918145 \
  --output-root tmp/strategy-compare \
  --selection-config tmp/compare-config.json

# Derive comparison reports
node scripts/derive_run_reports.mjs \
  --runs-dir tmp/strategy-compare \
  --reports-dir tmp/strategy-compare/reports
```

## Operator Workflow

The current operator workflow is intentionally centered on one verified local loop: `create-and-send-invoice` plus one stored replay fixture. Use that path as the backbone example until more tasks have the same evidence level.

### 1. Add a new task surface

Start from the frozen task template, then register the task explicitly.

```bash
cp -R src/tasks/_template src/tasks/task-<slug>
sed -n '1,220p' src/tasks/task-<slug>/task.ts
sed -n '1,220p' src/tasks/_template/README.md
sed -n '1,220p' src/registry/tasks.ts
```

Required edits:

- rename the folder to `src/tasks/task-<slug>/`
- replace the placeholder ids, task name, signature, required fields, and field descriptions in `task.ts`
- replace `strategies/example-strategy.ts` with at least one real deterministic strategy file
- export every task-local strategy from `loadTaskModule()` in `task.ts`
- import the new `taskRegistration` into `src/registry/tasks.ts` and add it to `implementedTaskRegistrations`
- pin the implemented task in `configs/active-strategies.json`, because the active config must cover every implemented task

Use `src/tasks/task-create-and-send-invoice/` as the reference implementation for the current frozen shape.

### 2. Add a new strategy

Keep the task surface fixed and add a new strategy file under the same task.

```bash
sed -n '1,220p' src/tasks/task-create-and-send-invoice/task.ts
sed -n '1,260p' src/tasks/task-create-and-send-invoice/strategies/order-then-invoice-send.ts
sed -n '1,260p' src/tasks/task-create-and-send-invoice/strategies/order-then-invoice-then-send.ts
sed -n '1,220p' configs/active-strategies.json
```

Rules that matter in practice:

- do not change the task-local input shape when adding a strategy
- give the strategy a new `strategyId`; do not overwrite the old idea in place
- add the new strategy import to `loadTaskModule()`
- keep `configs/active-strategies.json` as the promoted winner and use a second config file when you want an apples-to-apples comparison run

The repo already includes two comparable candidates for the one-task example:

- `create-and-send-invoice.order-then-invoice-send.v1`
- `create-and-send-invoice.order-then-invoice-then-send.v1`

### 3. Replay and inspect artifacts

Use the stored replay harness first. It runs the real deterministic pipeline and writes the same canonical artifact shape as `/solve`.

```bash
bun scripts/replay_request_fixture.ts --list
bun scripts/replay_request_fixture.ts \
  --fixture prod-2026-03-19-202404144Z-b7918145
```

Inspect the resulting evidence in two places:

```bash
find runs -maxdepth 2 | rg 'prod-2026-03-19-202404144Z-b7918145|create-and-send-invoice|replay'
find data/replay -maxdepth 3 -type f | tail -n 10
```

- `runs/<date>/run-*.json` is the canonical append-only artifact for comparison and reporting
- `runs/<date>/run-*.trace.json` is the sanitized Tripletex API trace sidecar
- `data/replay/runs/<run-id>/request.json` and `result.json` are the stage files that point at the canonical artifact path

### 4. Compare strategies and promote a winner

Run both strategies against the same replay fixture, then derive reports from only that experiment directory.

```bash
mkdir -p tmp/strategy-compare
bun scripts/replay_request_fixture.ts \
  --fixture prod-2026-03-19-202404144Z-b7918145 \
  --output-root tmp/strategy-compare \
  --selection-config configs/active-strategies.json
cat configs/active-strategies.json | \
  jq '.selectionConfigId = "compare-challenger" | .taskStrategies["create-and-send-invoice"] = "create-and-send-invoice.order-then-invoice-then-send.v1"' \
  > tmp/compare-config.json
bun scripts/replay_request_fixture.ts \
  --fixture prod-2026-03-19-202404144Z-b7918145 \
  --output-root tmp/strategy-compare \
  --selection-config tmp/compare-config.json
node scripts/derive_run_reports.mjs \
  --runs-dir tmp/strategy-compare \
  --reports-dir tmp/strategy-compare/reports
cat tmp/strategy-compare/reports/strategy-comparison.md
cat tmp/strategy-compare/reports/task-frontiers/create-and-send-invoice.json
```

Promotion is manual and should stay manual:

- read `tmp/strategy-compare/reports/strategy-comparison.md` for the ranked summary
- inspect `tmp/strategy-compare/reports/task-frontiers/create-and-send-invoice.json` when you need the exact run frontier and evidence class
- if the challenger is clearly better, update `configs/active-strategies.json` to point at that `strategyId`
- change `selectionConfigId` when promoting, then rerun the replay and report derivation so the promoted config has fresh evidence

### 5. Smoke the active config through `/solve`

Use the smoke server when you want to exercise the HTTP boundary with the current active strategy config.

Terminal 1:

```bash
PORT=3101 API_KEY=smoke-token \
  bun scripts/smoke_solve_server.ts
```

Terminal 2:

```bash
curl -s -X POST http://127.0.0.1:3101/solve \
  -H 'Authorization: Bearer smoke-token' \
  -H 'Content-Type: application/json' \
  --data-binary @<(cat <<'JSON'
{
  "prompt": "Opprett og send en faktura til kunden Nordhav AS (org.nr 876520427) på 7850 kr eksklusiv MVA. Fakturaen gjelder Analyserapport.",
  "files": [],
  "tripletex_credentials": {
    "base_url": "https://example.invalid",
    "session_token": "redacted-for-smoke",
    "credential_source": "fixture"
  }
}
JSON
)
```

Then inspect what the server wrote:

```bash
find data/sandbox/runs -maxdepth 2 -name 'result.json' | sort | tail -n 1 | xargs sed -n '1,200p'
find runs -maxdepth 2 | rg 'sandbox-smoke-run'
```

This smoke path matters because it proves that `/solve`, auth, staging, selection config loading, deterministic execution, and canonical artifact writing still work together.

### 6. Evidence levels

The system now has three distinct evidence tiers:

**Tier 1 — Local fixture-backed (replay + smoke)**
- replay evidence is local-only: `scripts/replay_request_fixture.ts` injects fixture task understanding and fixture-scoped Tripletex HTTP responses
- smoke evidence is local-only: `scripts/smoke_solve_server.ts` exercises `/solve` but uses fixture data
- useful for wiring proof and deterministic strategy proof

**Tier 2 — Live sandbox (achieved for `create-and-send-invoice`)**
- on 2026-03-20, the `order-then-invoice-send.v1` strategy successfully created invoice 2147551798 against the persistent Tripletex sandbox at `kkpqfuj-amager.tripletex.dev/v2`
- the full pipeline ran: Codex task understanding → deterministic strategy → real Tripletex API calls → canonical artifact + trace sidecar
- this is the strongest evidence level we currently have

**Tier 3 — Scored competition feedback (not yet achieved)**
- requires a real competition proxy submission with post-run attribution and evaluation enrichment
- this is the remaining gap before claiming full production readiness

Practical rule: treat replay as wiring proof, live sandbox as API-shape proof, and scored competition feedback as the only evidence strong enough to claim the task is truly solved.

## Task-Understanding Loop

The default solve pipeline now uses a Codex/`codex-environment/AGENTS.md` task-understanding handoff before deterministic strategy execution. You can probe that boundary directly with:

```bash
bun scripts/run_codex_task_understanding_sample.ts
bun scripts/run_codex_task_understanding_sample.ts "Opprett og send en faktura til kunden Nordhav AS ..."
```

This path requires a local `codex` CLI install plus valid Codex authentication.
.
