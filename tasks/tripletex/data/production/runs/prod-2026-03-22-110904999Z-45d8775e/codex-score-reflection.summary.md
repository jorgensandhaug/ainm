# Score Reflection: prod-2026-03-22-110904999Z-45d8775e

## 1. Task Attribution

- **Attributed task**: T06 (T1 tier, max score 2.0)
- **Evidence**: leaderboard diff shows T06 attempt_delta=1, best_score improved 1.2667→1.5; T06 last_attempt_after (11:10:25) aligns with task_complete_timestamp (11:10:20) within 5s scorer delay
- **Prompt**: "Opprett og send en faktura til kunden Bergvik AS (org.nr 890733751) på 28900 kr eksklusiv MVA. Fakturaen gjelder Systemutvikling."
- **Submission**: score_raw=7/7, 5/5 checks passed, normalized_score=1.5

## 2. Correctness Verdict

**Perfect correctness.** All 5/5 checks passed, score_raw=7/7.

The final Tripletex state was correct:
- Customer Bergvik AS (890733751) resolved via GET
- Invoice created with amountExcludingVatCurrency=28900, amountCurrency=36125 (25% VAT)
- Order line: "Systemutvikling", vatType.id=3, unitPriceExcludingVatCurrency=28900
- Invoice sent via default sendToCustomer=true

## 3. Efficiency Verdict

**Score: 1.5/2.0 (75%).** Correctness is perfect; the 25% gap is purely efficiency/error penalty.

API calls made:
1. `GET /customer?organizationNumber=890733751&fields=*` → 200 (free)
2. `GET /ledger/account?isBankAccount=true&fields=*` → 200 (free)
3. `PUT /ledger/account/499922623` → 200 (bank repair — 1 write)
4. `POST /invoice` → 201 (invoice create — 1 write)
5. `GET /invoice/{id}?fields=*,...` → 200 (verification — free)

Total: 5 HTTP calls, 2 writes, 0 errors.

**Best score before**: 1.2667 (26 attempts). **Best score after**: 1.5 (27 attempts). This run set a new personal best for T06, improving by +0.2333.

Despite being the best run yet, there is still a 0.5 gap to max (2.0). The scorer likely penalizes total write count. The theoretical minimum for this task shape:
- **If bank account already set**: 1 write (POST /invoice only) → likely scores 2.0
- **If bank repair needed**: 2 writes (PUT bank + POST invoice) → scores 1.5

The bank repair write is the efficiency cost. It is unavoidable when the fresh account has no bank account number, but the scorer doesn't distinguish between necessary and unnecessary writes.

## 4. Likely Root Cause

The 0.5 efficiency gap comes from the **bank account repair write** (PUT /ledger/account). In production fresh accounts, the invoice bank account (1920) consistently lacks a `bankAccountNumber`, requiring repair before the invoice can be created.

This is a structural property of the fresh account, not an agent mistake. The alternative — skipping the proactive check and letting POST /invoice fail with 422 — would cost 3 writes + 1 error (worse). The proactive approach (2 writes + 0 errors) is strictly optimal for this account state.

There is no way to avoid the bank repair write within the current task/account setup. The 1.5/2.0 score is the ceiling for this task when bank repair is needed.

## 5. What Went Right

1. **Correct standard selection**: Matched `create-and-send-customer-invoice.md` immediately (the 2026-03-21 run for the same task wrongly selected the order-based standard)
2. **Definite-article heuristic**: "kunden" correctly triggered GET /customer instead of POST /customer
3. **Hardcoded vatType.id=3**: Eliminated the GET /ledger/vatType call (saved 1 call vs 2026-03-21 runs)
4. **Proactive bank check**: GET /ledger/account + conditional PUT before POST /invoice — eliminated the 422 + retry pattern (saved 1 failed POST + 1 retry vs reactive approach)
5. **Zero errors**: No 4xx responses, no wasted writes, no retries
6. **Fast execution**: Task completed in ~75s (11:09:05 → 11:10:20)
7. **New best score**: Improved T06 from 1.2667 to 1.5

## 6. What To Change Next Time

1. **Bank repair is the only remaining inefficiency** — and it cannot be eliminated for fresh accounts. The 1.5/2.0 score is likely the ceiling for T06 when bank repair is required. Accept this as the optimal achievable score for this account state.
2. **Verification GET is free but could be dropped** if the scorer counts total HTTP calls rather than just writes. However, AGENTS.md mandates verification GETs after writes, so this should only be changed if the scoring formula is confirmed to penalize GETs.
3. **No changes to the flow are warranted** — the 4-call path (2 free GETs + 2 writes + 0 errors) is the proven optimal for existing-customer + bank-repair + 25% VAT + description-only line. This was confirmed by both production (this run) and sandbox verification.
4. **If the scorer ever provides accounts with pre-set bank numbers**, the same flow naturally drops to 3 calls (2 free GETs + 1 write) and should score 2.0/2.0.
