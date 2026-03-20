## Task

Reflect on the scored production run for the German prompt: create an order for `Waldstein GmbH` (`975687821`) with `Netzwerkdienst (4366)` at `32750 NOK` and `Beratungsstunden (3402)` at `17450 NOK`, convert it to an invoice, and register full payment. Then verify the exact task shape in persistent sandbox, update the shared Tripletex learning artifacts, commit those doc changes, and record the outcome here.

## Reflection

The production run went well. It matched the exact trusted standard, used the combined invoice-and-payment write, reused write responses, avoided avoidable `4xx`s, and finished with the intended state on the first path. Production created order `401975681`, invoice `2147552137`, and settled it with `paymentTypeId=36030207`.

No execution mistake happened in the live API flow. The main latent risk was documentation bias: the trusted standard already contained a same-day sandbox proof for this exact customer/product pair with `paymentTypeId=32813748`, which could tempt a future agent to hardcode that id. This run proved that would be wrong across environments even when the task shape is identical.

## Call Efficiency

This run was minimal-call for a fresh exact-match task with no same-run cached payment type. It used `5` Tripletex API calls, and `5` is the realistic floor here:

1. `GET /customer?organizationNumber=975687821&fields=*`
2. `GET /product?productNumber=4366&productNumber=3402&fields=*`
3. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
4. `POST /order`
5. `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false&paymentTypeId=36030207&paidAmount=0.01&paymentTypeIdRestAmount=36030207`

Wasted calls: none.

Lower-call replacement path: only conditional. If the same run already holds a proven incoming `paymentTypeId` for the same company and currency, the next agent can skip step 3 and finish in `4` downstream calls. For a standalone fresh run, the next agent should still use the `5`-call path above.

## Root Causes

The flow cannot safely drop the customer read because the invoice/order write needs `customer.id`.

The flow cannot safely drop the product read because the order lines should link existing products by `product.id`, and exact numeric refs still need resolution.

The flow cannot safely drop the payment-type read in a fresh run because `paymentTypeId` is account-specific. Production used `36030207`; the sandbox proof for the same task family used `32813748`.

The flow should not add a default `/ledger/account` hedge. This run succeeded without it, so preflighting bank-account repair would have wasted one call.

## Sandbox Verification

Persistent sandbox re-proof used only the provided sandbox credentials and the same task shape. The exact `5`-call path succeeded again:

1. `GET /customer?organizationNumber=975687821&fields=*`
2. `GET /product?productNumber=4366&productNumber=3402&fields=*`
3. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
4. `POST /order`
5. `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false&paymentTypeId=32813748&paidAmount=0.01&paymentTypeIdRestAmount=32813748`

Observed proof points:

- Sandbox selected `paymentTypeId=32813748`.
- That payment type had `name=null`, `debitAccount.number=1920`, `isBankAccount=true`, and `isInvoiceAccount=true`.
- `POST /order` echoed `orderLines=[]`, so that field is still not a reliable verifier.
- `PUT /order/:invoice` returned invoice `2147552216`, invoice number `167`, and both `amountCurrencyOutstanding=0` and `amountOutstanding=0`.

This confirms the shared standard path is correct and also confirms that payment-type ids differ across environments even for the same prompt family.

## Playbook Changes

Updated existing artifacts. No new trusted standard or playbook was created.

Changed paths:

- `AGENTS.md`
- `trusted-standards/create-order-invoice-and-register-payment.md`
- `task-playbooks/create-order-invoice-and-register-payment.md`

What changed:

- Added a concrete production proof that the exact `Waldstein GmbH` task finished on the plain `5`-call path with no `/ledger/account` repair branch.
- Added the paired production-vs-sandbox lesson that `paymentTypeId` is environment-specific for this task family.
- Tightened the guidance to keep resolving `/invoice/paymentType` dynamically unless the same run already holds a proven reusable id.

## Commit

Commit hash: `1f8b84dd05ed85fa1c3417722b3aa17b8cb6c4bd`

Commit message: `tripletex playbook: document dynamic payment type on order invoice flow`

## Reusable Heuristics

- For the exact existing-customer existing-product order->invoice->full-payment shape, default to the `5`-call path and stop if the invoice write already returns outstanding `0`.
- Reuse `paymentTypeId` only inside the same run and only for the same company and currency.
- Never hardcode a `paymentTypeId` copied from sandbox, another environment, or an older run.
- Do not add a proactive `/ledger/account` read unless run evidence makes the missing-bank-account branch likely enough to justify the hedge.
- Do not treat `POST /order` returning `orderLines=[]` as failure.
- Use `paidAmount=0.01` for ordinary NOK combined invoice-payment writes; `paidAmount=0` is not a safe shortcut.