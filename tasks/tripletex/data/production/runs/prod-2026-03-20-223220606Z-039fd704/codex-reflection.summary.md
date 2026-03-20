## 1. Task

Post-run learning pass for the production task that registered one travel expense for Charlotte Williams (`charlotte.williams@example.org`) with title `Client visit Bodø`, `3` per-diem days at `800 NOK`, and two cost lines (`6200` flight, `400` taxi).

## 2. Reflection

What went well:
- The production run used the correct deliverable travel-expense shape instead of the old create-only path.
- It avoided avoidable `4xx` errors.
- It used the right mechanical safeguards: employee lookup, conditional concrete `departureFrom`, live `rateType`, explicit zero-VAT cost rows, embedded costs/per diem, then `PUT /travelExpense/:deliver`.
- It stopped without wasting child verification reads.

What went poorly:
- The prompt omitted both explicit travel dates and `departureFrom`, so the run still had to guess the final scored date range.
- The run did not have an explicit documented forced-action rule for that ambiguous prompt family, only the warning that the family is not an exact trusted-standard match.
- The resulting production state may still miss scorer-perfect correctness even though the API accepted it, because sandbox proof shows multiple date ranges are equally deliverable for the same prompt family.

Correct approach:
- Keep the API path minimal and fully deliverable.
- Do one employee read, one conditional company fallback only if `employee.address` is missing, then `GET /travelExpense/costCategory`, `GET /travelExpense/paymentType`, `GET /travelExpense/rate`, `POST /travelExpense`, `PUT /travelExpense/:deliver`.
- If the prompt still omits dates, choose one deterministic local range and accept that it is only a best-effort fallback, not a trusted exact-match inference.

## 3. Call Efficiency

The production run was minimal-call for the chosen deliverable branch.

Wasted calls:
- None in the production script logic.
- It did not add `GET /travelExpense`, `GET /travelExpense/{id}`, `GET /travelExpense/cost`, `GET /travelExpense/perDiemCompensation`, repeated `GET /employee`, or speculative retry branches.

Exact lower-call path the next agent should follow for this same task family:
- `GET /employee?email=...&count=10&fields=*`
- Conditional `GET /company/{companyId}?fields=*,address(*)` only if `employee.address` has no concrete location
- `GET /travelExpense/costCategory?count=1000&fields=*`
- `GET /travelExpense/paymentType?count=1000&fields=*`
- `GET /travelExpense/rate?type=PER_DIEM&isValidDomestic=true&dateFrom=...&dateTo=...&count=1000&fields=*`
- `POST /travelExpense`
- `PUT /travelExpense/:deliver?id=...`

Call count for that branch:
- `6` calls if the employee already exposes a concrete address field
- `7` calls if one company fallback read is needed

Important nuance:
- The run was not under-called. The remaining risk was correctness ambiguity from missing prompt dates, not wasted API usage.

## 4. Root Causes

- Prompt underspecification: Tripletex travel-expense tasks can require a concrete `departureFrom` and deliverable date range even when the prompt gives only duration.
- API ambiguity: Tripletex accepts multiple delivered states for that duration-only prompt family, so the missing dates are not recoverable from extra reads.
- Documentation gap: the docs warned that the prompt family was ambiguous, but they did not yet say what the next agent should do when a scored run still forces autonomous action.

## 5. Sandbox Verification

Persistent sandbox used:
- Base URL: `https://kkpqfuj-amager.tripletex.dev/v2`
- Token: sandbox token from the follow-up prompt

Verification script:
- [sandbox_verify_duration_only_travel_expense.ts](/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223220606Z-039fd704/scripts/sandbox_verify_duration_only_travel_expense.ts)

Verified facts:
- Known employee `18478235` still had `address=null`.
- The same employee still exposed `companyId=108114337`.
- `GET /company/108114337?fields=*,address(*)` still exposed concrete fallback `departureFrom=Oslo`.
- Two otherwise-identical delivered Bodø expenses both succeeded:
- `11146082`: `2026-03-18..2026-03-20`, `departureFrom=Oslo`, `2` costs, `1` per-diem row, `state=DELIVERED`
- `11146083`: `2026-03-17..2026-03-19`, `departureFrom=Oslo`, `2` costs, `1` per-diem row, `state=DELIVERED`

Conclusion from sandbox:
- The ambiguity is real for the exact `3 days` / `800 per day` / `6200 flight` / `400 taxi` Bodø family too.
- Even after company-city fallback is fixed, Tripletex still accepts multiple delivered date ranges.
- Extra API calls do not recover a unique scorer-correct answer from Tripletex itself.

## 6. Playbook Changes

Updated existing docs:
- [AGENTS.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md)
- [trusted-standards/register-travel-expense.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/register-travel-expense.md)
- [trusted-standards/common-endpoints.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md)
- [task-playbooks/register-travel-expense.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/register-travel-expense.md)

What changed:
- Added the new 3-day Bodø sandbox proof, not just the older 4-day Bergen proof.
- Recorded that company-city fallback can be correct mechanically and still leave date ambiguity unresolved.
- Added explicit forced-action guidance: if the agent must still act on a duration-only prompt, keep the API flow minimal and choose one deterministic local date range instead of burning extra exploratory reads.
- Reinforced the pitfall list against repeated employee reads, exploratory `GET /travelExpense`, and placeholder `departureFrom` values.

No new trusted standard or playbook was created.

## 7. Commit

- Commit: `6c27c9787adc2ec18f1ec147321c08f363f8af30`
- Message: `tripletex playbook: clarify ambiguous travel-expense fallbacks`

## 8. Reusable Heuristics

- For multi-day travel expenses with per diem, the old 4-call create-only branch is not enough; use live `rateType`, explicit `departureFrom`, explicit zero-VAT cost rows, then `:deliver`.
- If `employee.address` is missing, do not repeat `GET /employee`; jump straight to `GET /company/{companyId}?fields=*,address(*)`.
- If both employee and company lack a concrete location, treat the run as blocked rather than inventing `Hjemsted` or another generic placeholder.
- If the prompt omits dates and Tripletex still requires action, one deterministic local guess is better than extra investigative API calls; the extra calls will not reveal a unique scorer-correct range.
- For this prompt family, optimize for the minimal deliverable branch, not for impossible certainty that the API does not provide.