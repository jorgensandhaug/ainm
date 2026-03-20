# 1. Task

Post-run learning pass for the 2026-03-20 production task that asked to create an order for customer `Río Verde SL` (`951612936`), invoice it, and register full payment. Required follow-up: reflect on the mistakes, verify the corrected path in sandbox, update reusable playbook guidance, commit only `AGENTS.md` / playbook changes, and write this summary.

# 2. Reflection

What went well:
- The original production run confirmed the core write path was correct: `POST /order` with embedded lines, `PUT /order/{id}/:invoice`, then `PUT /invoice/{id}/:payment`.
- The production run also correctly reused the invoice write response for the payment amount instead of paying the prompt’s ex-VAT sum.
- Recovery discipline improved after the payment-type mistake: instead of creating another order, the follow-up logic located the already-created unpaid invoice and finished the payment on that existing invoice.

What went poorly:
- I over-assumed that numeric refs in parentheses (`4430`, `7773`) would resolve via `GET /product?productNumber=...` or `GET /product?ids=...`. In this account they did not.
- I over-assumed a usable incoming payment type would expose a `15xx` customer-ledger `creditAccount`. In the actual account, the valid bank payment type was `Betalt til bank` with `debitAccount=1920` and `creditAccount=null`.
- Because of that second mistake, the first production payment attempt stopped after the order and invoice had already been created.

Correct approach:
- For product refs: try `productNumber` first, then `ids`, then exactly one broad `GET /product?count=1000&fields=*` filtered locally by exact prompt names if both numeric lookups miss.
- For payment type selection: prefer a `19xx` debit account, especially when `isBankAccount=true` or `isInvoiceAccount=true`; do not require `creditAccount`.
- After any late-step failure that happens after invoice creation, resume from the existing invoice instead of replaying `POST /order`.

# 3. Root Causes

- Weak assumption 1: “numeric prompt refs == Tripletex productNumber or product id”. False. The prompt can contain numeric refs that are only human-facing references.
- Weak assumption 2: “valid incoming payment type must show `creditAccount 15xx`”. False. Tripletex can return a valid payment type with `creditAccount=null`.
- Playbook gap 1: the order+invoice+payment playbook had no final fallback for product resolution once both numeric reads failed.
- Playbook gap 2: the payment playbook normalized numeric account numbers but still implicitly favored `15xx` credit-account presence.
- Recovery gap: the order+invoice+payment playbook did not explicitly say to resume payment on the existing invoice after partial success.

# 4. Sandbox Verification

Investigation used only sandbox credentials at `https://kkpqfuj-amager.tripletex.dev/v2`.

Inspection proof:
- `GET /customer?organizationNumber=951612936&fields=*` returned no sandbox customer for the production prompt.
- `GET /product?productNumber=4430&productNumber=7773&fields=*` returned no sandbox products for the production prompt.
- `GET /product?ids=4430,7773&fields=*` also returned none.
- `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` returned:
  - `32813747` `Kontant` with debit `1900`, `creditAccount=null`
  - `32813748` `Betalt til bank` with debit `1920`, `isBankAccount=true`, `isInvoiceAccount=true`, `creditAccount=null`

End-to-end proof of the corrected flow:
- Created sandbox customer `108243973` with organization number `995331320`
- Created order `401956811`
- Invoiced it to invoice `2147525823` / invoice number `9`
- Invoice ex-VAT total was `20450`
- Registered full payment with payment type `32813748` (`Betalt til bank`, debit `1920`, `creditAccount=null`)
- Payment write returned `remainingOutstanding=0`

This proves the corrected payment-type heuristic and confirms the full `order -> invoice -> payment` path works without needing a `15xx` credit-account field in the payment-type response.

# 5. Playbook Changes

Updated existing guidance. No new playbook created.

Exact paths changed:
- `./AGENTS.md`
- `./task-playbooks/create-order-invoice-and-register-payment.md`
- `./task-playbooks/register-customer-invoice-payment.md`

Changes made:
- Added a general AGENTS gotcha that prompt numeric product refs in parentheses are not guaranteed to be `productNumber` or product IDs; documented the final one-read broad-product fallback by exact prompt name.
- Added a general AGENTS gotcha that `GET /invoice/paymentType` may return a valid incoming payment type with `creditAccount=null`, and that `19xx` debit accounts flagged as bank/invoice accounts should be preferred.
- Added a general AGENTS gotcha to resume from the existing unpaid invoice after late-step failures instead of recreating the order.
- Updated the order+invoice+payment playbook to:
  - add the name-filtered broad `/product` fallback after numeric lookups miss
  - remove the implicit requirement for `creditAccount 15xx`
  - prefer bank/invoice-account `19xx` debit accounts
  - document the recovery flow for finishing payment on an already-created invoice
  - stop implying an unconditional `GET /ledger/account` in the minimal path
- Updated the invoice-payment playbook to explicitly allow `creditAccount=null` on valid payment types and prefer `19xx` debit accounts with bank/invoice flags.

# 6. Commit

- Commit hash: `79d07d2`
- Commit message: `tripletex playbook: refine order payment recovery`

# 7. Reusable Heuristics

- If a prompt gives existing-product numeric refs in parentheses, treat them as hints, not guarantees of `productNumber` or entity ID.
- Product lookup fallback order:
  1. `GET /product?productNumber=...`
  2. `GET /product?ids=...`
  3. if both fail and exact names are present, one decisive `GET /product?count=1000&fields=*` and local exact-name filter
- Payment-type selection heuristic:
  1. normalize account numbers to strings
  2. prefer debit account `19xx`
  3. prefer `isBankAccount=true` or `isInvoiceAccount=true`
  4. do not require `creditAccount`
- In create->invoice->pay flows, once invoice creation succeeded, the invoice becomes the recovery anchor. Do not replay upstream writes after a downstream failure.
- Reuse write responses for outstanding amounts. Do not pay prompt ex-VAT totals directly.
