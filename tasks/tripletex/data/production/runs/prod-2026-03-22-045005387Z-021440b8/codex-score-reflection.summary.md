# Score-Aware Reflection

## Task Attribution

- **Run ID**: prod-2026-03-22-045005387Z-021440b8
- **tx_task_id**: 14 (T2 task, tier max = 4)
- **Prompt**: Spanish — create a full credit note reversing the invoice for "Diseño web" (39850 NOK ex-VAT) to Estrella SL (org. nº 871338140)
- **Attempt**: 22nd attempt on task 14 (previous best: 4.0 — perfect T2 score)

## Correctness Verdict

**FAILED.** correctness = 0.125 (1/8 raw points). 4/5 checks failed.

| Check | Result |
|-------|--------|
| Check 1 | passed |
| Check 2 | failed |
| Check 3 | failed |
| Check 4 | failed |
| Check 5 | failed |

- **score_raw**: 1
- **score_max**: 8
- **normalized_score**: 0.25 (out of tier max 4)
- **Leaderboard best for task 14**: 4.0 (unchanged — this run did not improve it)

The prior reflection (codex-reflection phase) **incorrectly concluded this was a flawless run** based solely on the API returning `isCreditNote=true`. It even committed a "17th production confirmation" to the trusted standard and playbook. That update is now known to be wrong — this run scored 0.125 correctness, not 1.0.

## Efficiency Verdict

Efficiency is moot when correctness is this poor. The run used 2 API calls with 0 errors, which is the proven minimal-call count for this task shape. If the final state had been correct, the score would have been 4.0 (perfect). **The problem is entirely in correctness, not call count.**

## Likely Root Cause

### Cross-run evidence

All 8 scored task-14 runs used the identical 2-call approach. Results split cleanly by date:

| Run | Date | Description | Correctness |
|-----|------|-------------|-------------|
| bbc455f7 | 2026-03-21 | Datarådgjeving/45300 | 1.0 (5/5) |
| da4a5fb0 | 2026-03-21 | Opplæring/13100 | 1.0 (5/5) |
| 8ed57511 | 2026-03-21 | Licencia de software/25450 | 1.0 (5/5) |
| ee7cb0fd | 2026-03-21 | Webdesign/9900 | 1.0 (5/5) |
| 4032eb04 | 2026-03-21 | Webdesign/38800 | 1.0 (5/5) |
| **a5e9ca4e** | **2026-03-22** | **Programvarelisens/47350** | **0.125 (1/5)** |
| **021440b8** | **2026-03-22** | **Diseño web/39850** | **0.125 (1/5)** |

**All five 2026-03-21 runs scored perfectly. Both 2026-03-22 runs failed with the exact same check pattern (Check 1 pass, Checks 2-5 fail).** The approach did not change between dates.

### Most likely explanations

1. **Scoring environment or account setup change on 2026-03-22**: If the fresh account template changed (e.g., invoice descriptions stored differently, additional invoices created, different field defaults), the agent's exact-match filter on the prompt description could match the wrong invoice or a stale setup fixture. This would explain why the credit note entity exists (Check 1) but the reversal is incorrect (Checks 2-5).

2. **Wrong invoice credited**: The script filters on `organizationNumber + amount + description`. If the correct invoice has description "Webdesign" (Norwegian) but the prompt says "Diseño web" (Spanish translation), and a DIFFERENT invoice happens to match "Diseño web" literally, the agent credits the wrong one. The prior score-reflection for a5e9ca4e raised this same hypothesis.

3. **Scorer change**: If the scoring criteria tightened on 2026-03-22 (e.g., now checks credit note date vs original invoice date, or checks for specific accounting voucher entries), previously-passing runs would fail under the new checks.

### What the agent DID

- Found invoice id 2147664097 with `amountExcludingVatCurrency=39850` and `customer.organizationNumber=871338140` and description "Diseño web"
- Created credit note 2147675459 with `isCreditNote=true` and `creditedInvoice=2147664097`
- Both API calls returned HTTP 200 with expected response shape
- The agent cannot determine from the API responses alone that the credit note targets the wrong invoice

## What Went Right

1. **API execution was flawless**: 2 calls, 0 HTTP errors, 0 4xx responses
2. **Trusted standard was followed exactly**: Read the standard first, wrote the 2-call script, executed
3. **Duplicate handling was present**: `reduce((a,b) => a.id > b.id ? a : b)` logic
4. **Correct endpoint and parameters**: `PUT :createCreditNote?date=...&sendToCustomer=false`
5. **Credit note was created**: API confirmed `isCreditNote=true`

## What To Change Next Time

1. **Do NOT assume API success = scorer success.** The prior reflection concluded "flawless execution" based solely on 200 responses. Future reflections must note when scoring data is unavailable rather than claiming correctness. The trusted standard was incorrectly updated to record this as a "17th consecutive success" — that entry should be corrected or removed in a future phase.

2. **Add fallback matching for translated descriptions.** The current approach only matches the literal prompt description. For Spanish prompts, "Diseño web" might be a translation of "Webdesign" stored in the system. The script should:
   - First try exact match on the prompt description
   - If no match, try common translation equivalents (e.g., "Diseño web" ↔ "Webdesign", "Web design")
   - Log all candidate invoices (not just the selected one) for post-run diagnostics

3. **Log ALL matching candidates and ALL excluded invoices.** In both failed runs, the script only logged the selected invoice. Logging all candidates (including those excluded by `isCredited` or `isCreditNote` filters) would reveal whether the correct invoice was filtered out or never found.

4. **Investigate the 2026-03-22 environment.** Both failures occurred on 2026-03-22. If a future batch of task-14 runs on a different date scores perfectly again, this confirms an environment/scoring change on that specific date, not a systematic agent flaw.

5. **The 2-call path remains correct in principle.** 5 prior production runs achieved perfect scores with this exact path. The flow itself is sound. The problem is likely in invoice identification accuracy for certain account setups or translated descriptions.

6. **Correct the trusted standard and playbook.** The prior reflection phase committed changes recording this as a success. That commit (`862b5d2e`) should be reverted or amended in the next reflection phase to avoid misleading future agents into trusting a false confirmation.
