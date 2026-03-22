# Task 24 — Correct ledger errors Research Memory

This file is the task-local research memory for improving agents.
Read it together with `task.ts`, the generated packet, and `research/AGENTS.md`.
Update it after any meaningful frontier import, sandbox verification, promotion decision, or blocker discovery.

## Current Runtime Surface

- Canonical task id: `24`
- Active strategy pin: `24.correct-ledger-errors.v1`
- Task implementation: `task.ts`
- Stable task summary: _No task-local README.md yet_

## Current Research Queue Snapshot

- Priority: `2`
- Band: `focus`
- Queue eligibility: `ready`
- Research lane: `classifier-bugfix` + `strategy-rewrite`
- Best known score: `2.25` / `6`

## Current State

### Queue Notes

- Known classifier mismatch looks fixable and high leverage.
- Good score-per-fix target in Tier 3.

## Deep Analysis (2026-03-22)

### Root Cause: Two Blocking Problems

#### Problem 1: Hardcoded values do not match prompt parameters (CRITICAL)

The strategy hardcodes these constants:
```
WRONG_ACCOUNT_SOURCE = 7300, TARGET = 7000, AMOUNT = 7800
DUPLICATE_ACCOUNT = 6860, AMOUNT = 3500
MISSING_VAT_ACCOUNT = 6500, NET = 18350
WRONG_AMOUNT_ACCOUNT = 7300, RECORDED = 15000, CORRECT = 10050
```

But the actual prompt parameters **vary on every run**. Evidence from 7 production runs:

| Run | Wrong acct | Dup acct/amt | VAT acct/net | Wrong amt acct |
|-----|-----------|-------------|-------------|---------------|
| 0edbccb9 | 7300->7000/4500 | 6590/3300 | 6500/24750 | 7100/18800->8550 |
| 397faff2 | 6500->6540/7350 | 7100/3200 | 6540/11450 | 6300/8200->5800 |
| 7fed6a02 | 6340->6390/2450 | 6300/2900 | 7300/5350 | 7100/8550->6750 |
| db732541 | 7140->7100/2250 | 7000/4400 | 6500/14100 | 6590/13150->11650 |
| 3d464771 | 6340->6390/3050 | 6860/1650 | 4500/22900 | 6860/24450->10850 |
| ee909d4d | 7140->7100/2250 | 7000/4400 | 6500/14100 | 6590/13150->11650 |
| 0607a659 | 6540->6860/4800 | 7100/2000 | 4500/14500 | 7100/21650->17900 |

**None of the hardcoded values match any actual prompt.** The strategy will fail to find matching vouchers and throw errors like "Expected exactly one wrong-account voucher, found 0."

**Root fix**: The `CorrectLedgerErrorsInput` interface must be populated with prompt-extracted parameters. The classifier/extractor must parse the prompt to extract the 4 error parameters (accounts and amounts). The strategy must use these dynamic values instead of hardcoded constants.

Required input fields:
- `wrongAccountSource`, `wrongAccountTarget`, `wrongAccountAmount`
- `duplicateAccount`, `duplicateAmount`
- `missingVatAccount`, `missingVatNetAmount`
- `wrongAmountAccount`, `wrongAmountRecorded`, `wrongAmountCorrect`

#### Problem 2: Missing VAT correction uses wrong approach (Check 3 always fails)

**Sandbox-verified 2026-03-22.** The strategy posts the VAT correction on the expense account with `vatType=1`:

```typescript
// Line 282-287 in correct-ledger-errors.ts
buildPostingFromTemplate({
  accountId: MISSING_VAT_ACCOUNT_ID,  // 6500
  amount: missingVatCorrectionAmount, // net * 0.25
  forceVatTypeId: missingVatPosting.vatType?.id ?? 1,  // vatType=1
})
```

When you post `amount=4587.50` gross on account 6500 with vatType=1:
- Tripletex interprets 4587.50 as the **gross** (VAT-inclusive) amount
- It computes: net = 4587.50 / 1.25 = 3670, VAT = 4587.50 - 3670 = 917.50
- Auto-generates: 2710 +917.50
- But the scorer expects 2710 +4587.50 (the full 25% of 18350)
- The auto-generation gives only **1/5** of what's expected

**Correct approach: post directly on account 2710 with no vatType (or vatType=0)**:
```
{ account: 2710, amountGross: net_amount * 0.25 }           // VAT amount directly
{ account: counterpart (2400), amountGross: -(net_amount * 0.25), supplier: {...} }  // counterpart
```
This gives exact control over the 2710 amount. Just 2 lines. No expense account involved.

**Sandbox proof:**
- Approach A (broken): 6500 +4587.50 gross vatType=1 => Tripletex: 6500 net=3670, 2710 auto=917.50 (WRONG)
- Approach B (correct): 2710 +4587.50 => 2710 amount=4587.50 (exact, matches scorer expectation)

#### Problem 2b: VAT detection picks WRONG voucher

There are always TWO vouchers on the prompt account with the same amountGross:
- One correctly booked (WITH a 2710 posting, vatType=1) — the GOOD voucher
- One error (WITHOUT 2710, vatType=0) — the BAD voucher the scorer placed

The detection code finds the correct one first (lower ID) and applies Case B (already correct)
instead of Case A (the error). The strategy must filter for vouchers WITHOUT a 2710 posting
to identify the one that needs VAT correction.

### Production Evidence

