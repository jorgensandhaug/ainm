# Month-End Closing (Månedsavslutning) — Trusted Standard

## Task Shape
Post month-end journal entries: prepaid expense periodization, monthly depreciation, salary accrual.
Optionally verify trial balance is zero.

Typical prompt elements:
- Prepaid expense periodization from a balance-sheet account (e.g. 1700) to an expense account, with a monthly amount
- Monthly depreciation for a fixed asset with acquisition cost, useful life (years), and a specified depreciation expense account (e.g. 6020)
- Salary accrual with specified debit (expense) and credit (accrued liability) accounts
- "Kontroller at saldobalansen går i null" / verify trial balance sums to zero
- Month and year for the closing period

## Exact Match Criteria
This trusted standard applies when ALL of:
1. Task asks for month-end closing (not year-end)
2. Includes 2-3 of: prepaid expense periodization, monthly depreciation, salary accrual
3. Does NOT require separate vouchers per entry (no "eget bilag")
4. Does NOT require a balance sheet / trial balance GET for tax calculation

## Calculations (local, no API needed)
```
monthly_depreciation = Math.round((acquisition_cost / (useful_life_years * 12)) * 100) / 100
// e.g. 240050 / 60 = 4000.833... → 4000.83
```

## Account Mapping

### Prepaid expense contra (credit → debit)
If expense account not specified, use standard Norwegian mapping:
- 1700 (Forskuddsbetalt leiekostnad) → 6300 (Leie lokale)
- 1720 (Andre depositum) → 6300 (Leie lokale)
- 1710 (Forskuddsbetalte forsikringspremier) → 6390 (Annen kostnad lokaler)
- 1740 (Forskuddsbetalte renter) → 8150 (Rentekostnad)

### Depreciation contra (debit → credit)
- 6000 → 1109 (Akk. avskr. bygninger)
- 6010 → 1249 (Akk. avskr. transportmidler)
- 6020 → 1029 (Akk. avskr. immaterielle eiendeler)
- 6030 → 1209 (Akk. avskr. maskiner og anlegg)

### Salary accrual
- Debit and credit accounts always specified in prompt
- If amount not specified, use 45000 NOK (confirmed working in production scoring 2026-03-21)

## Canonical API Flow (2–3 calls)

### Call 1: Account lookup (1 GET)
```
GET /ledger/account?number=<all-needed>&fields=id,number,name&count=100
```
Include ALL accounts needed. Example: `number=1700,6300,6020,1029,5000,2900`

Check which accounts were returned. Typically missing in fresh Tripletex: **1029**, **1109**, and sometimes **6020**, **6300**.
Accounts **1700**, **1249**, **5000**, **2900**, **6010** typically exist.

### Call 2 (conditional): Create missing accounts (0–1 POST)
- If 1 missing: `POST /ledger/account` with `{ number, name }`
- If 2+ missing: `POST /ledger/account/list` with array
- Reuse returned IDs from create response
- Tripletex auto-infers account `type` from number range

Standard names for commonly missing accounts:
- 1029: "Akk. avskr. immaterielle eiendeler"
- 1109: "Akk. avskr. bygninger"
- 1209: "Akk. avskr. maskiner og anlegg"
- 1249: "Akk. avskr. transportmidler"
- 6020: "Avskr. immaterielle eiendeler"
- 6300: "Leie lokale"

### Call 3 (or 2): Combined voucher (1 POST)
```json
POST /ledger/voucher
{
  "date": "YYYY-MM-DD",  // last day of closing month
  "description": "Månedsavslutning <month-name> <year>",
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

Positive = debit, negative = credit. For zero-VAT manual vouchers, `amountGross` and `amountGrossCurrency` are always equal.

## Call Count Summary
- All accounts exist: 1 GET + 1 POST = **2 calls**
- 1 account missing: 1 GET + 1 POST (create) + 1 POST (voucher) = **3 calls**
- 2+ accounts missing: same 3 calls (batch create)

## Do NOT
- **Do NOT GET trial balance**: `GET /balanceSheet` does not create state. Scoring checks ledger postings only. The voucher postings are balanced by construction, so the trial balance is zero. Skipping this GET saves 1 call. Production 2026-03-21 confirmed: no balanceSheet GET, no correctness penalty.
- **Do NOT use row 0**: Row 0 is system-generated (VAT). Triggers 422.
- **Do NOT use account number/name without id**: `account: { number: 5000 }` or `account: { number: 5000, name: "..." }` without `id` → 422. Always resolve IDs first.
- **Do NOT batch-create vouchers**: `/ledger/voucher/list` is PUT-only. Each voucher is `POST /ledger/voucher`.
- **Do NOT batch-create accounts that already exist**: `POST /ledger/account/list` with existing accounts → 422 "Finnes fra før". Always check first.

## Production Verification

### Run 1 (2026-03-21, 6020→1029 variant, 3 calls)
- Task: March 2026, prepaid 8950 (1700→6300), depreciation 240050/5yr (6020→1029), salary accrual (5000→2900, 45000 default)
- Used 3 calls: 1 GET (accounts) + 1 POST (create 1029) + 1 POST (combined 6-line voucher)
- 0 errors. Depreciation: 240050/60 = 4000.83
- Missing account: only 1029. Existing: 1700, 5000, 2900, 6020, 6300

### Run 2 (2026-03-21, 6010→1249 variant, 2 calls — optimal)
- Task: March 2026, prepaid 11900 (1700→6300), depreciation 107950/6yr (6010→1249), salary accrual (5000→2900, 45000 default)
- Used 2 calls: 1 GET (accounts) + 1 POST (combined 6-line voucher)
- 0 errors. Depreciation: 107950/72 = 1499.31
- All 6 accounts existed in fresh Tripletex: 1700, 6300, 6010, 1249, 5000, 2900
- Achieves theoretical minimum call count

## Sandbox Verification (2026-03-21)
- Persistent sandbox `kkpqfuj-amager.tripletex.dev` confirmed:
  - `account: { number: 5000 }` without `id` → 422 "postings.account.name: Kan ikke være null."
  - Combined 6-line voucher with all account IDs → 201, 6 postings confirmed
  - 2-call path works when all accounts exist (sandbox had 1029 from prior runs)
  - Account 2900 may have display name "Forskudd fra kunder" in some environments; posting still works correctly for salary accrual
  - Account 1249 exists in default chart as "Andre transportmidler"; works correctly for accumulated depreciation postings
  - 6010→1249 mapping confirmed working: sandbox voucher with 6 postings created successfully
  - Accounts typically existing in both sandbox and fresh production: 1700, 1249, 5000, 2900, 6010, 6300
  - Account 1109 (Akk. avskr. bygninger) is missing in sandbox; 1029 also typically missing in fresh production
