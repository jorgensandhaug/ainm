# Score Reflection Summary

## Task Attribution

- **Run ID**: prod-2026-03-21-222838435Z-e6fd5a14
- **Attributed task**: Task 02 (create and send customer invoice) — T1, max score 2
- **Attribution confidence**: High. Leaderboard diff shows Task 02 gained +3 attempts (17→20) during the window. Task 06 (+1, no improvement) and Task 26 (+1, already max) also changed, but this prompt is unambiguously a create-and-send invoice shape matching Task 02.
- **Inference status**: `ambiguous` (3 tasks changed in window), but task shape makes attribution clear.

## Correctness Verdict

**Perfect correctness.** The matching submission shows:
- `score_raw`: 8/8
- `normalized_score`: 2.0 (max for T1)
- `feedback`: "7/7 checks passed."
- All 7 checks passed — no correctness issues whatsoever.

The final Tripletex state was exactly correct:
- Customer Sjøbris AS resolved correctly via org.nr 847830840
- Invoice amount: 7350 ex VAT, 9187.5 incl VAT (25% applied correctly)
- Description "Nettverksteneste" preserved as-is
- Invoice sent via `sendToCustomer=true`

## Efficiency Verdict

**Optimal efficiency.** The run achieved the maximum score (2/2) with:
- 6 API calls (the documented minimum for existing-customer + bank-repair)
- 0 avoidable 4xx errors
- The 422 on the first `POST /invoice` was unavoidable (fresh account without registered bank number)
- No wasted calls — every call was necessary

The best_score for Task 02 was already 2 before this run and stayed at 2 after. This means this run matched or exceeded the previous best efficiency. Since 2 is the maximum score, there is no efficiency gap to close.

## Likely Root Cause

No issues. This was a clean, optimal execution. The bank-account repair branch added 3 calls (failed invoice + GET account + PUT account) which is the documented minimum for that recovery path. The agent correctly:
1. Parallelized `GET /customer` and `GET /ledger/vatType`
2. Retained both IDs across the repair branch
3. Used `unitPriceExcludingVatCurrency` (not `unitCostPrice`)
4. Used safe URL construction (string concatenation, not `new URL()`)

## What Went Right

1. **Trusted standard matching**: Immediately identified `create-and-send-customer-invoice.md` as the correct standard. Read it before writing the script.
2. **Definite-article heuristic**: "kunden" (Nynorsk definite) correctly triggered `GET /customer` instead of `POST /customer`.
3. **VAT branch selection**: "eksklusiv MVA" correctly mapped to the taxed 25% branch, found `vatType.id=3` dynamically.
4. **Parallelization**: Customer lookup and VAT lookup ran in parallel, saving wall-clock time.
5. **State retention across repair**: `customer.id` and `vatType.id` were retained in local variables during the bank-account repair branch, avoiding 2 unnecessary re-reads (which plagued earlier runs like Étoile SARL at 8 calls).
6. **Description preservation**: Nynorsk "Nettverksteneste" passed through to the order line exactly as prompted.
7. **No unnecessary reads**: Zero verification GETs after the successful invoice create.

## What To Change Next Time

**Nothing needs to change.** This run was a textbook execution of the documented optimal path for the existing-customer + bank-repair create-and-send invoice shape.

For reference, the optimal paths for this task shape remain:
- **Happy path** (no bank repair): 3 calls — `GET /customer` + `GET /ledger/vatType` (parallel) → `POST /invoice?sendToCustomer=true`
- **With bank repair**: 6 calls — same 3 + failed `POST /invoice` + `GET /ledger/account` + `PUT /ledger/account/{id}` → retry `POST /invoice?sendToCustomer=true`

This run confirms the existing-customer + bank-repair shape is fully robust across Nynorsk, Bokmål, English, French, and German prompts. The trusted standard documentation is comprehensive and accurate.
