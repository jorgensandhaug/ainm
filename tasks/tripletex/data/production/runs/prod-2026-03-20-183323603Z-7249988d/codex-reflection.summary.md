## Task

Post-run reflection for the production task: reverse the returned payment on Bergwerk GmbH invoice `"Softwarelizenz"` so the invoice reopened as unpaid. Then audit call efficiency, prove the path in sandbox, update the reversal docs, and commit the doc changes.

## Reflection

The production run went well. It matched the exact trusted standard, used one decisive invoice read plus one voucher-reverse write, and succeeded with no recovery branch.

What did not go well was only in sandbox proofing, not production: the persistent sandbox `/invoice` search did not immediately surface a freshly created paid invoice that was already readable via `GET /invoice/{id}`. That could mislead a later agent into adding wasteful resolver reads. Correct approach: keep the production 2-call reversal standard unchanged, and treat that sandbox behavior as proof-only search lag/noise.

## Call Efficiency

The production run was minimal-call.

Calls used:
1. `GET /invoice?...fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`
2. `PUT /ledger/voucher/{paymentVoucherId}/:reverse?date=2026-03-20`

Wasted calls: none.

Exact lower-call path next agent should use for the same task shape:
1. One decisive `GET /invoice` using prompt facts like `customer.organizationNumber + exact ex-VAT amount + exact line/service text`, then extract the payment voucher from `postings[]`.
2. `PUT /ledger/voucher/{paymentVoucherId}/:reverse?date=<task-date>`.
3. Stop.
4. Only add one final invoice read if the prompt explicitly requires proof of reopened balance.

## Root Causes

- Success root cause: the prompt matched an existing trusted standard exactly, so no speculative endpoint exploration was needed.
- Main pitfall discovered after the run: persistent sandbox `/invoice` search can lag behind `GET /invoice/{id}` for freshly created paid invoices.
- Another confirmed pitfall: the payment posting can still be `type=null`; the safe fallback remains the unique negative `1500` customer-ledger posting with `Betaling: ...` text.

## Sandbox Verification

Used sandbox credentials only.

Proof fixture:
- Customer `108258035`, org `898097711`
- Product `84388435`
- Order `401964669`
- Invoice `2147536442`, invoice number `56`
- Service text `Softwarelizenz 809771`
- Ex-VAT amount `1234`

Verified facts:
- `GET /invoice/{id}?fields=*,customer(*),orderLines(*,product(*)),orders(*,orderLines(*,product(*))),postings(*,voucher(*),account(*),customer(*),closeGroup(*))` exposed the service text in top-level `orderLines[].description` and `displayName`.
- The payment posting was the unique negative `1500` posting with `type=null`, description `Betaling: Faktura nummer 56 ...`, voucher `608833063`.
- `PUT /ledger/voucher/608833063/:reverse?date=2026-03-20` returned reverse voucher `608833064`.
- A later `GET /invoice/{id}` showed reopened outstanding `1234`.

Sandbox-only trap observed:
- Broad same-day `GET /invoice?...count=1000...` returned `fullResultSize=3` / `values.length=3` but still omitted the freshly created paid invoice, while `GET /invoice/{id}` returned it immediately.

## Playbook Changes

Updated existing docs. No new trusted standard or playbook created.

Changed paths:
- `trusted-standards/reverse-customer-invoice-payment.md`
- `task-playbooks/reverse-customer-invoice-payment.md`
- `trusted-standards/common-endpoints.md`

What changed:
- documented that direct `GET /invoice/{id}` already exposes enough reversal evidence on one invoice
- documented the persistent-sandbox `/invoice` search lag trap
- explicitly warned not to turn that sandbox trap into extra production resolver calls

## Commit

- Commit: `896cf30`
- Message: `tripletex playbook: document invoice reversal search lag`

## Reusable Heuristics

- For exact existing-invoice payment-reversal tasks, default to `GET /invoice` once, `PUT /ledger/voucher/{id}/:reverse` once, then stop.
- Treat prompt ex-VAT amount as a locate key only, never as reopened-balance proof.
- For reversal lookup, scan `postings[]` first for `INCOMING_PAYMENT` / `INCOMING_PAYMENT_OPPOSITE`; if absent, use the unique negative `1500` posting with payment text.
- Do not add `GET /customer`, `GET /ledger/voucher/{id}`, or a default final invoice verification read in an exact-match scored run.
- In persistent sandbox proof runs, do not overreact if broad `/invoice` search misses a just-created paid invoice; that is not evidence that the production path needs more calls.