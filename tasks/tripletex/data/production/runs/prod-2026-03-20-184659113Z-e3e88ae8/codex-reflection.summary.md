# 1. Task

Reverse the returned bank payment for Montaña SL (`organizationNumber=888412972`) on the invoice with line text `Diseño web` and ex-VAT lookup amount `35800 NOK`, so the invoice becomes outstanding again.

# 2. Reflection

The run got perfect correctness but missed the efficiency point. The actual Tripletex side effect was right: invoice `2147493568` was matched and payment voucher `608775910` was reversed with `PUT /ledger/voucher/608775910/:reverse?date=2026-03-20`, returning reverse voucher `608833475`.

What went well:
- The task shape was recognized correctly as an exact match for `trusted-standards/reverse-customer-invoice-payment.md`.
- The first production `GET /invoice` already found the exact invoice and exposed the real payment posting.
- The reversal write used the correct endpoint and date and produced the correct final state.

What went poorly:
- The first local matcher rejected the correct payment posting because it over-required `posting.account.number=1500`.
- That assumption was too strict. The real payment posting was already enough: `type=null`, `description="Betaling: Faktura nummer 1 til Montaña SL (10001)"`, `amountCurrency=-44750`, `voucherId=608775910`, `account=null`.
- Because the script threw away that valid candidate, it forced one extra `GET /invoice` on the rerun.

Correct approach:
- Trust the first decisive invoice read.
- When `posting.type` is not helpful, accept the unique negative payment-style posting with `description` like `Betaling: ...`.
- Treat `account.number=1500` as a common hint, not a requirement.

# 3. Call Efficiency

The production run was not minimal-call.

Wasted calls:
- `1x GET /invoice` was wasted. The first `GET /invoice` already contained the correct voucher candidate, but the local resolver rejected it and reran the locate step.

Avoidable errors:
- No avoidable Tripletex `4xx` happened in the production run.
- The inefficiency came from local filtering logic, not from endpoint guessing.

Exact lower-call path the next agent should follow for this task shape:
1. `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-20&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`
2. Filter locally to the single paid invoice matching `customer.organizationNumber=888412972`, `amountExcludingVatCurrency=35800`, and line text `Diseño web`.
3. From that same read, take the unique negative payment-style posting `description~"Betaling: ..."`, even if `type=null` and `account=null`, and extract `voucherId=608775910`.
4. `PUT /ledger/voucher/608775910/:reverse?date=2026-03-20`
5. Stop. No verification read in the score-optimal path.

# 4. Root Causes

- I overfit the fallback rule to an earlier proof that showed `account.number=1500`.
- I treated missing `account` expansion as a blocker instead of as a normal variant of the same payment posting.
- I did not keep the trusted standard’s main lesson strict enough in code: the first decisive invoice read should stay authoritative unless it is genuinely ambiguous.
- I allowed a local assertion failure to trigger another locate read instead of widening the fallback matcher inside the same decision point.

# 5. Sandbox Verification

I used only the provided persistent sandbox credentials and wrote the proof script only under this run’s scripts directory.

Sandbox proof result:
- Script: `scripts/sandbox_verify_reverse_payment_reflection.ts`
- Created disposable product `84388586`
- Created disposable customer `108260054`
- Created disposable order `401965073`
- Invoiced it as invoice `2147537052` / invoice number `64`
- Paid it with payment type `32813748`
- The decisive locate read returned the real reverse target as:
  - `type=null`
  - `description="Betaling: Faktura nummer 64 til Reflection Reverse Customer 1774032662638 (10076)"`
  - `amountCurrency=-1000`
  - `voucherId=608833573`
  - `account=null`
- `PUT /ledger/voucher/608833573/:reverse?date=2026-03-20` returned reverse voucher `608833574`
- Proof-only verify read showed `amountCurrencyOutstanding=1000` again

Conclusion from sandbox:
- The correct low-call reverse-payment path is still locate once, reverse once.
- The fallback matcher must accept the unique negative `Betaling: ...` posting even when `account` is null.

# 6. Playbook Changes

Updated existing docs; created no new trusted standard or playbook.

Changed paths:
- `AGENTS.md`
- `trusted-standards/common-endpoints.md`
- `trusted-standards/reverse-customer-invoice-payment.md`
- `task-playbooks/reverse-customer-invoice-payment.md`

What changed:
- Removed the over-tight assumption that fallback payment postings require `account.number=1500`.
- Documented that `account=null` is a real, proven shape for the correct reverse target.
- Added the exact production miss and the exact lower-call replacement path.
- Reinforced that the winning exact-match path remains 2 calls, with no final verification read by default.

# 7. Commit

- Commit hash: `827c7a0`
- Commit message: `tripletex playbook: tighten reverse payment voucher detection`

# 8. Reusable Heuristics

- For reverse-payment tasks, use `postings(...)`, never `payments(...)`, on `GET /invoice`.
- If `posting.type` is null, look for the unique negative payment-style posting with `description` like `Betaling: ...`.
- Treat `account.number=1500` as supportive evidence only; do not require it.
- If the first decisive invoice read already isolates one voucher safely, reverse it immediately and stop.
- Do not spend a follow-up `GET /invoice` unless the prompt explicitly scores proof of reopened balance or the first read is genuinely ambiguous.