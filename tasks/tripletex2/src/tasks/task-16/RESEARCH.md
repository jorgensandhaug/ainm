# Task 16 — Register supplier invoice Research Memory

This file is the task-local research memory for improving agents.
Read it together with `task.ts`, the generated packet, and `research/AGENTS.md`.
Update it after any meaningful frontier import, sandbox verification, promotion decision, or blocker discovery.

## Current Runtime Surface

- Canonical task id: `16`
- Active strategy pin: `16.import-then-book-voucher.v1`
- Challenger strategy: `16.import-and-book-voucher.v2` (sendToLedger=true)
- Task implementation: `task.ts`
- Stable task summary: `README.md`

## Current Research Queue Snapshot

- Priority: `8`
- Band: `focus`
- Queue eligibility: `ready`
- Research lane: `execution-lane`
- Best known score: `3` / `4` (per packet — but see mapping mismatch below)

## Current State

### Queue Notes

- Execution-lane Tier 2 target.

## Frontier Memory

### Strongest known branch
- v1 (sendToLedger=false): 5 calls, sandbox-proven, trusted standard path. Multiple sandbox proofs from 2026-03-20.
- v2 (sendToLedger=true): 6 calls, sandbox-proven 2026-03-22. Adds booking step after postings.

### Score / correctness ceiling
- Packet reports 3/4 best known score, but this score is on leaderboard task 16 which is **project invoice**, not supplier invoice.
- Actual supplier invoice prompts score on leaderboard task 11 (best_score=1, unknown max).
- This is a **tx_task_id mapping mismatch** that affects the entire task 16 research pipeline.

### Call-budget frontier
- v1: 5 calls (fresh create), 6 calls (lookup-first + zero-hit fallback)
- v2: 6 calls (fresh create + booking), 7 calls (lookup-first + zero-hit + booking)

### Production evidence consulted (2026-03-22 wave)
- **dedc4bfe** (task 20, PDF variant): 8/10 score, 5/6 checks passed. Used sendToLedger=true as final step. Script: `scripts/register-supplier-invoice.ts`
- **53cb0731** (task 20, PDF variant): 7/10 score, 4/6 checks passed. Used sendToLedger=false only. Script: `scripts/register-supplier-invoice.ts`
- **c290243c** (supplier invoice prompt, scored on task 11): 0/8, used wrong path (direct POST /ledger/voucher). Script: `scripts/register-supplier-invoice.ts`
- **0b6fe5b8** (supplier invoice prompt, ambiguous diff): Exact same strategy as v1 but with lookup-first. Script: `scripts/register_supplier_invoice.ts`
- **db7151ac**, **aa17fe23**, **b3c40a84**, **bc4931a3**: Various supplier-invoice runs scoring 0/8 (wrong path) or no score.

### Key insight: sendToLedger=true
- The 8/10 run (dedc4bfe) used two PUTs: sendToLedger=false then sendToLedger=true, gaining check 6.
- The 7/10 run (53cb0731) used only sendToLedger=false, missing check 6.
- Sandbox confirmed: sendToLedger=true with postings in single PUT → 422. Must use two-step pattern.

### tx_task_id mapping mismatch (CRITICAL)
- Tripletex2 task 16 = "register-supplier-invoice" (code)
- Leaderboard task 16 = project invoice (evidence: all task-16 leaderboard deltas come from project-invoice prompts)
- Leaderboard task 11 = register supplier invoice (evidence: actual supplier-invoice prompts consistently delta on task 11)
- Tripletex2 task 11 = "create-order-invoice-and-register-payment" (code)
- The 3/4 "best known score" in the packet is from the WRONG leaderboard slot.
- The actual supplier-invoice leaderboard slot (task 11) has best_score=1.
- This mismatch means deploying the v2 strategy would score on leaderboard task 11, not task 16.

### Anti-patterns / dead ends
- Direct POST /ledger/voucher: creates balanced voucher but NOT a supplierInvoice object → 0/8
- sendToLedger=true with postings in one PUT: 422 validation error
- Invalid org numbers (non-mod11): 422 Peppol validation on importDocument
- POST /incomingInvoice: 403 on public accounts
- Malformed XML: 422 "Unable to identify document format"

## Sandbox Verification

### v2 strategy — sandbox-16-16.import-and-book-voucher.v2-2026-03-22T02-27-27-765Z
- Input: Sandbox Proof Supplier AS / 910000004 / INV-SANDBOX-16-V2-001 / kontortjenester / 62500 / 6500 / 25%
- Path: 6 calls (POST /supplier, GET account, GET vatType, POST importDocument, PUT sendToLedger=false, PUT sendToLedger=true)
- Result: completed, 0 errors, supplier 108505262, voucher 609279294

### v1 strategy — previous sandbox proofs from 2026-03-20
- Multiple proofs documented in trusted standard (Elvdal AS, Lumière SARL, Océan Reflection SARL, etc.)
- All used 5-call path with sendToLedger=false
- All proved correct postings in write response

## Blockers

1. **tx_task_id mapping mismatch**: The packet's "best known score 3/4" tracks the wrong leaderboard task. The actual supplier-invoice score is on leaderboard task 11, not 16. This affects whether the v2 strategy's score improvement will be visible in the expected metric.
2. **Call budget trade-off**: v2 uses 6 calls (1 more than v1) for the booking step. This is only justified if the competition checks voucher booking status.
3. **No formal verification plan**: The research OS verifier requires a verification plan in the packet, which wasn't present. Manual sandbox run used as proof path.

## Next Hypothesis

1. Fix the tx_task_id mapping in the tripletex2 task registry (task 16 should map to leaderboard task 11 if it's truly supplier-invoice, or the task registry should be renumbered).
2. Test whether skipping GET /ledger/vatType and hardcoding vatType.id=1 is safe for 25% VAT — the dedc4bfe 8/10 run did this successfully, which would save one call (5 calls instead of 6 for the booking variant).
3. Investigate what check 5 checks in the task-20 6-check rubric (the one both 8/10 and 7/10 runs failed).

## Next Improving-Agent Update Checklist

- Read the generated packet first.
- Compare against the current active strategy before editing code.
- Verify with the research OS / sandbox instead of writing strategy tests.
- Write back the outcome here, even if the result is "no import" or "frontier unchanged".
