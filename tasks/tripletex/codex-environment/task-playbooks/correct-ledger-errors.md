# Correct Ledger Errors (General Ledger Review + Correction Vouchers)

## Task Shape
The prompt describes discovered errors in the general ledger for a specific date range and asks you to create correction vouchers. Errors typically include:
- Wrong account posting
- Duplicate voucher
- Missing VAT line
- Incorrect amount

The prompt gives exact account numbers, amounts, and the nature of each error.

## Proven Minimum Path: 3 API Calls

### Call 1: Resolve all needed account IDs
```
GET /ledger/account?number=<all-prompt-accounts-and-target-accounts>&fields=id,number
```
Include every account mentioned in the prompt, including correction targets that may not appear in the bad vouchers yet.

### Call 2: Discover vouchers with nested posting expansion
```
GET /ledger/voucher?dateFrom=YYYY-MM-01&dateTo=YYYY-MM+1-01&fields=id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)&count=1000
```
**CRITICAL**: `fields=*` alone returns posting accounts as sparse link stubs. Use the explicit nested expansion above.

**CRITICAL: `dateTo` is exclusive** ("To and excluding"). Sandbox-verified: Tripletex error message explicitly says `'To and excluding'`. To include all of February, use `dateTo=2026-03-01`, NOT `dateTo=2026-02-28`. For a Jan+Feb range, use `dateFrom=2026-01-01&dateTo=2026-03-01`.

From this response:
- Identify wrong-account and incorrect-amount vouchers by matching the prompt account number plus prompt amount on that account.
- **Identify the duplicate** using this priority order:
  1. **PRIMARY: description keyword** — scan vouchers on the prompt account for description containing "duplikat"/"duplicate" with the prompt amount; most reliable because test environments may have only the duplicate (not the original)
  2. **SECONDARY: signature grouping** — group vouchers on the prompt account into normalized posting signatures and pick the repeated signature; choose the later voucher ID as the duplicate copy
  3. **TERTIARY: single-entry fallback** — if only one voucher matches prompt account + amount, that single entry IS the duplicate to reverse
  - **WARNING**: signature grouping alone caused 2 script crashes in production (0607a659), wasting 4 calls, because the duplicate was the ONLY entry on that account+amount
- For missing VAT, first check whether the original voucher has no `2710` posting at all or has a too-low existing VAT pattern (net booked as gross).
- Record the opposite-signed counterpart posting **ID** (from `account.id` in the nested expansion) and any `supplier.id` from the original voucher. Counterpart account IDs do NOT need a second `GET /ledger/account` — they come from the voucher response.
- **Record the `vatType.id` from each original expense posting** and copy it to the correction lines. Do not assume vatType 1 — accounts like 7100 are locked to vatType 0 and will 422 if forced to vatType 1.

### Call 3: Post one combined corrective voucher
```
POST /ledger/voucher?sendToLedger=true
{
  date: "<run-date>",
  description: "Korreksjonsbilag <period>",
  postings: [
    { row: 1, account: { id: <wrongAccountId> }, amountGross: -<wrongAmount>, amountGrossCurrency: -<wrongAmount> },
    { row: 2, account: { id: <correctAccountId> }, amountGross: <wrongAmount>, amountGrossCurrency: <wrongAmount> },
    { row: 3, account: { id: <duplicateExpenseId> }, amountGross: -<duplicateAmount>, amountGrossCurrency: -<duplicateAmount> },
    { row: 4, account: { id: <duplicateCounterpartId> }, amountGross: <duplicateAmount>, amountGrossCurrency: <duplicateAmount> },
    { row: 5, account: { id: <missingVatAccountId> }, amountGross: <vatAmount>, amountGrossCurrency: <vatAmount> },
    { row: 6, account: { id: <missingVatCounterpartId> }, amountGross: -<vatAmount>, amountGrossCurrency: -<vatAmount> },
    { row: 7, account: { id: <incorrectExpenseId> }, amountGross: -<difference>, amountGrossCurrency: -<difference> },
    { row: 8, account: { id: <incorrectCounterpartId> }, amountGross: <difference>, amountGrossCurrency: <difference> }
  ]
}
```
- **Missing VAT: ALWAYS post directly on 2710** — NEVER use expense + `vatType: { id: 1 }`. The auto-generated 2710 amount from vatType=1 will not match what the scorer expects. Production runs confirmed this across multiple tasks.
  - **Case A (no `2710` exists)**: post full `net * 0.25` directly on 2710, counterpart for same amount.
  - **Case B (`2710` exists but too low)**: post 3 lines — `2710 +vat_shortfall`, expense `+expense_net_shortfall` with `vatType: { id: 0 }`, counterpart `-total_shortfall`. Where: `vat_shortfall = net*0.25 - existing_2710`, `expense_net_shortfall = net - existing_net`, `total_shortfall = vat_shortfall + expense_net_shortfall`. Production run 0607a659 used expense+vatType=1 for Case B and Check 3 failed.
