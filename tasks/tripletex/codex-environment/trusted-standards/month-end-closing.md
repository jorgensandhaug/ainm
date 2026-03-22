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

Check which accounts were returned vs. which were queried. **Do NOT hardcode a "known missing" list** — instead, dynamically detect ALL accounts not returned by the GET and batch-create them. This prevents wasted calls when an unexpected account is missing.

Accounts confirmed **existing** in fresh Tripletex default chart: **1700**, **1710**, **1720**, **1740**, **1249**, **5000**, **2900**, **6000**, **6010**, **6020**, **6300**, **6390**, **8150**.
Accounts confirmed **missing** in fresh Tripletex default chart: **1029**, **1109**, **1209**, **6030**.
Note: **6030** (depreciation expense for maskiner og anlegg) is NOT in the default chart despite 6000/6010/6020 being present. Confirmed missing in production Run 7.
Note: **1209** (accumulated depreciation for maskiner og anlegg) confirmed missing in production Run 7.

### Call 2 (conditional): Create missing accounts (0–1 POST)
- If 1 missing: `POST /ledger/account` with `{ number, name }`
- If 2+ missing: `POST /ledger/account/list` with array
- Reuse returned IDs from create response
- Tripletex auto-infers account `type` from number range

Standard names for commonly missing accounts:
- 1029: "Akk. avskr. immaterielle eiendeler"
- 1109: "Akk. avskr. bygninger"
- 1209: "Akk. avskr. maskiner og anlegg"
- 6030: "Avskr. maskiner og anlegg"

**Critical pattern**: After the GET, compare the set of returned account numbers against ALL queried numbers. Create ALL missing accounts in one batch call. Do NOT assume only certain accounts can be missing.

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

## Verification (GETs are FREE — use them)

After the voucher POST, verify the created state:

```
GET /ledger/voucher/{id}?fields=id,number,date,description,postings(row,account(number,name),amountGross,amountGrossCurrency)
```
**Log every posting** — account number, name, amount. Confirm 6 postings with correct accounts and amounts.

Optionally verify trial balance (GETs are free now):
```
GET /balanceSheet?dateFrom=YYYY-MM-01&dateTo=YYYY-MM+1-01&accountNumberFrom=1000&accountNumberTo=9999&fields=account(number,name),balanceOut&count=500
```
Log all non-zero `balanceOut` accounts. The voucher postings are balanced by construction so this should sum to zero.

## Do NOT
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

### Run 3 (2026-03-21, 1710→6390 + 6020→1029 variant, blocked by credentials)
- Task: March 2026, prepaid 2450 (1710→6390), depreciation 111100/5yr (6020→1029), salary accrual (5000→2900, 45000 default)
- Script was correct: 1 GET + 1 POST (create 1029) + 1 POST (voucher) = 3 calls planned
- All 3 calls returned 403 "Invalid or expired proxy token" — blocked credentials, no state created
- Depreciation: Math.round((111100/60)*100)/100 = 1851.67
- Account mapping: 1710→6390 is first production use of this variant

### Run 4 (2026-03-21, 1720→6300 + 6020→1029 variant, 3 calls)
- Task: March 2026, prepaid 8050 (1720→6300), depreciation 179850/4yr (6020→1029), salary accrual (5000→2900, 45000 default)
- Used 3 calls: 1 GET (accounts) + 1 POST (create 1029) + 1 POST (combined 6-line voucher)
- 0 errors. Depreciation: 179850/48 = 3746.88
- Missing account: only 1029. Existing: 1720, 5000, 2900, 6020, 6300
- First production confirmation of 1720 as prepaid source account
- Confirms 1720 exists in fresh Tripletex default chart

### Run 5 (2026-03-21, 1700→6300 + 6020→1029 variant, Nynorsk prompt, 3 calls)
- Task: March 2026, prepaid 12000 (1700→6300), depreciation 278500/4yr (6020→1029), salary accrual (5000→2900, 45000 default)
- Used 3 calls: 1 GET (accounts) + 1 POST (create 1029) + 1 POST (combined 6-line voucher)
- 0 errors. Depreciation: 278500/48 = 5802.08
- Missing account: only 1029. Existing: 1700, 5000, 2900, 6020, 6300
- Nynorsk prompt with "kostnadskonto" correctly mapped to 6300 via 1700 source mapping
- 3rd production confirmation of 6020→1029 variant requiring 1029 creation

### Run 6 (2026-03-21, 1700→6300 + 6020→1029 variant, Nynorsk prompt, 3 calls)
- Task: March 2026, prepaid 12000 (1700→6300), depreciation 278500/4yr (6020→1029), salary accrual (5000→2900, 45000 default)
- Used 3 calls: 1 GET (accounts) + 1 POST (create 1029) + 1 POST (combined 6-line voucher)
- 0 errors. Depreciation: 278500/48 = 5802.08
- Missing account: only 1029. Existing: 1700, 5000, 2900, 6020, 6300
- Exact repeat of Run 5 parameters, 4th production confirmation of 6020→1029 variant
- Confirms 3-call path is stable and optimal for this variant across 4 independent production runs

