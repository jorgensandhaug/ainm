# Onboard Employee

## Scope

Use for tasks like:
- onboard one new employee from an offer letter or prompt
- create the employee card
- attach one named department
- set up one employment with percentage and annual salary
- configure standard worktime in hours per day

Do not use for:
- simple create-employee prompts that only score identity fields plus start date
- payroll transaction runs
- updates to an existing employee

## Verified Findings

Persistent sandbox verification on 2026-03-21 showed:
- `POST /employee` accepts a nested `employmentDetails[]` row inside the nested employment create payload
- the nested write really persists the employment details; readback showed:
  - `employmentType=ORDINARY`
  - `employmentForm=PERMANENT`
  - `remunerationType=MONTHLY_WAGE`
  - `workingHoursScheme=NOT_SHIFT`
  - `percentageOfFullTimeEquivalent=100`
  - `annualSalary=590000`
- `POST /employee` still returned `employments[]` only as link objects, but that was enough to prove the employment row existed
- `POST /salary/settings/standardTime` persisted `hoursPerDay=7.5`
- the speculative shortcut `department: { "name": ... }` inside `POST /employee` failed with `422 department.id`
- the persistent sandbox still required one usable `division.id` on the employee create path

Production scoring feedback on 2026-03-21 for the analogous offer-letter onboarding run showed:
- the run finished with only `11/14` correctness after using:
  - `POST /department`
  - `POST /employee` without `division.id`
  - `POST /employee/employment/details`
  - `POST /salary/settings/standardTime`
- the likely miss was not missing salary/worktime endpoint support, but the missing complete employment relation on the employee write
- the separate `POST /employee/employment/details` did not buy correctness for the missing employment-link fields

## Minimal Safe Flow

1. Confirm this richer onboarding shape is not an exact match for the simpler `create-employee` standard
2. Resolve one usable business unit:
   - `GET /division?count=1&fields=*`
3. Create the target department:
   - `POST /department`
4. Create the employee with all employment configuration in one write:
   - `POST /employee`
   - include `department.id`
   - include `division.id`
   - include nested `employmentDetails[]`
5. Configure company standard worktime:
   - `POST /salary/settings/standardTime`
6. Stop after the successful writes

## Recommended Payload Shape

```json
{
  "firstName": "Knut",
  "lastName": "Vik",
  "dateOfBirth": "1996-07-22",
  "userType": "NO_ACCESS",
  "department": { "id": 12345 },
  "employments": [
    {
      "startDate": "2026-06-06",
      "division": { "id": 67890 },
      "employmentDetails": [
        {
          "employmentType": "ORDINARY",
          "employmentForm": "PERMANENT",
          "remunerationType": "MONTHLY_WAGE",
          "workingHoursScheme": "NOT_SHIFT",
          "percentageOfFullTimeEquivalent": 100,
          "annualSalary": 590000
        }
      ]
    }
  ]
}
```

Then write standard worktime separately:

```json
{
  "fromDate": "2026-06-06",
  "hoursPerDay": 7.5
}
```

## Why The Earlier Run Missed

- It optimized for low raw call count by reusing the simpler employee-create mindset
- That tradeoff spent a write on `POST /employee/employment/details` instead of spending one decisive read on `/division`
- For a full onboarding task, the employment relation itself is part of the scored state, so missing `division.id` is a more serious miss than splitting employment-details into a separate write
- The speculative nested-department shortcut is not the answer either; sandbox re-proof showed it fails with `422 department.id`

## Avoidable Mistakes

- Do not assume the simple `create-employee` standard covers onboarding prompts with salary/worktime configuration
- Do not spend a default `POST /employee/employment/details` when nested `employmentDetails` already fits the chosen create payload
- Do not omit `division.id` on this fuller onboarding shape just because simpler employee-create prompts can sometimes succeed without it
- Do not add a discovery `GET /department`; create the department directly when the prompt gives the exact name
- Do not hardcode sandbox-only default state such as current `7.5` standard time into the production playbook
