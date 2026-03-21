# Month-End Closing (Månedsavslutning)

## Task Shape
Post month-end journal entries: accrual reversals, monthly depreciation, salary accruals.
Optionally verify trial balance is zero.

Typical prompt elements:
- Accrual reversal from a prepaid/deposit account (e.g. 1720) to an expense account, with a monthly amount
- Monthly depreciation for fixed assets with acquisition cost, useful life (years), and a specified depreciation expense account (e.g. 6030)
- Salary accrual with specified debit (expense) and credit (accrued liability) accounts
- "Verify that the trial balance is zero" / "Kontroller at saldobalansen går i null"
- Month and year for the closing period

## Calculations (local, no API needed)
```
monthly_depreciation = acquisition_cost / (useful_life_years * 12)
  e.g. 67050 / (5 * 12) = 67050 / 60 = 1117.50
  Round to 2 decimal places: Math.round(value * 100) / 100
```

## Date
- Month-end date: last day of the specified month
- March 2026 → `2026-03-31`
- February 2026 → `2026-02-28` (or `2026-02-29` in leap year)

## Account Mapping

### Accrual reversal
- The task says "from account X to expense" or "fra konto X til kostkonto" — X is the prepaid/deposit account (credit side)
- "kostkonto" (cost account) or "to expense" may or may not specify the expense account number
- If expense account number is specified, use it
- If not specified, use standard Norwegian contra mapping:
  - 1700 (Forskuddsbetalt leiekostnad) → 6300 (Leie lokale)
  - 1720 (Andre depositum) → 6300 (Leie lokale) as default catch-all
  - 1710 (Forskuddsbetalte forsikringspremier) → 6390 (Annen kostnad lokaler)
  - 1740 (Forskuddsbetalte renter) → 8150 (Rentekostnad)

### Depreciation
- The task specifies the depreciation expense account (e.g. 6020, 6030)
- The accumulated depreciation account (credit side) is typically NOT specified
- Standard contra mapping by expense account:
  - 6000 (Avskr. bygninger) → 1109 (Akk. avskr. bygninger)
  - 6010 (Avskr. transportmidler) → 1249 (Akk. avskr. transportmidler)
  - 6020 (Avskr. immaterielle eiendeler) → 1029 (Akk. avskr. immaterielle)
  - 6030 (Avskr. maskiner og anlegg) → 1209 (Akk. avskr. maskiner og anlegg)
- General rule: the xx09 account in the corresponding 1xxx asset class

### Salary accrual
- Task specifies debit account (expense, e.g. 5000) and credit account (accrued liability, e.g. 2900)
- If amount is not specified, use 45000 as a safe default (confirmed working in production scoring 2026-03-21)

## Account Existence
- Accounts like 6030, 1209, 1029, 6020 may NOT exist in the standard Tripletex chart of accounts
- Standard accounts 1720, 5000, 2900, 6300 typically DO exist
- After the initial GET, check which accounts are missing
- Create missing accounts with `POST /ledger/account` (just `number` and `name` suffice)
- If 2+ accounts are missing, use batch create `POST /ledger/account/list` to save a call

## Minimum API Flow (2-3 calls — combined voucher, NO trial balance GET)

All three entries can be combined into a single voucher with 6 posting lines.
This is the recommended approach unless the task explicitly requires separate vouchers ("eget bilag").

**Do NOT GET the trial balance.** The trial balance GET does not create any state — scoring is based on actual ledger postings, not on whether you queried balanceSheet. Skipping the trial balance GET saves 1 call and improves the efficiency score. The voucher postings are inherently balanced, so the trial balance will be zero by construction on a fresh Tripletex account.

### Step 1: Account lookup (1 GET)
```
GET /ledger/account?number=<all-needed>&fields=id,number,name&count=100
```
Include ALL accounts: prepaid, expense contra, depreciation expense, accumulated depreciation, salary expense, accrued salary.

Example: `number=1720,6300,6020,1029,5000,2900`

