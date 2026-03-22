# Correct Ledger Errors

## How to Recognize This Task
Prompt describes 4 errors found in Jan–Feb 2026 general ledger. Always these 4 types:
1. **Wrong account** — amount posted to account X, should be account Y
2. **Duplicate voucher** — same transaction booked twice on account Z
3. **Missing VAT** — purchase on account W recorded without VAT (missing 2710 line)
4. **Incorrect amount** — amount on account V is A, should be B

Prompt language varies: nb, en, de, es, fr, pt, nn. Account numbers and amounts change every run.

## What to Extract From the Prompt

Read carefully — every number matters. Extract these 10 values:

| Value | Example | Where in prompt |
|-------|---------|-----------------|
| `WRONG_ACCT_SOURCE` | 6340 | "posted to account **6340**" / "ble ført på konto **6340**" |
| `WRONG_ACCT_TARGET` | 6390 | "should have been **6390**" / "skulle vært **6390**" |
| `WRONG_ACCT_AMOUNT` | 3050 | amount for the wrong-account error |
| `DUP_ACCT` | 6860 | "duplicate... on account **6860**" |
| `DUP_AMOUNT` | 1650 | amount for the duplicate |
| `MV_ACCT` | 4500 | "without VAT on account **4500**" / "uten MVA" |
| `MV_EXCL_VAT` | 22900 | the amount excl. VAT |
| `WA_ACCT` | 6860 | "amount on account **6860**" |
| `WA_RECORDED` | 24450 | the wrong amount |
| `WA_CORRECT` | 10850 | what it should be |

Also extract the period: typically Jan–Feb 2026, so `DATE_FROM=2026-01-01`, `DATE_TO=2026-03-01` (exclusive!), `CORRECTION_DATE=2026-02-28`.

## Execution

1. Read the trusted standard (`correct-ledger-errors.md`)
2. It contains a complete, runnable script template
3. Fill in the 10 extracted values + BASE/TOKEN
4. Run it — 1 POST (scored) + GETs for detection & verification (free)

**Do not rewrite the detection logic.** The template handles all edge cases. Just fill in constants and run.

The template includes:
- **Pre-POST validation**: checks balance sums to 0, all account IDs resolved
- **Post-POST verification**: re-fetches all vouchers and computes per-account totals to confirm all 4 checks will pass
- **Detailed logging**: every candidate voucher logged with full posting breakdown for debugging

## Scoring (6 points max)

GETs are FREE — only POST/PUT/DELETE count for efficiency. This script uses 1 POST = max efficiency.

4 correctness checks (0.75 each = 3.0 max) + efficiency bonus (1 POST = 3.0 max):
- **Check 1**: wrong-account source zeroed, target has the amount
- **Check 2**: duplicate reversed (net effect = single entry)
- **Check 3**: account 2710 has ≥ `MV_EXCL_VAT * 0.25`
- **Check 4**: wrong-amount account shows correct amount

## The One Thing That Will Fail Your Run

**Check 3 (missing VAT) detection has THREE layers of traps.**

### The trap (three layers)

**Layer 1** (original): Two vouchers on `MV_ACCT` with same amount. One correctly booked (has 2710), one is the error (no 2710). Taking the first match picks the wrong one.

**Layer 2** (discovered Run 14): The error voucher is a **multi-line voucher**. The `MV_ACCT` posting has `vatType=0` (no VAT — this is the error), but ANOTHER posting in the same voucher has `vatType≠0`, which auto-generates a 2710 posting from that other line. The voucher-level `has2710` check sees that 2710 and **incorrectly classifies the error voucher as "correctly booked"**.

**Layer 3** (discovered Run 463433ee): The error voucher on `MV_ACCT` has `vatType=1` applied (not 0). The gross was entered as the excl-VAT amount but treated as incl-VAT by Tripletex, so VAT was under-calculated. Description says "uten MVA" / "without VAT" but vatType=1 was used. Both Layer 1 (vatType=0) and Layer 2 (no-2710) detection return 0 candidates.

### The fix (in the template)

The template uses **4-layer detection priority**:
1. **Layer 1**: Posting-level `vatType.id === 0` on MV_ACCT posting (catches Layers 1+2)
2. **Layer 2**: Voucher-level `!has2710` (catches simple single-line vouchers)
3. **Layer 3**: Description keywords (`uten MVA`, `utan MVA`, `without VAT`, `ohne MwSt`, `sin IVA`, `sem IVA`, `sans TVA`)
4. **Layer 4**: Amount match (MV_ACCT posting gross == MV_EXCL_VAT)

**Do not modify the detection logic. Do not replace it with a simpler approach.**

## Production History

- 13+ early runs, best score 2.25/6 (checks 1,2,4 pass; Check 3 always fails due to detection bugs)
- Run 14 (2026-03-22): 3 calls, 0 errors, discovered Layer 2 trap (multi-line vouchers)
- Run 463433ee (2026-03-22): 1 POST, 0 errors, 6/6 — discovered Layer 3 trap (vatType=1 error voucher)
- Run d9638f91 (2026-03-22): 1 POST, 0 errors, 6/6 — Layer 3 matched again (6300→7100, dup 7100, MV 6500, WA 6590)
- Template now uses 4-layer detection (sandbox-verified 2026-03-22, 2 consecutive 6/6 runs)
