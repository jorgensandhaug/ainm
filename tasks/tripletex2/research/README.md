# Tripletex2 Research Directory

This folder is the durable operator surface for strategy research.

Use it to continue task-by-task iteration without depending on chat history.

For manual coding-agent launches, use:

- packet = canonical context surface
- `research/AGENTS.md` = canonical instruction surface
- `src/tasks/task-XX/RESEARCH.md` = task-local research memory surface

The agent should read the packet first, then follow `research/AGENTS.md`, and write durable task-state updates back into the task-local `RESEARCH.md`.

## Workflow

The intended research loop is:

1. Start from the prioritized task queue in `task-queue.json`.
2. Build a packet for one task with `bun scripts/research_os.ts packet build --task <NN>`.
3. Use that packet as the working source of truth for context, current frontier, and sandbox verification.
4. Verify exactly one challenger in a freshly reset sandbox with `bun scripts/research_os.ts verify ...`.
5. Let the verifier update `candidate-strategies.json` with the latest sandbox result.
6. Review successful candidates before promoting anything into `../configs/active-strategies.json`.

## Ground Rules

- The sandbox verifier is the canonical proof surface for strategies.
- Do not spend time expanding per-strategy unit tests as the main correctness path.
- Legacy Tripletex1 material in this repo is offline research evidence only, not live runtime truth.
- Keep experimental strategies out of the live active-strategy config until they survive sandbox verification and deliberate review.
- Prefer additive history: packets, verification reports, and candidate statuses should accumulate as durable evidence.

## Key Files And Folders

- `task-queue.json`
  - prioritized tasks, launch eligibility, baseline budgets, proof-input pointers
- `candidate-strategies.json`
  - durable candidate queue with statuses such as `draft`, `sandbox-pass`, `sandbox-fail`, `needs-review`, and `promote-later`
- `proofs/`
  - checked-in proof inputs for canonical verification paths
- `packets/task-XX/`
  - generated task packets assembled from task docs, run artifacts, queue metadata, and legacy evidence
- `verifications/task-XX/`
  - sandbox verification reports plus deterministic run artifacts for challengers
- `legacy/`
  - offline Tripletex1 research material and prior notes

## Operator Commands

Show the queue:

```bash
bun scripts/research_os.ts queue show
bun scripts/research_os.ts queue top --count 3
```

Build a packet:

```bash
bun scripts/research_os.ts packet build --task 06
```

Verify a challenger:

```bash
bun scripts/research_os.ts verify \
  --packet <packet-path> \
  --strategy <strategy-id> \
  --input-file <input-json>
```

Inspect the candidate queue:

```bash
bun scripts/research_os.ts candidates list --task 06
```

## Task 06 Proof Path

Task 06 is the proof target for the research OS.

1. Build the packet:

```bash
bun scripts/research_os.ts packet build --task 06
```

2. Verify the current deterministic strategy:

```bash
bun scripts/research_os.ts verify \
  --packet research/packets/task-06/<packet-file>.json \
  --strategy 06.create-employee.v1 \
  --input-file research/proofs/task-06/task-06-proof-input.json
```

3. Inspect:

- the verification report under `verifications/task-06/`
- the deterministic run artifact linked from that report
- the updated candidate status in `candidate-strategies.json`

If a challenger is correct but exceeds the stored baseline call budget, it should land in `needs-review` rather than `sandbox-pass`.

## External Manual Use

`research_os.ts` does not launch or manage agents. Manual launches are still explicit and human-driven:

1. build one packet,
2. point the coding agent at `research/AGENTS.md`,
3. hand it that packet,
4. require it to read the packet first and beat the packet's documented frontier,
5. verify the resulting challenger with the packet's `bun scripts/research_os.ts verify ...` command.
