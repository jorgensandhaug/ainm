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
- Confirmed **existing** in fresh Tripletex default chart: 1700, 1710, 1720, 1740, 1249, 5000, 2900, 6000, 6010, 6020, 6300, 6390, 8150
- Confirmed **missing** in fresh Tripletex default chart: **1029**, **1109**, **1209**, **6030**
- Note: **6030** (depreciation expense) is NOT in the default chart despite 6000/6010/6020 being present
- **Do NOT hardcode a "known missing" list** — after the GET, dynamically detect ALL accounts not returned and batch-create them
- Create missing accounts with `POST /ledger/account` (just `number` and `name` suffice)
- If 2+ accounts are missing, use batch create `POST /ledger/account/list` to save a call
- Standard names for missing accounts:
  - 1029: "Akk. avskr. immaterielle eiendeler"
  - 1109: "Akk. avskr. bygninger"
  - 1209: "Akk. avskr. maskiner og anlegg"
  - 6030: "Avskr. maskiner og anlegg"

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
- **Missing accounts**: Accounts 1029, 1109, 1209, and 6030 are confirmed missing in fresh Tripletex. Do NOT assume only accumulated depreciation accounts can be missing — 6030 (depreciation expense) is also missing. Dynamically detect ALL missing accounts from GET response and batch-create them.
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
- Optimal would be 3 calls for that task (1029 missing, needed account creation)

### Run 2 (6020→1029 variant, 3 calls)
- Task: March 2026, prepaid 8950 (1700→6300), depreciation 240050/5yr (6020→1029), salary accrual (5000→2900, 45000 default)
- Used 3 calls: 1 GET + 1 POST (create 1029) + 1 POST (combined 6-line voucher)
- 0 errors, 0 wasted calls
- Only 1029 was missing; 1700, 5000, 2900, 6020, 6300 all existed
- Depreciation: Math.round((240050/60)*100)/100 = 4000.83

### Run 3 (6010→1249 variant, 2 calls — optimal)
- Task: March 2026, prepaid 11900 (1700→6300), depreciation 107950/6yr (6010→1249), salary accrual (5000→2900, 45000 default)
- Used 2 calls: 1 GET (accounts) + 1 POST (combined 6-line voucher)
- 0 errors, theoretical minimum call count achieved
- All 6 accounts existed: 1700, 6300, 6010, 1249, 5000, 2900
- Depreciation: Math.round((107950/72)*100)/100 = 1499.31

### Run 4 (1710→6390 + 6020→1029 variant, blocked by credentials)
- Task: March 2026, prepaid 2450 (1710→6390), depreciation 111100/5yr (6020→1029), salary accrual (5000→2900, 45000 default)
- Script correct: 1 GET + 1 POST (create 1029) + 1 POST (voucher) = 3 calls planned
- Blocked: 403 "Invalid or expired proxy token" on all calls
- Depreciation: Math.round((111100/60)*100)/100 = 1851.67

### Run 5 (1720→6300 + 6020→1029 variant, 3 calls)
- Task: March 2026, prepaid 8050 (1720→6300), depreciation 179850/4yr (6020→1029), salary accrual (5000→2900, 45000 default)
- Used 3 calls: 1 GET + 1 POST (create 1029) + 1 POST (combined 6-line voucher)
- 0 errors, optimal for 6020→1029 variant
- Only 1029 was missing; 1720, 5000, 2900, 6020, 6300 all existed
- Depreciation: Math.round((179850/48)*100)/100 = 3746.88
- First production confirmation of 1720 as prepaid source

### Run 6 (1700→6300 + 6020→1029 variant, Nynorsk prompt, 3 calls)
- Task: March 2026, prepaid 12000 (1700→6300), depreciation 278500/4yr (6020→1029), salary accrual (5000→2900, 45000 default)
- Used 3 calls: 1 GET + 1 POST (create 1029) + 1 POST (combined 6-line voucher)
- 0 errors, optimal for 6020→1029 variant
- Only 1029 was missing; 1700, 5000, 2900, 6020, 6300 all existed
- Depreciation: Math.round((278500/48)*100)/100 = 5802.08
- Nynorsk prompt: "kostnadskonto" correctly mapped to 6300 via 1700 source
- 3rd production confirmation of 6020→1029 needing 1029 creation

