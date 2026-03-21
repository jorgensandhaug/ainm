# Codex Reflection — prod-2026-03-21-191608814Z-db732541

## Task
Correct 4 ledger errors in Jan–Feb 2026:
1. Wrong account: 7140 used instead of 7100, amount 2250 NOK
2. Duplicate voucher: account 7000, amount 4400 NOK
3. Missing VAT line: account 6500, net 14100 NOK, missing VAT on 2710
4. Incorrect amount: account 6590, 13150 recorded instead of 11650 NOK

## Reflection
**What went well:**
- Clean 3-call execution (proven minimum): GET accounts → GET vouchers → POST combined corrective voucher
- 0 errors, 0 4xx responses, script succeeded on first execution attempt
- All 4 error types handled correctly:
  - Cross-vatType reclassification 7140 (vatType 12) → 7100 (locked vatType 0): used vatType 12 on reversal, vatType 0 on target from account lookup — first production confirmation of this pattern
  - Duplicate reversal on 7000 with vatType 1, detected via description keyword cascade (primary)
  - Missing VAT Case B with direct 2710 posting: existing2710=2820, vatShortfall=705, expenseNetShortfall=2820, totalShortfall=3525
  - Incorrect amount on 6590 (vatType 1), diff=1500
- Trusted standard followed exactly — all documented pitfalls avoided

**What went poorly:** Nothing. This was a clean optimal execution.

**Mistakes:** None.

## Call Efficiency
**This run was minimal-call.** 3 API calls total, 0 wasted:
1. `GET /ledger/account?number=7140,7100,7000,6500,2710,6590&fields=id,number,vatType(id)` — resolved all account IDs + vatType locks
2. `GET /ledger/voucher?dateFrom=2026-01-01&dateTo=2026-03-01&fields=id,date,description,postings(...)&count=1000` — discovered all error vouchers with nested expansion
3. `POST /ledger/voucher?sendToLedger=true` — single combined corrective voucher with all 4 corrections

**Wasted calls:** 0
**Lower-call path:** 3 calls is the proven minimum. Cannot be reduced because:
- `account: { number: ... }` does NOT work in POST body (requires `account: { id: ... }`)
- Nested field expansion on voucher GET is required to get account numbers and supplier IDs inline
- All 4 corrections fit in a single POST

## Root Causes
No failures in this run. The trusted standard's accumulated learnings from 6 prior runs (including 3 failures) produced a script that handled all edge cases correctly:
- Cross-vatType reclassification (from 6th run's sandbox verification)
- Duplicate detection cascade (from 3rd run's crash fix)
- Case B direct 2710 posting (from 4th run's correction)
- vatType copying from originals (from 1st run's 422 fix)

## Sandbox Verification
No sandbox verification needed — the run followed the exact proven 3-call path and all corrections matched expected patterns. The cross-vatType reclassification (7140→7100) was already sandbox-verified in the 6th run's reflection; this run provided the first production confirmation.

## Playbook Changes
**Updated existing files** (no new files created):
- `./trusted-standards/correct-ledger-errors.md` — added 7th production confirmation (db732541): first production confirmation of cross-vatType reclassification, Case B missing VAT, account 6590 vatType data point
- `./task-playbooks/correct-ledger-errors.md` — added 7th production confirmation with summary that the 3-call path is stable across 7 production runs (4 optimal)

## Commit
- Hash: `b464e68f`
- Message: `tripletex playbook: correct-ledger-errors — add 7th production confirmation (db732541, 7140→7100/2250 cross-vatType reclassification + dup 7000/4400 + missing VAT 6500/14100 Case B + wrong amount 6590/13150→11650, 3 calls 0 errors, first production confirmation of cross-vatType reclassification)`

## Reusable Heuristics
1. **Cross-vatType reclassification is production-proven**: When source and target accounts have different vatType locks (e.g., 7140 vatType 12 → 7100 locked vatType 0), use the original posting's vatType on the reversal line and the target account's vatType from account lookup on the target line. Auto-generated 2710 lines on the reversal side correctly reverse the original VAT.
2. **3-call path is stable**: Across 7 production runs with varying error configurations (different accounts, amounts, vatTypes, Case A/B missing VAT), the 3-call path (GET accounts + GET vouchers + POST combined correction) is proven reliable. 4 of 7 runs achieved this minimum.
3. **Account 6590 has vatType 1** (new data point): Not locked, accepts both 0 and 1.
4. **Description keyword cascade remains the primary duplicate detector**: All successful runs found duplicates via "duplikat" in voucher description. Signature grouping and single-entry fallback are safety nets only.
5. **Case B missing VAT with direct 2710 posting**: Three consecutive production runs (runs 5, 6-blocked, 7) confirm the pattern: `2710 +vatShortfall`, `expense +expenseNetShortfall (vatType=0)`, `counterpart -totalShortfall`. Never use expense + vatType=1.
