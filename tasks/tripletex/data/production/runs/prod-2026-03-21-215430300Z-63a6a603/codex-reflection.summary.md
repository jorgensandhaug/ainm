# Reflection Summary — prod-2026-03-21-215430300Z-63a6a603

## Task

Create employee Geir Neset, born 1997-06-24, email geir.neset@example.org, start date 2026-10-15. Simple create-employee shape (no department name, no salary, no occupation code, no standard worktime). Prompt was in Nynorsk.

## Reflection

**What went well:**
- Correctly identified this as a create-employee task (not onboard-employee) — no salary, percentage, or occupation code
- Followed the trusted standard's reactive department-repair branch correctly
- All fields persisted correctly: firstName, lastName, dateOfBirth, email, startDate
- Used `userType: "NO_ACCESS"` as recommended

**What went poorly:**
- Used 4 calls + 1 error instead of the now-proven minimum of 3 calls + 1 error for dept-required accounts
- The extra call was the verification `GET /employee/employment?employeeId=...&fields=*`, which is unnecessary when using `POST /employee?fields=*,employments(*)`

**Root mistake:**
- The trusted standard at the time said `POST /employee?fields=*` returns sparse employments (id + url only, no startDate), making a verification GET necessary
- Nobody had tested `POST /employee?fields=*,employments(*)` — the Tripletex nested field expansion syntax — which returns the full employment object including startDate

## Call Efficiency

**Run was NOT minimal-call.** Used 4 calls + 1 error. Optimal was 3 calls + 1 error.

| # | Call | Status | Necessary? |
|---|------|--------|-----------|
| 1 | `POST /employee` | 422 | Yes (reactive dept discovery) |
| 2 | `GET /department?isInactive=false&count=1&fields=*` | 200 | Yes (dept repair) |
| 3 | `POST /employee` with dept | 201 | Yes |
| 4 | `GET /employee/employment?employeeId=18676418&fields=*` | 200 | **NO — wasted call** |

**Wasted call:** Call 4 (verification GET) is unnecessary when using `?fields=*,employments(*)` on the POST.

**Lower-call path for next agent:**
- Fresh accounts: **1 call** — `POST /employee?fields=*,employments(*)` → response includes startDate
- Dept-required accounts: **3 calls + 1 error** — POST → 422, GET /department, POST with dept?fields=*,employments(*)

## Root Causes

1. **Missing field expansion knowledge**: The prior standard documented that `POST /employee?fields=*` returns sparse employments. This is correct. But nobody tested `fields=*,employments(*)` — the Tripletex nested object expansion syntax. This expansion causes the POST response to include full employment objects with startDate, eliminating the verification GET.

2. **Department 422 is unavoidable without pre-reading**: The account required department.id. The trusted standard correctly avoids pre-reading department because 4/6 production runs don't need it. The 422 is the signal to repair.

## Sandbox Verification

Three sandbox tests on 2026-03-21:

1. `POST /employee?fields=employments(*)` → **201**, response included `startDate: "2026-10-15"` in full employment object, but omitted top-level employee fields (firstName, etc.)

2. `POST /employee?fields=*` → **201**, response included employee identity fields but `employments` was sparse (id + url only, no startDate) — confirming the old behavior

3. `POST /employee?fields=*,employments(*)` → **201**, response included **both** full employee identity fields AND full employment objects with startDate — this is the optimal query parameter

**Key finding**: `fields=*` expands top-level fields only. `employments(*)` expands nested employment objects. You need both: `fields=*,employments(*)`.

## Playbook Changes

Updated existing files:

| File | Change |
|------|--------|
| `./trusted-standards/create-employee.md` | Changed POST to use `?fields=*,employments(*)`, removed verification GET step, updated call counts (1/3 instead of 2/4), updated sandbox/production status |
| `./task-playbooks/create-employee.md` | Complete rewrite reflecting the 1-call minimum, removed all references to verification GET, added the field expansion discovery as the critical finding |

No new files created. No AGENTS.md changes needed (table entries unchanged).

## Commit

```
1dc5fd76 tripletex playbook: create-employee — eliminate verification GET via POST /employee?fields=*,employments(*) after 6th production confirmation (63a6a603, Nynorsk prompt, Geir Neset / 1997-06-24 / geir.neset@example.org / start 2026-10-15, 4 calls 1 error dept-repair branch); sandbox proved POST /employee?fields=*,employments(*) returns full employment object with startDate, reducing fresh-account minimum from 2 calls to 1 call and dept-repair from 4+1err to 3+1err; fields=* alone still returns sparse employments (id+url only), the employments(*) expansion is essential
```

## Reusable Heuristics

1. **Tripletex nested field expansion**: `fields=*` does NOT expand nested objects. Use `fields=*,nestedField(*)` syntax to expand nested objects in POST responses. This applies beyond just employee — any POST that creates nested objects (employment inside employee, orderlines inside order, etc.) may benefit from the same pattern.

2. **POST response as verification**: Before adding a verification GET, always test whether the POST itself can return the needed data via field expansion. Eliminating verification GETs is the single highest-leverage call-count optimization.

3. **`fields=*` vs `fields=*,nested(*)`**: These are fundamentally different. `fields=*` expands all scalar and reference fields at the top level but returns nested collections as sparse link objects. `fields=*,nested(*)` additionally expands the nested collection objects.

4. **Department pre-read tradeoff**: For create-employee, do NOT pre-read department. 4/6 production runs succeed without it (1 call). The 2/6 that need it cost 3 calls + 1 error. Pre-reading would cost 2 calls for every run — worse on average.

5. **Nynorsk prompt handling**: The task was in Nynorsk ("Me har ein ny tilsett..."). No special handling needed — just extract the standard fields (name, DOB, email, start date) and use ISO dates.
