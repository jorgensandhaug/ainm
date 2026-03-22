# Post-Run Reflection: prod-2026-03-22-053741210Z-7443a3f6

## Task

Register full payment on an existing customer invoice for Floresta Lda (org. nº 906739542), pending invoice of 6800 NOK ex-VAT for "Consultoria de dados". Portuguese prompt.

## Reflection

**What went well:**
- Correctly identified the task as "register customer invoice payment" — an exact match for the `register-customer-invoice-payment` trusted standard
- Executed the canonical 3-call path with zero wasted calls and zero errors
- Used the live outstanding amount (8500) from the invoice object, not the prompt's ex-VAT amount (6800)
- Payment parameters correctly sent as query params on `PUT /:payment`, not as JSON body
- Correct field expansions on both GET calls (`customer(*),orderLines(*),orders(*,orderLines(*))` and `debitAccount(*),creditAccount(*)`)
- Payment type "Betalt til bank" (id 38834237, debit 1920) correctly selected

**What went poorly:**
- Read 4 documentation files (2 trusted standards + 2 playbooks) when only 1 was needed. The AGENTS.md instruction explicitly says "After reading the matched standard, immediately write and execute the script. Do not also read AGENTS.md, openapi.json, the playbook, or any other file." This wasted context window space and processing time but did not waste API calls.

**Mistakes:** None in the API execution itself. The only issue was over-reading documentation.

## Call Efficiency

**This run was minimal-call: 3 API calls, 0 errors.**

| # | Call | Result |
|---|------|--------|
| 1 | `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))` | Located invoice 2147677561, outstanding=8500 |
| 2 | `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` | Resolved payment type 38834237 (Betalt til bank, debit 1920) |
| 3 | `PUT /invoice/2147677561/:payment?paymentDate=2026-03-22&paymentTypeId=38834237&paidAmount=8500` | Remaining outstanding = 0 |

No wasted calls. The canonical minimum for a standalone register-payment task without cached paymentTypeId is 3 calls. No 2-call shortcut exists (sandbox-verified).

## Root Causes

No failures or wasted calls occurred, so no root cause analysis is needed for the API execution.

The only process-level issue: reading multiple documentation files instead of just the matching trusted standard. This is caused by the agent not immediately recognizing the exact match and wanting to compare with the "create order + invoice + payment" flow. Future agents should distinguish these upfront: if the prompt says the invoice already exists (e.g. "tem uma fatura pendente"), it's always `register-customer-invoice-payment`, not the create-order flow.

## Sandbox Verification

Re-verified on 2026-03-22 in persistent sandbox:
- `GET /invoice` response has **zero** payment-related keys (no `paymentTypeId`, no `paymentType`, no `payments` anywhere in the response)
- `fields=*,paymentType(*)` → 400
- `fields=*,paymentTypes(*)` → 400
- `fields=*,payments(*)` → 400
- Payment types still: `32813747` (Kontant, debit 1900) and `32813748` (Betalt til bank, debit 1920)
- **No 2-call standalone shortcut exists.** 3 calls is the proven floor.

## Playbook Changes

Updated existing files only (no new files created):
- `./trusted-standards/register-customer-invoice-payment.md` — added 17th production confirmation entry for `906739542` + `6800` + `Consultoria de dados` (Portuguese, 3 calls, 0 errors)
- `./task-playbooks/register-customer-invoice-payment.md` — added production run details and payment type `38834237` to the variance list

No AGENTS.md changes needed — the task shape was already fully documented.

## Commit

- **Hash**: `ae4e1fc8`
- **Message**: `tripletex playbook: register-customer-invoice-payment — add prod-7443a3f6 run entry (Portuguese prompt, Floresta Lda / 906739542 / Consultoria de dados / 6800 ex-VAT → 8500 outstanding, 3 calls 0 errors, payment type 38834237 Betalt til bank / debit 1920); 17th production confirmation of this task shape; third Portuguese confirmation; sandbox re-verified 2026-03-22: paymentType(*)/paymentTypes(*)/payments(*) expansions on GET /invoice all still return 400, no 2-call shortcut exists`

## Reusable Heuristics

1. **Task disambiguation**: When the prompt says "has a pending invoice" / "tem uma fatura pendente" — always use `register-customer-invoice-payment`, never the create-order flow. The invoice already exists.
2. **3-call floor is proven**: For standalone register-payment with no cached paymentTypeId, 3 calls is the proven minimum. No field expansion on GET /invoice can embed a reusable paymentTypeId.
3. **Read only the matching trusted standard**: Do not read the playbook, AGENTS.md, or openapi.json for exact trusted-standard matches. Read only the `.md` file, then immediately write and execute the script.
4. **Always use live outstanding amount**: The prompt's ex-VAT amount (6800) is the invoice locator, not the payment amount. The payment amount comes from `amountCurrencyOutstanding` (8500 = 6800 × 1.25).
5. **Payment type selection**: Prefer `description === "Betalt til bank"` → debit account starting with `19` → `pts[0]` as fallback. All three strategies have worked in production.
6. **Payment params are query params**: `paymentDate`, `paymentTypeId`, `paidAmount` on `PUT /:payment` must be query parameters, never JSON body. JSON body causes 422.
