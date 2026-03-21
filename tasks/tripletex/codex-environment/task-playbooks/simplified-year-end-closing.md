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
```
IT_dep   = cost / useful_life   (e.g. 382900 / 5 = 76580)
SW_dep   = cost / useful_life   (e.g. 436000 / 10 = 43600)
INV_dep  = cost / useful_life   (e.g. 384600 / 5 = 76920)
total_dep = IT_dep + SW_dep + INV_dep
```

## Prepaid Expense Contra Account
The task typically says "reverser forskuddsbetalte kostnader på konto 1700" without specifying the expense contra.
- Account 1700 in the standard Norwegian chart (NS 4102) = "Forskuddsbetalt leiekostnad" (prepaid rent)
- Standard contra: **6300** (Leie lokale / Rent expense)
- Include 6300 in the initial account lookup
- If the task explicitly names a different expense contra, use that instead

## Minimum API Flow (7 calls)

### Phase 1: Two GETs (can run in parallel)
1. `GET /ledger/account?number=<all-needed>&fields=*`
   - Include ALL accounts from the task: depreciation cost, accumulated depreciation, prepaid, tax, tax payable, plus the prepaid contra (6300)
   - Example: `number=1209,6010,1700,6300,8700,2920`
   - Verify all returned; if any missing, handle before proceeding

2. `GET /balanceSheet?dateFrom=YYYY-01-01&dateTo=YYYY+1-01-01&accountNumberFrom=3000&accountNumberTo=8700&fields=*,account(*)&count=1000`
   - `accountNumberTo=8700` is exclusive, so includes 3000-8699 (all revenue + expenses before tax)
   - Sum `balanceOut` across all returned rows
   - Revenue accounts (3xxx) have negative balanceOut (credit); expense accounts (4xxx-8xxx) have positive (debit)
   - `preTaxProfit = -(sumOfBalanceOut)`
   - Adjust for planned entries: `adjustedProfit = preTaxProfit - totalDepreciation - prepaidReversal`
   - `taxAmount = Math.round(Math.max(0, adjustedProfit) * 0.22)`

### Phase 2: Five POSTs
3-5. Three `POST /ledger/voucher` for depreciation (one per asset):
```json
{
  "date": "YYYY-12-31",
  "description": "Avskrivning <asset> YYYY",
  "postings": [
    { "row": 1, "account": { "id": <depCostAcctId> }, "amountGross": <amount>, "amountGrossCurrency": <amount>, "description": "Avskrivning <asset>" },
    { "row": 2, "account": { "id": <accumDepAcctId> }, "amountGross": -<amount>, "amountGrossCurrency": -<amount>, "description": "Akk. avskrivning <asset>" }
  ]
}
```

6. One `POST /ledger/voucher` for prepaid expense reversal:
```json
{
  "date": "YYYY-12-31",
  "description": "Periodisering forskuddsbetalte kostnader",
  "postings": [
    { "row": 1, "account": { "id": <expenseContraId> }, "amountGross": <prepaidAmount>, "amountGrossCurrency": <prepaidAmount>, "description": "Periodisering leiekostnad" },
    { "row": 2, "account": { "id": <prepaidAcctId> }, "amountGross": -<prepaidAmount>, "amountGrossCurrency": -<prepaidAmount>, "description": "Forskuddsbetalte kostnader" }
  ]
}
```

7. One `POST /ledger/voucher` for tax expense (only if `taxAmount > 0`):
```json
{
  "date": "YYYY-12-31",
  "description": "Skattekostnad YYYY",
  "postings": [
    { "row": 1, "account": { "id": <taxExpenseAcctId> }, "amountGross": <taxAmount>, "amountGrossCurrency": <taxAmount>, "description": "Skattekostnad" },
    { "row": 2, "account": { "id": <taxPayableAcctId> }, "amountGross": -<taxAmount>, "amountGrossCurrency": -<taxAmount>, "description": "Betalbar skatt" }
  ]
}
```

## Critical Pitfalls
- **row=0 is reserved**: Postings MUST use `row: 1` and `row: 2`. Row 0 is system-generated (VAT) and triggers `422` if used.
- **Account IDs required**: Number-only account refs fail with `422 postings.account.name: Kan ikke være null.`. Always resolve account IDs first via `GET /ledger/account?number=...`.
- **Balance sheet dateTo is exclusive**: `dateTo=2026-01-01` includes all of 2025. `dateTo=2025-12-31` would EXCLUDE December 31.
- **accountNumberTo is exclusive**: `accountNumberTo=8700` covers up to account 8699, correctly excluding the tax expense account.
- **Tax on negative result**: If the taxable result is zero or negative, skip the tax voucher entirely (do not post a zero-amount voucher).
- **Separate vouchers**: The task says "eget bilag" for each depreciation. Do not combine multiple depreciations into one voucher.
- **No batch voucher POST**: `/ledger/voucher/list` is PUT-only (batch update). Each voucher must be created individually with `POST /ledger/voucher`.

## Sandbox Verification (2026-03-21)
- Persistent sandbox `kkpqfuj-amager.tripletex.dev` confirmed:
  - `POST /ledger/voucher` with `row: 1` / `row: 2` succeeded for balanced two-line depreciation entries
  - Without explicit `row`, the API returned `422` with "posteringene på rad 0 (guiRow 0) er systemgenererte"
  - `GET /balanceSheet` with result account range correctly returned cumulative balances
  - Account 1700 standard name: "Forskuddsbetalt leiekostnad"
  - Full flow: 2 GETs + 5 POSTs = 7 calls confirmed as minimum