All 7 production runs show the same pattern:
- Checks 1, 2, 4: **PASS** (wrong account, duplicate, wrong amount)
- Check 3: **ALWAYS FAILS** (missing VAT correction)
- Score: 0.75 correctness, 2.25/6 normalized

Runs are executed via the legacy codex agent (tripletex1), not the tripletex2 deterministic strategy. The codex agent independently chose the same broken vatType=1 approach because the trusted standard's "other branch" section was misleading. The trusted standard has since been updated (commit 0f04d4b4), but the deterministic strategy code has NOT been fixed.

### Classifier Mismatch Analysis

Both task 21 and task 24:
- Same name: "Correct ledger errors"
- Same empty input schema: `CorrectLedgerErrorsInput {}`
- Same task shape: 4 errors in Jan-Feb 2026 vouchers
- Different txTaskId (21 vs 24)
- Different hardcoded account numbers

The classifier sees both in the task spec list and may route prompts to the wrong one. However, since BOTH have empty input schemas and hardcoded values that don't match actual prompts, **the classifier mismatch is secondary** — the primary fix is to add prompt extraction.

Note: Task 21 has its own set of different hardcoded values (e.g. wrong account 7100->7140/2250, duplicate 6500/1500, missing VAT 6540/22000, wrong amount 6860/8650->7900) that also don't match the actual task-24 prompt parameters. The tasks are genuinely different tx_task_ids on the leaderboard, meaning the competition generates different seed data for each.

### Efficiency Analysis

Current strategy: 3 API calls (GET accounts, GET vouchers, POST correction). This is already optimal.

The codex agent used 4-6 calls in production runs:
- 1 wasted re-fetch of voucher data
- 1 wasted extra account lookup (IDs available from voucher expansion)
- 1 avoidable 422 from hardcoding vatType=1 on locked 7xxx accounts

With the correct strategy, 3 calls is achievable.

## v3 Strategy Implementation (2026-03-22)

### What changed

Created `strategies/correct-ledger-errors-v3.ts` (strategyId: `24.correct-ledger-errors.v3`) addressing all identified root causes:

1. **Dynamic prompt parsing** — Extracts the 10 error parameters (accounts + amounts) directly from `ctx.request.prompt` at runtime using positional regex on the 4 parenthesized error blocks. Verified against all 4 production languages (EN, DE, PT, FR). No classifier/extractor changes needed — the strategy self-extracts.

2. **Missing-VAT detection priority** — `selectMissingVatVoucher()` implements a 3-tier cascade:
   - Tier 1: exact account+amount match, voucher has NO 2710 posting (Case A — the actual error)
   - Tier 2: account-only match, voucher has NO 2710 posting (broader fallback)
   - Tier 3: exact account+amount match regardless of 2710 (Case B last resort)

3. **Direct 2710 posting** — VAT correction posts amount = `postedAmount * 0.25` directly on account 2710 with no vatType (clean posting), counterpart carries supplier from original voucher template.

4. **vatType handling** — All non-VAT corrections copy vatType from original posting template via `buildPostingFromTemplate`. The 2710 posting has no template → no vatType set → Tripletex uses account default.

5. **Counterpart finding** — Uses largest-absolute-value approach (like task 21) instead of pickSingle for robustness with multi-posting vouchers.

### What did NOT change

- `CorrectLedgerErrorsInput` remains `{}` — no classifier/extractor refactor needed
- task.ts updated to load v3 first, v1 as fallback
- 3-call budget preserved (GET accounts, GET vouchers, POST correction)
- v1 strategy file kept intact for reference

### Prompt parser validation

All 7 unique production prompt variants verified (4 shown below):
| Language | Wrong acct | Dup | VAT | Wrong amt |
|----------|-----------|-----|-----|----------|
| German | 6340→6390/3050 ✓ | 6860/1650 ✓ | 4500/22900 ✓ | 6860/24450→10850 ✓ |
| Portuguese | 7140→7100/2250 ✓ | 7000/4400 ✓ | 6500/14100 ✓ | 6590/13150→11650 ✓ |
| English | 6500→6540/7350 ✓ | 7100/3200 ✓ | 6540/11450 ✓ | 6300/8200→5800 ✓ |
| French | 6540→6860/4800 ✓ | 7100/2000 ✓ | 4500/14500 ✓ | 7100/21650→17900 ✓ |

### Remaining risk

- v3 requires `ctx.request.prompt` — sandbox runs with synthetic prompts won't work unless the sandbox provides a real task prompt
- If the competition ever changes the prompt structure (e.g., reorders the 4 error descriptions), the positional parser would break

## Frontier Memory

- **Strongest known branch**: `24.correct-ledger-errors.v3` (candidate, not yet verified in production)
- **Score ceiling with v3**: 6/6 (all 4 checks passable + 3-call efficiency = perfect score)
- **Call-budget frontier**: 3 calls (same as v1)
- **Predecessor**: v1 hardcoded values, v2 never implemented, codex agent scored 2.25/6 consistently
- **Anti-patterns / dead ends**:
  - NEVER use expense account + vatType=1 for missing VAT corrections
  - NEVER hardcode account numbers — they vary per run
  - NEVER hardcode vatType=1 on 7xxx accounts (locked to vatType=0, causes 422)
  - NEVER pick the first amount-matched voucher for missing-VAT — always prefer no-2710 voucher

## Next Steps

1. Sandbox verification with a real prompt (not generic "Sandbox operator run" prompt)
2. Production run to verify all 4 checks pass
3. If Check 3 passes: promote v3 to active, retire v1
4. If Check 3 still fails: add diagnostic logging of all postings on the missing-VAT account
