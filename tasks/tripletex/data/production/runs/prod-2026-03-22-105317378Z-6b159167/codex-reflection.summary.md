# Reflection Summary — prod-2026-03-22-105317378Z-6b159167

## Task

Register supplier invoice INV-2026-6556 from Solmar Lda (org 974178680) for 50750 NOK gross (25% VAT included), expense account 6500. Portuguese prompt, text-only (no PDF).

## Reflection

**What went well:**
- Correctly identified task as T11 (text-only supplier invoice) and read the trusted standard before writing code
- Used importDocument (not direct POST /ledger/voucher) to create the required supplierInvoice entity
- Correctly handled `.values[0]` response shape from importDocument (this was the crash cause in d49da665)
- Two-step PUT booking worked correctly (sendToLedger=false then sendToLedger=true)
- Final Tripletex state appears correct: SI entity with amount=-50750, amountExcludingVat=-40600, kidOrReceiverReference=INV-2026-6556, voucher booked as 1-2026

**What went poorly:**
- 3 avoidable 422 errors that wasted API calls and time:
  1. importDocument rejected because XML buyer org number `000000000` fails PEPPOL-COMMON-R041 mod11 validation
  2. `GET /company/whoAmI` returns 422 because the proxy treats "whoAmI" as a numeric company ID
  3. `GET /supplierInvoice?voucherId=X&fields=*` returns 422 because `invoiceDateFrom` and `invoiceDateTo` are required params

## Call Efficiency

**Not minimal-call.** The run used 11 calls (4 writes + 4 reads + 3 errors) when the optimal path is 8 calls (4 writes + 4 reads, zero errors).

| # | Call | Status | Wasted? |
|---|------|--------|---------|
| 1 | POST /supplier | 201 | No |
| 2 | GET /ledger/account | 200 | No |
| 3 | POST /ledger/voucher/importDocument | **422** | **YES** — buyer org `000000000` fails mod11 |
| 4 | GET /company/whoAmI | **422** | **YES** — proxy doesn't support this path |
| 5 | POST /ledger/voucher/importDocument | 201 | No (retry with fixed org) |
| 6 | GET /supplierInvoice (no dates) | **422** | **YES** — missing required date params |
| 7 | GET /supplierInvoice (with dates) | 200 | No |
| 8 | PUT /ledger/voucher (postings) | 200 | No |
| 9 | PUT /ledger/voucher (book) | 200 | No |
| 10 | GET /ledger/voucher | 200 | No |
| 11 | GET /supplier | 200 | No |

**3 wasted calls.** All were avoidable with correct documentation.

**Optimal 8-call path for next agent:**
1. `POST /supplier` → extract id + ledgerAccount.id
2. `GET /ledger/account?number=6500&isApplicableForSupplierInvoice=true&fields=*` → expense account id
3. `POST /ledger/voucher/importDocument` with XML using buyer org `987654325` (valid mod11)
4. `GET /supplierInvoice?voucherId={id}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*` → verify SI
5. `PUT /ledger/voucher/{id}?sendToLedger=false` → set postings
6. `PUT /ledger/voucher/{id}?sendToLedger=true` → book
7. `GET /ledger/voucher/{id}?fields=*` → verify booked
8. `GET /supplier/{id}?fields=*` → verify supplier

## Root Causes

1. **Buyer org mod11 (importDocument 422)**: The trusted standard said "use company org number from whoAmI or a placeholder" without specifying the placeholder must pass mod11. `000000000` fails PEPPOL-COMMON-R041 validation. Fix: hard-code `987654325` (verified valid mod11).

2. **whoAmI proxy incompatibility (422)**: The proxy routes `/company/whoAmI` as `/company/{id}` where id="whoAmI" → "Expected number" error. Fix: skip whoAmI entirely; hard-code a valid buyer org instead.

3. **supplierInvoice GET required params (422)**: `GET /supplierInvoice` requires `invoiceDateFrom` and `invoiceDateTo` — omitting them returns 422 "Kan ikke være null". The trusted standard's step 4 didn't include these params. Fix: always include `&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31`.

## Sandbox Verification

Ran full 8-call clean flow in sandbox (script: `sandbox-verify.ts`):
- Buyer org `987654325` in XML: **WORKS** (importDocument 201)
- supplierInvoice GET without date params: **FAILS** (422, as expected)
- supplierInvoice GET with date params: **WORKS** (200, SI entity found)
- Full flow zero errors: **YES** — 8 calls, all successful
- Voucher booked as number 905-2026 in sandbox
- SI entity: amount=-12500, amountExcludingVat=-10000, kidOrReceiverReference populated

## Playbook Changes

Updated existing files (no new files created):

- **`trusted-standards/register-supplier-invoice.md`**:
  - Step 4: added required `invoiceDateFrom`/`invoiceDateTo` params to supplierInvoice GET
  - XML Rules: replaced "use whoAmI or a placeholder" with "hard-code `987654325`" + mod11 warning
  - Verification section: added CRITICAL note about required date params
  - Known Pitfalls: added 2 new CRITICAL entries (buyer org mod11, supplierInvoice date params)
  - Production History: added 6b159167 run record

- **`task-playbooks/register-supplier-invoice.md`**:
  - Step 4: added required date params to supplierInvoice GET
  - XML Template: added buyer org hard-code instruction with mod11/whoAmI warnings
  - Known Pitfalls: added 2 new CRITICAL entries matching trusted standard
  - Production History: added 6b159167 run record

## Commit

- Hash: `a24b0641`
- Message: `tripletex playbook: register-supplier-invoice — fix 3 pitfalls causing avoidable 422s (buyer org mod11, supplierInvoice date params, whoAmI proxy)`

## Reusable Heuristics

1. **All org numbers in EHF XML must pass mod11 validation.** Norwegian org numbers (9 digits) are validated by PEPPOL-COMMON-R041. Use `987654325` or `999999999` as buyer placeholder — never `000000000`.

2. **`GET /supplierInvoice` always requires `invoiceDateFrom` + `invoiceDateTo`.** These are mandatory query params, not optional filters. Use a wide range like `2026-01-01` to `2026-12-31`.

3. **`GET /company/whoAmI` does not work on the Tripletex proxy.** The proxy interprets "whoAmI" as a numeric company ID → 422. Avoid this endpoint entirely; any data it would provide (company org number) can be hard-coded.

4. **Test XML placeholder values for standards compliance before production.** PEPPOL/EHF XML undergoes schema validation — dummy values that look valid to humans (like `000000000`) may fail automated checks.

5. **When a trusted standard says "or a placeholder", specify the exact placeholder value.** Ambiguous instructions lead agents to choose invalid values and waste calls on 422 errors.
