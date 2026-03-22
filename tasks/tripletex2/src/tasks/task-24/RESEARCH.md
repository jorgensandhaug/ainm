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

## Required Fixes (Priority Order)

### Fix 1: Add prompt extraction to CorrectLedgerErrorsInput (HIGHEST PRIORITY)

Change `CorrectLedgerErrorsInput` from `{}` to:
```typescript
interface CorrectLedgerErrorsInput {
  wrongAccountSource: number;
  wrongAccountTarget: number;
  wrongAccountAmount: number;
  duplicateAccount: number;
  duplicateAmount: number;
  missingVatAccount: number;
  missingVatNetAmount: number;
  wrongAmountAccount: number;
  wrongAmountRecorded: number;
  wrongAmountCorrect: number;
}
```

Update `task.ts` requiredFields and extractionNotes.
Update the classifier prompt / codex task understanding to extract these 10 fields from the multi-language prompt.

### Fix 2: Use direct 2710 posting for missing VAT correction

Replace lines 282-298 in the strategy. Instead of:
```
{ 6500: +vatAmount, vatType=1 }  // WRONG: auto-generates partial 2710
{ counterpart: -vatAmount }
```
Use:
```
{ 2710: +vatAmount }             // CORRECT: direct control
{ counterpart: -vatAmount, supplier: {...} }
```

Copy the approach from task 21's strategy (lines 213-251) which already does this correctly.

### Fix 3: Copy vatType from original posting, don't hardcode

Some accounts (7xxx) are locked to vatType=0. The strategy should copy vatType from the original posting's template, not hardcode vatType=1.

### Fix 4: Differentiate task 21 from task 24 in classifier

The classifier needs a way to distinguish these two identical-looking tasks. Options:
- Add a distinguishing field to the task spec (e.g. different summaries that reference different account ranges)
- Use the leaderboard's txTaskId routing rather than classifier inference
- Merge the two into one task with dynamic extraction

## v3 Challenger Implementation (2026-03-22)

### Strategy: `24.correct-ledger-errors.v3`

**Candidate status**: `needs-review` — sandbox verification blocked by drift.

**What changed** (all fixes from the checklist above implemented):
1. **Prompt parsing at strategy runtime** via `ctx.request.prompt` — extracts 10 error parameters from parenthesized groups using regex. Verified correct against all 5 production prompts (EN, DE, PT).
2. **Direct 2710 posting** for missing VAT correction — replaces broken expense+vatType=1 approach with `buildDirectPosting` to account 2710 (no vatType, exact amount control).
3. **Dynamic account lookup** — requests all unique accounts from the prompt plus 2710.
4. **vatType copied from original posting template** — no hardcoding. The `buildPostingFromTemplate` copies vatType from the source posting.
5. **Missing VAT voucher detection** — filters for `!hasAccount(voucher, 2710)` to always find the BAD voucher (without VAT), not the GOOD one.
6. **Input schema left empty** — extraction happens at strategy time, not classifier time. No classifier changes needed. This also sidesteps the task-21/task-24 classifier mismatch issue.

**Architecture decision**: Prompt parsing at strategy runtime (via `ctx.request.prompt`) rather than classifier-time extraction. Rationale: (a) regex extraction is deterministic, (b) no risk of classifier extraction failures, (c) keeps the strategy self-contained, (d) no changes to the shared classifier contract.

### Production Runs Consulted

| Run ID | Language | Prompt Parameters | Score |
|--------|----------|-------------------|-------|
| `prod-2026-03-21-204843788Z-3d464771` | German | 6340→6390/3050, dup 6860/1650, vat 4500/22900, amt 6860/24450→10850 | 2.25/6 |
| `prod-2026-03-21-204558586Z-ee909d4d` | Portuguese | 7140→7100/2250, dup 7000/4400, vat 6500/14100, amt 6590/13150→11650 | 2.25/6 |
| `prod-2026-03-21-191608814Z-db732541` | Portuguese | 7140→7100/2250, dup 7000/4400, vat 6500/14100, amt 6590/13150→11650 | 2.25/6 |
| `prod-2026-03-21-182142534Z-7fed6a02` | Portuguese | 6340→6390/2450, dup 6300/2900, vat 7300/5350, amt 7100/8550→6750 | 2.25/6 |
| `prod-2026-03-21-175751200Z-397faff2` | English | 6500→6540/7350, dup 7100/3200, vat 6540/11450, amt 6300/8200→5800 | 2.25/6 |

**Key script inspected**: `prod-2026-03-21-175751200Z-397faff2/scripts/correct-ledger-errors.ts` — codex agent script showing the correct 3-call pattern but with the VAT detection bug (finds good voucher first → Case B shortfall = 0 → no correction).

### Verification Outcome

**Sandbox verification blocked** — two independent blockers:
1. **Sandbox reset failure**: 3 stale task-06 employee records fail to neutralize (`Validering feilet`).
2. **Sandbox voucher drift**: 118 vouchers in Jan-Feb 2026 window (should be ~20-30). Many duplicate test vouchers for same account/amount patterns cause `pickSingle` to fail.

**Prompt parsing verified offline**: All 5 production prompts parse correctly — all 10 parameters extracted match the expected values from RESEARCH.md evidence table.

**Verifier infrastructure**: Added `--prompt-file` and `--skip-reset` flags to `scripts/research_os.ts`, plus `promptOverride` to `RunSandboxVerificationOptions`. This allows strategies that parse `ctx.request.prompt` to receive a real prompt during verification.

### Next Steps

1. **Sandbox cleanup**: Manually reverse/delete stale experiment vouchers, or provision a fresh sandbox.
2. **Re-verify**: Run `bun scripts/research_os.ts verify --packet <packet> --strategy 24.correct-ledger-errors.v3 --input-file research/proof-inputs/task-24/input.json --prompt-file research/proof-inputs/task-24/prompt.txt`
3. **If sandbox verified**: Promote to active in `configs/active-strategies.json`.
4. **Task 21 parity**: Apply the same prompt-parsing approach to task 21 (which has the identical hardcoded-value problem).

## Frontier Memory

- **Strongest known branch**: `24.correct-ledger-errors.v3` — fixes both root causes, pending sandbox verification.
- **Score ceiling with fixes**: 6/6 (all 4 checks passable + 3-call efficiency = perfect score)
- **Call-budget frontier**: 3 calls (GET accounts, GET vouchers, POST correction)
- **Imported legacy evidence**: Codex agent's `correct-ledger-errors.ts` script from run 397faff2 confirms the direct-2710 approach works for checks 1,2,4 but has the VAT detection bug.
- **Anti-patterns / dead ends**:
  - NEVER use expense account + vatType=1 for missing VAT corrections
  - NEVER hardcode account numbers — they vary per run
  - NEVER hardcode vatType=1 on 7xxx accounts (locked to vatType=0, causes 422)
  - NEVER iterate vouchers to find the first match for missing-VAT — must filter for !has2710
