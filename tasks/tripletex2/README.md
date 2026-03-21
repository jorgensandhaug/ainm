# Tripletex 2

Deterministic Tripletex accounting agent for NM i AI 2026.

## Quick Start

```bash
# Run the server
TRIPLETEX_STORAGE_MODE=production bun run src/server.ts

# Expose via ngrok
ngrok http 3000

# Webhook URL: https://<ngrok-id>.ngrok-free.dev/solve
```

## Architecture

```
POST /solve → classify (Codex/AGENTS.md) → extract typed input
  → deterministic strategy (tasks 01-18): execute in-process
  → not-implemented strategy (tasks 19-30): Codex tmux fallback
  → log run artifact + trace sidecar
  → leaderboard polling for task attribution
```

### How it works

1. **Classify**: Codex reads the prompt and identifies which of the 29 tasks it is
2. **Extract**: Codex extracts typed input fields (org number, names, amounts, etc.)
3. **Execute**: If a real strategy exists, runs deterministically via TypeScript. If not, falls through to Codex tmux solver
4. **Log**: Writes canonical run artifacts under `data/<mode>/runs/<runId>/`

## Task Coverage

- **18/29 tasks have deterministic strategies** (01-18) — fast, reliable, ~2-5s
- **11/29 tasks are Tier 3 placeholders** (19-23, 25-30) — Codex tmux fallback, ~90s

## Key Files

| File | Purpose |
|------|---------|
| `src/server.ts` | HTTP server, routing, concurrency |
| `src/runtime/solve-pipeline.ts` | Classify → strategy → execute orchestration |
| `src/runtime/tmux-solve.ts` | Codex tmux fallback for unimplemented tasks |
| `src/runtime/tripletex-client.ts` | Thin API client with call capture |
| `src/registry/legacy-tripletex1-task-bridge.ts` | Canonical 29-task registry |
| `src/registry/tasks.ts` | Task loading and wiring |
| `configs/active-strategies.json` | Pinned strategy per task |
| `codex-environment/AGENTS.md` | Classifier contract for task understanding |
| `src/tasks/task-XX/` | Per-task folder with task.ts + strategies/ |

## Strategy Contract

Each strategy file exports `const strategy: TaskStrategy`:

```typescript
export const strategy: TaskStrategy = {
  strategyId: "08.order-then-invoice-send.v1",
  async execute(ctx) {
    // Deterministic API call sequence
    const customer = await ctx.fetch("GET", "/customer?organizationNumber=...");
    const invoice = await ctx.fetch("POST", "/invoice", { body: {...} });
    return { status: "completed", apiCallsMade: 2, artifacts: {} };
  }
};
```

## Reference Material

- `research/legacy/trusted-standards/` — Tripletex1 reference flows (endpoint patterns, field requirements)
- `research/legacy/task-playbooks/` — Tripletex1 broader task-flow references
- `docs/architecture.md` — System model and north star
- `docs/strategy-contract.md` — Strategy standardization spec

## Testing

```bash
bun test  # 63 tests across 16 files
```
