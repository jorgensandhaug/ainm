# Task Override Bank

Pre-written `TASK_OVERRIDE.md` files for selective task execution in Tripletex1.

## How it works

1. **Gate line** (add to top of `codex-environment/AGENTS.md` once):
   ```
   **TASK OVERRIDE**: If `./TASK_OVERRIDE.md` exists, read it FIRST and follow it exclusively. The task is already identified — skip classification. If the incoming prompt clearly does not match the override, say so and stop.
   ```

2. **Deploy an override**: copy the desired file into `codex-environment/`:
   ```bash
   cp docs/task-override-bank/task-30.md tasks/tripletex/codex-environment/TASK_OVERRIDE.md
   ```

3. **Clear override** (return to normal classification):
   ```bash
   rm tasks/tripletex/codex-environment/TASK_OVERRIDE.md
   ```

## Available overrides

| File | Task | Current score | Max | Gap | Notes |
|------|------|--------------|-----|-----|-------|
| `task-30.md` | Simplified year-end closing | 1.8 | 6 | 4.2 | Module activation hypothesis untested |
| `task-23.md` | Bank statement reconciliation | 0.6 | 6 | 5.4 | Pre-built script, full 9-step flow |
| `task-29.md` | Full project lifecycle | 0.55 | 6 | 5.45 | Needs all 11 checks |
| `task-12.md` | Employee payroll | 0 | 4 | 4 | Hard research, zero score |
| `task-22.md` | Receipt expense voucher | 2.1 | 6 | 3.9 | Check 3 (amount/VAT) failing |
| `task-24.md` | Correct ledger errors | 2.25 | 6 | 3.75 | Prompt-driven extraction needed |

## Priority order for deployment

1. **task-30** — highest confidence fix (module activation is the only untested variable)
2. **task-23** — pre-built script handles the full flow, just needs production confirmation
3. **task-29** — v2 challenger has 11/11 sandbox checks, but production-untested
4. **task-24** — needs prompt-driven extraction instead of hardcoded values
5. **task-22** — NET vs GROSS amount/VAT treatment is the blocker
6. **task-12** — hardest remaining task, payroll complexity