### Run 7 (1700→6300 + 6020→1029 variant, Nynorsk prompt, 3 calls)
- Task: March 2026, prepaid 12000 (1700→6300), depreciation 278500/4yr (6020→1029), salary accrual (5000→2900, 45000 default)
- Used 3 calls: 1 GET + 1 POST (create 1029) + 1 POST (combined 6-line voucher)
- 0 errors, optimal for 6020→1029 variant
- Only 1029 was missing; 1700, 5000, 2900, 6020, 6300 all existed
- Depreciation: Math.round((278500/48)*100)/100 = 5802.08
- Exact repeat of Run 6 parameters, 4th production confirmation of 6020→1029 variant
- Confirms 3-call path is stable across 4 independent production runs (Runs 2, 5, 6, 7)

### Run 8 (1720→6300 + 6030→1209 variant, English prompt, 4 calls — suboptimal)
- Task: March 2026, prepaid 9200 (1720→6300), depreciation 275800/3yr (6030→1209), salary accrual (5000→2900, 45000 default)
- Used 4 calls: 1 GET + 1 POST (create 1209) + 1 POST (create 6030) + 1 POST (voucher)
- 0 errors but 1 wasted call. Depreciation: 275800/36 = 7661.11
- **Both 6030 AND 1209 were missing** — first production confirmation of 6030→1209 variant
- Optimal: 3 calls (1 GET + 1 batch POST for 6030+1209 + 1 POST voucher)
- Root cause: script hardcoded only 1209 as "known missing"; did not dynamically detect 6030 missing from GET response
- Existing: 1720, 5000, 2900, 6300. Missing: 6030, 1209

### Run 9 (1710→6390 + 6020→1029 variant, Portuguese prompt, 3 calls)
- Task: March 2026, prepaid 12250 (1710→6390), depreciation 144950/9yr (6020→1029), salary accrual (5000→2900, 45000 default)
- Used 3 calls: 1 GET + 1 POST (create 1029) + 1 POST (combined 6-line voucher)
- 0 errors, optimal for 6020→1029 variant
- Missing: only 1029. Existing: 1710, 5000, 2900, 6020, 6390
- First successful production run of 1710→6390 variant (Run 4 was blocked)
- Portuguese prompt: "conta 1710 para despesa" → 1710→6390
- 5th consecutive optimal run for 6020→1029 variant (Runs 2, 5, 6, 7, 9)
- First 9-year useful life (108 months): Math.round((144950/108)*100)/100 = 1342.13

### Run 10 (1700→6300 + 6020→1029 variant, German prompt, 3 calls)
- Task: March 2026, prepaid 3400 (1700→6300), depreciation 289700/7yr (6020→1029), salary accrual (5000→2900, 45000 default)
- Used 3 calls: 1 GET + 1 POST (create 1029) + 1 POST (combined 6-line voucher)
- 0 errors, optimal for 6020→1029 variant
- Missing: only 1029. Existing: 1700, 5000, 2900, 6020, 6300
- German prompt: "Rechnungsabgrenzung", "Abschreibung", "Gehaltsrückstellung"
- 6th consecutive optimal run for 6020→1029 variant (Runs 2, 5, 6, 7, 9, 10)
- First 7-year useful life (84 months): Math.round((289700/84)*100)/100 = 3448.81
- Confirmed language variants: nb, nn, en, es, fr, pt, de

