# Score-Aware Reflection — prod-2026-03-21-222433471Z-ba977073

## Task Attribution

- **Attributed task**: T25 (overdue invoice reminder fee + partial payment)
- **Task tier**: T3 (max score 6)
- **Attribution confidence**: High — task shape is unambiguous "overdue invoice reminder fee" match; leaderboard diff shows task 25 `attempt_delta=1` with `last_attempt_after=22:26:56` closest to run completion at `22:26:53`; submission `6471072b` (queued 22:24:20, completed 22:26:56) shows 6/6 checks passed with `normalized_score=3.6`
- **Attribution status in metadata**: `ambiguous` (candidate_count=3) — 5 tasks changed in the diff window (04, 10, 17, 19, 25), but task 25 is the clear match by task shape

## Correctness Verdict

**Perfect correctness.** 6/6 checks passed, score_raw=10/10.

All required side effects were correctly applied:
- Overdue invoice located (id=2147645103, customer=108441398, outstanding=36875)
- Voucher posted with debit 1500 / credit 3400, fee amount 40 NOK
- Fee invoice #4 created and sent (amountCurrency=40)
- Partial payment of 5000 NOK registered (outstanding 36875→31875)

## Efficiency Verdict

**Significantly penalized.** normalized_score=3.6 out of max 6 (60% efficiency factor).

- **This run**: 7 API calls (6 successful + 1 wasted 422)
- **Previous best**: 6 API calls, 0 errors → scored 6/6 (100%)
- **Score impact**: The single wasted 422 dropped the score from 6 to 3.6 — a 40% penalty
- **Best score unchanged**: Task 25 best_score remained at 6 (already achieved in prior runs)

| # | Call | Status | Wasted? |
|---|------|--------|---------|
| 1 | `GET /invoice?...` | 200 | No |
| 2 | `GET /invoice/paymentType?...` | 200 | No |
| 3 | `GET /ledger/account?number=1500,3400` | 200 | No |
| 4 | `POST /ledger/voucher` | 201 | No |
| 5 | `POST /invoice` (wrong payload) | **422** | **Yes** |
| 6 | `POST /invoice` (correct payload) | 201 | No |
| 7 | `PUT /invoice/{id}/:payment` | 200 | No |

## Likely Root Cause

The fee-invoice `POST /invoice` used `orders: [], orderLines: [...]` (top-level orderLines on the invoice body) instead of `orders: [{ customer, orderDate, deliveryDate, orderLines: [...] }]` (orderLines nested inside an order within the orders array).

Tripletex requires at least one order in the `orders` array and rejects `orders: []` with `422 orders: Listen kan ikke være tom.`

**Why it happened**: The trusted standard said "create one direct order line for the prompt fee amount" without specifying the nesting structure. The playbook had the correct payload example in its "Winning Payload Shapes" section, but per the knowledge hierarchy the agent only read the trusted standard (correct behavior for exact matches). The critical nesting detail was missing from the trusted standard itself.

**Post-run fix**: The trusted standard's Payload Rules section now explicitly documents the `orders[].orderLines[]` structure requirement, and the playbook's Pitfalls section now warns against top-level `orderLines`. Both were committed as `53644cf3`.

## What Went Right

1. **Correct task identification** — immediately matched to the exact trusted standard
2. **Read the standard first** — followed the mandatory "read before writing" rule
3. **Response parsing** — correctly handled `values` vs `value` from the first script (previous runs wasted calls on this)
4. **Voucher payload** — included `row: 1` / `row: 2` (previous run `d022ee19` wasted a call omitting these)
5. **No vatType GET** — correctly omitted the unnecessary vatType lookup (saving 1 call vs the old 7-call path)
6. **Quick recovery** — the fix-up script reused all prior results and only made the 2 remaining calls, not a full restart
7. **Perfect correctness** — all 6 checks passed, all side effects correct

## What To Change Next Time

1. **The trusted standard now documents the invoice payload structure** — the next agent reading the standard will see the explicit `orders[{ customer, orderDate, deliveryDate, orderLines: [...] }]` requirement and the warning against `orders: []` with top-level `orderLines`. This is the primary fix that should prevent this exact mistake from recurring.

2. **If unsure about invoice payload nesting, check the playbook's "Winning Payload Shapes"** — the playbook contains concrete JSON examples that are more resistant to structural misinterpretation than prose descriptions.

3. **The 6-call path remains optimal** — no lower-call path was found during sandbox investigation. The calls are: locate → paymentType → accounts → voucher → invoice → payment. All 6 are irreducible (each has been individually proven mandatory in prior sandbox proofs).

4. **422 errors are heavily penalized** — a single wasted 422 dropped the score by 40% (from 6 to 3.6). This reinforces the AGENTS.md guidance: "Make sure you know the API calls will work before running."
