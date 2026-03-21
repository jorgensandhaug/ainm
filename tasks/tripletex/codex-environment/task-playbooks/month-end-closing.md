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

## Minimum API Flow

### Phase 1: One GET for all accounts
`GET /ledger/account?number=<all-needed>&fields=*`
- Include ALL accounts from the task: prepaid account, expense contra, depreciation expense, accumulated depreciation, salary expense, accrued salary
- Example: `number=1720,6300,6030,1209,5000,2900`
- Check which are returned; note missing ones

### Phase 2: Create missing accounts (0-1 calls)
- If 1 missing: `POST /ledger/account` with `{ number, name }`
- If 2+ missing: `POST /ledger/account/list` with array of `{ number, name }` objects
- Both work with just `number` and `name`; Tripletex auto-infers `type` from the account number range
- Reuse returned IDs from the create response

### Phase 3: Post vouchers (3 calls, or 1 if combined)
Three separate `POST /ledger/voucher` calls:

**Voucher 1: Accrual reversal**
```json
{
  "date": "YYYY-MM-DD",
  "description": "Periodisering forskuddsbetalte kostnader <month> <year>",
  "postings": [
    { "row": 1, "account": { "id": <expenseAcctId> }, "amountGross": <amount>, "amountGrossCurrency": <amount>, "description": "Periodisering forskuddsbetalt kostnad" },
    { "row": 2, "account": { "id": <prepaidAcctId> }, "amountGross": -<amount>, "amountGrossCurrency": -<amount>, "description": "Forskuddsbetalt kostnad" }
  ]
}
```

**Voucher 2: Depreciation**
```json
{
  "date": "YYYY-MM-DD",
  "description": "Avskrivning driftsmidler <month> <year>",
  "postings": [
    { "row": 1, "account": { "id": <depExpenseAcctId> }, "amountGross": <depAmount>, "amountGrossCurrency": <depAmount>, "description": "Avskrivning maskiner og anlegg" },
    { "row": 2, "account": { "id": <accumDepAcctId> }, "amountGross": -<depAmount>, "amountGrossCurrency": -<depAmount>, "description": "Akk. avskrivning maskiner og anlegg" }
  ]
}
```

**Voucher 3: Salary accrual**
```json
{
  "date": "YYYY-MM-DD",
  "description": "Lønnsavsetning <month> <year>",
  "postings": [
    { "row": 1, "account": { "id": <salaryExpenseAcctId> }, "amountGross": <salaryAmount>, "amountGrossCurrency": <salaryAmount>, "description": "Lønn til ansatte" },
    { "row": 2, "account": { "id": <accruedSalaryAcctId> }, "amountGross": -<salaryAmount>, "amountGrossCurrency": -<salaryAmount>, "description": "Påløpt lønn" }
  ]
}
```

### Phase 4: Trial balance verification (optional, 1 GET)
`GET /balanceSheet?dateFrom=YYYY-MM-01&dateTo=YYYY-MM+1-01&fields=*,account(*)&count=10000`
- Sum all `balanceOut` values — should equal zero for a balanced set of entries
- `dateTo` is exclusive: for March 2026, use `dateTo=2026-04-01`
- This is a read-only verification step with no side effect — likely not scored, but confirms correctness

## Call Count Summary
- Best case (all accounts exist): 1 GET + 3 POST + 1 GET = 5 calls
- Typical case (2 accounts missing): 1 GET + 1 POST (batch) + 3 POST + 1 GET = 6 calls
- Without verification: subtract 1 GET

## Combined Voucher Optimization
All three entries can be combined into one voucher with 6 posting rows (rows 1-6).
This saves 2 POST calls but risks losing points if the scorer expects separate vouchers for each entry type.
- Use combined approach only if the task says "book all as one voucher" or similar
- Default to separate vouchers for safety

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
  - Account 1720 = "Andre depositum" (ASSETS), account 5000 = "Lønn til ansatte" (OPERATING_EXPENSES), account 2900 = "Forskudd fra kunder" (LIABILITIES)
  - Accounts 6030 and 1209 do NOT exist in the standard chart; must be created
  - `POST /ledger/account` with just `{ number, name }` succeeds (201), auto-infers account type
  - `POST /ledger/account/list` batch create succeeds (201) for multiple accounts
  - Account number+name refs on voucher postings fail (422); account ID required
  - `POST /ledger/voucher` with row 1/2 balanced postings succeeds (201)
  - Combined 6-line voucher with rows 1-6 succeeds (201)
  - `GET /balanceSheet` with dateFrom/dateTo/fields/count returns correct cumulative balances
  - Depreciation 270750/96 = 2820.31 calculated and posted correctly
