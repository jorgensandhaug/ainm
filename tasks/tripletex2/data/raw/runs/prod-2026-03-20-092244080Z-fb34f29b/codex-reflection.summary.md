# 1. Task

Post-run learning pass for production run `prod-2026-03-20-092244080Z-fb34f29b`: reflect on the failed approach, prove the correct Tripletex path in sandbox only, update the playbook system, commit only the learning docs, and write this summary.

# 2. Reflection

The strongest original mistake was not the API write shape itself; it was my verification logic. I treated `response.value.orderLines=[]` from `POST /order` as proof that embedded line creation had failed. Sandbox later proved that assumption was wrong: Tripletex created the lines, but the write response did not echo them.

The original run also suffered from missing task-specific guidance. There was no exact-match playbook for “create order -> invoice it -> register full payment”, so I improvised from invoice/payment playbooks and drifted into weaker assumptions. After the first product-resolution failure, I reacted by changing the write path to `/order/orderline/list` before proving that embedded order lines were actually broken. That was extra complexity and the wrong corrective branch.

The good part: the initial spec reading was narrow, the bank-account/payment-type heuristics were directionally correct, and the sandbox follow-up isolated the real issue quickly once I stopped assuming the `POST /order` response was authoritative for line verification.

# 3. Root Causes

- Missing exact-match playbook for order -> invoice -> full-payment tasks.
- Over-trusting an intermediate write response shape: `POST /order` can omit embedded lines in `response.value.orderLines`.
- Verification at the wrong step: I tried to prove correctness from the order-create response instead of from the later invoice/payment responses, which are stronger for this task.
- Product-reference handling was not codified. I used `productNumber` plus ID fallback in code, but I had not first proven that repeated `productNumber` lookup works, so the first failure left too much ambiguity.
- The production run likely created at least one order before aborting. This is an inference from sandbox proof: the same shape created lines successfully there even though the response echoed `orderLines=[]`.

# 4. Sandbox Verification

I used only the provided sandbox credentials and wrote all API scripts under:

`/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-092244080Z-fb34f29b/scripts`

Verified facts:

- Created sandbox customer `108240251` (`organizationNumber=100000008`) and products `84384037` / `84384038` using outgoing VAT type `6`.
- Verified product lookup both ways:
  - `GET /product?productNumber=844294&productNumber=374294&fields=*` returned both products.
  - `GET /product?ids=84384037,84384038&fields=*` returned both products.
- Verified the response-shape trap:
  - `POST /order` created order `401954023` with embedded lines.
  - The `201` response echoed `orderLines=[]`.
  - `GET /order/401954023?fields=*,customer(*),orderLines(*)` returned `2` lines.
  - I deleted that proof order after reading it.
- Verified the alternate explicit-line path also works:
  - bare order `401954024`
  - `POST /order/orderline/list` created line IDs `1607498540` and `1607498541`
  - invoice `2147522260`
  - payment reduced outstanding `20450 -> 0`
- Verified the actual winning path end to end with embedded lines and no `/order/orderline/list` detour:
  - customer `108240263`
  - products `84384044` / `84384045`
  - `POST /order` created order `401954042` and still echoed `postResponseLineCount=0`
  - `PUT /order/401954042/:invoice?invoiceDate=2026-03-20&sendToCustomer=false` created invoice `2147522278`
  - invoice response proved `amountExcludingVatCurrency=20450` and `outstandingBeforePayment=20450`
  - `PUT /invoice/2147522278/:payment` reduced outstanding to `0`
- Verified payment-type heuristic remained valid in sandbox:
  - payment type `32813747`
  - description `Kontant`
  - debit account `1900`
- Company invoice bank account was already present on account `424190862` with `12345678903`, so no sandbox update was needed in the final proof run.

# 5. Playbook Changes

I created a new playbook.

Exact playbook paths changed:

- `tasks/tripletex/codex-environment/task-playbooks/create-order-invoice-and-register-payment.md`

Other learning-doc change:

- `tasks/tripletex/codex-environment/AGENTS.md`

What changed:

- Added a new exact-match playbook for “create order, invoice it, and register full payment”.
- Captured the proven rule that `POST /order` may create embedded lines while echoing `orderLines=[]`.
- Documented the correct winning flow:
  - resolve customer
  - resolve products by `productNumber` first, `ids` once as fallback
  - ensure invoice bank account if needed
  - `POST /order` with embedded `orderLines`
  - `PUT /order/{id}/:invoice?sendToCustomer=false`
  - `GET /invoice/paymentType`
  - `PUT /invoice/{id}/:payment` using invoice outstanding amount
- Updated the AGENTS Task Playbooks table and added a general gotcha bullet for the `POST /order` response-shape trap.

# 6. Commit

- Hash: `1557387`
- Message: `tripletex playbook: add order invoice payment flow`

# 7. Reusable Heuristics

- For multi-step Tripletex tasks, do not let an intermediate write response override stronger downstream proof. Here, invoice/payment responses were more trustworthy than `POST /order` for line verification.
- When `POST /order` uses embedded `orderLines`, trust the returned order `id`, not necessarily the echoed `orderLines` array.
- If the prompt references existing products with numeric refs, try `productNumber` lookup first, then a single `ids` fallback. Stop after that unless the prompt clearly forces a broader search.
- Do not replace a simple write path with a more complex one just because a response echo looks sparse. Prove the failure first.
- For invoice-payment tasks, always pay the current outstanding amount from the invoice object, never the prompt’s line subtotal.
- Keep `sendToCustomer=false` unless the prompt explicitly asks for sending.
