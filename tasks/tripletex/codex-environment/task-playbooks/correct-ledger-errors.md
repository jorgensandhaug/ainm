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
2. It contains a complete, runnable script template (~240 lines)
3. Fill in the 10 extracted values + BASE/TOKEN
4. Run it — 3 API calls, 0 expected errors

**Do not rewrite the detection logic.** The template handles all edge cases. Just fill in constants and run.

## Scoring (6 points max)

4 correctness checks (0.75 each = 3.0 max) + efficiency bonus (3 calls = 3.0 max):
- **Check 1**: wrong-account source zeroed, target has the amount
- **Check 2**: duplicate reversed (net effect = single entry)
- **Check 3**: account 2710 has ≥ `MV_EXCL_VAT * 0.25`
- **Check 4**: wrong-amount account shows correct amount

## The One Thing That Will Fail Your Run

**Check 3 has failed in ALL 12+ production runs.** Every time, the script picked the wrong voucher for missing-VAT correction. The trap:

> Two vouchers exist on `MV_ACCT` with the same amount.
> - Voucher A (lower ID, appears FIRST): correctly booked, HAS a 2710 posting
> - Voucher B (higher ID, appears SECOND): the error, NO 2710 posting
>
> If you iterate and take the first match → you get Voucher A → your "correction" does nothing → Check 3 = FAIL.

The template handles this by filtering `!has2710` BEFORE selecting. Do not modify that logic.

## Production History

- 12 runs, best score 2.25/6
- Checks 1, 2, 4: always pass
- Check 3: always fails (wrong voucher selected)
- Fix is in the template — sandbox-verified 2026-03-22, all 4 checks pass
