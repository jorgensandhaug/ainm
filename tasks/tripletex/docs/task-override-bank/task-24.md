# TASK OVERRIDE — Task 24: Correct Ledger Errors

**You are running Task 24. The task is already identified. Do not classify.**

## What this task is

Find and correct four types of errors in the general ledger for a specific period:
1. **Wrong account** — an expense posted to the wrong account, needs reposting to the correct one
2. **Duplicate voucher** — an entry was booked twice, needs reversal
3. **Missing VAT** — an expense was booked without VAT, needs a 25% VAT correction on account 2710
4. **Incorrect amount** — an expense was booked for the wrong amount, needs the difference corrected

The prompt (in any of nb/en/de/es/fr/pt/nn) will give you the exact account numbers and amounts for each error.

## What to read and execute

1. **Read ONLY** `./trusted-standards/correct-ledger-errors.md`
2. The trusted standard has a **complete copy-paste script template**. Extract the 10 prompt values (account numbers + amounts), paste them in, and run with `bun`.
3. **Do NOT modify the detection logic.** It has 4-layer missing-VAT detection that is production-proven across 4 consecutive 6/6 runs.
4. **Immediately write and execute.** Do NOT read AGENTS.md, openapi.json, or playbooks.

## Critical: Prompt value extraction

The prompt is multilingual. Extract these values:
- `WRONG_ACCT_SOURCE` / `WRONG_ACCT_TARGET` / `WRONG_ACCT_AMOUNT` — the wrong account, correct account, and amount
- `DUP_ACCT` / `DUP_AMOUNT` — the duplicated account and amount
- `MV_ACCT` / `MV_EXCL_VAT` — the missing-VAT expense account and amount excluding VAT
- `WA_ACCT` / `WA_RECORDED` / `WA_CORRECT` — the wrong-amount account, recorded amount, correct amount
- `DATE_FROM` / `DATE_TO` / `CORRECTION_DATE` — period range (dateTo is EXCLUSIVE = first of next month), correction date = last day of period

## Why this works

The template uses only **1 scored POST** (combined correction voucher) + unlimited free GETs. It:
1. Fetches all vouchers in the period with nested field expansion
2. Filters out reversed vouchers
3. Detects each error type using amount + account matching
4. Builds a balanced correction voucher with all 8 correction lines (2 per error)
5. Validates balance before posting
6. Verifies all 4 checks with post-correction GETs

## Production track record

**4 consecutive 6/6 runs** (nb, en, de, de prompts) — proven across varied account overlaps and multilingual prompts. Current score: 2.25/6 only because earlier runs used hardcoded values instead of prompt extraction.

## If the prompt doesn't match

If the incoming prompt does NOT describe 4 specific ledger errors with exact account numbers and amounts, say so and stop. Note: Task 21 (ledger audit) is DIFFERENT — it asks for implicit discovery of errors without providing specific values.
