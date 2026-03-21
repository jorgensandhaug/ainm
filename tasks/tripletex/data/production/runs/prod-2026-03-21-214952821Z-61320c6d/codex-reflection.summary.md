# Codex Reflection Summary

## Task

Register supplier invoice for Fjelltopp AS (org 804872205) in Tripletex. Nynorsk prompt with PDF attachment. Invoice INV-2026-8221, gross 60500 NOK, expense account 6300, 25% VAT. PDF included supplier address (Solveien 92, 8006 Bodø) and bank account (53239317029).

## Reflection

**What went well:**
- Correctly identified exact trusted-standard match and read it before writing script
- Extracted all PDF data: supplier name, org number, address, bank account, invoice details
- Used `POST /supplier` with `postalAddress` and `bankAccountPresentation` (learned from earlier production run that scored 7/10 for omitting these)
- Hard-coded `vatType: { id: 1 }` for 25% VAT, avoiding unnecessary `GET /ledger/vatType`
- Used `values[0]` (not `value`) for importDocument response
- Used explicit `row: 1` and `row: 2` on PUT postings
- Executed two-step booking: `sendToLedger=false` then `sendToLedger=true` with only `{ version }`
- Preserved exact description casing "Nettverkstjenester"

**What went poorly:**
- XML `AccountingCustomerParty` buyer block was missing `cac:PostalAddress`, triggering `422 ERROR [BR-10]` on the first `importDocument` attempt
- This wasted 1 API call and caused 1 avoidable 4xx error

**Why it happened:**
- The trusted standard's XML Rules said "keep a stable buyer block in the template" but did not explicitly require `PostalAddress` or provide a complete buyer block template
- The agent wrote a minimal buyer block with only `EndpointID` and `PartyLegalEntity`, omitting `PostalAddress`
- The 8 prior successful production runs happened to include `PostalAddress` in their buyer blocks, so this gap in the documentation was never exposed

## Call Efficiency

**Run was NOT minimal-call.** Used 6 calls with 1 error instead of optimal 5 calls with 0 errors.

| # | Call | Status | Needed? |
|---|------|--------|---------|
| 1 | `POST /supplier` | 201 | Yes |
| 2 | `GET /ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*` | 200 | Yes |
| 3 | `POST /ledger/voucher/importDocument` | 422 | **Wasted** — buyer block missing PostalAddress |
| 4 | `POST /ledger/voucher/importDocument` | 201 | Yes (retry with fixed XML) |
| 5 | `PUT /ledger/voucher/{id}?sendToLedger=false` | 200 | Yes |
| 6 | `PUT /ledger/voucher/{id}?sendToLedger=true` | 200 | Yes |

**Wasted calls:** 1 (call #3, the 422 on importDocument)

**Optimal path (5 calls, 0 errors):**
1. `POST /supplier` — create supplier with name, org number, postalAddress, bankAccountPresentation
2. `GET /ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*` — resolve expense account id
3. `POST /ledger/voucher/importDocument` — import valid EHF XML with buyer PostalAddress included
4. `PUT /ledger/voucher/{id}?sendToLedger=false` — set postings with `vatType: { id: 1 }`, `row: 1`/`row: 2`
5. `PUT /ledger/voucher/{id}?sendToLedger=true` — book voucher with only `{ version }`

## Root Causes

1. **Missing buyer PostalAddress in XML template**: The trusted standard's XML Rules section mentioned "a stable buyer block" but did not explicitly require `PostalAddress` or provide a complete template. The EHF BR-10 validation rule mandates `cac:AccountingCustomerParty/cac:Party/cac:PostalAddress`. Without it, Tripletex rejects the XML with 422.

2. **Documentation gap**: The playbook's "Customer block requirements" said "keep a stable buyer block in the template" and "sandbox proof accepted a generic placeholder buyer" — this was too vague to prevent the error. The earlier sandbox proofs likely included PostalAddress but didn't document it as a requirement.

## Sandbox Verification

Tested three XML variants against the persistent sandbox:

| Variant | Result |
|---------|--------|
| No buyer PostalAddress, no TaxScheme | **422** (BR-10 validation) |
| With buyer PostalAddress, no TaxScheme | **201** (success) |
| With buyer PostalAddress and TaxScheme | **201** (success) |

**Conclusion:** Buyer `PostalAddress` is mandatory. `PartyTaxScheme` is optional but harmless. The minimum buyer block needs: `EndpointID`, `PostalAddress` (with StreetName, CityName, PostalZone, Country), and `PartyLegalEntity`.

## Playbook Changes

Updated existing files (no new files created):

1. **`./trusted-standards/register-supplier-invoice.md`**:
   - Updated XML Rules to explicitly state `AccountingCustomerParty` MUST include `cac:PostalAddress` (BR-10 rule)
   - Added BR-10 pitfall to Known Pitfalls section
   - Added 9th production run confirmation (Fjelltopp AS / 804872205 / INV-2026-8221, 6 calls 1 error)

2. **`./task-playbooks/register-supplier-invoice.md`**:
   - Replaced vague "keep a stable buyer block" with explicit buyer block template including PostalAddress
   - Added BR-10 validation error documentation
   - Added 9th production run confirmation

No AGENTS.md changes needed (table entries already correct).

## Commit

- **Hash:** `5c3af9f8`
- **Message:** `tripletex playbook: register-supplier-invoice — add buyer PostalAddress requirement after 9th production run (61320c6d, Nynorsk prompt, Fjelltopp AS / 804872205 / INV-2026-8221 / 60500 / 6300, 6 calls 1 error); XML AccountingCustomerParty without cac:PostalAddress triggers 422 BR-10 validation, wasting 1 call; add explicit minimal buyer block template with PostalAddress to both trusted-standard and playbook; sandbox re-proof confirmed: without PostalAddress → 422, with → 201, PartyTaxScheme optional`

## Reusable Heuristics

1. **Always include buyer PostalAddress in EHF XML**: The `AccountingCustomerParty` block must contain `cac:PostalAddress` with at least `StreetName`, `CityName`, `PostalZone`, and `Country/IdentificationCode`. EHF BR-10 validation rejects XML without it. Use a static placeholder buyer block.

2. **Provide complete templates, not descriptions**: When documentation says "keep a stable X block", agents may interpret this too loosely. Providing an exact copy-paste template prevents omissions. The buyer block template is now in both the trusted standard and playbook.

3. **Every XML validation rule is a potential 422**: EHF/PEPPOL has many validation rules (BR-10, etc.) that Tripletex enforces before accepting an import. When updating XML templates, verify the complete required structure against the sandbox, not just the business-relevant fields.

4. **Streak-breaking errors expose documentation gaps**: The 8 prior optimal runs all happened to include PostalAddress in the buyer block, masking the gap in documentation. The first run that omitted it exposed the missing requirement. This pattern suggests: after any 422 on a previously-stable path, explicitly document the specific requirement that was violated.

5. **PartyTaxScheme is optional in buyer block**: Unlike PostalAddress, the buyer's `cac:PartyTaxScheme` is not required by EHF validation. Including it is harmless but not necessary. This distinction was confirmed by sandbox testing.