- Copy `vatType` from original postings on all other correction lines (wrong account, duplicate, incorrect amount). Do NOT hardcode vatType 1.
- If any correction touches account `2400`, include `supplier: { id: ... }` from the original voucher.
- Use the write response as default verification.

## Critical Pitfalls
1. **`fields=*` does NOT expand nested objects**: On `/ledger/posting` and `/ledger/voucher`, `fields=*` returns nested objects (account, vatType, voucher) as sparse link stubs. Always use explicit nested expansion on voucher discovery.
2. **Account IDs required**: `POST /ledger/voucher` with `account: { number: 7000 }` fails with `422 postings.account.name: Kan ikke være null.` — always resolve account IDs first.
3. **Row values required**: All postings MUST have explicit `row: 1`, `row: 2`, etc. Row 0 is system-reserved.
4. **`dateTo` is exclusive**: `dateTo=2026-03-01` means up to and excluding March 1st (i.e., includes all of February).
5. **Duplicate detection cascade**: Use description keyword "duplikat" as PRIMARY detector, then signature grouping, then single-entry fallback. Do NOT rely solely on signature grouping — production run 0607a659 proved that the duplicate can be the ONLY entry on that account+amount (no original to pair with), causing 2 script crashes and 4 wasted calls.
6. **NEVER use expense + vatType=1 for ANY missing VAT correction**: Whether Case A (no 2710) or Case B (2710 exists but too low), always post directly on 2710. The expense+vatType=1 approach creates auto-generated 2710 amounts that don't match scorer expectations. Production run 0607a659 Check 3 failed because of this.
7. **Account 2400 requires supplier**: Postings on account 2400 (Leverandørgjeld) require `supplier: { id: ... }`. If the original error voucher used 2400 as contra, the correction voucher on 2400 also needs the supplier reference from the original posting.
8. **vatType-locked accounts cause 422**: Some accounts are locked to a specific vatType (e.g., 7100 Bilgodtgjørelse oppgavepliktig is locked to vatType 0). Always copy the `vatType.id` from the original posting instead of hardcoding vatType 1. Production run 2026-03-21 wasted a call on this exact 422.
9. **Do NOT make a second `GET /ledger/account` for counterpart IDs**: The voucher response's nested `account(id,number)` expansion already provides all counterpart account IDs. Only the initial `GET /ledger/account` is needed — for correction-target accounts not present in any voucher posting (e.g., the correct account in a reclassification).

## Sandbox Proof
- 2026-03-21 persistent sandbox confirmed the exact 3-call correction flow after setup:
  1. `GET /ledger/account?number=7300,7000,6860,6500,2710&fields=id,number`
  2. `GET /ledger/voucher?dateFrom=2026-01-01&dateTo=2026-03-01&fields=id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)&count=1000`
  3. `POST /ledger/voucher?sendToLedger=true`