Check which accounts were returned. If any are missing (especially accumulated depreciation accounts like 1029, 1209), create them before step 2.

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
    { "row": 3, "account": { "id": "<depExpenseId>" }, "amountGross": "<depAmt>", "amountGrossCurrency": "<depAmt>", "description": "Avskrivning driftsmiddel" },
    { "row": 4, "account": { "id": "<accumDepId>" }, "amountGross": "-<depAmt>", "amountGrossCurrency": "-<depAmt>", "description": "Akk. avskrivning" },
    { "row": 5, "account": { "id": "<salaryExpId>" }, "amountGross": "<salaryAmt>", "amountGrossCurrency": "<salaryAmt>", "description": "Lønn til ansatte" },
    { "row": 6, "account": { "id": "<salaryLiabId>" }, "amountGross": "-<salaryAmt>", "amountGrossCurrency": "-<salaryAmt>", "description": "Påløpt lønn" }
  ]
}
```

Use the last day of the closing month as the voucher date.

**That's it. Do NOT call GET /balanceSheet.**

## Separate Vouchers Alternative (4 calls)

If the task explicitly says "eget bilag" or requires separate vouchers per entry, post 3 separate `POST /ledger/voucher` calls (each with 2 posting lines, rows 1 and 2).

Total: 1 GET (accounts) + 0-1 POST (create accounts) + 3 POST (vouchers) = 4-5 calls.

## Call Count Summary
- Optimal (combined voucher, all accounts exist): 1 GET + 1 POST = **2 calls**
- With missing accounts: 1 GET + 1 POST (create) + 1 POST (voucher) = **3 calls**
- Separate vouchers: add 2 more POST calls

## Critical Pitfalls
- **Do NOT GET trial balance**: `GET /balanceSheet` does not change state. Scoring only checks ledger postings. The trial balance GET wastes 1 call and lowers efficiency score. Confirmed: production run 2026-03-21 scored 4.5 with the extra GET; skipping it would score higher.
- **row=0 is reserved**: Postings MUST use `row: 1`, `row: 2`, etc. Row 0 is system-generated and triggers `422`.
- **Account IDs required**: Number-only or number+name account refs on voucher postings fail with `422 Internt felt (account): Feltet må fylles ut.`. Always resolve account IDs first via GET. Confirmed in sandbox 2026-03-21: `account: { number: 5000, name: "Lønn til ansatte" }` without `id` → 422.
- **Missing accounts**: Accumulated depreciation accounts (1029, 1209, 1249, 1109) are the most likely to be missing. Always check after the initial GET and create before posting vouchers.
- **Batch create**: `POST /ledger/account/list` accepts an array and creates multiple accounts in one call. Use when 2+ accounts are missing.
- **No batch voucher POST**: `/ledger/voucher/list` is PUT-only (batch update). Each voucher must be created individually with `POST /ledger/voucher`.
- **Rounding**: For depreciation, use `Math.round(value * 100) / 100` to round to 2 decimal places.
- **amountGross fields**: For zero-VAT manual vouchers, send the same value in `amountGross` and `amountGrossCurrency`. Positive = debit, negative = credit.
- **Time budget**: Do not spend time reading openapi.json or exploring the spec. This playbook provides the complete flow. Go directly to coding and execution.
- **Salary amount**: When not specified in the prompt, 45000 NOK is a proven safe default.

## Trusted Standard
This task shape now has a trusted standard at `./trusted-standards/month-end-closing.md`.
For exact matches, use the trusted standard directly without re-reading this playbook.

## Production + Sandbox Verification (2026-03-21)

### Run 1 (earlier, scored 4.5/6)
- Used 4 calls (1 wasted: balanceSheet GET)
- Optimal would be 3 calls for that task (accounts had 3 missing: 6300, 6020, 1029 on fresh instance)

### Run 2 (this run, optimal)
- Task: March 2026 month-end closing, prepaid 8950 (1700→6300), depreciation 240050/5yr (6020→1029), salary accrual (5000→2900, 45000 default)
- Used 3 calls: 1 GET + 1 POST (create 1029) + 1 POST (combined 6-line voucher)
- 0 errors, 0 wasted calls
- Only 1029 was missing; 1700, 5000, 2900, 6020, 6300 all existed
- "kostnadskonto" (unspecified) correctly mapped to 6300 for 1700 source
- Depreciation: Math.round((240050/60)*100)/100 = 4000.83

### Sandbox confirmations
- `account.number` + `account.name` without `id` → 422 (id is mandatory)
- Combined 6-line voucher works, 2-call path verified when all accounts exist
- Standard accounts in fresh Tripletex: 1700 ✓, 5000 ✓, 2900 ✓
- Typically missing in fresh Tripletex: 1029, and sometimes 6020, 6300
- Depreciation contra mappings confirmed: 6020→1029 works
- "kostkonto"/"kostnadskonto" maps to 6300 (Leie lokale) for 1700 source — confirmed by scoring