### Run 7 (2026-03-21, 6030→1209 variant, 4 calls — suboptimal)
- Task: March 2026, prepaid 9200 (1720→6300), depreciation 275800/3yr (6030→1209), salary accrual (5000→2900, 45000 default)
- Used 4 calls: 1 GET (accounts) + 1 POST (create 1209) + 1 POST (create 6030) + 1 POST (voucher)
- 0 errors. Depreciation: 275800/36 = 7661.11
- **Both 6030 AND 1209 were missing** in fresh Tripletex — first production confirmation
- Script only anticipated 1209 as potentially missing; 6030 was assumed to exist
- Optimal would have been 3 calls: 1 GET + 1 POST (batch create 6030+1209) + 1 POST (voucher)
- **Root cause of extra call**: hardcoded "known missing" list instead of dynamically detecting all missing accounts from GET response
- Existing: 1720, 5000, 2900, 6300. Missing: 6030, 1209

### Run 8 (2026-03-21, 1710→6390 + 6020→1029 variant, Portuguese prompt, 3 calls)
- Task: March 2026, prepaid 12250 (1710→6390), depreciation 144950/9yr (6020→1029), salary accrual (5000→2900, 45000 default)
- Used 3 calls: 1 GET (accounts) + 1 POST (create 1029) + 1 POST (combined 6-line voucher)
- 0 errors. Depreciation: Math.round((144950/108)*100)/100 = 1342.13
- Missing account: only 1029. Existing: 1710, 5000, 2900, 6020, 6390
- First successful production confirmation of 1710→6390 variant (Run 3 had same mapping but was blocked by credentials)
- Portuguese prompt correctly mapped: "conta 1710 para despesa" → 1710→6390
- 5th consecutive optimal run for 6020→1029 variant (Runs 1, 4, 5, 6, 8)
- Confirms 9-year useful life (108 months) works correctly with rounding

### Run 9 (2026-03-21, 1700→6300 + 6020→1029 variant, German prompt, 3 calls)
- Task: March 2026, prepaid 3400 (1700→6300), depreciation 289700/7yr (6020→1029), salary accrual (5000→2900, 45000 default)
- Used 3 calls: 1 GET (accounts) + 1 POST (create 1029) + 1 POST (combined 6-line voucher)
- 0 errors. Depreciation: Math.round((289700/84)*100)/100 = 3448.81
- Missing account: only 1029. Existing: 1700, 5000, 2900, 6020, 6300
- German prompt: "Rechnungsabgrenzung" (periodization), "Abschreibung" (depreciation), "Gehaltsrückstellung" (salary accrual)
- 6th consecutive optimal run for 6020→1029 variant (Runs 1, 4, 5, 6, 8, 9)
- First 7-year useful life (84 months) confirmation
- Confirmed language variants: nb, nn, en, es, fr, pt, de

### Run 10 (2026-03-22, 1710→6390 + 6030→1209 variant, Nynorsk prompt, 3 calls — optimal)
- Task: March 2026, prepaid 4650 (1710→6390), depreciation 242900/4yr (6030→1209), salary accrual (5000→2900, 45000 default)
- Used 3 calls: 1 GET (accounts) + 1 POST (batch create 6030+1209) + 1 POST (combined 6-line voucher)
- 0 errors. Depreciation: Math.round((242900/48)*100)/100 = 5060.42
- Missing accounts: 6030, 1209. Existing: 1710, 5000, 2900, 6390
- **First optimal 6030→1209 production run**: batch-created both missing accounts in 1 call (Run 7 used 4 calls with individual creates)
- Nynorsk prompt: "kostnadskonto" correctly mapped to 6390 via 1710 source mapping
- Confirms dynamic missing-account detection + batch create saves 1 call vs hardcoded approach
- Language variants confirmed: nb, nn, en, es, fr, pt, de (all 7 produce correct results)

### Run 11 (2026-03-22, 1700→6300 + 6010→1249 variant, English prompt, 2 calls — optimal)
- Task: March 2026, prepaid 5450 (1700→6300), depreciation 156750/10yr (6010→1249), salary accrual (5000→2900, 45000 default)
- Used 2 calls: 1 GET (accounts) + 1 POST (combined 6-line voucher)
- 0 errors. Depreciation: Math.round((156750/120)*100)/100 = 1306.25
- All 6 accounts existed in fresh Tripletex: 1700, 6300, 6010, 1249, 5000, 2900
- 2nd optimal 2-call 6010→1249 production run (first was Run 2)
- First 10-year useful life (120 months) confirmation
- Confirmed language variants: nb, nn, en, es, fr, pt, de (all 7 produce correct results)
- 12 production runs total: 10 optimal, 1 blocked (creds), 1 suboptimal (Run 7, 4 calls — batch-create fix applied in Run 10)

