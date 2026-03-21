# Score-Aware Reflection

## Task Attribution

- **Task ID**: `07` (T1, max score 2)
- **Prompt**: Register full payment on outstanding invoice for Polaris AS (896571559), 15200 kr ex MVA, "Datarådgivning"
- **Run ID**: `prod-2026-03-21-164504782Z-e93a67ba`
- **Attempt**: 16th attempt on this task

## Correctness Verdict

**Perfect.** `correctness = 1`, `score_raw = 7/7`, `normalized_score = 2/2`. All 2/2 checks passed. The final Tripletex state was exactly correct.

## Efficiency Verdict

**Optimal.** The run achieved the maximum score (`2/2`) matching the prior leaderboard best (`2`). This means the 3-call path had zero efficiency penalty:

1. `GET /invoice` — locate invoice `2147567128`, outstanding `19000`
2. `GET /invoice/paymentType` — resolve payment type `27869893`
3. `PUT /invoice/{id}/:payment` — pay `19000`, remaining `0`

No wasted calls. No 4xx errors. No retries. The run matched both the correctness ceiling and the efficiency ceiling for this task shape.

## Likely Root Cause

No issues to diagnose. The run was flawless. The agent:
- Recognized the exact trusted-standard match immediately
- Read only the trusted standard (skipped AGENTS.md and openapi.json)
- Wrote one script and executed once
- Used the invoice's live `amountCurrencyOutstanding` (19000) for payment, not the prompt's ex-VAT locator (15200)
- Selected the correct bank payment type (debit account 1920, `isBankAccount=true`)

## What Went Right

1. **Trusted-standard recognition**: The agent matched `register-customer-invoice-payment` without hesitation and followed the documented 3-call flow exactly.
2. **Payment amount rule**: Correctly used `amountCurrencyOutstanding = 19000` instead of the prompt's `15200` ex-VAT locator.
3. **Payment type selection**: Chose debit account `1920` with `isBankAccount=true` — the proven safe default.
4. **Single script execution**: No debugging, no retries, no extra reads.
5. **Verification from write response**: Confirmed `amountCurrencyOutstanding = 0` directly from the PUT response without a follow-up GET.

## What To Change Next Time

Nothing. This run is the reference implementation for task `07`. The next agent should:

1. Follow the identical 3-call path: `GET /invoice` → `GET /invoice/paymentType` → `PUT /invoice/{id}/:payment`
2. Use the invoice object's live outstanding amount for `paidAmount`, never the prompt's ex-VAT figure
3. Select payment type by debit account `19xx` with `isBankAccount=true`
4. Verify from the write response, not a follow-up GET
5. If this task appears in a multi-task run where an earlier step already resolved a `paymentTypeId`, reuse it for a 2-call path
