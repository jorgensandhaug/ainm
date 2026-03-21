# Codex Reflection Summary

## 1. Task

Portuguese prompt: Create an order for customer **Cascata Lda** (org. nº 927161524) with products **Consultoria de dados (8400)** at 5700 NOK and **Design web (2535)** at 3850 NOK. Convert the order to an invoice and register full payment.

Exact match to trusted standard: `./trusted-standards/create-order-invoice-and-register-payment.md`.

## 2. Reflection

**What went well:**
- Immediately identified the task as an exact trusted-standard match
- Read the trusted standard before writing any script
- Used all proven patterns: comma-separated product lookup, `String(p.number)` comparison, `pts[0]` payment type selection, `paidAmount=0.01` seed
- Zero errors, zero wasted calls, outstanding=0 on first attempt
- Single script executed the full 5-call path cleanly

**What went poorly:**
- Nothing. This was a clean, optimal execution.

**Mistakes:**
- None.

## 3. Call Efficiency

**The run was minimal-call.** 5 API calls, matching the canonical minimum for this task shape:

| # | Call | Result |
|---|------|--------|
| 1 | `GET /customer?organizationNumber=927161524&fields=*` | Customer id 108438083 |
| 2 | `GET /product?number=8400,2535&fields=*` | Both products found (count=2) |
| 3 | `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` | Kontant, id 37496241 |
| 4 | `POST /order` | Order 402040785 created |
| 5 | `PUT /order/402040785/:invoice?...&paymentTypeId=37496241&paidAmount=0.01&paymentTypeIdRestAmount=37496241` | Invoice 2147643553, outstanding=0 |

**Wasted calls:** 0

**Lower-call path:** None exists. 5 is the proven floor (see sandbox verification below).

## 4. Root Causes

No errors or inefficiencies in this run. The agent correctly followed the trusted standard without deviation.

## 5. Sandbox Verification

Three call-reduction hypotheses were tested and all disproved:

1. **Inline `product: { number: "..." }` on POST /order** — accepted (201) but creates orphaned order lines. Product fields are `null`/`undefined` in readback. The order line has no linkage to the existing product. **Verdict: unusable.**

2. **Inline `customer: { organizationNumber: "..." }` on POST /order** — rejected (422, `customer.name: Kan ikke være null`). The API treats this as creating a new customer, which requires the name field. **Verdict: impossible.**

3. **Hardcoded `paymentTypeId=1` on PUT /order/:invoice** — rejected (422, `Ugyldig verdi`). Payment type IDs are account-specific and cannot be guessed. **Verdict: impossible.**

**Conclusion:** All three GET calls (customer, product, paymentType) are mandatory for a fresh run. The 5-call canonical path is the proven floor.

## 6. Playbook Changes

**Updated existing files** (no new files created):

- `./trusted-standards/create-order-invoice-and-register-payment.md`
  - Added 4th production confirmation (f6b01fc8, Portuguese, Cascata Lda / 927161524, 5 calls 0 errors)
  - Added sandbox findings disproving three call-reduction hypotheses
  - Stated "5 calls is the proven floor for this task shape on a fresh run"

- `./task-playbooks/create-order-invoice-and-register-payment.md`
  - Added matching production confirmation with summary of sandbox findings

No AGENTS.md changes needed — the trusted standard and playbook table entries already existed.

## 7. Commit

- **Hash:** `e52d74a6`
- **Message:** `tripletex playbook: create-order-invoice-and-register-payment — add 4th production confirmation (f6b01fc8, Portuguese prompt, Cascata Lda / 927161524 / Consultoria de dados 8400 + Design web 2535, 5 calls 0 errors), disprove three call-reduction hypotheses: inline product:{number} creates orphaned lines (no product linkage), inline customer:{organizationNumber} rejected 422, hardcoded paymentTypeId=1 rejected 422 — confirms 5 calls is the proven floor for this task shape`

## 8. Reusable Heuristics

1. **The 5-call path is the proven floor** for order→invoice→payment with existing customer and products on a fresh run. No inline resolution shortcuts work.

2. **`product: { number }` is a trap** — POST /order accepts it silently (201) but does NOT resolve the number to an existing product. The order line is created without product linkage, which would fail scoring.

3. **`customer: { organizationNumber }` requires name** — the API treats it as a customer-creation attempt, not a lookup-by-orgNumber.

4. **`paymentTypeId` is account-specific** — hardcoding any value (even 1) returns 422. Always resolve via `GET /invoice/paymentType`.

5. **The canonical execution order matters:** customer → products → paymentType → order → invoice+payment. The three GETs are independent and could theoretically run in parallel for speed, but each is a separate API call.

6. **This task shape is fully stable** across Portuguese, English, Nynorsk, and Norwegian prompts — 4 consecutive clean 5-call confirmations with the comma-separated product lookup path.
