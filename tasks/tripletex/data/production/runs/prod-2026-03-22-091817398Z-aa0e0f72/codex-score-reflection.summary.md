# Score-Aware Reflection — prod-2026-03-22-091817398Z-aa0e0f72

## 1. Task Attribution

- **Task ID:** T01 (create employee)
- **Tier:** T1 (max score: 2)
- **Prompt:** Nynorsk — create employee Bjørn Neset, DOB 1996-02-21, email bjrn.neset@example.org, start date 2026-06-16
- **Attempt:** 25th overall for T01

## 2. Correctness Verdict

**Perfect.** Correctness = 1.0, score_raw = 8/8, all 7/7 checks passed. The final Tripletex state was exactly correct — employee created with all required fields (name, DOB, email, employment start date).

## 3. Efficiency Verdict

**Not efficient.** Normalized score = 1.4 out of a maximum 2.0. The leaderboard best for T01 was already 2.0 (from the prior Bjørn Neset run 8e8e2e86 which achieved 2 calls, 0 errors). This run's best_score stayed at 2.0 — it did not improve the leaderboard.

The 0.6 point deficit (1.4 vs 2.0) is entirely due to the efficiency penalty from wasted API calls and the avoidable 422 error.

**Actual calls:** 4 calls, 1 error (422)
- GET /department → 200 (necessary)
- POST /employee → 422 (wasted — invented fields)
- GET /department → 200 (wasted — script re-run)
- POST /employee → 201 (necessary)

**Optimal calls:** 2 calls, 0 errors
- GET /department → 200
- POST /employee → 201

**Wasted:** 2 calls + 1 avoidable 422 error.

## 4. Likely Root Cause

The agent added three fields to the employment object that do not exist on the Tripletex employment model: `employmentType: "ORDINARY"`, `percentageOfFullTimeEquivalent: 100`, and `employmentDetails: []`. These caused a 422 code 16000 ("Feltet eksisterer ikke i objektet.") on the first POST attempt.

The agent likely confused the simple create-employee employment shape (which accepts only `startDate` + optional `division`) with the richer onboard-employee shape (which uses `employmentType`, `workingHoursScheme`, etc. inside a nested `employmentDetails` object). Despite reading the trusted standard — which has an example payload showing only `{ "startDate": "2026-10-25" }` in the employment array — the agent deviated from the example and added fields from memory/intuition.

After the 422, the agent had to fix the script and re-run it, which re-executed the already-successful GET /department call, doubling the total call count.

## 5. What Went Right

1. **Correct task identification.** The agent recognized this as a create-employee exact match and read the trusted standard before writing any code.
2. **Pre-read department strategy.** Correctly used the GET /department pre-read (the current standard flow), avoiding the old no-pre-read pattern that caused 422s in earlier runs.
3. **Department placement.** Correctly placed `department` at the top level of the employee object, not inside `employments[]` — avoiding the code 16000 trap that hit the André Almeida run.
4. **Date normalization.** Correctly converted Nynorsk dates (21. February 1996, 16. June 2026) to ISO format.
5. **Unicode name preservation.** Kept `Bjørn` with the ø intact.
6. **Perfect final state.** Despite wasted calls, all 7 checks passed and correctness was 1.0.

## 6. What To Change Next Time

1. **Copy the trusted standard's employment payload verbatim.** The employment object for the simple create-employee shape contains ONLY `{ startDate: "YYYY-MM-DD" }`. No other fields. The trusted standard example is the single source of truth — do not add fields based on intuition or knowledge of other task shapes.

2. **Distinguish simple create-employee from onboard-employee.** The fields `employmentType`, `percentageOfFullTimeEquivalent`, `workingHoursScheme`, `remunerationType` belong to the onboard-employee shape's `employmentDetails` nested structure. They are NOT valid on the base employment model used by `POST /employee` in the simple create-employee flow.

3. **Get the payload right on the first attempt.** A script re-run re-executes all calls including previously-successful ones. In a 2-call script, one field mistake costs 4 total calls — a 100% overhead. The trusted standard's example payload exists precisely to prevent this.

4. **The prior reflection already updated the trusted standard, playbook, and AGENTS.md** with explicit warnings against invented employment fields. The commit `eff12e8b` adds these warnings. Future agents reading the current documentation should not repeat this mistake.
