# Codex Reflection Summary

## Task

Create an order for customer **Cascata Lda** (org nr `927161524`) with products **Consultoria de dados** (`8400`) at 5700 NOK and **Design web** (`2535`) at 3850 NOK. Convert the order to an invoice and register full payment.

Task shape: **create-order-invoice-and-register-payment** (exact trusted-standard match).

## Reflection

**What went well:**
- Immediately identified the exact trusted-standard match (`create-order-invoice-and-register-payment.md`)
- Read the trusted standard before writing any code (critical rule followed)
- Wrote a single script implementing the canonical 5-call path
- Used all documented best practices:
  - Comma-separated `number=8400,2535` product lookup (OR semantics)
  - `String(p.number)` comparison (avoids type mismatch trap)
  - `pts[0]` payment type selection (no `isIncoming` filtering)
  - `paidAmount=0.01` seed for combined invoice+payment write
- Single script execution, zero retries, zero errors
- Invoice returned `amountOutstanding=0` — fully settled

**What went poorly:**
- Nothing. This was a flawless execution.

**Mistakes:**
- None.

## Call Efficiency

**The run was minimal-call.** 5 API calls, 0 errors — matches the proven floor for this task shape.

| # | Call | Result |
|---|------|--------|
| 1 | `GET /customer?organizationNumber=927161524&fields=*` | 200 — resolved customer id=108441424 |
| 2 | `GET /product?number=8400,2535&fields=*` | 200 — found both products |
| 3 | `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` | 200 — resolved paymentType id=37540194 (Kontant) |
| 4 | `POST /order` | 201 — created order id=402041924 |
| 5 | `PUT /order/402041924/:invoice?invoiceDate=2026-03-21&sendToCustomer=false&paymentTypeId=37540194&paidAmount=0.01&paymentTypeIdRestAmount=37540194` | 200 — invoice #1, outstanding=0 |

**Wasted calls:** 0

**Lower-call path for next agent:** Same 5-call path. This is the proven minimum. All lower-call hypotheses have been disproved:
- Inline `product: { number: "..." }` instead of `product: { id }`: creates orphaned order lines (no product linkage)
- Inline `customer: { organizationNumber: "..." }` instead of `customer: { id }`: rejected with 422 ("customer.name: Kan ikke være null")
- Hardcoded `paymentTypeId=1`: rejected with 422 ("Ugyldig verdi") — ID is account-specific
- Omitting `paymentTypeId` from invoice write: rejected with 422 ("Både paidAmount og paymentTypeId må oppgis")

## Root Causes

No issues to analyze. The run executed the canonical path without deviation.

## Sandbox Verification

1. **Parallel GETs test**: Confirmed steps 1-3 (customer, product, paymentType) are independent and can be parallelized with `Promise.all`. Parallel: 189ms vs sequential: 238ms. Call count unchanged (5). Wall-clock savings are minor and don't affect scoring.

2. **End-to-end 5-call path**: Verified using sandbox products `7579`+`2292` with customer `Logging Probe AS`. Order created (402042293), invoice #421, `amountOutstanding=0`. Path confirmed working.

3. **Product number edge case noted**: Sandbox products with numbers exceeding int32 range (e.g., `9459732933`) cause the comma-separated `number` filter to fail with 422 ("Listen med ID-er må være en kommaseparert liste med positive heltall"). Not relevant for production (product numbers are always small 4-digit integers), but noted as a sandbox-specific artifact.

## Playbook Changes

**No changes made.** The trusted standard (`trusted-standards/create-order-invoice-and-register-payment.md`) and playbook (`task-playbooks/create-order-invoice-and-register-payment.md`) were already fully documented with this exact run as the 4th production confirmation (lines 104-106 of trusted standard, lines 135-138 of playbook). Both files are committed and current.

- Trusted standard: 132 lines, 5 production confirmations, all call-reduction hypotheses disproved
- Playbook: 311 lines, extensive historical context and recovery branches
- AGENTS.md: table entries for both files already present and correct
- Common endpoints: order-to-invoice pattern already documented

## Commit

**No commit made.** No documentation changes were needed — the run was a flawless execution of an already fully-documented canonical path. All trusted standard, playbook, and AGENTS.md entries for this task shape were already committed and accurate.

## Reusable Heuristics

1. **5 calls is the proven floor** for the create-order-invoice-and-register-payment task shape on a fresh run without cached paymentTypeId. Do not attempt to reduce below 5.

2. **Read the trusted standard first, always.** This run succeeded because the agent read the standard before writing any code. Previous runs that skipped this step hit every documented pitfall.

3. **Comma-separated `number` filter** (`number=X,Y`) uses OR semantics and is the most efficient product lookup for known numeric refs. One call resolves all products.

4. **`String(p.number)` comparison is mandatory.** Product numbers are always strings in the API response. Strict integer comparison silently fails.

5. **`pts[0]` for payment type selection.** Payment type objects have no `isIncoming` field. Both "Kontant" and "Betalt til bank" work for the combined write.

6. **`paidAmount=0.01` is the proven NOK seed.** Tripletex calculates the remaining full payment automatically. `paidAmount=0` is rejected as missing.

7. **Single-script execution pattern.** For exact trusted-standard matches, write one script with all 5 calls and execute it once. No retries, no intermediate verification, no second script needed.

8. **This task shape is now confirmed across 5 languages**: Portuguese, English, Nynorsk, Spanish, German — with zero endpoint variation across any of them.