- The combined correction voucher succeeded as voucher `608960780` with all 8 corrective lines.
- The exact no-`2710` missing-VAT branch succeeded with direct `2710 +4587.5` and counterpart `-4587.5`.
- The alternative `6500 +4587.5` plus `vatType: { id: 1 }` branch was explicitly tested on voucher `608960784` and proved wrong for this prompt shape because it created only `2710 +917.5` and `6500 amount=3670`.

## Production Run Learnings (2026-03-21)
- First run used 6 calls instead of ideal 3: 1 redundant debug GET, 1 unnecessary account lookup, 1 avoidable 422 on vatType
- Account 7100 is locked to vatType 0 — vatType 1 triggers `422 Kontoen 7100 er låst til mva-kode 0`
- Counterpart account IDs (1920, 2400) were already available from the voucher response; the second `GET /ledger/account` was wasteful
- The missing VAT voucher (6500/24750) already had a 2710 posting (4950) → "other branch" applied; the script initially tried "exact branch" detection and crashed
- Fix: always read the original posting's `vatType.id` and check for existing 2710 postings before choosing the correction branch
- Second run (0f4ba20a) achieved ideal 3 calls, 0 errors: correctly copied vatType from originals, correctly detected "other branch" for missing VAT, included supplier.id for 2400
- **Latent bug in second run**: used `dateTo=2026-02-28` (exclusive → excludes Feb 28); succeeded only because all errors were dated before Feb 28. Always use first-of-next-month (e.g., `dateTo=2026-03-01` for Jan-Feb).
- Third run (0607a659): scored 2.25/6 (correctness 0.75) — 3/4 corrections correct, Check 3 (missing VAT) failed
  - script crashed twice due to duplicate detection failure, wasting 4 of 7 total calls (2 GET pairs)
  - duplicate root cause: only 1 voucher had 7100/2000 (desc="Kontorrekvisita duplikat"); signature grouping needs 2+ entries
  - duplicate fix: use description keyword "duplikat" as PRIMARY detector, signature grouping SECONDARY, single-entry TERTIARY
  - **Check 3 failure**: used expense 4500 +3625 with vatType=1, Tripletex auto-generated 2710 +725; scorer rejected this
  - correct approach for Case B: 2710 +725 (vat_shortfall), 4500 +2900 (expense_net_shortfall, vatType=0), 2400 -3625 with supplier
  - this confirms: NEVER use expense + vatType=1 for missing VAT, even in Case B
- Fourth run (397faff2): achieved ideal 3 calls, 0 errors on all 4 correction types
  - errors: 6500→6540 (7350, vatType 1), dup 7100 (3200, vatType 0), missing VAT 6540 (11450 excl, had 2710=2290 → Case B), wrong amount 6300 (8200→5800, vatType 0)
  - Case B correctly applied with direct 2710 posting: 2710 +572.50, 6540 +2290 (vatType=0), 2400 -2862.50 with supplier
  - first production run to correctly use Case B direct-2710 posting and pass all 4 correction types
  - duplicate detected via description keyword cascade (no signature grouping needed)
  - confirms: the 3-call path is stable and production-proven across 4 different error configurations
- Fifth run (7fed6a02): achieved ideal 3 calls, 0 errors on all 4 correction types
  - errors: 6340→6390 (2450, vatType 1), dup 6300 (2900, vatType 0), missing VAT 7300 (5350 excl, had 2710=1070 → Case B), wrong amount 7100 (8550→6750, vatType 0)
  - Case B correctly applied: 2710 +267.5 (vat_shortfall), 7300 +1070 (expense_net_shortfall, vatType=0), 2400 -1337.5 with supplier
  - duplicate found via description keyword "kontorrekvisita duplikat" (primary cascade)
  - second consecutive run to achieve 3 calls, 0 errors, all 4 corrections correct with Case B
  - sandbox confirmed `account: { number: ... }` does NOT work in POST — `account: { id: ... }` is required, proving 3 calls is the minimum
