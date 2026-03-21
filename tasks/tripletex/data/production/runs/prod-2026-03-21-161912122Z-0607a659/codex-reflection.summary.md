# Post-Run Reflection: prod-2026-03-21-161912122Z-0607a659

## 1. Task

Correct 4 ledger errors in Jan-Feb 2026 general ledger (task 24, T3, max 6):
1. Wrong account: 6540→6860, 4800 NOK
2. Duplicate: 7100, 2000 NOK
3. Missing VAT: 4500, 14500 HT, VAT missing on 2710
4. Incorrect amount: 7100, 21650→17900

## 2. Reflection

**Score: 2.25/6 (correctness 0.75, 3/4 checks passed, Check 3 failed)**

**What went well:**
- 3/4 corrections produced correct final state (wrong account, duplicate, incorrect amount)
- Duplicate detection eventually worked via description keyword "duplikat" (PRIMARY strategy)
- vatType correctly copied from originals (avoided 422 on 7100)
- dateTo=2026-03-01 correctly used (exclusive)

**What went poorly:**
- **Check 3 (missing VAT) failed**: used expense 4500 +3625 with vatType=1 instead of direct 2710 posting
- **Script crashed twice** on duplicate detection, wasting 4 API calls
- The trusted standard already documented the correct Case B approach but the script ignored it

**Mistakes:**
1. Missing VAT "other branch" correction posted on expense with vatType=1 instead of direct 2710
2. Duplicate detection relied solely on signature grouping which fails with single-entry duplicates
3. No null safety on error detections — crashes wasted call budget

## 3. Call Efficiency

**Not minimal-call. 7 calls instead of ideal 3.**

| Execution | Calls | Outcome |
|-----------|-------|---------|
| 1st attempt | 2 GETs | Crashed: dupPosting null (signature grouping found nothing) |
| 2nd attempt | 2 GETs | Crashed: same root cause, different code path |
| 3rd attempt | 2 GETs + 1 POST | Succeeded, but Check 3 wrong |

**Wasted calls**: 4 (two redundant GET pairs from script crashes)

**Lower-call path**: A correct script would achieve 3 calls on first execution:
1. GET /ledger/account (resolve all account IDs including correction targets)
2. GET /ledger/voucher (nested expansion, dateFrom/dateTo covering full period)
3. POST /ledger/voucher?sendToLedger=true (one combined corrective voucher)

## 4. Root Causes

1. **Check 3 failure**: The "other branch" (2710 exists but VAT too low) correction used `expense + vatType=1`, which auto-generates 2710 postings. The scorer expects direct user-created postings on 2710, not system-generated ones. The correct approach is Case B from the trusted standard: post vat_shortfall on 2710, expense_shortfall on expense with vatType=0, counterpart with total shortfall.

2. **Script crashes**: Duplicate detection used signature grouping as primary method. When only one voucher existed on 7100/2000 (description "Kontorrekvisita duplikat"), signature grouping returned zero groups with 2+ entries, leaving dupPosting=null. No null check → TypeError.

3. **Anti-pattern repeated**: Run 0f4ba20a (prior run on task 24) had the same vatType=1 anti-pattern but its Check 3 failure wasn't recognized as a scoring failure in its reflection.

## 5. Sandbox Verification

Sandbox investigation confirmed:
- Duplikat-labeled vouchers may be the only entry on a given account+amount (no original to pair with)
- Signature grouping alone is insufficient for duplicate detection
- The description keyword "duplikat" is the most reliable primary detector
- Direct 2710 postings (Case B) are required for scorer acceptance of "other branch" missing VAT corrections

## 6. Playbook Changes

**Updated**: `./trusted-standards/correct-ledger-errors.md`
- Added run 0607a659 production learnings with Check 3 failure analysis
- Updated run 0f4ba20a entry to note same latent vatType=1 anti-pattern
- Duplicate detection priority (description keyword → signature grouping → single-entry) and script robustness section were already added during earlier reflection pass

**No changes needed** to `./task-playbooks/correct-ledger-errors.md` — it already had the correct warnings.

## 7. Commit

- **Hash**: `63fe2f98`
- **Message**: `tripletex playbook: correct-ledger-errors score reflection — Check 3 failed expense+vatType=1`
- **Files**: `trusted-standards/correct-ledger-errors.md`

## 8. Reusable Heuristics

1. **NEVER use expense+vatType=1 for missing VAT corrections** — always post directly on 2710 with Case A or Case B approach. This is the #1 scoring failure for task 24.

2. **Duplicate detection cascade**: description keyword "duplikat" (PRIMARY) → signature grouping (SECONDARY) → single-entry fallback (TERTIARY). Signature grouping alone fails when the original is absent.

3. **Script must succeed on first execution**: every re-execution doubles the GET count. Add null safety for all error detections and try alternative strategies before crashing.

4. **Read your own trusted standard before writing the script**: the Case B approach was already documented but the script code ignored it and used the simpler but wrong approach.

5. **Cross-check playbook warnings against trusted standard templates**: the playbook explicitly warned against expense+vatType=1 but the trusted standard template was ambiguous enough that the script chose the wrong path.
