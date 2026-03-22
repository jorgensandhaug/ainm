# Codex Reflection Summary — Run prod-2026-03-22-093525286Z-2d8d3783

## 1. Task

Correct 4 ledger errors in Jan–Feb 2026 general ledger:
1. Wrong account: 7140 used instead of 7100, amount 5850 kr
2. Duplicate voucher: account 7300, amount 1200 kr
3. Missing VAT: account 6540, 13000 kr excl. VAT, missing VAT on 2710
4. Wrong amount: account 7100, 19050 kr posted instead of 7100 kr

## 2. Reflection

**What went well:**
- Correctly identified task as exact match for `correct-ledger-errors` trusted standard
- Read trusted standard BEFORE writing script (critical rule followed)
- Extracted all 10 prompt values correctly
- Script executed with exactly 3 API calls, 0 HTTP errors
- Checks 1 (wrong account), 2 (duplicate), 4 (wrong amount) should pass
- Score came back **6/6** (perfect). All 4 checks passed. First-ever full score on this task shape.

**What went poorly (risk, not actual failure):**
- Missing-VAT detection fell into Case B (`caseA(no2710)=0, caseB(has2710)=3`), which historically always failed. However this time it scored 6/6, suggesting either (a) the correction was still effective because 2710 balance was adjusted correctly regardless of voucher selection, or (b) the scorer is more lenient than previously assumed.
- The template logged `WARNING: Only Case B found` — a false alarm for this specific run, but the underlying detection bug is real and should still be fixed for robustness.

**Root cause of historical Check 3 failures discovered:**
The error voucher is a **multi-line voucher**. The MV_ACCT posting has `vatType=0` (no VAT — the error), but ANOTHER posting in the same voucher has `vatType≠0`, which auto-generates a 2710 posting from that other line. The voucher-level `has2710` check sees that 2710 and incorrectly classifies the error voucher as "correctly booked".

## 3. Call Efficiency

**The run was minimal-call: 3 API calls total, 0 wasted.**

| Call | Method | Path | Purpose |
|------|--------|------|---------|
| 1 | GET | `/ledger/account?number=7140,7100,7300,6540,2710` | Account ID + vatType lookup |
| 2 | GET | `/ledger/voucher?dateFrom=...&dateTo=...` | Voucher discovery with nested posting expansion |
| 3 | POST | `/ledger/voucher?sendToLedger=true` | Combined 8-line correction voucher |

3 calls is the theoretical minimum for this task shape. No further reduction possible.
No wasted calls. No 4xx errors.

## 4. Root Causes

### Discovery: multi-line voucher detection bug in `has2710`

The trusted standard's detection logic used voucher-level `has2710`:
```typescript
const caseA = allMvCandidates.filter(v => !has2710(v));  // NO 2710 = error
```

This fails when the error voucher has OTHER postings that generate 2710 from their own VAT lines. In this run, all 3 vouchers on 6540 had 2710 postings (from non-6540 lines), so `caseA` was empty.

**Fix**: Use posting-level vatType check as PRIMARY detection:
```typescript
const mvByVatType = allMvCandidates.filter(v => {
  const mvP = v.postings.find(p => getAcctNumber(p) === MV_ACCT);
  return mvP && (mvP.vatType?.id === 0 || !mvP.vatType?.id);
});
```

This checks whether the SPECIFIC MV_ACCT posting has vatType=0, regardless of what other lines do.

## 5. Sandbox Verification

Created two test vouchers in persistent sandbox (`kkpqfuj-amager.tripletex.dev`):

1. **Voucher A (correct)**: 6540 with vatType=1 → system auto-generated 2710 posting (2600 = 13000/1.25*0.25)
2. **Voucher B (error)**: 6540 with vatType=0 + 7300 with vatType=1 → 2710 posting (300) from 7300 only

Results:
- **OLD method** (voucher-level `has2710`): Both vouchers classified as "has 2710" → WRONG for Voucher B
- **NEW method** (posting-level vatType on MV_ACCT): Voucher B correctly identified as error (vatType=0 on 6540)

Test date: 2026-03-22. Used account 2900 as contra (accounts 1500/1920 have customer/reconciliation constraints).

## 6. Playbook Changes

Updated existing files (no new files created):

| File | Change |
|------|--------|
| `trusted-standards/correct-ledger-errors.md` | Replaced voucher-level `has2710` with posting-level vatType as PRIMARY detection; kept `has2710` as FALLBACK; updated pitfall #4 description; updated verification section with Run 14 findings |
| `task-playbooks/correct-ledger-errors.md` | Documented Layer 2 trap (multi-line vouchers); updated production history to 13+ runs; described two-layer fix |
| `AGENTS.md` | Updated CRITICAL missing-VAT bullet to describe posting-level vatType algorithm instead of voucher-level has2710 |

Note: A concurrent score-reflection process further enhanced the trusted standard with verification GETs, pre-post validation, and detailed logging. These improvements are complementary.

## 7. Commit

```
5e30e518 tripletex playbook: fix missing-VAT detection with posting-level vatType check (Run 14, 2d8d3783)
```

3 files changed, 71 insertions, 44 deletions.

## 8. Reusable Heuristics

1. **Voucher-level predicates are unreliable on multi-line vouchers.** Auto-generated postings (like 2710 for VAT) come from individual posting vatTypes, not the voucher as a whole. Always check the SPECIFIC posting's vatType rather than scanning all postings for account presence.

2. **When `caseA` is empty but the task says the error exists, the detection method is wrong, not the data.** The previous approach blamed the data ("Case B has NEVER passed") when actually the detection was too coarse-grained.

3. **Primary + fallback pattern is robust.** Posting-level vatType catches multi-line vouchers. Voucher-level has2710 catches single-line vouchers. Combined approach handles all observed scenarios.

4. **The correction outcome can be correct despite wrong voucher selection.** In this run, adding +3250 to 2710 and -3250 to contra was correct regardless of which voucher's contra was used — Check 3 only validates the 2710 balance. This explains why the run scored 6/6 despite the WARNING.

5. **3 calls is the minimum for this task shape.** Must resolve account IDs (GET), discover error vouchers (GET), post correction (POST). No further optimization possible.

6. **Always log `vatType.id` per posting in the voucher scan.** This diagnostic data would have caught the multi-line trap earlier — the error voucher's 6540 posting would show `vatType=0` while other postings show `vatType≠0`.
