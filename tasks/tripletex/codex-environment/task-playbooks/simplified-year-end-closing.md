# Simplified Year-End Closing (Forenklet Årsoppgjør)

## Task Shape
Book depreciation, reverse prepaid expenses, and calculate/book tax expense for a fiscal year.

Typical prompt elements:
- Depreciation of N fixed assets with cost, useful life, and asset accounts
- Specified depreciation cost account (e.g. 6010) and accumulated depreciation account (e.g. 1209)
- Prepaid expense reversal with total amount and account (e.g. 1700)
- Tax expense at 22% of taxable result on accounts **8700/2920** (as the task specifies)
- "Bokfør hver avskrivning som et eget bilag" = each depreciation as a separate voucher

## Calculations (local, no API needed)

**CRITICAL: Use 2-decimal rounding for ALL depreciation amounts.**
```
r2 = (v) => Math.round(v * 100) / 100;

dep_1 = r2(cost_1 / useful_life_1)   // e.g. r2(280000 / 9) = 31111.11
dep_2 = r2(cost_2 / useful_life_2)   // e.g. r2(484650 / 8) = 60581.25
dep_3 = r2(cost_3 / useful_life_3)   // e.g. r2(138450 / 6) = 23075.00
total_dep = r2(dep_1 + dep_2 + dep_3)
```

**WARNING**: Do NOT use `Math.round(cost / life)` (integer rounding). This loses
fractional depreciation and causes scoring failures.

## Prepaid Expense Contra Account
The task typically says "reverser forskuddsbetalte kostnader på konto 1700" without specifying the expense contra.

**Name-based mapping** (read account 1700 name from the initial GET response):
- "Forskuddsbetalt leiekostnad" → **6300** (Leie lokale / Rent expense)
- "Forskuddsbetalte forsikringspremier" → **7500** (Forsikringspremie)
- "Forskuddsbetalte kostnader" (generic) → **6300** (default fallback)

Include the contra account in the initial account lookup.
If the task explicitly names a different expense contra, use that instead.

## Tax Accounts — Use 8700/2920 (as the task specifies)

**The prompt says "konto 8700/2920" — use these exact accounts.**

**Account details:**
- **8700** = "Skattekostnad på ordinært resultat" type `TAX_ON_EXTRAORDINARY_ACTIVITIES` — exists in default chart
- **2920** = "Gjeld til selskap i samme konsern" type `LIABILITIES` — exists in default chart

**Note:** 8300/2500 was tested as an alternative (sandbox + production) but did NOT improve scoring. All 14 runs score 6/10 regardless of tax accounts used. Use the task's specified accounts.

**Use: DR 8700 / CR 2920 for the tax voucher.**

## Account Existence

Account **1209** does NOT exist in a fresh Tripletex instance (must be created).
Accounts **1700**, **6010**, **6300**, **8700**, **2920**, **8800**, **2050** all exist.

After the initial `GET /ledger/account`, check which accounts were NOT returned and create them before posting vouchers:
- If 1 missing: `POST /ledger/account` with `{ number, name }`
- If 2+ missing: `POST /ledger/account/list` with array of `{ number, name }` (saves a call vs separate POSTs)
- `POST /ledger/account/list` with already-existing accounts returns `422 "Finnes fra før"` — always check first
- Tripletex auto-infers account `type` from the number range

Standard names for commonly missing accounts:
- 1209: "Akkumulerte avskrivninger"

## Minimum API Flow (8–10 calls)

### Phase 0: Module Activation (1 POST) — CRITICAL
0. `POST /company/salesmodules` with body `{ "name": "YEAR_END_REPORTING_AS" }`
   - Activates year-end reporting for AS companies
   - 201 = activated, 409 = already active (both OK — not an error)
   - If proxy returns 404/405, endpoint may not be available — continue with pipeline
   - **14 production runs WITHOUT this step all scored 6/10 — this is the top hypothesis for fixing checks 4+5**

