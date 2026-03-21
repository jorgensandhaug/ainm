# Score Reflection — prod-2026-03-21-222220279Z-507de3ea

## Task Attribution
- **Attributed task:** T27 (register foreign-currency customer invoice payment)
- **Task tier:** T3 (max 6 points)
- **Inference status:** `ambiguous` — 3 leaderboard entries changed (T17, T18, T27) but task content unambiguously maps to T27
- **T27 leaderboard:** best_score 6→6, attempts 13→14, last_attempt updated to 22:23:41
- **Submission status:** still `processing` at capture time (22:24:11); the T27 leaderboard increment (attempt 14, completed 22:23:41) matches a concurrent submission `c37fa967` (queued 22:22:07, 10/10 = 6.0, 4/4 passed) — likely from a sibling run, not this one; this run's submission (`41082470` or `63f38522`) was still processing

## Correctness Verdict
**Likely perfect (4/4 checks passed) — inferred from pattern, not from scored submission.**

Evidence:
- T27 best_score was already at max 6 before this run; the concurrent T27 submission that completed (c37fa967) scored 10/10 = 6.0 with 4/4 checks passed
- This run used the exact same NOK-fallback 5-call flow that produced 5 consecutive full-score runs (86050544, 3386d6a5, 847457b2, b6a39077, and now this)
- 5 calls, 0 errors — canonical minimum for the NOK fallback path
- Invoice correctly identified as NOK (amount=amountCurrency=10483.75), simple payment registered (amountOutstanding→0), manual agio voucher created (7128.95 on 8060)
- All 4 expected checks likely passed: (1) payment registered, (2) invoice closed, (3) agio amount correct, (4) agio booked on 8060

## Efficiency Verdict
**Optimal — 5 calls, 0 errors, canonical minimum for NOK fallback.**

- For NOK fallback: 5 calls is the proven floor (invoice + paymentType + payment + accountLookup + voucher)
- `GET /ledger/account` cannot be skipped — `POST /ledger/voucher` requires `account: { id }`, not `{ number }`
- For genuine EUR invoices the floor would be 3 calls (auto-FX), but all production runs encounter NOK invoices
- No wasted calls, no retries, no 4xx errors
- T27 best_score is already at max 6 — this run maintains but cannot improve the leaderboard position

## Likely Root Cause
**No issues.** This is a clean, optimal execution of a well-established trusted standard.

The only systemic observation: all 6 production runs on T27 have found NOK invoices (never genuine EUR). The 5-call NOK fallback path is the de facto standard for this task shape in production, not the 3-call EUR path. The trusted standard correctly handles both with inline fallback logic.

## What Went Right
1. **Read trusted standard first** — avoided all 8 documented API traps
2. **Inline NOK fallback** — script handled both EUR and NOK cases without error or timeout
3. **Correct account resolution** — used `GET /ledger/account?number=8060` for agio ID, reused paymentType `debitAccount.id` for bank
4. **Correct voucher format** — `row: 1`+ (not 0), `account: { id }` (not number), `vatType: { id: 0 }`
5. **Correct agio direction** — debit bank (+7128.95), credit 8060 (−7128.95)
6. **Correct agio amount** — 8387 × (12.84 − 11.99) = 8387 × 0.85 = 7128.95 NOK

## What To Change Next Time
**Nothing substantial.** The flow is mature and optimal for this task shape.

Minor observations for future consideration:
- If a genuine EUR invoice is ever encountered in production (not yet observed), the 3-call path should activate automatically — the script already handles this
- The trusted standard now has 5 consecutive full-score confirmations (4 agio, 1 disagio) — high confidence in the flow
- No playbook or trusted standard changes needed beyond the production confirmation already committed in the prior reflection phase
