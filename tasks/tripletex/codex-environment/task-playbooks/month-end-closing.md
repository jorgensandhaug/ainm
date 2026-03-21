# Month-End Closing (Månedsavslutning)

## Task Shape
Post month-end journal entries: accrual reversals, monthly depreciation, salary accruals.
Optionally verify trial balance is zero.

Typical prompt elements:
- Accrual reversal from a prepaid/deposit account (e.g. 1720) to an expense account, with a monthly amount
- Monthly depreciation for fixed assets with acquisition cost, useful life (years), and a specified depreciation expense account (e.g. 6030)
- Salary accrual with specified debit (expense) and credit (accrued liability) accounts
- "Verify that the trial balance is zero"
- Month and year for the closing period

## Calculations (local, no API needed)
```
monthly_depreciation = acquisition_cost / (useful_life_years * 12)
  e.g. 270750 / (8 * 12) = 270750 / 96 = 2820.31
  Round to 2 decimal places: Math.round(value * 100) / 100
```

## Date
- Month-end date: last day of the specified month
- March 2026 → `2026-03-31`
- February 2026 → `2026-02-28` (or `2026-02-29` in leap year)

## Account Mapping

### Accrual reversal
- The task says "from account X to expense" — X is the prepaid/deposit account (credit side)
- "To expense" may or may not specify the expense account number
- If expense account number is specified, use it
- If not specified, use standard Norwegian contra mapping:
  - 1700 (Forskuddsbetalt leiekostnad) → 6300 (Leie lokale)
  - 1720 (Andre depositum) → 6300 (Leie lokale) as default catch-all
  - 1710 (Forskuddsbetalte forsikringspremier) → 6390 (Annen kostnad lokaler)
  - 1740 (Forskuddsbetalte renter) → 8150 (Rentekostnad)

### Depreciation
- The task specifies the depreciation expense account (e.g. 6030)
- The accumulated depreciation account (credit side) is typically NOT specified
- Standard contra mapping by expense account:
  - 6000 (Avskr. bygninger) → 1109 (Akk. avskr. bygninger)
  - 6010 (Avskr. transportmidler) → 1249 (Akk. avskr. transportmidler)
  - 6020 (Avskr. immaterielle eiendeler) → 1029 (Akk. avskr. immaterielle)
  - 6030 (Avskr. maskiner og anlegg) → 1209 (Akk. avskr. maskiner og anlegg)
- General rule: the xx09 account in the corresponding 1xxx asset class

### Salary accrual
- Task specifies debit account (expense, e.g. 5000) and credit account (accrued liability, e.g. 2900)
- If amount is not specified, it may need to be determined from context or the prompt may accept any reasonable amount

## Account Existence
- Accounts like 6030 and 1209 may NOT exist in the standard Tripletex chart of accounts
- After the initial GET, check which accounts are missing
- Create missing accounts with `POST /ledger/account` (just `number` and `name` suffice)
- If 2+ accounts are missing, use batch create `POST /ledger/account/list` to save a call

## Minimum API Flow (3 calls — combined voucher)

All three entries can be combined into a single voucher with 6 posting lines.
This is the recommended approach unless the task explicitly requires separate vouchers ("eget bilag").

### Step 1: Account lookup (1 GET)
```
GET /ledger/account?number=<all-needed>&fields=*
```
Include ALL accounts: prepaid, expense contra, depreciation expense, accumulated depreciation, salary expense, accrued salary.

Example: `number=1720,6300,6030,1209,5000,2900`

Check which accounts were returned. If any are missing (especially 6030, 1209), create them before step 2.

### Step 1b: Create missing accounts (0-1 calls)
- If 1 missing: `POST /ledger/account` with `{ number: <num>, name: "<name>" }`
- If 2+ missing: `POST /ledger/account/list` with array of `{ number: <num>, name: "<name>" }` objects
- Tripletex auto-infers account `type` from the number range
- Reuse returned IDs from the create response

