# Codex Reflection Summary — prod-2026-03-21-222433471Z-ba977073

## Task
German prompt: Find the one overdue invoice, book a 40 NOK reminder fee (debit 1500 / credit 3400), create and send a fee invoice to the customer, and register a 5000 NOK partial payment on the overdue invoice.

Exact trusted-standard match: `./trusted-standards/overdue-invoice-reminder-fee-and-partial-payment.md`

## Reflection

**What went well:**
- Correctly identified the task as an exact trusted-standard match
- Read the trusted standard before writing any script
- Response parsing (`values` vs `value`) handled correctly from the first script
- Voucher payload included correct `row: 1` / `row: 2`, avoiding the system-generated row 0 trap
- Omitted `vatType` on the fee invoice order line (correct for 0% reminder fee)
- All 6 successful API calls produced the correct Tripletex state

**What went poorly:**
- Fee-invoice `POST /invoice` used `orders: [], orderLines: [...]` (top-level orderLines) instead of `orders: [{ customer, orderDate, deliveryDate, orderLines: [...] }]`
- This caused a 422 error (`orders: Listen kan ikke være tom.`) and wasted 1 API call
- The agent then wrote a fix-up script with only the 2 remaining calls, which succeeded

**Why it happened:**
- The trusted standard said "create one direct order line for the prompt fee amount" but did not explicitly specify the `orders[].orderLines[]` nesting structure
- The playbook had the correct payload shape in the "Winning Payload Shapes" section, but the agent only read the trusted standard (as instructed for exact matches), not the playbook
- The `create-and-send-customer-invoice.md` standard explicitly warns "create lines under `orders[].orderLines[]`, not `invoice.orderLines`" — but this cross-reference was not in the overdue-invoice standard

## Call Efficiency

**Was the run minimal-call?** No. 7 calls used, 6 optimal.

| # | Call | Status | Notes |
|---|------|--------|-------|
| 1 | `GET /invoice?...&fields=*,customer(*)` | 200 | Found overdue invoice #1, id=2147645103, outstanding=36875 |
| 2 | `GET /invoice/paymentType?...` | 200 | Payment type 37539606 |
| 3 | `GET /ledger/account?number=1500,3400&fields=*` | 200 | 1500->475220342, 3400->475220538 |
| 4 | `POST /ledger/voucher` | 201 | Voucher #1, id=609186182 |
| 5 | `POST /invoice` | **422** | **WASTED** -- `orders: []` + top-level `orderLines` |
| 6 | `POST /invoice` | 201 | Fee invoice #4, id=2147645318, amount=40 |
| 7 | `PUT /invoice/{id}/:payment` | 200 | Outstanding 36875->31875 |

**Wasted calls:** 1 (call #5 -- incorrect invoice payload structure)

**Optimal 6-call path:**
1. `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-03-21&count=1000&sorting=-invoiceDate&fields=*,customer(*)`
2. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
3. `GET /ledger/account?number=1500,3400&fields=*`
4. `POST /ledger/voucher` (with `row: 1` / `row: 2`, `voucherType: null`, customer on 1500 posting)
5. `POST /invoice` with `orders: [{ customer, orderDate, deliveryDate, orderLines: [{ description, count: 1, unitPriceExcludingVatCurrency: <fee> }] }]`
6. `PUT /invoice/{id}/:payment?paymentDate=<date>&paymentTypeId=<id>&paidAmount=5000`

## Root Causes

1. **Invoice payload structure ambiguity in trusted standard** -- The standard said "create one direct order line" without specifying the `orders[].orderLines[]` nesting. The agent constructed a payload with top-level `orderLines` and empty `orders: []`, which Tripletex rejects.

2. **Cross-reference gap** -- The `create-and-send-customer-invoice.md` standard explicitly documents this nesting requirement, but the overdue-invoice standard did not cross-reference or duplicate that critical payload rule.

## Sandbox Verification

- **Confirmed**: `POST /invoice` with `orders: [], orderLines: [...]` fails `422 orders: Listen kan ikke være tom.`
- **Confirmed**: Same payload restructured as `orders: [{ customer, orderDate, deliveryDate, orderLines: [...] }]` succeeds `201` with correct `amountCurrency=40`
- Sandbox test used existing customer `108124240` (Logging Probe AS) with a new fixture invoice `#416` (id=2147645519, amount=8000, due 2026-02-15)

## Playbook Changes

Updated **existing** trusted standard and playbook (no new files created):

- `./trusted-standards/overdue-invoice-reminder-fee-and-partial-payment.md`:
  - Expanded the fee-invoice payload rule to explicitly require `orders[{ customer, orderDate, deliveryDate, orderLines: [...] }]` structure
  - Warned against top-level `orderLines` with empty `orders: []`
  - Added production proof for run `ba977073` (German prompt, fee 40, 7 calls / 1 wasted 422)
  - Added sandbox re-proof confirming the trap and correct structure

- `./task-playbooks/overdue-invoice-reminder-fee-and-partial-payment.md`:
  - Added pitfall: "Do not put order lines at the top level of the invoice payload"
  - Added production proof for run `ba977073` in Reflection Delta section

## Commit

- **Hash**: `53644cf3`
- **Message**: `tripletex playbook: overdue-invoice-reminder-fee -- add 8th production confirmation (ba977073, German prompt, fee 40 NOK, 7 calls 1 wasted 422); document orders[].orderLines[] payload structure requirement -- using top-level orderLines with empty orders fails 422; sandbox-verified`

## Reusable Heuristics

1. **Always nest order lines inside orders**: `POST /invoice` requires `orders: [{ orderLines: [...] }]`, never top-level `orderLines` with empty `orders: []`. This applies to all invoice creation, not just fee invoices.

2. **Cross-reference critical payload shapes**: When a trusted standard references invoice creation, it should document the exact nesting structure or explicitly point to the canonical invoice payload rules in `create-and-send-customer-invoice.md`.

3. **Read the playbook's "Winning Payload Shapes" section**: Even for exact trusted-standard matches, the playbook contains concrete payload examples that prevent structural mistakes. The trusted standard documents *what* to do; the playbook documents *how* the payload looks.

4. **Fee amount 40 NOK confirmed**: This run adds `40` to the verified fee amounts (`35`, `40`, `50`, `60`, `70`) across `de`, `es`, `fr`, `nb`, `pt` prompts. The 6-call path remains optimal across all variations.
