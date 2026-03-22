# Score-Aware Reflection: prod-2026-03-22-112254283Z-3b494e3a

## 1. Task Attribution

- **Attributed task**: T18 (create customer invoice)
- **Evidence**: submission `completed_at` ("2026-03-22T11:24:03.182853+00:00") matches T18 `last_attempt_at` exactly in the after-leaderboard; T18 `total_attempts` incremented from 21 → 22
- **Tier**: T2 (max 4 points)

## 2. Correctness Verdict

**Perfect.** correctness=1.0, score_raw=8/8, normalized_score=4/4, all 3 checks passed.

- Check 1: passed
- Check 2: passed
- Check 3: passed

No correctness issues. The final Tripletex state exactly matched expectations.

## 3. Efficiency Verdict

**Optimal.** The run scored the maximum 4/4 (T2 ceiling), matching the existing T18 best_score of 4. This is the 10th consecutive correct T18 run and the 2nd using the proactive bank-account check pattern.

- 6 API calls total: 4 free GETs + 2 writes (PUT bank + POST invoice)
- 0 avoidable errors
- 0 wasted calls
- No efficiency penalty detected — normalized_score equals the tier maximum

The proactive bank-account check (GET before POST) continued to prove its value: the invoice succeeded on the first POST attempt with 0 errors, avoiding the 422 that the reactive pattern would have caused.

## 4. Likely Root Cause

No issues to diagnose. The run was flawless:
- Trusted standard was read before scripting
- Comma-separated product query resolved all 3 products in 1 call (9th production confirmation)
- Products carried correct `vatType.id` values (3/31/6), eliminating the need for `/ledger/vatType`
- Proactive bank-account check detected and fixed missing `bankAccountNumber` before the invoice write
- Invoice totals correct: `amountExcludingVatCurrency=29900`, `amountCurrency=33485`

## 5. What Went Right

1. **Immediate execution** — read trusted standard, wrote script, ran it with zero hesitation
2. **Comma-separated product query** — `GET /product?number=8679,5934,8942&fields=*` resolved all 3 products in one call
3. **Product VAT reuse** — products already carried correct `vatType.id` (3=25%, 31=15%, 6=0%), no `/ledger/vatType` call needed
4. **Proactive bank-account check** — detected missing `bankAccountNumber`, fixed via PUT before POST /invoice, achieving 0 errors
5. **Verification GET** — confirmed all 3 lines linked to correct products with correct unit prices and VAT types
6. **Duration** — completed in 83s out of 300s budget, well within time limit

## 6. What To Change Next Time

**Nothing.** This run achieved the maximum possible score (4/4) with the optimal call path (6 calls, 2 writes, 0 errors). The create-customer-invoice flow is fully mature:

- 10 consecutive correct runs across 5 languages (EN, ES, PT, FR, NO)
- 2 consecutive proactive bank-account check runs with 0 errors each
- 9 consecutive comma-separated product query successes
- Consistent `vatType.id` values across all fresh accounts: 3 (25%), 31 (15%), 6 (0%)

The next agent should continue using the identical flow:
1. `GET /customer?organizationNumber=...&fields=*`
2. `GET /product?number=X,Y,Z&fields=*`
3. `GET /ledger/account?isBankAccount=true&fields=*` (proactive)
4. (conditional) `PUT /ledger/account/{id}` if `bankAccountNumber` is falsy
5. `POST /invoice?sendToCustomer=false`
6. `GET /invoice/{id}?fields=*,...` (verify)
