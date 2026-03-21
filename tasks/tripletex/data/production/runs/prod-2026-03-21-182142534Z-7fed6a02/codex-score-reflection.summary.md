# Score-Aware Reflection: prod-2026-03-21-182142534Z-7fed6a02

## 1. Task Attribution

- **tx_task_id**: 24 (T3, max score 6)
- **Task**: Correct 4 ledger errors in Jan–Feb 2026 (wrong account, duplicate, missing VAT, incorrect amount)
- **Prompt language**: Portuguese
- **Leaderboard best before**: 2.25/6 (7 attempts)
- **Leaderboard best after**: 2.25/6 (8 attempts) — this run tied, did not improve

## 2. Correctness Verdict

**Correctness: 0.75 — NOT perfect. 1/4 checks failed.**

| Check | Result | Correction type |
|-------|--------|-----------------|
| Check 1 | passed | Wrong account 6340→6390 (2450, vatType 1) |
| Check 2 | passed | Duplicate reversal 6300/2900 (vatType 0) |
| Check 3 | **failed** | Missing VAT 7300/5350 excl. VAT |
| Check 4 | passed | Incorrect amount 7100 8550→6750 (vatType 0) |

- score_raw: 7.5/10
- normalized_score: 2.25/6

## 3. Efficiency Verdict

The run used the ideal **3 API calls, 0 errors** — execution was maximally efficient. Efficiency is NOT the issue. The failure is purely a correctness problem on Check 3 (missing VAT).

- Call 1: `GET /ledger/account` — 6 accounts resolved
- Call 2: `GET /ledger/voucher` — 30 vouchers with nested expansion
- Call 3: `POST /ledger/voucher` — combined corrective voucher, 201 Created

No wasted calls, no 4xx errors, no retries. If correctness were 1.0, this run would likely score near 6/6.

## 4. Likely Root Cause

**The script matched the WRONG voucher for the missing VAT correction, then applied Case B instead of Case A.**

The script searched for a 7300 posting matching `|amountGross| === 5350 || |amount| === 5350`. It found:
- 7300: gross=5350, amount=4280, **vatType=1**, with existing 2710=1070

This voucher ALREADY has VAT — it was booked with vatType=1, so Tripletex auto-generated 2710=1070 (treating 5350 as gross-inclusive). This is NOT the "missing VAT" voucher.

The prompt says "valor sem IVA 5350 NOK falta IVA na conta 2710" — the value WITHOUT VAT is 5350 and the VAT line on 2710 is MISSING. The correct target voucher should be one where:
- 7300 has a posting with gross=amount=5350 and **vatType=0** (no VAT was charged)
- **NO 2710 posting exists** in that voucher

There are likely TWO vouchers matching 7300/5350:
1. **Wrong match** (selected): gross=5350, vatType=1, has 2710=1070 — this voucher has proper VAT
2. **Correct target** (missed): gross=5350, vatType=0, no 2710 — this is the one with MISSING VAT

The script takes the first match and breaks. It found voucher #1 first and applied Case B:
- Posted: 2710 +267.5, 7300 +1070 (vatType=0), 2400 -1337.5

But the scorer expected Case A on the correct voucher:
- Expected: 2710 +1337.5, counterpart -1337.5

**This is a voucher selection bug, not a Case B formula bug.** The same Check 3 failure pattern (task 24) has persisted across 8 attempts because the disambiguation logic for missing-VAT voucher matching has never been fixed.

## 5. What Went Right

1. **Ideal 3-call path**: GET accounts → GET vouchers → POST correction, 0 errors
2. **Checks 1, 2, 4 all passed**: wrong account reclassification, duplicate reversal, and incorrect amount were all correct
3. **vatType correctly copied** from original postings (1 for reclassification, 0 for dup and wrong-amount)
4. **Duplicate detection cascade** worked correctly — description keyword "kontorrekvisita duplikat" found immediately
5. **dateTo=2026-03-01** correctly used (exclusive)
6. **supplier.id included** for 2400 counterpart
7. **Script robustness** — no crashes, no retries, single execution succeeded
8. **Case B formula was mathematically correct** — the bug was picking the wrong input voucher, not computing the wrong correction

## 6. What To Change Next Time

### Critical fix: Missing VAT voucher disambiguation

The missing-VAT detection logic must **prioritize vouchers where VAT is actually missing** before falling back to Case B (existing but too-low VAT):

1. **First pass**: Collect ALL candidate vouchers matching the prompt account + amount
2. **Prioritize Case A candidates**: Select vouchers where **no 2710 posting exists** in the same voucher (true missing VAT)
3. **Secondary: prioritize vatType=0**: If multiple candidates, prefer the one with vatType=0 on the expense posting (no VAT was charged)
4. **Fallback to Case B**: Only if ALL candidates have 2710 postings, then apply Case B (shortfall correction)

Updated detection logic (pseudocode):
```typescript
// Collect ALL matching vouchers for missing VAT
const missingVatCandidates = [];
for (const v of vouchers) {
  for (const p of v.postings) {
    if (p.account?.number === promptAccount && (|p.amountGross| === promptAmount || |p.amount| === promptAmount)) {
      const has2710 = v.postings.some(x => x.account?.number === 2710);
      missingVatCandidates.push({ voucher: v, posting: p, has2710 });
    }
  }
}

// Priority: no 2710 (Case A) > has 2710 (Case B)
const caseA = missingVatCandidates.find(c => !c.has2710);
const selected = caseA ?? missingVatCandidates[0]; // Case B fallback
```

### Trusted standard update needed

The `correct-ledger-errors.md` trusted standard's Step 2 detection logic currently says:
> "identify wrong-account and incorrect-amount vouchers by matching the stated account number plus the prompt amount on that account"

It needs an additional rule for missing-VAT detection:
> **When detecting the missing-VAT voucher, prefer vouchers WITHOUT a 2710 posting (Case A) over those WITH one (Case B).** If multiple vouchers match the prompt account + amount, the one without 2710 is the true "missing VAT" target. Taking the first match without disambiguation caused Check 3 failures across 8 consecutive task 24 attempts.

### Summary of required changes

| Change | File | Priority |
|--------|------|----------|
| Add missing-VAT voucher disambiguation (prefer no-2710 candidates) | `trusted-standards/correct-ledger-errors.md` | Critical |
| Add same disambiguation to playbook | `task-playbooks/correct-ledger-errors.md` | Critical |
| Document that `amountGross` can match different vouchers when vatType differs | Both files | Important |
