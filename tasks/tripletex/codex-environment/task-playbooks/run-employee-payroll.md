# Run Employee Payroll

## Scope

Use for tasks like:
- run payroll for one existing employee for a specific month
- the prompt gives the employee identity, usually email and/or name
- the prompt gives one or more salary amounts such as base salary, bonus, or other manual pay lines
- the task is to create the payroll transaction, not to create the employee from scratch

Do not use for:
- employee-creation tasks
- payment-registration tasks after invoice creation
- travel-expense reimbursement flows

## Verified Findings

Production failure analysis on 2026-03-20 showed:
- `POST /salary/transaction` with manual `payslips[].specifications[]` is the correct write family for this task shape
- a target employee with `dateOfBirth=null` and no employments is not payroll-ready
- the write failed with `422` and validation message:
  - `employee: Ansatt nr.  er ikke registrert med et arbeidsforhold i perioden.`
- trying to repair that target with `POST /employee/employment` then failed because the employee still lacked required personal data:
  - `employee.dateOfBirth: Feltet må fylles ut.`
- therefore the original run should not have guessed missing personal data or continued into payroll writes after one decisive prerequisite read

Persistent-sandbox verification on 2026-03-20 proved the successful path:
- `POST /salary/transaction` succeeded with embedded manual payslip specifications for `Fastlønn` and `Bonus`
- the successful sandbox setup required an employee that was payroll-ready before the salary write:
  - `dateOfBirth` present
  - employment active in the payroll period
  - employment details present
  - employment linked to a real business/`division`
- the salary write failed with `422 department: Selskapet har ikke aktivert avdelingsregnskap.` when `department` was included in the salary payload in an account without department accounting
- after omitting `department` from the salary payload, the flow succeeded
- one immediate `GET /salary/transaction/{id}?fields=*` returned the created payslip id
- one immediate `GET /salary/payslip/{id}?fields=*` then verified:
  - `grossAmount=55200`
  - `amount=55200`
  - `specifications.length=2`

## Minimal Safe Flow

1. Confirm these operations in `./openapi.json`
   - `GET /employee`
   - `GET /salary/type`
   - `POST /salary/transaction`
   - optional verification:
     - `GET /salary/transaction/{id}`
     - `GET /salary/payslip/{id}`
2. Resolve the employee with one decisive read
   - usually `GET /employee?email=<email>&count=10&fields=*`
   - exact-match the email locally because the API filter is containing, not exact
3. Check payroll prerequisites from that same employee object before any salary write
   - `dateOfBirth` must be present
   - `employments` must contain at least one employment that covers the requested payroll period
4. If those prerequisites are missing and the prompt does not provide the missing personal/payroll-setup facts needed to repair them, stop and treat the run as blocked
   - do not invent `dateOfBirth`
   - do not invent business/sub-entity registration data
5. Resolve salary types with one read
   - `GET /salary/type?count=1000&fields=*`
   - exact-match the needed type names locally, typically `Fastlønn` and `Bonus`
6. Create the payroll transaction
   - `POST /salary/transaction`
   - include:
     - `date`
     - `year`
     - `month`
     - `paySlipsAvailableDate`
     - one `payslips[]` entry for the target employee
     - embedded manual `specifications[]` entries for the requested salary lines
7. Reuse the write response first
   - keep the returned transaction id
8. If the write response is too sparse for proof, do one immediate verification branch
   - `GET /salary/transaction/{id}?fields=*`
   - take the returned payslip id
   - `GET /salary/payslip/{payslipId}?fields=*`

## Recommended Payload Shape

Resolve the salary type ids first, then send:

```json
{
  "date": "2026-03-20",
  "year": 2026,
  "month": 3,
  "paySlipsAvailableDate": "2026-03-20",
  "payslips": [
    {
      "employee": { "id": 12345 },
      "date": "2026-03-20",
      "year": 2026,
      "month": 3,
      "specifications": [
        {
          "employee": { "id": 12345 },
          "salaryType": { "id": 69031179 },
          "description": "Fastlønn mars 2026",
          "year": 2026,
          "month": 3,
          "count": 1,
          "rate": 42350,
          "amount": 42350
        },
        {
          "employee": { "id": 12345 },
          "salaryType": { "id": 69031348 },
          "description": "Bonus mars 2026",
          "year": 2026,
          "month": 3,
          "count": 1,
          "rate": 12850,
          "amount": 12850
        }
      ]
    }
  ]
}
```

Replace the ids and amounts with the task-specific values.

## Exact-Match Fast Path

- For a prompt that:
  - identifies one existing employee by email
  - asks to run payroll for one month
  - gives a base salary and one bonus amount
- the winning flow is usually:
  1. `GET /employee?email=...&count=10&fields=*`
  2. `GET /salary/type?count=1000&fields=*`
  3. `POST /salary/transaction`
- only add the verification branch if the write response does not already prove the created payroll transaction strongly enough
- only branch into payroll-prerequisite repair if the prompt actually supplies the missing repair data

## Payroll Prerequisite Trap

- Do not assume every existing employee is payroll-ready
- Before the salary write, the employee must already have the payroll prerequisites needed by the account configuration
- Missing prerequisites can surface as employee-level validation errors on `POST /salary/transaction`, such as:
  - missing employment in the period
  - missing `dateOfBirth` when trying to create the needed employment
  - missing business linkage for the employment
- If the prompt does not provide the missing personal or business-registration data, do not guess them

## Department Trap

- Do not automatically copy the employee's department into the salary payload
- In accounts without department accounting, `POST /salary/transaction` fails with:
  - `department: Selskapet har ikke aktivert avdelingsregnskap.`
- Only include `department` on payslips/specifications when the account configuration clearly supports it or the prompt explicitly requires it

## Verification Shape

- `POST /salary/transaction`
  - expect `ResponseWrapperSalaryTransaction`
  - keep the returned transaction id
- `GET /salary/transaction/{id}?fields=*`
  - expect the created `payslips[]` ids
- `GET /salary/payslip/{id}?fields=*`
  - can verify:
    - `grossAmount`
    - `amount`
    - `specifications.length`

## Avoidable Mistakes

- Do not jump straight to `POST /salary/transaction` without first checking whether the target employee is payroll-ready
- Do not invent `dateOfBirth` for an existing employee when the prompt never supplied it
- Do not guess a business/sub-entity setup just because payroll validation mentions `virksomhet`
- Do not include `department` blindly in the salary payload
- Do not widen into generic salary browsing when `GET /employee` already proves the task is blocked on missing prerequisites
