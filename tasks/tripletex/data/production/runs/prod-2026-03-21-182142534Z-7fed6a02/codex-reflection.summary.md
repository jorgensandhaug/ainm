# Reflection Summary — prod-2026-03-21-182142534Z-7fed6a02

## Task
Correct 4 ledger errors in Jan–Feb 2026:
1. Wrong account: 6340 used instead of 6390, amount 2450 NOK
2. Duplicate voucher: account 6300, amount 2900 NOK
3. Missing VAT line: account 7300, 5350 NOK excl. VAT, missing VAT on 2710
4. Incorrect amount: account 7100, 8550 NOK recorded instead of 6750 NOK

## Reflection

**What went well:**
- Achieved the ideal 3-call path on the first script execution attempt: GET accounts → GET vouchers → POST combined corrective voucher
- Zero 4xx errors — all API calls succeeded on first try
- All 4 corrections implemented correctly:
  - Wrong account: vatType 1 correctly copied from original for reclassification 6340→6390
  - Duplicate: found via description keyword "kontorrekvisita duplikat" (primary cascade), vatType 0
  - Missing VAT: Case B correctly applied — original had 2710=1070, posted direct 2710 +267.5, 7300 +1070 (vatType=0), 2400 -1337.5 with supplier
  - Incorrect amount: difference=1800, vatType 0 correctly copied
- Script followed the trusted standard exactly: dateTo=2026-03-01 (exclusive), nested field expansion, supplier ID for 2400, Case B direct-2710 posting
- Script had robust duplicate detection cascade and null safety checks

**What went poorly:**
- Nothing. This was a clean execution that followed the trusted standard perfectly.

## Call Efficiency

**The run was minimal-call.** 3 API calls total, 0 wasted:

| Call | Endpoint | Purpose |
|------|----------|---------|
| 1 | `GET /ledger/account?number=6340,6390,6300,7300,2710,7100&fields=id,number` | Resolve all account IDs |
| 2 | `GET /ledger/voucher?dateFrom=2026-01-01&dateTo=2026-03-01&fields=...nested...&count=1000` | Discover all vouchers with posting details |
| 3 | `POST /ledger/voucher?sendToLedger=true` | Single combined corrective voucher |

**Lower-call path investigation:** Tested in sandbox whether `account: { number: ... }` works in POST body to eliminate the GET /ledger/account step. Result: Tripletex requires `account: { id: ... }` — using `account: { number: 6300, name: "Leie lokale" }` returns 422. **3 calls is the proven minimum** for this task shape.

## Root Causes

No errors or mistakes in this run. The script:
- Read the trusted standard before writing code
- Correctly identified all 4 error patterns from voucher data
- Used the duplicate detection cascade (description keyword found "kontorrekvisita duplikat")
- Applied Case B for missing VAT (original had 2710=1070, not Case A)
- Copied vatType from original postings (1 for reclassification, 0 for dup and wrong-amount)
- Included supplier.id for 2400 counterpart
- Used dateTo=2026-03-01 (exclusive, includes all of February)

## Sandbox Verification

1. **Tested `account: { number: ... }` in POST /ledger/voucher** — returned 422 (`postings.account.name: Kan ikke være null`). Even with `account: { number: 6300, name: "Leie lokale" }` — returned 422 (`Feltet må fylles ut`). Confirms `account: { id: ... }` is mandatory.
2. **3 calls is the proven minimum** — the GET /ledger/account step cannot be eliminated since correction-target accounts (e.g., 6390) don't appear in any existing posting.

## Playbook Changes

Updated existing files (no new files created):

- **`./trusted-standards/correct-ledger-errors.md`**: Added 5th production run notes (7fed6a02) confirming ideal 3-call path with Case B. Added sandbox proof that `account: { number }` doesn't work, confirming 3 calls is the proven minimum.
- **`./task-playbooks/correct-ledger-errors.md`**: Added 5th production run learnings with same details.

No changes to `AGENTS.md` — the trusted standards table already had the correct entry.

## Commit

- Hash: `2b507f4d`
- Message: `tripletex playbook: correct-ledger-errors — add 5th production confirmation (7fed6a02, 3 calls, 0 errors) and prove 3-call minimum`

## Reusable Heuristics

1. **3 calls is the proven minimum for correct-ledger-errors**: GET accounts → GET vouchers (nested expansion) → POST combined voucher. Sandbox-confirmed that `account: { number }` doesn't work, so the account lookup step is mandatory.
2. **Always read the trusted standard before writing code**: This run succeeded because the script followed the standard exactly. Previous runs (0607a659) that deviated from the standard scored 0.75 correctness.
3. **Case B for missing VAT is now battle-tested**: This is the 2nd consecutive run to correctly apply Case B with direct 2710 posting. The formula (`vat_shortfall = net*0.25 - existing_2710`, `expense_net_shortfall = net - existing_net`, `total_shortfall = sum`) is stable.
4. **Duplicate detection cascade is essential**: Description keyword "duplikat" as primary → signature grouping → single-entry fallback. This run found the duplicate via keyword on first try.
5. **Always copy vatType from original postings**: Accounts like 7100 are locked to vatType 0. This run correctly used vatType 0 for 6300 (dup) and 7100 (wrong-amount), vatType 1 for 6340/6390 (reclassification).
6. **dateTo is exclusive**: Always use first-of-next-month (e.g., 2026-03-01 for Jan-Feb range). This is now confirmed across 3 consecutive production runs.
7. **Supplier ID for 2400 counterpart**: Always extract from the original voucher's nested `supplier(id)` expansion. This run correctly used supplier ID 108392217.
8. **The correct-ledger-errors standard is mature**: 5 production runs, 2 consecutive clean 3-call executions. No further changes needed unless a new error shape is encountered.
