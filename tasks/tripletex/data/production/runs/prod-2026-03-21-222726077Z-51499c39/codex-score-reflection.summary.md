# Score Reflection Summary

## Task Attribution

**Status: Ambiguous** — the task attribution system could not uniquely identify which task this run scored against. Three candidate tasks had `attempt_delta=1` in the leaderboard diff window:

| Candidate | Tier | Max | Best Before | Best After | last_attempt_after |
|---|---|---|---|---|---|
| Task 13 | T2 | 4 | 1.125 | 1.125 | 22:28:21 |
| Task 15 | T2 | 4 | 3.3333 | 3.3333 | 22:27:39 |
| Task 19 | T3 | 6 | 2.7273 | 2.7273 | 22:28:24 |

The run completed at 22:28:23. Task 19's last_attempt (22:28:24) has the closest timestamp match. However, the prompt ("employment contract, create employee with all details") is a standard onboard-employee shape, which more naturally maps to a T2 task. Task 13 is known to be travel expense (from memory), so it is excluded.

**Most likely attribution: Task 15 (T2, max 4) or Task 19 (T3, max 6)** — the run likely maps to one of these, but neither best_score improved.

The submissions were still in "processing"/"scoring" status at capture time — no final normalized_score is available.

## Correctness Verdict

**Indeterminate, but likely imperfect or tied with existing best.**

Neither candidate task's best_score improved after this run. This means the run scored ≤ the existing best for whichever task it attributed to.

If task 15 (T2, max 4): best 3.3333/4 = 83.3% — suggests either ~83% correctness or 100% correctness with efficiency penalty capping at 83%.

If task 19 (T3, max 6): best 2.7273/6 = 45.5% — would indicate significant correctness issues, which seems unlikely for a clean 4-call run. This attribution is less plausible.

**Assessment**: The run's execution was clean (4 calls, 0 errors, all fields from contract included). If the score matched or was slightly below 3.3333 (task 15), the likely explanation is either:
1. A field the scorer checks is wrong or missing (e.g., occupation code mapping issue, address field, or another nuance), or
2. The 4-call count is slightly above the efficiency optimum for this specific task variant

No definitive correctness assessment is possible without the final score.

## Efficiency Verdict

**The run used the theoretical minimum call count (4 calls) for the hardcoded-occupation-code + standard-worktime shape:**

1. `GET /division?count=1&fields=id` — 0 rows (fresh account, as expected)
2. `POST /department` (Drift) — 201
3. `POST /employee` (with nested employmentDetails, occupation code 2951) — 201
4. `POST /employee/standardTime` (7.5h/day) — 201

Steps 1+2 ran in parallel. 0 errors. 0 wasted calls. No retries. This is the minimum-call floor — it cannot be reduced further.

If the score is below the max despite 4 calls and 0 errors, the issue is correctness, not efficiency.

## Likely Root Cause

Since the score didn't improve the best, and the run was at the minimum call floor with 0 errors, the most likely explanations are:

1. **Existing best was set by a prior equally-efficient run** — this run merely matched it. With 15+ onboard-employee production runs, earlier runs with the same task variant likely already achieved a comparable score.

2. **Possible correctness gap** — if the best_score for this task is stuck below the max across all attempts, there may be a systematic field that all runs miss. Potential candidates:
   - The contract PDF may contain additional fields not extracted (e.g., an address, phone number, or contractual detail)
   - The occupation code mapping STYRK 4110 → id 2951 (KONTORMEDARBEIDER) might not be the exact match the scorer expects
   - Standard worktime 7.5h might not be the expected value if the contract implies different hours

3. **This run may have gone to task 19 (T3)** — if so, the onboard-employee flow may be incomplete for a more complex T3 task variant, though this seems unlikely given the straightforward prompt.

## What Went Right

- **Hardcoded occupation code** — STYRK 4110 → id 2951 used directly, saving 1 API call vs dynamic lookup
- **Standard worktime default** — correctly defaulted to 7.5h/day even though the contract didn't specify it
- **All contract fields included** — firstName, lastName, dateOfBirth, nationalIdentityNumber, email, bankAccountNumber, department, employment percentage, salary, start date
- **Zero errors** — all 4 calls returned 201
- **Parallel execution** — GET /division + POST /department ran concurrently
- **Minimum call count** — 4 calls is the proven floor for this task shape
- **Correct payload structure** — nested employmentDetails with all required fields (employmentType, employmentForm, remunerationType, workingHoursScheme, occupationCode by id)
- **Correct standard worktime endpoint** — used `POST /employee/standardTime` (per-employee), not the company-wide `/salary/settings/standardTime`

## What To Change Next Time

1. **No execution changes needed** — the 4-call flow with 0 errors is optimal. The run followed the trusted standard exactly.

2. **Monitor for score availability** — the ambiguous attribution and missing final score make it impossible to confirm whether this run achieved perfect correctness. Future runs should ensure the scoring pipeline resolves before capturing results.

3. **If STYRK 4110 consistently underperforms** — investigate whether KONTORMEDARBEIDER (id 2951) is truly the scorer's expected occupation code for STYRK 4110. The mapping is logical (STYRK-08 4110 = "Generelle kontormedarbeidere" = KONTORMEDARBEIDER), but if scores remain below max, try the dynamic lookup path to see if a different occupation code is expected.

4. **Check for uncaptured contract fields** — if the PDF contains fields beyond what the prompt explicitly lists (phone number, address, middle name, etc.), test whether including them improves the score. The prompt says "all details from the contract" which may include fields beyond the enumerated list.

5. **The trusted standard's `count=1` bug was fixed** — the dynamic occupation code lookup step now correctly says `count=10&fields=id,nameNO` with exact-match picking, preventing the KONSERNREGNSKAPSSJEF-before-REGNSKAPSSJEF pitfall. This fix was committed in the post-run reflection phase.
