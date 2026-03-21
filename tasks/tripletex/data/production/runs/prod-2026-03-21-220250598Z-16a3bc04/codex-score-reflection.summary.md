# Score Reflection: prod-2026-03-21-220250598Z-16a3bc04

## 1. Task Attribution

- **Attributed task**: T06 (T1 tier, max 2 points)
- **Attribution confidence**: High — `completed_at` timestamp `2026-03-21T22:04:49.262908+00:00` exactly matches T06 leaderboard diff entry; T06 is the only entry whose `best_score` improved (1.4 → 1.5333); submission feedback confirms 5/5 checks
- **Prompt**: "Create and send an invoice to the customer Brightstone Ltd (org no. 894181273) for 14150 NOK excluding VAT. The invoice is for Cloud Storage."
- **Task shape**: existing-customer, direct-line (no product), create-and-send, English prompt

## 2. Correctness Verdict

**Perfect correctness.** `score_raw = 7/7`, all 5/5 checks passed.

- Customer Brightstone Ltd (org 894181273) correctly resolved
- Invoice amount: 14150 NOK excl. VAT, 17687.5 NOK incl. VAT (25%)
- Description: "Cloud Storage" correctly set
- Invoice sent via `sendToCustomer=true`
- VAT: 25% standard outgoing rate correctly applied

No field-level errors. The entire correctness score was earned.

## 3. Efficiency Verdict

**Score: 1.5333 / 2.0** (76.7% of max). New best for T06 (up from 1.4).

The efficiency gap (0.4667 points) is attributable to the bank-account repair branch:

| Call # | Endpoint | Status | Category |
|--------|----------|--------|----------|
| 1 | `GET /customer?organizationNumber=894181273&fields=*` | 200 | Core — required |
| 2 | `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*` | 200 | Core — required (direct line, no product to inherit VAT) |
| 3 | `POST /invoice?sendToCustomer=true` | 422 | Core — inherent bank-account failure |
| 4 | `GET /ledger/account?isBankAccount=true&fields=*` | 200 | Repair — conditional on call 3 |
| 5 | `PUT /ledger/account/{id}` | 200 | Repair — conditional on call 3 |
| 6 | `POST /invoice?sendToCustomer=true` | 201 | Repair — retry after fix |

- **Avoidable calls**: 0
- **Avoidable 4xx errors**: 0
- **Theoretical minimum (no bank issue)**: 3 calls, 0 errors
- **Actual**: 6 calls, 1 inherent 422
- **The 422 is not avoidable** — it's caused by the fresh-account state lacking a registered bank account number, not by agent error

The efficiency penalty is entirely from the bank-account repair branch. Without the bank-account issue (which is account-state-dependent, not agent-behavior-dependent), the run would have scored 3 calls with 0 errors.

## 4. Likely Root Cause

The gap to 2.0 is caused by the **bank-account repair branch** adding 3 calls and 1 inherent 422. This is a structural limitation of fresh Tripletex accounts, not an agent mistake.

There is no way to avoid this without preemptive bank-account checking, which the trusted standard already tested (sandbox 2026-03-21) and found to be worse on average: preemptive parallel check costs 4 calls in the happy case (vs 3 sequential) with no wall-clock benefit, making it worse ~70% of the time when no repair is needed.

One minor process issue: the agent initially read `create-customer-invoice.md` (the create-only standard) instead of `create-and-send-customer-invoice.md`. This didn't affect correctness or call count since the agent adapted the flow correctly, but it wasted agent thinking time and could have caused issues if the wrong standard had conflicting guidance.

## 5. What Went Right

1. **Perfect correctness** — 7/7 raw score, 5/5 checks passed
2. **New best score for T06** — improved from 1.4 to 1.5333
3. **Zero avoidable errors** — the 422 was inherent to account state
4. **Efficient direct-line handling** — correctly identified this as a non-product-linked task, used `GET /ledger/vatType` for VAT resolution instead of unnecessary product lookups
5. **Correct existing-customer detection** — English "the customer" with definite article correctly triggered `GET /customer` instead of `POST /customer`
6. **Bank-account repair executed cleanly** — customer.id and vatType.id retained across the repair branch (no wasted re-reads)
7. **`sendToCustomer=true`** — correctly used to combine create and send in one call

## 6. What To Change Next Time

1. **Read the correct trusted standard**: When the prompt says "create and send", always match `create-and-send-customer-invoice.md` first, not `create-customer-invoice.md`. The trusted standard has already been updated with a pitfall note about this.
2. **Bank-account repair is unavoidable**: The 3-call repair branch is the optimal recovery path. Do not attempt preemptive `GET /ledger/account` — it was proven worse on average in sandbox testing.
3. **No further call reduction possible for this task shape**: The theoretical minimum is 3 calls (customer + VAT + invoice) in the happy path, or 6 calls with bank repair. Both are already achieved.
4. **Efficiency ceiling for bank-repair runs**: Runs that hit the bank-account validation are structurally capped below 2.0 due to the 3 extra calls. This is a scoring ceiling, not an agent error. The only path to 2.0 is a fresh account that already has a registered bank account number.
5. **Consider whether the first invoice write could detect bank-account state earlier**: Not practically — the trusted standard already proved that preemptive checking is worse on average.
