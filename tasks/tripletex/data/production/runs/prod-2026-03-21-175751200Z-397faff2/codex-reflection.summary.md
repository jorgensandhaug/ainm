# Codex Reflection Summary

## 1. Task

Correct 4 ledger errors in January-February 2026 with corrective vouchers:
1. **Wrong account**: 6500 used instead of 6540, amount 7350 NOK
2. **Duplicate voucher**: account 7100, amount 3200 NOK
3. **Missing VAT line**: account 6540, amount excl. 11450 NOK, missing VAT on 2710
4. **Incorrect amount**: account 6300, 8200 NOK posted instead of 5800 NOK

## 2. Reflection

**What went well:**
- Immediately recognized exact trusted-standard match (`correct-ledger-errors.md`) and executed without wasting time reading openapi.json or other docs
- Achieved ideal 3-call path on first script execution — no retries, no crashes
- All 4 error types correctly identified and corrected in a single combined voucher
- Case B missing VAT correctly handled with direct 2710 posting (not the broken expense+vatType=1 pattern that failed in prior runs)
- vatType correctly copied from originals: vatType=1 for 6500 reclassification, vatType=0 for 7100 dup and 6300 wrong-amount
- Duplicate detected via description keyword cascade (PRIMARY detection), no need for signature grouping fallback
- `dateTo=2026-03-01` correctly used (exclusive boundary)
- Supplier ID included on 2400 counterpart for missing VAT correction

**What went poorly:**
- Nothing — this run was optimal

**Mistakes:**
- None

## 3. Call Efficiency

**The run was minimal-call.** 3 API calls, 0 errors — this is the theoretical minimum for this task shape.

| # | Call | Purpose |
|---|------|---------|
| 1 | `GET /ledger/account?number=6500,6540,7100,6300,2710&fields=id,number` | Resolve all account IDs |
| 2 | `GET /ledger/voucher?dateFrom=2026-01-01&dateTo=2026-03-01&fields=...nested...&count=1000` | Discover vouchers with inline account/vatType/supplier data |
| 3 | `POST /ledger/voucher?sendToLedger=true` | Single combined corrective voucher with all 4 corrections |

**Wasted calls:** 0
**4xx errors:** 0
**Lower-call path:** None possible — 3 calls is the minimum.

The next agent should use this same 3-call path:
1. GET accounts (all prompt + correction-target accounts)
2. GET vouchers with nested expansion (`account(id,number)`, `vatType(id)`, `supplier(id)`)
3. POST single combined corrective voucher

## 4. Root Causes

No failures in this run. The success factors were:
- **Following the trusted standard exactly** — including Case B direct-2710 posting instead of the tempting expense+vatType=1 shortcut
- **Robust duplicate detection cascade** — description keyword first, signature grouping second, single-entry fallback third
- **Checking both amountGross and amount** when matching prompt amounts to postings
- **Copying vatType from originals** instead of hardcoding vatType=1
- **Including supplier ID** on 2400 counterpart lines
- **Using `dateTo=2026-03-01`** (exclusive boundary for Jan-Feb range)

## 5. Sandbox Verification

Verified Case B math in persistent sandbox:
- Original: 6540 gross=11450, net=9160, 2710=2290 (net booked as gross)
- correct_vat = 11450 × 0.25 = 2862.50
- vat_shortfall = 2862.50 − 2290 = 572.50
- expense_net_shortfall = 11450 − 9160 = 2290
- total_shortfall = 572.50 + 2290 = 2862.50
- Final ledger: 6540 net=11450 ✓, 2710=2862.50 ✓, 2400=−14312.50 ✓

No alternative lower-call path exists — 3 calls is already the minimum.

## 6. Playbook Changes

Updated existing files only (no new files created):

| File | Change |
|------|--------|
| `trusted-standards/correct-ledger-errors.md` | Added 4th production run (397faff2) confirmation: ideal 3-call path, 0 errors, Case B direct-2710 posting correctly applied in production for first time |
| `task-playbooks/correct-ledger-errors.md` | Added 4th production run details with same confirmation |

No AGENTS.md changes needed — the correct-ledger-errors entry was already in both the Trusted Standards and Task Playbooks tables.

## 7. Commit

```
6a3d8ed0 tripletex playbook: correct-ledger-errors — add 4th production run 397faff2 confirming ideal 3-call path with Case B direct-2710 posting
```

## 8. Reusable Heuristics

1. **Case B direct-2710 posting is now production-proven.** Post `2710 +vat_shortfall`, expense `+expense_net_shortfall` (vatType=0), counterpart `−total_shortfall` (with supplier). NEVER use expense+vatType=1.
2. **Duplicate detection cascade works.** Description keyword "duplikat" → signature grouping → single-entry fallback. This run confirmed PRIMARY detection succeeded immediately.
3. **Always check both `amountGross` and `amount` fields** when matching prompt amounts — the prompt may refer to either depending on context (gross for vatType=0, could be either for vatType=1).
4. **The 3-call path is stable across 4 different error configurations.** All variations of wrong-account, duplicate, missing VAT (Case A and B), and incorrect amount have been successfully handled.
5. **vatType must be copied from originals.** Account 7100 is locked to vatType 0; other expense accounts (6300, 6500, 6540) accept vatType 1. Never hardcode.
6. **Counterpart account IDs from nested expansion eliminate the need for a second GET /ledger/account.** Only the correction-target account (e.g., the "correct" account in a reclassification) needs pre-resolution.
