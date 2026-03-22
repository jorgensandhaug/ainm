# TASK OVERRIDE — Task 21: Onboard Employee from Offer Letter (Tilbudsbrev)

**You are running Task 21. The task is already identified. Do not classify.**

## What this task is

Onboard one new employee from a **tilbudsbrev** (offer letter) PDF attachment — NOT an arbeidskontrakt (employment contract). The PDF contains: name, job title, department, birth date, start date, employment form, percentage, annual salary, hours/day. It does NOT contain: Lønnstype, email, personnummer, bankkontonummer, or STYRK code.

**Task 21 vs Task 19:** Task 19 uses arbeidskontrakt (has Lønnstype, NIN, bank, email, STYRK). Task 21 uses tilbudsbrev (has job title instead of STYRK, no personal ID fields). Both use the same trusted standard.

## What to read and execute

1. **Read ONLY** `./trusted-standards/onboard-employee.md` — this is the complete, verified flow
2. **Immediately write and execute** a TypeScript script with `bun`. Do NOT read AGENTS.md, openapi.json, or playbooks.

## Check 5 — the 2-point gap (PRIMARY: documentArchive upload)

ALL task 21 runs score 12/14. Check 5 (2pt) ALWAYS fails. 15 total attempts by ALL participants — 0 passes. Leaderboard best = 2.5714.

**PRIMARY FIX — upload tilbudsbrev PDF to employee document archive:**
- `POST /documentArchive/employee/{empId}` (multipart/form-data, `file` field = original PDF)
- This endpoint exists, returns 201, sandbox-verified. NO production run has EVER used it.
- The tilbudsbrev IS the task — archiving it to the employee record is a natural onboarding step.
- **DO NOT SKIP THIS.** This is the strongest remaining hypothesis.

**SECONDARY FIX — set employeeNumber and employmentId:**
- `employeeNumber: "1"` on employee, `employmentId: "1"` on employment. API leaves these empty; UI auto-assigns.

## Full API flow (3-4 POSTs + free GETs)

```
Step 1 (parallel GETs — all free):
  GET /division?count=1&fields=id
  GET /department?name=<dept>&isInactive=false&count=1000&fields=*
  GET /salary/settings?fields=municipality
  (if job title NOT in hardcoded table): GET /employee/employment/occupationCode?nameNO=<title>&count=10&fields=id,nameNO

Step 2 (conditional — only if no exact department match):
  POST /department { name: "<dept>" }

Step 3 (POST with deep expansion):
  POST /employee?fields=*,employments(*,employmentDetails(*))
  Payload: see trusted standard. Key fields:
    remunerationType: "MONTHLY_WAGE"
    employmentType: "ORDINARY", workingHoursScheme: "NOT_SHIFT", employmentForm: "PERMANENT"
    employeeNumber: "1", employmentId: "1"
    occupationCode: { id: <from table> }
    payrollTaxMunicipalityId: { id: <from salary/settings> } (if available)
    NO email, NO NIN, NO bankAccountNumber (not in tilbudsbrev)

Step 4 (POST):
  POST /employee/standardTime { employee: { id }, fromDate: "<startDate>", hoursPerDay: <from PDF or 7.5> }

Step 5 (POST — multipart upload, CRITICAL for Check 5):
  POST /documentArchive/employee/<empId>  (FormData with file=<original tilbudsbrev PDF>)

Step 6 (parallel verification GETs — all free):
  GET /employee/<empId>?fields=*,department(*),employments(*,employmentDetails(*))
  GET /employee/standardTime?employeeId=<empId>&fields=*
  GET /documentArchive/employee/<empId>?fields=*
```

## Occupation code mapping (use id directly — skip API lookup)

| PDF says | id | Tripletex name |
|----------|-----|----------------|
| Salgssjef | 4930 | SALGSSJEF |
| Regnskapssjef | 4679 | REGNSKAPSSJEF |
| HR-rådgiver | 4169 | PERSONALRÅDGIVER |
| Seniorutvikler | 5935 | SYSTEMUTVIKLER |
| IT-konsulent | 2610 | IT-KONSULENT |
| Kontormedarbeider | 2951 | KONTORMEDARBEIDER |
| Markedsanalytiker | 3544 | MARKEDSANALYTIKER |

For titles NOT in this table: `GET /employee/employment/occupationCode?nameNO=<title>&count=10&fields=id,nameNO` — pick EXACT match, NOT the first result (substring search, alphabetically sorted).

## Known traps

- `occupationCode: { code: "..." }` silently stores null — ALWAYS use `{ id: <number> }`
- `department: { name: "..." }` on POST /employee → 422. Use `{ id }` from GET or POST
- Department: SEARCH first (`GET /department?name=X`), reuse if exists. POST-always → duplicate ID → Check 10 fails
- `nameNO=regnskapssjef&count=1` → returns KONSERNREGNSKAPSSJEF (wrong). Always scan for exact match
- `nameNO=seniorutvikler` → 0 results (doesn't exist). Use hardcoded table: 5935
- `nameNO=HR-rådgiver` → 0 results. Tripletex uses "personalrådgiver". Use hardcoded table: 4169
- Division: include ONLY if GET returns rows. Fresh accounts return 0 → omit entirely
- Deep expansion `employments(*,employmentDetails(*))` is required on POST — standard `employments(*)` returns stubs only
- payrollTaxMunicipalityId: DISPROVEN for task 21 Check 5 but STILL INCLUDE (fixes task 19, harmless here)
- Tilbudsbrev has NO email — do not fabricate one

## If the prompt doesn't match

If the incoming prompt is NOT about onboarding an employee from a tilbudsbrev/offer letter, or if the attachment is an arbeidskontrakt (has "Lønnstype", NIN, bank fields), say so and stop. Arbeidskontrakt = task 19, not task 21.