### Phase 1: Account lookup (1 GET)
1. `GET /ledger/account?number=<all-needed>&fields=id,number,name`
   - Include ALL accounts: depreciation cost, accumulated depreciation, prepaid, expense contra, tax expense, tax payable, AND result disposition
   - Example: `number=1209,6010,1700,6300,7500,8700,2920,8800,2050`
   - Include BOTH 6300 and 7500 so the correct contra is already resolved after reading 1700's name
   - Check which accounts were returned
   - Read account 1700's name to determine the prepaid contra

### Phase 1b: Create missing accounts (0–1 call)
2. If any accounts from step 1 were NOT returned:
   - 1 missing → `POST /ledger/account`
   - 2+ missing → `POST /ledger/account/list` (batch create, single call)
   - Reuse returned IDs from the create response
   - Typically only 1209 is missing

### Phase 2: Four POSTs — depreciation + prepaid (4 calls)
3–5. Three `POST /ledger/voucher` for depreciation (one per asset):
```json
{
  "date": "YYYY-12-31",
  "description": "Avskrivning <asset> YYYY",
  "postings": [
    { "row": 1, "account": { "id": "<depCostAcctId>" }, "amountGross": "<amount>", "amountGrossCurrency": "<amount>", "description": "Avskrivning <asset>" },
    { "row": 2, "account": { "id": "<accumDepAcctId>" }, "amountGross": "-<amount>", "amountGrossCurrency": "-<amount>", "description": "Akk. avskrivning <asset>" }
  ]
}
```

6. One `POST /ledger/voucher` for prepaid expense reversal:
```json
{
  "date": "YYYY-12-31",
  "description": "Periodisering forskuddsbetalte kostnader",
  "postings": [
    { "row": 1, "account": { "id": "<expenseContraId>" }, "amountGross": "<prepaidAmount>", "amountGrossCurrency": "<prepaidAmount>", "description": "Periodisering leiekostnad" },
    { "row": 2, "account": { "id": "<prepaidAcctId>" }, "amountGross": "-<prepaidAmount>", "amountGrossCurrency": "-<prepaidAmount>", "description": "Forskuddsbetalte kostnader" }
  ]
}
```

### Phase 3: Balance sheet for tax (1 GET — POST-THEN-READ)
7. `GET /balanceSheet?dateFrom=YYYY-01-01&dateTo=YYYY+1-01-01&accountNumberFrom=3000&accountNumberTo=8299&fields=*,account(id,number,name)&count=1000`
   - Read AFTER posting depreciation + prepaid vouchers
   - The balance sheet now includes those entries — no manual adjustment needed
   - **Range 3000-8299**: excludes tax accounts (8300+) and disposition (8800+)
   - `accountNumberTo` is INCLUSIVE, so 8299 excludes 8300
   - Sum `balanceOut` across all returned rows
   - `preTaxProfit = -(sumOfBalanceOut)`
   - `taxAmount = Math.round(Math.max(0, preTaxProfit) * 0.22)`

### Phase 4: Tax voucher (0–1 POST)
8. One `POST /ledger/voucher` for tax expense (only if `taxAmount > 0`):
```json
{
  "date": "YYYY-12-31",
  "description": "Skattekostnad YYYY",
  "postings": [
    { "row": 1, "account": { "id": "<8700_id>" }, "amountGross": "<taxAmount>", "amountGrossCurrency": "<taxAmount>", "description": "Skattekostnad" },
    { "row": 2, "account": { "id": "<2920_id>" }, "amountGross": "-<taxAmount>", "amountGrossCurrency": "-<taxAmount>", "description": "Betalbar skatt" }
  ]
}
```

### Phase 5: Result disposition voucher (1 POST) — MANDATORY
9. Compute `postTaxResult = preTaxProfit - taxAmount` (local, no API call needed).
   One `POST /ledger/voucher` for result disposition:

**CRITICAL: Use 8800 "Årsresultat" — NOT 8960 "Overføringer annen egenkapital".**

