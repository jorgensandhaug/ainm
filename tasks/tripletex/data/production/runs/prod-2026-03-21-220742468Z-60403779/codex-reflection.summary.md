# Codex Reflection Summary

## 1. Task

Register a supplier invoice for **Forêt SARL** (org 823356366) in Tripletex from a French-language prompt with PDF attachment. Invoice INV-2026-6107, gross 80437 NOK, expense account 6340, 25% VAT. PDF included address (Solveien 51, 9008 Tromsø) and bank account (68474635604).

## 2. Reflection

**What went well:**
- Correctly identified this as a register-supplier-invoice trusted standard match
- Read the trusted standard before writing any script
- Extracted all PDF data (name, org, address, bank) and included them in `POST /supplier`
- Used hardcoded `vatType: { id: 1 }` for 25% VAT (no unnecessary `GET /ledger/vatType`)
- Correctly accessed `importDocument` response via `values[0]` (not `value`)
- Correctly used `row: 1` and `row: 2` on PUT postings
- Correctly executed two-step booking (sendToLedger=false then sendToLedger=true)
- Final Tripletex state was correct: booked voucher with proper expense/supplier/VAT postings

**What went poorly:**
- Wasted 2 API calls due to 2 separate bugs in the script:
  1. FormData Content-Type set manually in the `api` helper function → `400 HTTP 415 Unsupported Media Type`
  2. Buyer EndpointID `000000000` in XML → `422 PEPPOL-COMMON-R041` validation failure

## 3. Call Efficiency

**Optimal path:** 5 calls, 0 errors
**Actual path:** 7 calls, 2 errors (1× 400, 1× 422)

| Call | Endpoint | Status | Notes |
|------|----------|--------|-------|
| 1 | POST /supplier | 201 | ✓ with address + bank |
| 2 | GET /ledger/account | 200 | ✓ expense 6340 |
| 3 | POST /ledger/voucher/importDocument | 400 | ✗ Content-Type bug |
| 4 | POST /ledger/voucher/importDocument | 422 | ✗ buyer EndpointID 000000000 |
| 5 | POST /ledger/voucher/importDocument | 201 | ✓ buyer EndpointID 123456785 |
| 6 | PUT /ledger/voucher/{id}?sendToLedger=false | 200 | ✓ postings set |
| 7 | PUT /ledger/voucher/{id}?sendToLedger=true | 200 | ✓ booked, number=1 |

**Wasted calls:** 2 (calls 3 and 4)

**Correct lower-call path the next agent should follow:**
1. `POST /supplier` (with postalAddress + bankAccountPresentation from PDF)
2. `GET /ledger/account?number=6340&isApplicableForSupplierInvoice=true&fields=*`
3. `POST /ledger/voucher/importDocument` (FormData, no manual Content-Type, buyer EndpointID=`123456785`)
4. `PUT /ledger/voucher/{id}?sendToLedger=false` (postings with row:1/row:2, vatType:{id:1})
5. `PUT /ledger/voucher/{id}?sendToLedger=true` (only `{version}`)

## 4. Root Causes

### Bug 1: FormData Content-Type (call 3 → 400)
- The TypeScript `api` helper function had a `contentType` parameter path that set `Content-Type` header even when the body was `FormData`
- When fetch sends FormData, it must generate its own `Content-Type: multipart/form-data; boundary=...` header automatically
- Manually setting any Content-Type on a FormData body causes the server to reject it as `415 Unsupported Media Type`
- **Fix:** When `body instanceof FormData`, do NOT set `Content-Type` header — let fetch handle it

### Bug 2: Buyer EndpointID `000000000` (call 4 → 422)
- The XML template used `000000000` as the buyer (AccountingCustomerParty) EndpointID
- While `000000000` technically passes mod11 arithmetic (0 mod 11 = 0, check digit = 0), PEPPOL-COMMON-R041 validation rejects it
- The existing pitfall in the trusted standard mentioned supplier org number mod11 but not buyer EndpointID
- **Fix:** Use `123456785` as the hardcoded buyer EndpointID constant (sandbox-proven valid mod11)

## 5. Sandbox Verification

Three sandbox tests confirmed the root causes:
1. `000000000` buyer EndpointID → `422 PEPPOL-COMMON-R041` (FAILS)
2. `123456785` buyer EndpointID → `201` (voucher 609179763)
3. `979442459` buyer EndpointID → `201` (voucher 609179769)

Additional verification:
4. `999999999` (playbook template value) → `201` (voucher 609181318) — also valid

## 6. Playbook Changes

**Updated existing playbook:** `task-playbooks/register-supplier-invoice.md`
- Added "XML org number validation" section with buyer EndpointID pitfall
- Added "FormData Content-Type for importDocument" section
- Added production run entry for Forêt SARL (7 calls, 2 errors)
- Added two new heuristics to Reusable Heuristics section

**Trusted standard already updated:** `trusted-standards/register-supplier-invoice.md` was already updated by a parallel reflection run with the same buyer EndpointID and FormData pitfalls. Verified the content is correct and complete.

**Files changed:**
- `tasks/tripletex/codex-environment/task-playbooks/register-supplier-invoice.md` (26 insertions, 2 deletions)

## 7. Commit

- **Hash:** `ead89f15`
- **Message:** `tripletex playbook: register-supplier-invoice — add 10th production run (60403779, Forêt SARL / 823356366 / INV-2026-6107 / 80437 / 6340 / 25%, 7 calls 2 errors); document two new pitfalls: (1) buyer EndpointID 000000000 fails PEPPOL-COMMON-R041 → use 123456785 or 999999999 as hardcoded constant, (2) FormData Content-Type set manually → 400/415 Unsupported Media Type; add both findings to Known Pitfalls and Reusable Heuristics sections`

## 8. Reusable Heuristics

1. **Buyer EndpointID must be valid mod11:** Do NOT use `000000000` as the buyer EndpointID in EHF/UBL XML. Use `123456785` as the hardcoded constant. PEPPOL-COMMON-R041 validation applies to ALL org numbers in the XML, not just the supplier's.

2. **FormData Content-Type is automatic:** When using `FormData` for `importDocument`, NEVER set the `Content-Type` header manually. Let `fetch` generate `multipart/form-data; boundary=...` automatically. Manually setting any Content-Type causes `400 HTTP 415 Unsupported Media Type`.

3. **Standard flow remains 5 calls for 25% VAT with fresh account:** POST supplier → GET account → POST importDocument → PUT sendToLedger=false → PUT sendToLedger=true. No further call reduction is possible.

4. **All XML validation pitfalls are now documented:** Buyer PostalAddress (BR-10), buyer EndpointID (R041), Content-Type on FormData, supplier mod11 — covering every XML-related failure seen across 10+ production runs.
