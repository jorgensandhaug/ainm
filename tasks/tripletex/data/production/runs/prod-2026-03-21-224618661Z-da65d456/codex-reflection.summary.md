# Codex Reflection Summary

## Task
Register full payment on an existing customer invoice for Olivares SL (org. nº 866946108), 43300 NOK ex-VAT, "Sesión de formación" (Spanish prompt).

## Reflection
This run executed flawlessly, matching the trusted standard exactly:
1. `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))` — located invoice `2147575475` for Olivares SL by `organizationNumber=866946108`, `amountExcludingVatCurrency=43300`, and description containing "formación"/"sesión"
2. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` — resolved payment type `28417664` ("Betalt til bank", debit account `1920`)
3. `PUT /invoice/2147575475/:payment?paymentDate=2026-03-21&paymentTypeId=28417664&paidAmount=54125` — paid the live outstanding amount (54125 = 43300 × 1.25 VAT), reducing `amountOutstanding` to `0`

**What went well:**
- Read the trusted standard before writing any script
- Used correct field expansions on both GET calls
- Used query parameters (not JSON body) for PUT /:payment
- Used the live `amountOutstanding` (54125) not the prompt's ex-VAT amount (43300)
- Spanish description matching worked correctly with lowercase substring search
- Zero errors, zero wasted calls

**What could be improved:** Nothing — this was an optimal execution.

## Call Efficiency
**Minimal-call: YES** — 3 calls, matching the proven canonical floor for standalone invoice payment with no cached same-run paymentTypeId.

| # | Call | Purpose | Result |
|---|------|---------|--------|
| 1 | `GET /invoice?...` | Locate unpaid invoice | Found `2147575475`, outstanding=54125 |
| 2 | `GET /invoice/paymentType?...` | Resolve incoming payment type | `28417664` "Betalt til bank" debit 1920 |
| 3 | `PUT /invoice/2147575475/:payment?...` | Register full payment | amountOutstanding=0 |

**Wasted calls:** 0
**Lower-call path:** None exists for standalone execution. Sandbox re-verification confirmed `paymentType` is not a valid field expansion on `GET /invoice` (returns 400), and invoice objects expose zero payment-related keys. The 3-call floor is the proven minimum without same-run paymentTypeId caching.

## Root Causes
No errors or inefficiencies to diagnose. The run followed the trusted standard perfectly on the first attempt.

## Sandbox Verification
Sandbox tests confirmed:
- `fields=*,paymentType(*)` on `GET /invoice` → 400 (not a valid InvoiceDTO field)
- `fields=*,invoicePaymentType(*)` on `GET /invoice` → 400 (not a valid InvoiceDTO field)
- Invoice objects contain zero payment-related keys (no `paymentType`, `paymentTypeId`, etc.)
- `GET /invoice/paymentType` still returns "Betalt til bank" (id=32813748) with debitAccount=1920 on sandbox
- No 2-call standalone shortcut exists — the 3-call floor remains proven

## Playbook Changes
**Updated existing files** (no new files created):
- `./trusted-standards/register-customer-invoice-payment.md` — added 15th production confirmation (Spanish, da65d456)
- `./task-playbooks/register-customer-invoice-payment.md` — added 15th production confirmation details and payment type `28417664` to observed variance list

No structural changes needed — the trusted standard and playbook are mature and comprehensive after 15 production confirmations across 7 languages (nb, en, es, pt, fr, de, nn).

## Commit
- **Hash:** `1398ff99`
- **Message:** `tripletex playbook: register-customer-invoice-payment — add 15th production confirmation (da65d456, Spanish prompt, Olivares SL / 866946108 / Sesión de formación / 43300 / 54125 outstanding, 3 calls 0 errors); second Spanish confirmation; payment type 28417664 added to observed variance list`

## Reusable Heuristics
1. **Always read the trusted standard first** — this run avoided all documented pitfalls by reading the standard before writing the script
2. **Use live outstanding amount, never prompt ex-VAT** — prompt said 43300 NOK "sin IVA", actual payment was 54125 (with 25% VAT)
3. **Spanish description matching** — search for unique substrings ("formación", "sesión") rather than exact full-string match; lowercase normalize for accent-insensitive matching
4. **Query params on PUT /:payment** — all params (`paymentDate`, `paymentTypeId`, `paidAmount`) must be query params, not JSON body
5. **Field expansions are mandatory** — `fields=*` alone gives ID-only refs; always use `customer(*),orderLines(*),orders(*,orderLines(*))` on invoice read and `debitAccount(*),creditAccount(*)` on payment type read
6. **"Betalt til bank" with debit 1920** — consistent across all 15 production runs as the correct incoming bank payment type
7. **3 calls is the floor** — exhaustively proven across 15 production runs and multiple sandbox proofs; no field expansion or endpoint shortcut reduces it to 2 calls for standalone execution
