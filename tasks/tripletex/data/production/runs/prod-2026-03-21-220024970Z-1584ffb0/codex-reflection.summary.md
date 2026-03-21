# Codex Reflection Summary

## Task
Create product "Eplejuice" with product number 9026, price 49700 kr eksklusiv MVA, 15% VAT rate for næringsmidler (food items). Norwegian-language prompt.

## Reflection
The run executed flawlessly. The agent correctly identified this as a non-default VAT task (15% reduced rate), followed the trusted standard's 2-call path, and created the product with zero errors.

**What went well:**
- Correctly recognized 15% as a non-default VAT rate requiring a VAT lookup (not the 1-call 25% shortcut)
- Used `typeOfVat=OUTGOING` filter to safely resolve the 15% VAT type, avoiding the documented pitfall of broad-catalog 15% rows (id 11 is incoming, not outgoing)
- Selected `id=31` ("Utgående avgift, middels sats") — the correct OUTGOING 15% code
- Norwegian `eksklusiv MVA` correctly mapped to `priceExcludingVatCurrency`
- Category qualifier "næringsmidler" was correctly treated as cosmetic
- Verified from write response: `priceIncludingVatCurrency=57155` (49700 × 1.15), confirming correct VAT application

**What went poorly:**
- Nothing. Clean execution.

## Call Efficiency
**Minimal-call: YES.** 2 calls, 0 errors.

| # | Method | Endpoint | Purpose | Result |
|---|--------|----------|---------|--------|
| 1 | GET | `/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*` | Resolve 15% VAT type | 200, found id=31 |
| 2 | POST | `/product` | Create product with name, number, price, vatType | 201 |

**Wasted calls: 0.** The 2-call path is the proven minimum for any non-default VAT rate. Cannot reduce to 1 call because:
- The 1-call shortcut (omitting `vatType`) only works for standard 25% VAT in fresh accounts
- For reduced rates (0%, 15%), the VAT type ID must be explicitly resolved since it varies across accounts (e.g., sandbox has only 0% OUTGOING)

**Lower-call path for next agent:** Same 2-call path. No improvement possible.

## Root Causes
No errors or inefficiencies to diagnose. The trusted standard already documented the exact 2-call path for non-default VAT, and the agent followed it precisely.

## Sandbox Verification
- Persistent sandbox (`kkpqfuj-amager`) still has only `OUTGOING` VAT row `id=6` / `0%`
- Sandbox cannot verify 15% product create — remains blocked for 15% and 25% VAT verification
- This is consistent with all prior sandbox findings from 2026-03-20 and 2026-03-21

## Playbook Changes
Updated existing files (no new files created):

1. **`./trusted-standards/create-product.md`**:
   - Added Norwegian `eksklusiv MVA` / `eks. MVA` to localized excluding-VAT wording list in Exact Match section
   - Extended category qualifier cosmetic note to include "15% for næringsmidler (food)" alongside existing "0% for books/newspapers"
   - Added production verification entry: `Eplejuice` / `9026` / `49700` / 15% VAT → 2 calls 0 errors, id=31
   - Added sandbox re-verification entry confirming persistent sandbox still blocked for 15%

2. **`./task-playbooks/create-product.md`**:
   - Added Norwegian `eksklusiv MVA` to "When Not To Pre-Read" localized wording list
   - Extended category qualifier cosmetic note in Avoidable Mistakes to include 15% for næringsmidler
   - Added full production verification entry in Verified Findings section documenting the 15% path success

## Commit
- **Hash:** `e1b7bf57`
- **Message:** `tripletex playbook: create-product — add 1st 15% reduced-rate VAT production confirmation (1584ffb0, Norwegian prompt, Eplejuice / 9026 / 49700 eksklusiv MVA / 15% næringsmidler, 2 calls 0 errors); first production proof of the 2-call path for explicit 15% VAT; extends proven non-default VAT set from {0%} to {0%, 15%}; confirms id=31 (Utgående avgift, middels sats) is the correct OUTGOING 15% row in fresh accounts; Norwegian eksklusiv MVA maps to priceExcludingVatCurrency; næringsmidler category qualifier is cosmetic`

## Reusable Heuristics
1. **15% VAT = 2-call path, never 1-call.** The omit-vatType shortcut only works for standard 25% in fresh accounts. All reduced rates (0%, 15%) require explicit VAT resolution via `GET /ledger/vatType?typeOfVat=OUTGOING`.
2. **Fresh-account OUTGOING 15% is always id=31** ("Utgående avgift, middels sats") across all tested fresh accounts. But never hardcode — always resolve dynamically.
3. **Norwegian `eksklusiv MVA` = `priceExcludingVatCurrency`.** Same mapping as Portuguese `sem IVA`, Spanish `sin IVA`, German `ohne MwSt.`, French `hors TVA`.
4. **Category qualifiers are always cosmetic.** "Næringsmidler" (food) for 15%, "books" and "newspapers" for 0% — none of these change the VAT resolution logic. Always just pick the matching percentage from the filtered OUTGOING result.
5. **Proven non-default VAT rates:** {0% → id=5 in fresh, id=6 in sandbox} and {15% → id=31 in fresh}. Both use the same 2-call path.
6. **Broad-catalog 15% trap persists.** The unfiltered VAT list has 15% rows 11, 31, 551, 556 — and id=11 is incoming, not outgoing. Always filter by `typeOfVat=OUTGOING`.
