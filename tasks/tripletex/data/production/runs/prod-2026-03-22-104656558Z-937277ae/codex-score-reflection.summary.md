# Score-Aware Reflection

## Task Attribution

- **Inference status**: ambiguous (candidate_count=2)
- **Leaderboard diff**: T09 (+1 attempt, best 4→4) and T27 (+1 attempt, best 6→6)
- **Most likely task**: T09 (create customer invoice) — the prompt is a textbook T09 shape (customer org + product numbers + mixed VAT + create-only invoice)
- **T27 delta**: likely from a concurrent run in the same scoring window
- **Tier**: T2, max score = 4

## Correctness Verdict

**Perfect correctness (4/4) — very likely.**

Evidence:
- T09 best_score was already 4 (max) before this run and stayed at 4 after — this run either matched or was below the max
- The run produced correct totals: `amountExcludingVatCurrency=41350`, `amountCurrency=48015` (24650×1.25 + 3350×1.15 + 13350×1.0)
- All 3 products linked by ID with correct `vatType.id` values: `3` (25%), `31` (15%), `6` (0%)
- Customer correctly resolved by org number
- Invoice verification GET confirmed all fields
- This exact task shape has scored 4/4 in every previous correct execution (8+ production runs)
- 0 HTTP errors, 0 4xx responses

No evidence of any correctness issue. The run almost certainly scored 4/4.

## Efficiency Verdict

**Optimal — 6 calls is the minimum when bank-account repair is needed, with 0 avoidable errors.**

Call breakdown:
| # | Call | Status | Category |
|---|------|--------|----------|
| 1 | `GET /customer?organizationNumber=932956233&fields=*` | 200 | free read |
| 2 | `GET /product?number=5566,6035,5199&fields=*` | 200 | free read |
| 3 | `GET /ledger/account?isBankAccount=true&fields=*` | 200 | free read (proactive bank check) |
| 4 | `PUT /ledger/account/498857626` | 200 | write (bank repair) |
| 5 | `POST /invoice?sendToCustomer=false` | 201 | write (invoice created first try) |
| 6 | `GET /invoice/2147696156?fields=*,...` | 200 | free read (verification) |

- **Writes**: 2 (PUT bank + POST invoice) — minimum when bank repair needed
- **Errors**: 0
- **Wasted calls**: 0
- **This was the first production run to use the proactive bank-account check**, which eliminated the 422 that all prior reactive-approach runs incurred. Same total call count (6), but 0 errors vs 1 error.

## Likely Root Cause

No failure or score loss to diagnose. The run executed the optimal path for this task shape with bank-account repair needed. The only theoretical improvement is if the bank account already had a `bankAccountNumber` set (which would reduce to 4 calls: 3 core + 1 verify), but that's account-dependent, not agent-controllable.

## What Went Right

1. **Proactive bank-account check** — first production validation; eliminated the 422 error that all 7 prior bank-repair runs incurred
2. **Comma-separated product query** — `number=5566,6035,5199` resolved all 3 products in 1 call (8th production confirmation of OR semantics)
3. **Product VAT reuse** — `vatType: { id: product.vatType.id }` avoided the unnecessary `GET /ledger/vatType` call
4. **Immediate execution** — read trusted standard, wrote script, ran it; no time wasted on extra file reads
5. **0 errors, 0 retries, 0 wasted calls**

## What To Change Next Time

**Nothing substantive.** This run achieved the optimal path for this task shape. For future runs of the same shape:

1. **Keep the proactive bank-account check.** It's proven now — same call count as reactive, but 0 errors instead of 1. This is the validated production standard.
2. **Keep comma-separated `number=X,Y,Z` as the primary product resolver.** 8 consecutive production successes with OR semantics.
3. **Keep product `vatType.id` reuse.** Values `3`/`31`/`6` for `25%`/`15%`/`0%` are stable across all tested production accounts.
4. **The only call-reduction opportunity is if the bank account already has `bankAccountNumber` set** — in that case, skip the PUT and achieve the theoretical 4-call minimum (3 core + 1 verify). The current proactive check already handles this case correctly (GET returns the existing value, no PUT needed).
