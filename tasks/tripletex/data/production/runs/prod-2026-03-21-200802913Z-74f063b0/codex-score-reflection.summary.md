# Score Reflection — prod-2026-03-21-200802913Z-74f063b0

## Task Attribution

- **Task ID**: 09 (T2, max score 4)
- **Prompt**: Create invoice for Sierra SL (org. nº 909007135) with 3 product lines: Desarrollo de sistemas (8344) 19250 NOK 25% VAT, Horas de consultoría (9563) 10000 NOK 15% VAT (food), Informe de análisis (8060) 15800 NOK 0% VAT (exempt)
- **Language**: Spanish
- **Attempt**: 14th overall for task 09

## Correctness Verdict

**Perfect.** Correctness = 1.0, score_raw = 8/8, all 6/6 checks passed. Every scored field matched the expected state.

## Efficiency Verdict

**Maximum score achieved.** normalized_score = 4/4 (T2 max). The run used 3 API calls with 0 errors in 74.5 seconds:

1. `GET /customer?organizationNumber=909007135&fields=*` — resolved customer (1 result)
2. `GET /product?number=8344,9563,8060&fields=*` — resolved all 3 products via comma-separated OR semantics (1 call)
3. `POST /invoice?sendToCustomer=false` — created invoice with correct totals (`amountExcludingVatCurrency=45050`, `amountCurrency=51362.5`)

This is the theoretical minimum call count for this task shape. No wasted calls, no 4xx errors, no retries, no bank-account repair needed.

**Leaderboard impact**: New best score for task 09, improving from 2.5333 → 4.0 (previous best was a partial-correctness or inefficient run).

## Likely Root Cause

No issues. This run executed the exact-match fast path from the trusted standard without deviation. The comma-separated `number=X,Y,Z` product query (OR semantics) resolved all 3 products in one call — this is the first production confirmation of that query approach, and it eliminated the unreliable `productNumber=X&productNumber=Y` (repeated params) pattern that caused partial results in prior runs.

## What Went Right

1. **Comma-separated product query**: `GET /product?number=8344,9563,8060&fields=*` returned all 3 products in one call. This is strictly better than the old `productNumber=X&productNumber=Y` approach which returned partial results in production (e.g., the Elvdal AS run returned only 1 of 3 products).

2. **VAT inheritance from products**: Products carried `vatType.id` values `3` (25%), `31` (15%), `6` (0%). Reusing these on invoice lines with explicit `vatType: { id: product.vatType.id }` produced the correct mixed-VAT totals without needing a separate `GET /ledger/vatType` call.

3. **No unnecessary reads**: No `GET /ledger/vatType`, no `GET /ledger/account`, no `GET /invoice/{id}` readback. The write response totals were sufficient to confirm the outcome.

4. **No bank-account repair**: The account already had a registered bank account number, saving 2 calls compared to some prior runs.

5. **Script execution speed**: Read the trusted standard, wrote and executed the script immediately. No time wasted on reading AGENTS.md, openapi.json, or multiple documentation files (the trap that caused the Ridgepoint Ltd run to score 0/1 via timeout).

## What To Change Next Time

Nothing needs changing for this exact task shape. The 3-call path is proven optimal and should be repeated exactly:

1. `GET /customer?organizationNumber=...&fields=*`
2. `GET /product?number=<ref1>,<ref2>,<ref3>&fields=*` (comma-separated, OR semantics)
3. `POST /invoice?sendToCustomer=false` with `product: { id }` and `vatType: { id: product.vatType.id }`

The only conditional addition is the bank-account repair branch (adds 2 calls) if the first `POST /invoice` fails with the `bankkontonummer` validation — but that is reactive, not proactive.

Key reinforcement for future agents:
- **Always use comma-separated `number=X,Y,Z`** as the primary product resolver, never `productNumber=X&productNumber=Y`
- **Always reuse `product.vatType.id`** from the product read rather than spending a separate `/ledger/vatType` call
- **Read the trusted standard file, then immediately write and execute the script** — do not spend time on AGENTS.md or openapi.json for exact matches
