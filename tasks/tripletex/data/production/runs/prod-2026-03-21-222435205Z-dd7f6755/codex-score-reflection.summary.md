# Score Reflection — prod-2026-03-21-222435205Z-dd7f6755

## Task Attribution

- **Task ID**: T10 (T2 tier, max score 4)
- **Prompt**: Portuguese — create order for Cascata Lda (org 927161524) with products Consultoria de dados (8400) @ 5700 NOK + Design web (2535) @ 3850 NOK, convert to invoice, register full payment
- **Trusted standard**: `create-order-invoice-and-register-payment.md` (exact match)

## Correctness Verdict

**Perfect correctness.** score_raw = 8/8, correctness = 1, 5/5 checks passed, all_checks_passed = true. The final Tripletex state (order, invoice, full payment) was exactly correct.

## Efficiency Verdict

- **normalized_score**: 3 / 4 max (75%)
- **API calls**: 5 (the proven minimum floor for this task shape)
- **Errors**: 0
- **Duration**: 69,184 ms
- **Leaderboard**: best_score was 3 before this run, remained 3 after — this run matched the ceiling but did not improve it
- **Assessment**: The run achieved the maximum attainable score for this task shape. The 5-call floor has been exhaustively proven in sandbox (inline customer by orgNumber → 422, inline product by number → orphaned lines, hardcoded paymentTypeId → 422, omitting paymentTypeId → 422). There is no known path to reduce below 5 calls. The 3/4 normalized score represents the scoring formula's efficiency penalty for 5 calls, which is the structural floor — no run on T10 has ever scored 4.

## Likely Root Cause

No deficiency. The 1-point gap from max (3 vs 4) is a structural scoring artefact: the efficiency bonus formula does not award full marks at 5 API calls. Since 5 is the proven minimum for this task shape (3 reads + 1 create + 1 combined invoice-payment write), the normalized_score of 3 is the ceiling.

## What Went Right

1. **Immediate trusted-standard match**: Agent read `create-order-invoice-and-register-payment.md` before writing any code — zero time wasted on spec exploration.
2. **Single script execution**: All 5 API calls in one script, no retries, no intermediate debugging scripts.
3. **Comma-separated product lookup**: `number=8400,2535` resolved both products in one call with OR semantics.
4. **String comparison**: Used `String(p.number) === "8400"` correctly, avoiding the documented type pitfall.
5. **pts[0] payment type**: Used first available payment type without filtering by nonexistent `isIncoming` field.
6. **paidAmount=0.01 seed**: Combined invoice+payment write settled the invoice to outstanding=0 in a single PUT.
7. **No bank-account repair needed**: Clean 5-call path without the `/ledger/account` recovery branch.

## What To Change Next Time

1. **Nothing to change for this task shape.** The canonical 5-call path is optimal and this run executed it perfectly.
2. **Maintain awareness**: If a future scoring formula change rewards sub-5-call paths, re-investigate whether new API features allow combining reads. Until then, 5 calls / 3 normalized score is the ceiling for T10.
3. **Wall-clock optimization (minor)**: The 3 independent GETs (customer, product, paymentType) could be parallelized with `Promise.all` to save ~50ms wall-clock time. This doesn't affect call count or scoring but provides headroom against the 300s timeout budget. Not worth documenting in the trusted standard since the 69s total is well within budget.