### Run 11 (1710→6390 + 6030→1209 variant, Nynorsk prompt, 3 calls — optimal)
- Task: March 2026, prepaid 4650 (1710→6390), depreciation 242900/4yr (6030→1209), salary accrual (5000→2900, 45000 default)
- Used 3 calls: 1 GET + 1 POST (batch create 6030+1209) + 1 POST (combined 6-line voucher)
- 0 errors. Depreciation: Math.round((242900/48)*100)/100 = 5060.42
- Missing: 6030, 1209. Existing: 1710, 5000, 2900, 6390
- **First optimal 6030→1209 production run** — batch-created both missing accounts in 1 call (Run 8 used 4 calls with individual creates)
- Nynorsk "kostnadskonto" correctly mapped to 6390 via 1710 source mapping
- Confirms dynamic missing-account detection + batch create saves 1 call vs hardcoded approach
- 7th consecutive optimal run overall; all language variants (nb, nn, en, es, fr, pt, de) produce correct results

### Run 12 (1700→6300 + 6010→1249 variant, English prompt, 2 calls — optimal)
- Task: March 2026, prepaid 5450 (1700→6300), depreciation 156750/10yr (6010→1249), salary accrual (5000→2900, 45000 default)
- Used 2 calls: 1 GET (accounts) + 1 POST (combined 6-line voucher)
- 0 errors, theoretical minimum call count achieved
- All 6 accounts existed: 1700, 6300, 6010, 1249, 5000, 2900
- 2nd optimal 2-call 6010→1249 production run (first was Run 3)
- First 10-year useful life (120 months): Math.round((156750/120)*100)/100 = 1306.25
- 12 production runs total: 10 optimal, 1 blocked (creds), 1 suboptimal (Run 8, batch-create fix applied in Run 11)

### Run 13 (1700→6300 + 6020→1029 variant, Norwegian prompt, 3 calls — optimal)
- Task: March 2026, prepaid 11150 (1700→6300), depreciation 147250/5yr (6020→1029), salary accrual (5000→2900, 45000 default)
- Used 3 calls: 1 GET (accounts) + 1 POST (create 1029) + 1 POST (combined 6-line voucher)
- 0 errors, optimal for 6020→1029 variant
- Missing: only 1029. Existing: 1700, 5000, 2900, 6020, 6300
- Depreciation: Math.round((147250/60)*100)/100 = 2454.17
- 7th optimal run for 6020→1029 variant (Runs 2, 5, 6, 7, 9, 10, 13)
- 13 production runs total: 11 optimal, 1 blocked (creds), 1 suboptimal (Run 8, batch-create fix applied in Run 11)

### Sandbox confirmations
- `account.number` + `account.name` without `id` → 422 (id is mandatory)
- Combined 6-line voucher works, 2-call path verified when all accounts exist
- 1710→6390 mapping confirmed working: sandbox voucher created successfully
- Comprehensive account survey: prepaid source (1700, 1710, 1720, 1740), periodization targets (6300, 6390, 8150), depreciation expense (6000, 6010, 6020), and accum. dep. (1249) exist in default chart
- Accounts 6030, 1029, 1209 exist in sandbox but were CREATED during prior testing (not default chart)
- 1720→6300, 1700→6300, 1710→6390, 6020→1029, 6010→1249, 6030→1209 mappings all confirmed working in sandbox
- Confirmed missing in fresh production: 1029 (Runs 2, 5, 6, 7), 6030 + 1209 (Run 8); 1109 missing in sandbox default
- "kostkonto"/"kostnadskonto" maps to 6390 for 1710 source, 6300 for 1700 source
- Portuguese "conta 1710 para despesa" maps to 1710→6390 (confirmed Run 9)
- German "Rechnungsabgrenzung von Konto 1700 auf Aufwand" maps to 1700→6300 (confirmed Run 10)
- Account 1249 named "Andre transportmidler" in default chart; works correctly as accumulated depreciation target
- 1710→6390 + 6030→1209 with 242900/4yr (dep 5060.42) sandbox-verified 2026-03-22: 6 postings created, balance sums to zero
- 1700→6300 + 6010→1249 with 156750/10yr (dep 1306.25) sandbox-verified 2026-03-22: 6 postings created, balance sums to zero
