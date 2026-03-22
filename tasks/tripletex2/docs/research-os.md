# Tripletex2 Research OS

This document defines the durable operator workflow for strategy research in `tripletex2`.

The research OS is intentionally narrow. It exists to make repeated task-by-task strategy iteration inspectable and restartable without depending on chat memory.

Canonical sandbox operations now live in [`docs/sandbox.md`](./sandbox.md). Use `scripts/research_os.ts` for queue / packet / candidate bookkeeping, and `scripts/sandbox.ts` for sandbox reset, setup, inspection, runs, and verification.

For manual research-agent launches:

- packet = canonical context surface
- `research/AGENTS.md` = canonical instruction surface
- `src/tasks/task-XX/RESEARCH.md` = task-local research memory

The packet must be read first. `codex-environment/AGENTS.md` remains classifier-only.

## Durable layers

### 1. Priority queue

- Path: `research/task-queue.json`
- Purpose: durable task ordering plus research readiness
- Key fields: `priority`, `band`, `queueEligibility`, `baselineCallBudget`, `proofInputPath`

Operator commands:

```bash
bun scripts/research_os.ts queue show
bun scripts/research_os.ts queue top --count 3
```

### 2. Context / task packet builder

- Output root: `research/packets/task-XX/`
- Purpose: build one deterministic task packet from checked-in evidence
- Manual-agent role: expose the current score frontier, packet-provided production-run paths, success rubric, verification command, and route-map to deeper evidence
- Inputs:
  - Tripletex2 run artifacts under `runs/`
  - legacy Tripletex1 leaderboard and prompt-label history
  - task-local README / trusted standards / playbooks
  - queue metadata such as proof input and baseline budget

Important constraint:

- Legacy Tripletex1 evidence is offline context only. It must not become live runtime truth.

Operator command:

```bash
bun scripts/research_os.ts packet build --task 06
```

### 3. Sandbox verifier

- Output root: `research/verifications/task-XX/`
- Purpose: canonical clean-room proof loop
- Behavior:
  - run best-effort sandbox cleanup from durable sandbox evidence
  - optionally apply an explicit fixture/setup plan
  - run exactly one challenger strategy through the deterministic runtime
  - inspect resulting Tripletex state through a task-specific verification plan
  - compare observed API calls against the stored baseline budget

Important constraint:

- Do not treat per-strategy unit tests as the primary proof surface. Strategy correctness belongs in sandbox verification.

Canonical operator command shape:

```bash
bun scripts/sandbox.ts verify \
  --task 06 \
  --strategy 06.create-employee.v1 \
  --input-file research/proofs/task-06/task-06-proof-input.json
```

Compatibility wrapper:

```bash
bun scripts/research_os.ts verify \
  --packet <packet-path> \
  --strategy <strategy-id> \
  --input-file <input-json>
```

### 4. Candidate queue

- Path: `research/candidate-strategies.json`
- Purpose: durable store for challengers before live promotion
- Statuses:
  - `draft`
  - `sandbox-pass`
  - `sandbox-fail`
  - `needs-review`
  - `promote-later`

Operator command:

```bash
bun scripts/research_os.ts candidates list --task 06
```

Manual agent briefing can still happen outside this pipeline by handing a packet to an external tool. The canonical sandbox operator surface is `scripts/sandbox.ts`.

The durable manual-launch rule is explicit:

- give the coding agent `research/AGENTS.md`
- give it exactly one packet
- make it inspect the packet's `productionRuns` paths and the actual run folders/scripts for that same canonical task id before proposing changes
- make it inspect and update the task-local `src/tasks/task-XX/RESEARCH.md`
- require it to beat the packet's frontier or explain why no plausible improvement exists

`research_os.ts` remains intentionally limited to queue inspection, packet building, sandbox verification entry, and candidate-state management.

## Task 06 proof path

Task 06 is the proof target for this stack.

1. Build the packet:

```bash
bun scripts/research_os.ts packet build --task 06
```

2. Run the canonical verifier against the Task 06 strategy:

```bash
bun scripts/sandbox.ts verify \
  --task 06 \
  --strategy 06.create-employee.v1 \
  --input-file research/proofs/task-06/task-06-proof-input.json
```

Or use the compatibility wrapper if you already have a packet path:

```bash
bun scripts/research_os.ts verify \
  --packet research/packets/task-06/<packet-file>.json \
  --strategy 06.create-employee.v1 \
  --input-file research/proofs/task-06/task-06-proof-input.json
```

3. Inspect the outputs:

- verification report under `research/verifications/task-06/`
- deterministic artifact under the report’s `artifacts/` directory
- candidate status update in `research/candidate-strategies.json`

If the verifier passes correctness but exceeds the stored budget, the candidate is marked `needs-review` instead of `sandbox-pass`.