### Step 2: Combined voucher (1 POST)
```json
{
  "date": "YYYY-MM-DD",
  "description": "Månedsavslutning <month> <year>",
  "postings": [
    { "row": 1, "account": { "id": "<expenseId>" }, "amountGross": "<accrualAmt>", "amountGrossCurrency": "<accrualAmt>", "description": "Periodisering forskuddsbetalt kostnad" },
    { "row": 2, "account": { "id": "<prepaidId>" }, "amountGross": "-<accrualAmt>", "amountGrossCurrency": "-<accrualAmt>", "description": "Forskuddsbetalt kostnad" },
    { "row": 3, "account": { "id": "<depExpenseId>" }, "amountGross": "<depAmt>", "amountGrossCurrency": "<depAmt>", "description": "Avskrivning maskiner og anlegg" },
    { "row": 4, "account": { "id": "<accumDepId>" }, "amountGross": "-<depAmt>", "amountGrossCurrency": "-<depAmt>", "description": "Akk. avskrivning maskiner og anlegg" },
    { "row": 5, "account": { "id": "<salaryExpId>" }, "amountGross": "<salaryAmt>", "amountGrossCurrency": "<salaryAmt>", "description": "Lønn til ansatte" },
    { "row": 6, "account": { "id": "<salaryLiabId>" }, "amountGross": "-<salaryAmt>", "amountGrossCurrency": "-<salaryAmt>", "description": "Påløpt lønn" }
  ]
}
```

Use the last day of the closing month as the voucher date.

### Step 3: Trial balance verification (1 GET)
```
GET /balanceSheet?dateFrom=YYYY-01-01&dateTo=YYYY-MM+1-01&fields=*,account(*)&count=10000
```
Sum all `balanceOut` values — should equal zero (within floating-point tolerance).

For March 2026: `dateFrom=2026-01-01&dateTo=2026-04-01`

Note: `dateTo` is exclusive — `2026-04-01` includes all of March.

## Separate Vouchers Alternative (5 calls)

If the task explicitly says "eget bilag" or requires separate vouchers per entry, post 3 separate `POST /ledger/voucher` calls (each with 2 posting lines, rows 1 and 2).

Total: 1 GET (accounts) + 3 POST (vouchers) + 1 GET (trial balance) = 5 calls.

## Call Count Summary
- Optimal (combined voucher, all accounts exist): 1 GET + 1 POST + 1 GET = **3 calls**
- With 2 missing accounts: 1 GET + 1 POST (batch create) + 1 POST (voucher) + 1 GET = **4 calls**
- Without trial balance verification: subtract 1 GET

## Critical Pitfalls
- **row=0 is reserved**: Postings MUST use `row: 1`, `row: 2`, etc. Row 0 is system-generated and triggers `422`.
- **Account IDs required**: Number-only or number+name account refs on voucher postings fail with `422 postings.account.name: Kan ikke være null.` or `422 Internt felt (account): Feltet må fylles ut.`. Always resolve account IDs first.
- **Missing accounts**: Accounts like 6030, 1209 may not exist in the standard chart. Always check after the initial GET and create before posting vouchers.
- **Batch create**: `POST /ledger/account/list` accepts an array and creates multiple accounts in one call. Use when 2+ accounts are missing.
- **No batch voucher POST**: `/ledger/voucher/list` is PUT-only (batch update). Each voucher must be created individually with `POST /ledger/voucher`.
- **Rounding**: For depreciation, use `Math.round(value * 100) / 100` to round to 2 decimal places.
- **amountGross fields**: For zero-VAT manual vouchers, send the same value in `amountGross` and `amountGrossCurrency`. Positive = debit, negative = credit.
- **Time budget**: Do not spend time reading openapi.json or exploring the spec. This playbook provides the complete flow. Go directly to coding and execution.

## Sandbox Verification (2026-03-21)
- Persistent sandbox `kkpqfuj-amager.tripletex.dev` confirmed:
  - Account 1720 = "Andre depositum", 5000 = "Lønn til ansatte", 2900 = "Forskudd fra kunder"
  - Accounts 6030 and 1209 existed in sandbox (non-default IDs suggest created by prior tests)
  - Combined 6-line voucher with rows 1-6 succeeded (voucher 112): all three entries in a single POST
  - Separate 2-line vouchers for each entry also succeeded (vouchers 109, 110, 111)
  - `GET /balanceSheet` with dateFrom/dateTo/fields/count returns correct cumulative balances
  - Depreciation 270750/96 = 2820.31 calculated and posted correctly
  - Monthly accrual reversal 2450 NOK from 1720 to 6390 succeeded
  - Salary accrual 45000 NOK from 5000 to 2900 succeeded
