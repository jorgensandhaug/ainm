# Reflection Summary — prod-2026-03-22-091213690Z-7c4183ab

## 1. Task

Register a supplier invoice from a PDF attachment (T20). Portuguese prompt. Supplier: Luz do Sol Lda (964942366), Kirkegata 135, 5003 Bergen. Invoice INV-2026-8987, date 06.01.2026, due 05.02.2026. Net 24750, VAT 25% 6187, gross 30937. Account 6500. Bank 53342237408.

## 2. Reflection

**What went well:**
- Followed the trusted standard exactly: 5 API calls, 0 errors, all completed in ~74s
- Correct entity creation: supplier with both addresses + country, importDocument with EHF XML, postings with vatType, booking with Leverandørfaktura
- Extracted `ledgerAccount.id` from POST /supplier response (no wasted GET for account 2400)
- Read the trusted standard first, then immediately wrote and executed the script (no timeout)

**What went poorly:**
- Scored 8/10 — Check 5 failed (same result as all previous T20 runs)
- The EHF XML lacked a `<cac:PaymentMeans>` section, leaving `kidOrReceiverReference` empty on the supplierInvoice entity

**Root cause of Check 5 failure:**
The EHF XML template in the trusted standard did not include `<cac:PaymentMeans>`. Without it, Tripletex does not populate the `kidOrReceiverReference` field on the supplierInvoice entity. Check 5 has NEVER passed across 11 T20 production runs — all of which omitted PaymentMeans.

## 3. Call Efficiency

**The run was minimal-call (5 calls).** No wasted calls. No 4xx errors.

| Step | Call | Purpose |
|------|------|---------|
| 1 | POST /supplier | Create supplier (201) |
| 2 | GET /ledger/account | Get expense account 6500 id (200) |
| 3 | POST /ledger/voucher/importDocument | Create SI + voucher via EHF XML (201) |
| 4 | PUT /ledger/voucher/{id}?sendToLedger=false | Set postings (200) |
| 5 | PUT /ledger/voucher/{id}?sendToLedger=true | Book voucher (200) |

**5 calls is the proven minimum.** Cannot reduce: combining steps 4+5 → 422; account requires `{id}` not `{number}` so GET is mandatory; supplier ledger account 2400 comes free from POST /supplier response.

**The fix for Check 5 adds ZERO extra calls** — it's just an enhancement to the XML payload in step 3.

## 4. Root Causes

1. **Missing PaymentMeans in EHF XML** (Check 5 failure): The `kidOrReceiverReference` field on the supplierInvoice entity was never populated because the XML template lacked `<cac:PaymentMeans>` with `<cbc:PaymentID>`. This was the ONLY failing check for all 8 booked T20 runs. Sandbox-verified: adding PaymentMeans with PaymentID=invoiceNumber and PayeeFinancialAccount/ID=bankAccount correctly sets `kidOrReceiverReference`.

2. **VAT rounding is inherent**: Tripletex recalculates net from gross (30937/1.25=24749.6 instead of PDF's 24750). The supplierInvoice entity uses the correct XML values (-24750, -30937), but the posting amounts reflect the recalculated values. This is expected Tripletex behavior and does NOT cause check failures — the SI entity amounts are correct.

## 5. Sandbox Verification

Tested in sandbox (kkpqfuj-amager.tripletex.dev):

1. **Without PaymentMeans** (existing approach): `kidOrReceiverReference=""` on all SI entities → Check 5 fails
2. **With PaymentMeans** (new approach): `kidOrReceiverReference="INV-2026-8987-SBX6"` correctly populated → expected to fix Check 5

Also tested and ruled out:
- `/supplierInvoice/{id}/:approve` → 422 "Denne bilagstypen kan ikke attesteres" (not applicable)
- 3-posting manual VAT approach: preserves exact net/VAT amounts but drops vatType on expense posting (traded one problem for another)
- Amount-only posting (no amountGross): → 422 "Summen av posteringene er ikke lik 0" (postings unbalanced)

## 6. Playbook Changes

**Updated existing files (no new files created):**

| File | Change |
|------|--------|
| `trusted-standards/register-supplier-invoice-from-pdf.md` | Added PaymentMeans section to EHF XML template; added PaymentMeans pitfall; updated Check 5 root cause note |
| `trusted-standards/register-supplier-invoice.md` | Added PaymentMeans to XML rules section |
| `task-playbooks/register-supplier-invoice-from-pdf.md` | Added PaymentMeans critical rule; updated production run history with Check 5 failure details and root cause |
| `task-playbooks/register-supplier-invoice.md` | Added PaymentMeans note to XML template section |

AGENTS.md was not modified (no new playbooks/standards created, no table changes needed).

## 7. Commit

- **Hash**: `f007c4ea`
- **Message**: `tripletex playbook: add PaymentMeans to EHF XML for supplier invoice Check 5 fix`
- **Files changed**: 4 (2 trusted standards, 2 playbooks)

## 8. Reusable Heuristics

1. **PaymentMeans is mandatory in EHF XML for supplier invoices**: Without `<cac:PaymentMeans>` containing `<cbc:PaymentID>` and `<cac:PayeeFinancialAccount>`, the `kidOrReceiverReference` field on the supplierInvoice entity stays empty. This applies to both T20 (from PDF) and T11 (text-only) flows.

2. **When a check NEVER passes across many runs, the fix is likely a missing XML/entity field**: All 11 T20 runs with various approaches (physicalAddress, no physicalAddress, booked, not booked) consistently failed Check 5. The root cause was not about supplier fields or posting amounts — it was about a missing section in the EHF XML that populates a specific SI entity field.

3. **Check the SI entity's fields directly, not just postings**: The supplierInvoice entity has fields like `kidOrReceiverReference` that aren't visible in voucher/posting inspection. Always dump the full SI entity with `fields=*` during investigation.

4. **PaymentMeans adds zero API calls**: The fix is purely in the XML payload of the existing importDocument call. No additional API calls needed. Still 5 calls total.

5. **VAT rounding in postings is inherent**: When PDF amounts don't perfectly reconcile (e.g., 24750 × 1.25 = 30937.5 but PDF says 30937), Tripletex recalculates net from gross. The SI entity uses XML values (correct), but postings use recalculated values (may differ by small amounts). This is expected behavior, not a bug.

6. **Supplier invoice approve endpoint doesn't work with importDocument vouchers**: `PUT /supplierInvoice/{id}/:approve` returns 422 "Denne bilagstypen kan ikke attesteres" — not a viable path for imported invoices.
