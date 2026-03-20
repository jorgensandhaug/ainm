## Task

Post-run learning pass for the production task that registered one travel expense with per diem and two cost lines. Re-audited the run, verified the lowest-call solution in persistent sandbox, updated the travel-expense guidance, and committed only the learning docs.

## Reflection

What went well:
- Production run was correct.
- No `4xx`.
- Embedded `POST /travelExpense` shape was right on the first try.
- Payload choices were correct: `amountCurrencyIncVat`, `amountNOKInclVAT`, `travelDetails.isCompensationFromRates=true`, no explicit `department`.

What went poorly:
- The run used 2 unnecessary reads after the write.
- I followed the old trusted standard too literally and did not challenge whether its verification branch was still canonical for scored runs.

Correct approach:
- For the exact create-only existing-employee travel-expense shape, stop after the write.
- Use the post-write child reads only as a conditional investigation branch, not as the default scored path.

## Call Efficiency

The production run was not minimal-call.

Actual run:
1. `GET /employee?email=...&count=10&fields=*`
2. `GET /travelExpense/costCategory?count=1000&fields=*`
3. `GET /travelExpense/paymentType?count=1000&fields=*`
4. `POST /travelExpense`
5. `GET /travelExpense/cost?travelExpenseId=...&count=20&fields=*`
6. `GET /travelExpense/perDiemCompensation?travelExpenseId=...&count=20&fields=*`

Wasted calls:
- `GET /travelExpense/cost?...`
- `GET /travelExpense/perDiemCompensation?...`

Lower-call path next agent should use:
1. `GET /employee?email=...&count=10&fields=*`
2. `GET /travelExpense/costCategory?count=1000&fields=*`
3. `GET /travelExpense/paymentType?count=1000&fields=*`
4. `POST /travelExpense` with embedded `costs[]` and `perDiemCompensations[]`
5. Stop

Why this is the correct lower-call path:
- The exact embedded-create shape persists the child rows in the parent write.
- The write response already proves parent fields and returns child ids/counts.
- The extra child reads add certainty for investigation, but not extra scored side effects.

## Root Causes

- The existing trusted standard was outdated: it still encoded the 6-call verification-heavy path as the default.
- I optimized for proof instead of score on an exact trusted-standard task.
- I did not explicitly re-audit whether the standard’s verification reads were still justified once embedded child creation had already been proven in sandbox.

## Sandbox Verification

Persistent sandbox credentials were used, not production credentials.

Verified path:
- `GET /employee?count=50&fields=*` selected existing employee `simen.sandhaug@gmail.com` (`id=18441996`) for proof only.
- `GET /travelExpense/costCategory?count=1000&fields=*` resolved `Fly` (`id=32813722`) and `Taxi` (`id=32813737`).
- `GET /travelExpense/paymentType?count=1000&fields=*` resolved `Privat utlegg` (`id=32813706`).
- `POST /travelExpense` created travel expense `id=11143985`.
- Conditional proof reads:
  - `GET /travelExpense/cost?travelExpenseId=11143985&count=20&fields=*`
  - `GET /travelExpense/perDiemCompensation?travelExpenseId=11143985&count=20&fields=*`

What this proved:
- The single embedded `POST /travelExpense` created both cost rows and the per-diem row correctly.
- The write response returned child arrays as sparse `id`/`url`, but with enough parent data and child ids/counts for the exact scored create-only flow to stop after the write.
- The conditional child reads matched the intended values exactly:
  - `Flugticket`, `5250`, date `2026-03-18`, category `Fly`
  - `Taxi`, `250`, date `2026-03-20`, category `Taxi`
  - per diem `location=Tromsø`, `count=3`, `rate=800`, `amount=2400`

Pitfalls to avoid:
- Do not omit `amountCurrencyIncVat` on embedded costs.
- Do not leave `travelDetails.isCompensationFromRates=false` when sending `perDiemCompensations[]`.
- Do not add `department` unless prompt-scored or validation forces it.
- Do not waste a `GET /travelExpense/{id}`; it still leaves child arrays sparse.
- Do not add child verification reads by default on exact create-only scored runs.

## Playbook Changes

Updated existing artifacts; no new files created.

Changed paths:
- [AGENTS.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md)
- [trusted-standards/register-travel-expense.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/register-travel-expense.md)
- [trusted-standards/common-endpoints.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md)
- [task-playbooks/register-travel-expense.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/register-travel-expense.md)

What changed:
- Promoted the travel-expense trusted standard from a 6-call default to a 4-call canonical scored path.
- Moved `/travelExpense/cost` and `/travelExpense/perDiemCompensation` into a conditional investigation branch.
- Updated the common-endpoints note and AGENTS gotcha text to match the lower-call path.

## Commit

- Commit hash: `77c162c`
- Commit message: `tripletex playbook: reduce travel-expense call path`

## Reusable Heuristics

- When a trusted standard is an exact match, still audit whether its verification branch is scoring-critical or just reassurance.
- For Tripletex create-only tasks, if the write shape and persistence behavior are already proven in sandbox, prefer stopping after the decisive write.
- Treat sparse child arrays in a write response as a reason to avoid `GET /.../{id}` expansion assumptions, not automatically as a reason to spend extra reads.
- Keep child verification endpoints as conditional branches for investigation, not default steps, unless later logic truly depends on expanded child fields.