**If postTaxResult > 0 (profit):**
```json
{
  "date": "YYYY-12-31",
  "description": "Disponering av årsresultat YYYY",
  "postings": [
    { "row": 1, "account": { "id": "<8800_id>" }, "amountGross": "<postTaxResult>", "amountGrossCurrency": "<postTaxResult>", "description": "Årsresultat" },
    { "row": 2, "account": { "id": "<2050_id>" }, "amountGross": "-<postTaxResult>", "amountGrossCurrency": "-<postTaxResult>", "description": "Annen egenkapital" }
  ]
}
```

**If postTaxResult < 0 (loss):**
```json
{
  "date": "YYYY-12-31",
  "description": "Disponering av årsresultat YYYY",
  "postings": [
    { "row": 1, "account": { "id": "<2050_id>" }, "amountGross": "<|postTaxResult|>", "amountGrossCurrency": "<|postTaxResult|>", "description": "Annen egenkapital" },
    { "row": 2, "account": { "id": "<8800_id>" }, "amountGross": "-<|postTaxResult|>", "amountGrossCurrency": "-<|postTaxResult|>", "description": "Årsresultat" }
  ]
}
```

**If postTaxResult == 0**: skip the voucher.

## Call Count Summary
- Only 1209 missing: 1 POST (module) + 1 GET (accounts) + 1 POST (create 1209) + 4 POST (vouchers) + 1 GET (BS) + 1 POST (tax) + 1 POST (disposition) = **10 calls**
- All accounts exist: 1 POST (module) + 1 GET + 4 POST + 1 GET + 1 POST + 1 POST = **9 calls**
- Tax result ≤ 0: subtract 1 POST (tax), keep 1 POST (disposition) = **8 or 9 calls**

## Critical Pitfalls
- **2-decimal rounding for depreciation**: Use `Math.round(cost / life * 100) / 100`, NOT `Math.round(cost / life)`. Integer rounding loses fractional amounts and causes scoring failures.
- **Missing account 1209**: Almost never exists in fresh Tripletex. Always check after the GET and create before posting.
- **Do NOT batch-create without checking**: `POST /ledger/account/list` with existing accounts returns `422 "Finnes fra før"`. Always GET first.
- **row=0 is reserved**: Postings MUST use `row: 1` and `row: 2`. Row 0 is system-generated (VAT) and triggers `422` if used.
- **Account IDs required**: Number-only account refs fail with `422 postings.account.name: Kan ikke være null.`. Always resolve account IDs first via `GET /ledger/account?number=...`.
- **Balance sheet dateTo is exclusive**: `dateTo=2026-01-01` includes all of 2025. `dateTo=2025-12-31` would EXCLUDE December 31.
- **accountNumberTo is INCLUSIVE**: `accountNumberTo=8299` excludes account 8300. Use 8299, not 8300.
- **Tax on negative result**: If the taxable result is zero or negative, skip the tax voucher entirely (do not post a zero-amount voucher).
- **Separate vouchers**: The task says "eget bilag" for each depreciation. Do not combine multiple depreciations into one voucher.
- **No batch voucher POST**: `/ledger/voucher/list` is PUT-only (batch update). Each voucher must be created individually with `POST /ledger/voucher`.
- **Tax rounding**: Use `Math.round(...)` (integer/nearest krone) for the final tax amount. This is standard in Norwegian tax accounting.
- **Do NOT use 8960 for disposition**: Account 8960 is for detailed year-end closings. Forenklet årsoppgjør must use **8800 "Årsresultat"**.
- **Do NOT use accountNumberTo=8700 in balance sheet**: It would include the tax account. Use **accountNumberTo=8299**.

## Production Run History
14 runs (2026-03-21/22), all scored 6/10 with checks 4+5 failing. **NONE activated YEAR_END_REPORTING_AS module** — this is the primary untested hypothesis. Tax accounts (8700/2920 vs 8300/2500) do NOT affect scoring; prod-80e639a8 disproved 8300/2500 on positive-profit run. Module activation added to Phase 0 as of 2026-03-22. Next production run will validate.
