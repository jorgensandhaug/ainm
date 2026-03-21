# Simplified Year-End Closing (Forenklet Årsoppgjør) — Trusted Standard

## Task Shape
Book depreciation, reverse prepaid expenses, and calculate/book tax expense for a fiscal year.

Typical prompt elements:
- Depreciation of N fixed assets with cost, useful life, and asset accounts
- Specified depreciation cost account (e.g. 6010) and accumulated depreciation account (e.g. 1209)
- Prepaid expense reversal with total amount and account (e.g. 1700)
- Tax expense at 22% of taxable result on specified accounts (e.g. 8700/2920)
- "Bokfør hver avskrivning som et eget bilag" = each depreciation as a separate voucher

## Exact Match Criteria
This trusted standard applies when ALL of:
1. Task asks for year-end closing (not month-end)
2. Includes depreciation of 2–4 fixed assets with specified costs, useful lives, and accounts
3. Includes prepaid expense reversal with total amount on account 1700
4. Includes tax expense calculation at 22% on specified accounts
5. Requires separate vouchers per depreciation ("eget bilag")
6. Requires a balance sheet GET for taxable result calculation

## Calculations (local, no API needed)

**CRITICAL: Use 2-decimal rounding for ALL depreciation amounts.**
```
r2 = (v) => Math.round(v * 100) / 100;

dep_1 = r2(cost_1 / useful_life_1)   // e.g. r2(222900 / 10) = 22290.00
dep_2 = r2(cost_2 / useful_life_2)   // e.g. r2(254250 / 8) = 31781.25
dep_3 = r2(cost_3 / useful_life_3)   // e.g. r2(207900 / 6) = 34650.00
total_dep = r2(dep_1 + dep_2 + dep_3)
```

**WARNING**: Do NOT use `Math.round(cost / life)` (integer rounding). This loses
fractional depreciation and causes scoring failures.

## Prepaid Expense Contra Account
The task typically says "reverser forskuddsbetalte kostnader på konto 1700" without specifying the expense contra.
- Account 1700 in the standard Norwegian chart (NS 4102) = "Forskuddsbetalt leiekostnad" (prepaid rent)
- Standard contra: **6300** (Leie lokale / Rent expense)
- Include 6300 in the initial account lookup
- If the task explicitly names a different expense contra, use that instead

## Account Existence

Accounts **1209** and **8700** typically do NOT exist in a fresh Tripletex instance.
Accounts **1700**, **2920**, **6010**, **6300** typically exist.

After the initial `GET /ledger/account`, check which accounts were NOT returned and create them before posting vouchers:
- If 1 missing: `POST /ledger/account` with `{ number, name }`
- If 2+ missing: `POST /ledger/account/list` with array of `{ number, name }` (saves a call vs separate POSTs)
- `POST /ledger/account/list` with already-existing accounts returns `422 "Finnes fra før"` — always check first
- Tripletex auto-infers account `type` from the number range

Standard names for commonly missing accounts:
- 1209: "Akkumulerte avskrivninger"
- 8700: "Skattekostnad på ordinært resultat"

## Canonical API Flow (7–8 calls)

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

## Do NOT
- **Do NOT use integer rounding**: `Math.round(cost / life)` loses fractional amounts. Use `Math.round(cost / life * 100) / 100`.
- **Do NOT batch-create accounts without checking**: `POST /ledger/account/list` with existing accounts returns `422 "Finnes fra før"`. Always GET first.
- **Do NOT use row 0**: Row 0 is system-generated (VAT). Triggers 422.
- **Do NOT use account number/name without id**: `account: { number: 6010 }` without `id` → 422. Always resolve IDs first.
- **Do NOT batch-create vouchers**: `POST /ledger/voucher/list` is PUT-only (returns 400). Each voucher is `POST /ledger/voucher`.
- **Do NOT combine depreciation vouchers**: When the task says "eget bilag", each depreciation must be a separate voucher.
- **Do NOT post zero-amount tax voucher**: If taxable result ≤ 0, skip the tax voucher entirely.
- **Do NOT use `dateTo=YYYY-12-31`**: Balance sheet `dateTo` is exclusive. Use `dateTo=YYYY+1-01-01` to include all of December.

## Production Verification (2026-03-21, run 1)
- Task: 2025 year-end closing with 3 assets (Kontormaskiner 222900/10yr, Inventar 254250/8yr, IT-utstyr 207900/6yr), 78250 prepaid reversal (1700→6300), 22% tax (8700→2920)
- Depreciation: 22290.00 + 31781.25 + 34650.00 = 88721.25
- Balance sheet sum: -907054.87, preTaxProfit: 907054.87, adjusted: 740083.62, tax: 162818
- Used 8 calls: 2 GET (parallel) + 1 POST (batch create 1209+8700) + 5 POST (vouchers)
- 0 errors, all calls succeeded on first attempt
- Missing accounts: 1209, 8700 (as expected)
- Existing accounts: 1700, 2920, 6010, 6300

## Production Verification (2026-03-21, run 2 — Portuguese prompt)
- Task: 2025 year-end closing with 3 assets (IT-utstyr 470650/10yr acct 1210, Kjøretøy 146700/3yr acct 1230, Inventar 313500/4yr acct 1240), 63300 prepaid reversal (1700→6300), 22% tax (8700→2920)
- Prompt language: Portuguese ("Realize o encerramento anual simplificado de 2025")
- Depreciation: 47065.00 + 48900.00 + 78375.00 = 174340.00
- Balance sheet sum: -2012876.72, preTaxProfit: 2012876.72, adjusted: 1775236.72, tax: 390552
- Used 8 calls: 2 GET (parallel) + 1 POST (batch create 1209+8700) + 5 POST (vouchers)
- 0 errors, all calls succeeded on first attempt
- Missing accounts: 1209, 8700 (as expected)
- Existing accounts: 1700, 2920, 6010, 6300
- Note: asset accounts (1210, 1230, 1240) from prompt are informational only — all depreciation postings use 6010 (expense) and 1209 (accumulated)

## Sandbox Verification (2026-03-21)
- Persistent sandbox `kkpqfuj-amager.tripletex.dev` confirmed:
  - `POST /ledger/voucher` with `row: 1` / `row: 2` succeeded for balanced two-line depreciation entries
  - Without explicit `row`, the API returned `422` with "posteringene på rad 0 (guiRow 0) er systemgenererte"
  - `GET /balanceSheet` with result account range correctly returned cumulative balances
  - Account 1700 standard name: "Forskuddsbetalt leiekostnad"
  - 2-decimal amounts (e.g. 31781.25, 34650.00) correctly stored in voucher postings
  - `POST /ledger/account/list` batch create works for new accounts, returns 422 for existing
  - Account 1209 does NOT exist in fresh Tripletex (must be created)
  - Account 8700 does NOT exist in fresh Tripletex (must be created)
  - `POST /ledger/voucher/list` returns 400 (Method Not Allowed) — batch voucher creation is not supported
  - Full flow: 2 GETs + 1 POST (create missing) + 5 POSTs (vouchers) = 8 calls with missing accounts
  - `POST /ledger/voucher` with `account: { number: ..., name: ... }` (no id) returns `422 "Internt felt (account): Feltet må fylles ut."` — account IDs are always required, no shortcut via number+name
  - `POST /ledger/account/list` with any already-existing account in the batch rejects the entire batch with `422 "Finnes fra før"` — cannot blindly batch-create without checking first
