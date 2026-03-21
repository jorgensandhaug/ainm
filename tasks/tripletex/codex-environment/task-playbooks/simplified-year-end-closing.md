# Simplified Year-End Closing (Forenklet Årsoppgjør)

## Task Shape
Book depreciation, reverse prepaid expenses, and calculate/book tax expense for a fiscal year.

Typical prompt elements:
- Depreciation of N fixed assets with cost, useful life, and asset accounts
- Specified depreciation cost account (e.g. 6010) and accumulated depreciation account (e.g. 1209)
- Prepaid expense reversal with total amount and account (e.g. 1700)
- Tax expense at 22% of taxable result on specified accounts (e.g. 8700/2920)
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
fractional depreciation and causes scoring failures. Production run 2026-03-21 scored
6/10 because `Math.round(280000/9)` = 31111 instead of correct 31111.11, and
`Math.round(484650/8)` = 60581 instead of correct 60581.25.

## Prepaid Expense Contra Account
The task typically says "reverser forskuddsbetalte kostnader på konto 1700" without specifying the expense contra.
- Account 1700 in the standard Norwegian chart (NS 4102) = "Forskuddsbetalt leiekostnad" (prepaid rent)
- Standard contra: **6300** (Leie lokale / Rent expense)
- Include 6300 in the initial account lookup
- If the task explicitly names a different expense contra, use that instead

## Account Existence

Accounts **1209** and **8700** typically do NOT exist in a fresh Tripletex instance.

After the initial `GET /ledger/account`, check which accounts were NOT returned and create them before posting vouchers:
- If 1 missing: `POST /ledger/account` with `{ number, name }`
- If 2+ missing: `POST /ledger/account/list` with array of `{ number, name }` (saves a call vs separate POSTs)
- `POST /ledger/account/list` with already-existing accounts returns `422 "Finnes fra før"` — always check first
- Tripletex auto-infers account `type` from the number range

Standard names for commonly missing accounts:
- 1209: "Akkumulerte avskrivninger"
- 8700: "Skattekostnad på ordinært resultat"

## Minimum API Flow (7–8 calls)

### Phase 1: Two parallel GETs (2 calls)
1. `GET /ledger/account?number=<all-needed>&fields=id,number,name`
   - Include ALL accounts: depreciation cost, accumulated depreciation, prepaid, expense contra, tax expense, tax payable
   - Example: `number=1209,6010,1700,6300,8700,2920`
   - Check which accounts were returned

2. `GET /balanceSheet?dateFrom=YYYY-01-01&dateTo=YYYY+1-01-01&accountNumberFrom=3000&accountNumberTo=8700&fields=*,account(id,number,name)&count=1000`
   - `accountNumberTo=8700` is exclusive, so includes 3000–8699 (all revenue + expenses before tax)
   - Sum `balanceOut` across all returned rows
   - Revenue accounts (3xxx) have negative balanceOut (credit); expense accounts (4xxx–8xxx) have positive (debit)
   - `preTaxProfit = -(sumOfBalanceOut)`
   - Adjust for planned entries: `adjustedProfit = preTaxProfit - totalDepreciation - prepaidReversal`
   - `taxAmount = Math.round(Math.max(0, adjustedProfit) * 0.22)`

### Phase 1b: Create missing accounts (0–1 call)
3. If any accounts from step 1 were NOT returned:
   - 1 missing → `POST /ledger/account`
   - 2+ missing → `POST /ledger/account/list` (batch create, single call)
   - Reuse returned IDs from the create response

### Phase 2: Five POSTs (5 calls)
4–6. Three `POST /ledger/voucher` for depreciation (one per asset):
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

7. One `POST /ledger/voucher` for prepaid expense reversal:
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

8. One `POST /ledger/voucher` for tax expense (only if `taxAmount > 0`):
```json
{
  "date": "YYYY-12-31",
  "description": "Skattekostnad YYYY",
  "postings": [
    { "row": 1, "account": { "id": "<taxExpenseAcctId>" }, "amountGross": "<taxAmount>", "amountGrossCurrency": "<taxAmount>", "description": "Skattekostnad" },
    { "row": 2, "account": { "id": "<taxPayableAcctId>" }, "amountGross": "-<taxAmount>", "amountGrossCurrency": "-<taxAmount>", "description": "Betalbar skatt" }
  ]
}
```

## Call Count Summary
- All accounts exist: 2 GET + 5 POST = **7 calls**
- Some accounts missing: 2 GET + 1 POST (create) + 5 POST (vouchers) = **8 calls**
- Tax result ≤ 0: subtract 1 POST = **6 or 7 calls**

## Critical Pitfalls
- **2-decimal rounding for depreciation**: Use `Math.round(cost / life * 100) / 100`, NOT `Math.round(cost / life)`. Integer rounding loses fractional amounts and causes scoring failures.
- **Missing accounts 1209 and 8700**: These almost never exist in fresh Tripletex. Always check after the GET and create before posting. Use batch create (`POST /ledger/account/list`) when 2+ are missing.
- **Do NOT batch-create without checking**: `POST /ledger/account/list` with existing accounts returns `422 "Finnes fra før"`. Always GET first.
- **row=0 is reserved**: Postings MUST use `row: 1` and `row: 2`. Row 0 is system-generated (VAT) and triggers `422` if used.
- **Account IDs required**: Number-only account refs fail with `422 postings.account.name: Kan ikke være null.`. Always resolve account IDs first via `GET /ledger/account?number=...`.
- **Balance sheet dateTo is exclusive**: `dateTo=2026-01-01` includes all of 2025. `dateTo=2025-12-31` would EXCLUDE December 31.
- **accountNumberTo is exclusive**: `accountNumberTo=8700` covers up to account 8699, correctly excluding the tax expense account.
- **Tax on negative result**: If the taxable result is zero or negative, skip the tax voucher entirely (do not post a zero-amount voucher).
- **Separate vouchers**: The task says "eget bilag" for each depreciation. Do not combine multiple depreciations into one voucher.
- **No batch voucher POST**: `/ledger/voucher/list` is PUT-only (batch update). Each voucher must be created individually with `POST /ledger/voucher`.
- **Tax rounding**: Use `Math.round(...)` (integer/nearest krone) for the final tax amount. This is standard in Norwegian tax accounting.

## Sandbox Verification (2026-03-21)
- Persistent sandbox `kkpqfuj-amager.tripletex.dev` confirmed:
  - `POST /ledger/voucher` with `row: 1` / `row: 2` succeeded for balanced two-line depreciation entries
  - Without explicit `row`, the API returned `422` with "posteringene på rad 0 (guiRow 0) er systemgenererte"
  - `GET /balanceSheet` with result account range correctly returned cumulative balances
  - Account 1700 standard name: "Forskuddsbetalt leiekostnad"
  - 2-decimal amounts (e.g. 31111.11, 60581.25) correctly stored in voucher postings
  - `POST /ledger/account/list` batch create works for new accounts, returns 422 for existing
  - Account 1209 does NOT exist in fresh Tripletex (must be created)
  - Account 8700 does NOT exist in fresh Tripletex (must be created)
  - Full flow: 2 GETs + 1 POST (create missing) + 5 POSTs (vouchers) = 8 calls with missing accounts