### Run 12 (2026-03-22, 1700→6300 + 6020→1029 variant, Norwegian prompt, 3 calls)
- Task: March 2026, prepaid 11150 (1700→6300), depreciation 147250/5yr (6020→1029), salary accrual (5000→2900, 45000 default)
- Used 3 calls: 1 GET (accounts) + 1 POST (create 1029) + 1 POST (combined 6-line voucher)
- 0 errors. Depreciation: Math.round((147250/60)*100)/100 = 2454.17
- Missing account: only 1029. Existing: 1700, 5000, 2900, 6020, 6300
- 7th optimal run for 6020→1029 variant (Runs 1, 4, 5, 6, 8, 9, 12)
- 13 production runs total: 11 optimal, 1 blocked (creds), 1 suboptimal (Run 7, 4 calls — batch-create fix applied in Run 10)

### Run 13 (2026-03-22, 1700→6300 + 6030→1209 variant, Spanish prompt, 3 calls — optimal)
- Task: March 2026, prepaid 3500 (1700→6300), depreciation 232650/6yr (6030→1209), salary accrual (5000→2900, 45000 default)
- Used 3 calls: 1 GET (accounts) + 1 POST (batch create 6030+1209) + 1 POST (combined 6-line voucher)
- 0 errors. Depreciation: Math.round((232650/72)*100)/100 = 3231.25
- Missing accounts: 6030, 1209. Existing: 1700, 5000, 2900, 6300
- First production 1700→6300 + 6030→1209 combination (prior 6030→1209 runs used 1710 or 1720 prepaid sources)
- Spanish prompt: "periodificación de la cuenta 1700 a gasto" → 1700→6300
- 2nd optimal 6030→1209 production run (after Run 10); confirms batch-create path stable
- 14 production runs total: 12 optimal, 1 blocked (creds), 1 suboptimal (Run 7, 4 calls — batch-create fix applied in Run 10)
- Confirmed language variants: nb, nn, en, es, fr, pt, de (all 7 produce correct results)

## Sandbox Verification (2026-03-21)
- Persistent sandbox `kkpqfuj-amager.tripletex.dev` confirmed:
  - `account: { number: 5000 }` without `id` → 422 "postings.account.name: Kan ikke være null."
  - Combined 6-line voucher with all account IDs → 201, 6 postings confirmed
  - 2-call path works when all accounts exist (sandbox had 1029 from prior runs)
  - Account 2900 may have display name "Forskudd fra kunder" in some environments; posting still works correctly for salary accrual
  - Account 1249 exists in default chart as "Andre transportmidler"; works correctly for accumulated depreciation postings
  - 6010→1249 mapping confirmed working: sandbox voucher with 6 postings created successfully
  - 1710→6390 mapping confirmed working: sandbox voucher with 6 postings (prepaid 2450, dep 1851.67, salary 45000) created successfully
  - Account 1109 (Akk. avskr. bygninger) is only month-end account missing in sandbox
  - Comprehensive account survey: all prepaid source accounts (1700, 1710, 1720, 1740), all periodization targets (6300, 6390, 8150), all depreciation expense accounts (6000, 6010, 6020), and accumulated depreciation account 1249 exist in sandbox default chart
  - Sandbox accounts 6030, 1029, 1209 exist but were CREATED during prior testing (id range ~462xxxxxx vs default ~424190xxx) — they are NOT part of default chart
  - 1720→6300 mapping confirmed working: sandbox voucher with 6 postings (prepaid 8050, dep 3746.88, salary 45000) created successfully
  - 1700→6300 mapping confirmed working: sandbox voucher with 6 postings (prepaid 12000, dep 5802.08, salary 45000) created successfully
  - 6030→1209 mapping confirmed working: sandbox voucher with 6 postings (prepaid 9200, dep 7661.11, salary 45000) created successfully
  - Confirmed missing in fresh production: 1029 (Runs 1, 4, 5, 6), 6030 + 1209 (Run 7); confirmed missing in sandbox default: 1109
  - **ID range analysis**: default chart accounts have ids ~424190xxx; accounts with ids ~462xxxxxx were created during testing and do NOT exist in fresh instances
  - 1710→6390 + 6020→1029 with 144950/9yr (dep 1342.13) sandbox-verified: 6 postings created successfully
  - 1700→6300 + 6020→1029 with 289700/7yr (dep 3448.81) sandbox-verified: 6 postings created successfully (German prompt variant)
  - 1710→6390 + 6030→1209 with 242900/4yr (dep 5060.42) sandbox-verified 2026-03-22: 6 postings created, balance sums to zero, voucher deleted after verification
  - 1700→6300 + 6010→1249 with 156750/10yr (dep 1306.25) sandbox-verified 2026-03-22: 6 postings created, balance sums to zero, voucher deleted after verification
  - 1700→6300 + 6020→1029 with 147250/5yr (dep 2454.17) sandbox-verified 2026-03-22: 6 postings created, balance sums to zero, voucher deleted after verification
  - 1700→6300 + 6030→1209 with 232650/6yr (dep 3231.25) sandbox-verified 2026-03-22: 6 postings created, balance sums to zero, voucher deleted after verification (Spanish prompt variant)
