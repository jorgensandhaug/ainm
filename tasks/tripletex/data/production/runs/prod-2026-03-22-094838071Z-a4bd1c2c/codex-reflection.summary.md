# Codex Reflection: prod-2026-03-22-094838071Z-a4bd1c2c

## Task

Register full payment on an existing customer invoice for Windmill Ltd (org no. 830362894), 32200 NOK excluding VAT for "System Development". Task ID: 07 (register-customer-invoice-payment).

## Reflection

**What went well:**
- Agent correctly identified the exact trusted-standard match (`register-customer-invoice-payment.md`) on the first attempt via glob search
- Read the trusted standard before writing any script (following the documented rule)
- Wrote a single script that followed the canonical 3-call path exactly
- Used `amountOutstanding` (40250) from the invoice object for `paidAmount`, not the prompt's ex-VAT amount (32200) — this is the single most important rule in this task shape
- Correctly used query parameters (not JSON body) on `PUT /invoice/{id}/:payment`
- Correctly included `invoiceDateFrom`/`invoiceDateTo` on `GET /invoice`
- Correctly used `fields=*,customer(*),orderLines(*),orders(*,orderLines(*))` for full expansion
- Selected `Betalt til bank` payment type with debit account `1920`
- Result: 3 calls, 0 errors, 7/7 score (2/2 checks passed)

**What went poorly:**
- Nothing. This was an optimal execution.

**Mistakes:**
- None.

## Call Efficiency

**The run was minimal-call.** 3 API calls is the proven floor for this task shape (18th production confirmation). No calls were wasted.

| # | Call | Purpose |
|---|------|---------|
| 1 | `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))` | Locate the unpaid invoice |
| 2 | `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` | Resolve incoming payment type |
| 3 | `PUT /invoice/2147689036/:payment?paymentDate=2026-03-22&paymentTypeId=28547465&paidAmount=40250` | Register full payment |

**Lower-call path:** None exists. The standalone 3-call path is the proven minimum. A 2-call path would require embedding `paymentTypeId` discovery inside the invoice locate read, which has been disproven — `fields=*,paymentType(*)` returns 400 on `GET /invoice`, and no other shortcut exists (verified across 6+ sandbox proofs).

**Exact path the next agent should follow:**
1. `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))` — filter locally by `customer.organizationNumber`, `amountExcludingVatCurrency`, positive `amountOutstanding`, and description match
2. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` — use `Betalt til bank` or first available
3. `PUT /invoice/{id}/:payment?paymentDate=<today>&paymentTypeId=<id>&paidAmount=<amountOutstanding>` — query params only, NO JSON body

## Root Causes

No issues to diagnose. This was the 18th production confirmation and 4th run for this exact customer+amount+description combination (`830362894` / `32200` / `System Development`).

## Sandbox Verification

Sandbox payment path was **blocked by reconciled bank statement** (`Posteringer kan ikke gjøres i en periode der det finnes en avstemt kontoutskrift`). This is persistent sandbox state noise from prior bank reconciliation testing — all payment dates (including future months) are blocked. The 3-call path is already proven by 18 production runs and 8+ prior sandbox verifications.

## Playbook Changes

**No changes made.** The trusted standard (`trusted-standards/register-customer-invoice-payment.md`) and playbook (`task-playbooks/register-customer-invoice-payment.md`) are already comprehensive and optimal:
- 17 prior production confirmations documented
- 8+ sandbox verifications documented
- 2-call shortcut exhaustively disproven
- All common pitfalls documented (missing date params, JSON body on PUT, insufficient field expansion, fake server-side filters)
- Payment amount rules clear (use `amountOutstanding`, not prompt ex-VAT amount)
- Payment type selection rules clear (no `isIncoming` field, `creditAccount` can be null)

Adding an 18th production confirmation line would add minimal value to already conclusive documentation.

## Commit

No commit needed. No documentation changes were required — the existing trusted standard and playbook already capture the complete and optimal 3-call path for this task shape.

## Reusable Heuristics

1. **This task shape is fully solved.** The 3-call `GET invoice → GET paymentType → PUT payment` path has 18 production confirmations across 7 languages (en, nb, nn, de, fr, es, pt) with zero failures when the trusted standard is followed.
2. **The single biggest pitfall is using the prompt's ex-VAT amount as `paidAmount`.** Always use `amountOutstanding` or `amountCurrencyOutstanding` from the located invoice object.
3. **The second biggest pitfall is sending PUT parameters as JSON body.** `PUT /invoice/{id}/:payment` takes all parameters as query parameters.
4. **The third biggest pitfall is omitting date parameters on GET /invoice.** Both `invoiceDateFrom` and `invoiceDateTo` are required.
5. **Field expansion is mandatory.** `fields=*` alone returns ID-only references — use `customer(*)`, `orderLines(*)`, `orders(*,orderLines(*))` on invoice reads and `debitAccount(*),creditAccount(*)` on payment type reads.
6. **Payment type selection is simple.** Use `Betalt til bank` or first available. No `isIncoming` field exists. `creditAccount` can be null.
7. **Read the trusted standard before writing.** This run took 5 seconds from task receipt to script execution because it followed the established standard exactly.
