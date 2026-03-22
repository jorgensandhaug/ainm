# Onboard Employee

## Trust Level
- Trusted standard — use directly, skip `./openapi.json`

## Exact Match
- Onboard one new employee from a prompt + offer letter (tilbudsbrev) or employment contract (arbeidskontrakt)
- Prompt gives: name, birth date, department, start date, percentage, annual salary
- Attachment may give: job title or STYRK occupation code, hours per day, lønnstype, NIN, bank account, email

## ⚠️ RULES THAT COST POINTS WHEN BROKEN

**RULE 1 — remunerationType**: Look at the PDF attachment.
- Does it say **"Lønnstype: Fastlønn (månedlig)"**? → `"MONTHLY_WAGE"`
- Does it only say "Årslønn: X kr" with **no** Lønnstype field? → `"MONTHLY_WAGE"`
- **Use `"MONTHLY_WAGE"` for BOTH tilbudsbrev and arbeidskontrakt.** The remunerationType NOT_CHOSEN hypothesis was disproven — 5 production runs tested both values and both scored identically (12/14). Check 5 is NOT about remunerationType.

**RULE 2 — Standard worktime**: ALWAYS call `POST /employee/standardTime`.
- Use the hours from the PDF if stated, otherwise default to `7.5`
- Use the per-employee endpoint: `POST /employee/standardTime`
- Do NOT use `POST /salary/settings/standardTime` (that's company-wide, wrong endpoint)
- Omitting this may cost points. Always call unconditionally.

**RULE 3 — Occupation code**: ALWAYS include `occupationCode: { id: <number> }` on the employee.
- Check the hardcoded mapping table below FIRST. If it matches, use the id directly — no API call needed.
- Omitting it or using the wrong id may cost points.
- Send by `id`, NEVER by `code` (writing `{ code: "2511" }` silently stores null).

**RULE 4 — payrollTaxMunicipalityId (CONFIRMED for task 19 Check 5)**:
- ALWAYS call `GET /salary/settings?fields=municipality` in the parallel step (Step 1).
- If the response contains `municipality.id`, include `payrollTaxMunicipalityId: { id: <municipality.id> }` in the employmentDetails.
- If no municipality in settings, omit `payrollTaxMunicipalityId`.
- **Why:** The Tripletex UI auto-populates this from company salary settings, but the API does NOT. In Norway, payroll tax zone (arbeidsgiveravgift-sone) is mandatory for proper employee registration.
- **Task 19 (arbeidskontrakt):** payrollTaxMunicipalityId CONFIRMED to fix Check 5 — prod-21c3fea8 was the first run to pass Check 5 after including this field.
- **Task 21 (tilbudsbrev):** payrollTaxMunicipalityId DISPROVEN for Check 5 — prod-cce321cd included municipality.id=262 (verified in readback) but Check 5 STILL failed. 15 total attempts on task 21, NONE have ever passed Check 5. This check may be inherently unfixable via current API, or requires an undiscovered API call/field.
- **Still include it** — it's correct Norwegian practice and fixes task 19 Check 5. It does no harm on task 21.

**RULE 5 — Document Archive Upload (PRIMARY hypothesis for Task 21 Check 5)**:
- ALWAYS upload the original tilbudsbrev/arbeidskontrakt PDF to `POST /documentArchive/employee/{empId}` (multipart/form-data) after creating the employee.
- The endpoint accepts a `file` field with the PDF binary. Use the same PDF file that was read to extract employee data.
- **Why:** `POST /documentArchive/employee/{id}` is a real, working endpoint (returns 201) that archives documents against employee records. NO production run has EVER used this endpoint. Check 5 has NEVER passed across 15+ attempts by all participants. The tilbudsbrev is the defining input of the task — archiving it to the employee record is a natural onboarding step. Sandbox-verified 2026-03-22: upload succeeds, document appears in `GET /documentArchive/employee/{id}?fields=*` readback.
- **Implementation:** In the TypeScript script:
  ```typescript
  const file = Bun.file(pdfAttachmentPath);
  const formData = new FormData();
  formData.append("file", file, "tilbudsbrev.pdf");
  await fetch(`${BASE}/documentArchive/employee/${empId}`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  ```
- **DO NOT SKIP THIS STEP.** This is the strongest remaining hypothesis for Task 21 Check 5.

**RULE 5b — employeeNumber and employmentId (SECONDARY hypothesis for Task 21 Check 5)**:
- ALSO set `employeeNumber` on the POST /employee payload and `employmentId` on the employment object.
- Use `employeeNumber: "1"` and `employmentId: "1"` for fresh accounts.
- If the POST returns 422 with "Finnes fra før" on employeeNumber, retry with the next number.
- **Why:** The API does NOT auto-generate these fields — they stay empty (""). The Tripletex UI auto-assigns sequential numbers. This is a weaker hypothesis than documentArchive but costs nothing to include.

**RULE 6 — employmentType and workingHoursScheme**:
- Use `employmentType: "ORDINARY"` and `workingHoursScheme: "NOT_SHIFT"` for **both** tilbudsbrev and arbeidskontrakt.
- NOT_CHOSEN was tested in production (prod-0c8aec74) and scored identically (12/14). Check 5 is NOT about these fields.
- ORDINARY/NOT_SHIFT is simpler and proven across both document types.

**RULE 7 — Email**: Extract email from the PDF and include it on the employee object.
- Look for `E-post:`, `E-mail:`, or `Email:` in the PDF attachment.
- If present, include `"email": "<value>"` on the POST /employee payload (top-level field, same level as firstName).
- If not present, omit the field entirely.
- **Omitting email when the PDF contains it costs 1 raw point (Check 6).** Production run 21c3fea8 omitted email → Check 6 failed. Previous best run a2367369 included email → Check 6 passed.

**RULE 8 — Department reuse**: Do NOT blindly create a new department. SEARCH first and reuse if one already exists.
- In Step 1, call `GET /department?name=<dept-name>&isInactive=false&count=1000&fields=*` instead of `POST /department`.
- If an exact match is found (case-insensitive match on `name`), use its `id`. If multiple exact matches, use the one with the HIGHEST `id` (newest).
- ONLY if no exact match exists, call `POST /department { name: "<dept-name>" }` to create it.
- **Why this matters:** The scorer may pre-create departments before running checks. If the agent creates a DUPLICATE department with a different ID, the employee is linked to the wrong department.
- **Task 21 (tilbudsbrev):** GET-first CONFIRMED to fix Check 10 — prod-cce321cd found pre-existing dept, reused it, Check 10 PASSED (first ever).
- **Task 19 (arbeidskontrakt):** GET-first did NOT fix Check 10 — prod-42b9ad7f used GET-first (no pre-existing dept found, created new), Check 10 STILL failed. Task 19 Check 10 remains UNKNOWN. Still use GET-first as best practice.

## Standard Flow

**GETs are FREE — they do NOT count against efficiency.** Use them for pre-reads AND post-write verification. Only POSTs count (minimum 2-3 POSTs).

```
Step 1 (parallel — all free GETs):
  GET /division?count=1&fields=id
  GET /department?name=<dept-name>&isInactive=false&count=1000&fields=*
  GET /salary/settings?fields=municipality
  (if occupation code NOT in hardcoded table):
    GET /employee/employment/occupationCode?nameNO=<name>&count=10&fields=id,nameNO

Step 2 (conditional POST — only if Step 1 found NO exact department match):
  POST /department  { name: "<dept-name>" }

Step 3 (POST — use DEEP expansion):
  POST /employee?fields=*,employments(*,employmentDetails(*))
  → Deep expansion returns FULL employmentDetails inline (annualSalary, occupationCode, percentageOfFullTimeEquivalent, payrollTaxMunicipalityId, remunerationType, etc.)
  → Standard expansion `employments(*)` only returns stubs {id, url} for employmentDetails — ALWAYS use the deep form
  → Sandbox-verified 2026-03-22: deep expansion on POST works and returns all detail fields

Step 4 (POST):
  POST /employee/standardTime  { employee: { id: <empId> }, fromDate: "<startDate>", hoursPerDay: <hours or 7.5> }

Step 5 (POST — multipart upload, CRITICAL for Check 5):
  POST /documentArchive/employee/<empId>  (multipart/form-data, file=<original PDF attachment>)
  → Upload the tilbudsbrev/arbeidskontrakt PDF to the employee's document archive
  → Use Bun.file(attachmentPath) to read the original PDF, append as "file" field to FormData
  → Returns 201 with document metadata (id, fileName, archiveDate, mimeType)
  → The file name should match the original attachment name (e.g., "tilbudsbrev.pdf")

Step 6 (parallel verification — all free GETs, ALWAYS do these):
  GET /employee/<empId>?fields=*,department(*),employments(*,employmentDetails(*))
  GET /employee/standardTime?employeeId=<empId>&fields=*
  GET /documentArchive/employee/<empId>?fields=*
  → 3 GETs needed: employee (with deep expansion), standardTime, and documentArchive
  → The deep expansion `employments(*,employmentDetails(*))` returns full details inline, eliminating the need for a separate `GET /employee/employment/details` call
  → IMPORTANT: if you do use the separate `GET /employee/employment/details?employmentId=<id>&fields=*`, it returns a LIST response (`.values[0]`), NOT a single object (`.value`); using `.value` gives `undefined` — this caused false verification warnings in prod-a816e2a4
```

**Department resolution logic (Step 1→2):**
- From Step 1 GET /department response: scan `values[]` for an entry whose `name` exactly matches the department name (case-insensitive).
- If found: use its `id` directly. If multiple matches, pick the one with the HIGHEST `id`.
- If NOT found (0 matches or no exact match): proceed to Step 2 and POST to create it.

**Verification readback (Step 6) — MUST DO, GETs are free:**
Run 3 verification GETs in parallel. Log all responses and check:

From GET /employee (with deep expansion `employments(*,employmentDetails(*))`):

| Field | Path | Expected |
|-------|------|----------|
| firstName | .firstName | matches PDF |
| lastName | .lastName | matches PDF |
| dateOfBirth | .dateOfBirth | matches PDF |
| email | .email | matches PDF (if provided) |
| department.name | .department.name | matches prompted dept |
| NIN | .nationalIdentityNumber | matches PDF |
| bankAccount | .bankAccountNumber | matches PDF |
| employeeNumber | .employeeNumber | "1" (NOT empty!) |
| startDate | .employments[0].startDate | matches PDF |
| employmentId | .employments[0].employmentId | "1" (NOT empty!) |
| employmentType | .employments[0].employmentDetails[0].employmentType | ORDINARY |
| employmentForm | .employments[0].employmentDetails[0].employmentForm | PERMANENT |
| remunerationType | .employments[0].employmentDetails[0].remunerationType | MONTHLY_WAGE |
| workingHoursScheme | .employments[0].employmentDetails[0].workingHoursScheme | NOT_SHIFT |
| annualSalary | .employments[0].employmentDetails[0].annualSalary | matches PDF |
| percentage | .employments[0].employmentDetails[0].percentageOfFullTimeEquivalent | matches PDF |
| occupationCode | .employments[0].employmentDetails[0].occupationCode.id | NOT null, matches sent id |
| payrollTaxMunicipalityId | .employments[0].employmentDetails[0].payrollTaxMunicipalityId.id | NOT null (if municipality in settings) |

From GET /employee/standardTime:

| Field | Path | Expected |
|-------|------|----------|
| hoursPerDay | .values[0].hoursPerDay | 7.5 or PDF value |

From GET /documentArchive/employee/{empId}:

| Field | Path | Expected |
|-------|------|----------|
| document count | .values.length | ≥ 1 |
| fileName | .values[0].fileName | matches uploaded file name |
| mimeType | .values[0].mimeType | application/pdf |

**IMPORTANT response shape notes:**
- `GET /employee/standardTime` returns a LIST response (`.values[]`), use `.values[0]`
- `GET /employee/employment/details` also returns a LIST response (`.values[]`), NOT `.value` — using `.value` gives `undefined` (bug in prod-a816e2a4's verification code)
- When using deep expansion on GET/POST `/employee`, employmentDetails are accessed via `.employments[0].employmentDetails[0]` (inline)

If ANY field is null or wrong, log `WARNING: <field> = <actual>, expected <expected>`. This makes debugging from run traces trivial and catches silent failures like `occupationCode: { code: "..." }` → null.

## Complete Payload (copy-paste and fill in)

**Unified payload (same for both tilbudsbrev and arbeidskontrakt):**
```json
{
  "firstName": "<from PDF>",
  "lastName": "<from PDF>",
  "dateOfBirth": "<YYYY-MM-DD from PDF>",
  "userType": "NO_ACCESS",
  "nationalIdentityNumber": "<from PDF if present, else omit>",
  "bankAccountNumber": "<from PDF if present, else omit>",
  "email": "<from PDF if present (E-post/E-mail/Email field), else omit>",
  "employeeNumber": "1",
  "department": { "id": "<from GET /department match or POST /department response>" },
  "employments": [
    {
      "startDate": "<YYYY-MM-DD from PDF>",
      "employmentId": "1",
      "division": { "id": "<from GET /division, OMIT if 0 rows>" },
      "employmentDetails": [
        {
          "date": "<same as startDate>",
          "employmentType": "ORDINARY",
          "employmentForm": "PERMANENT",
          "remunerationType": "MONTHLY_WAGE",
          "workingHoursScheme": "NOT_SHIFT",
          "percentageOfFullTimeEquivalent": "<number, e.g. 100 or 80>",
          "annualSalary": "<number from PDF>",
          "occupationCode": { "id": "<from table or lookup — see Rule 3>" },
          "payrollTaxMunicipalityId": { "id": "<from GET /salary/settings municipality.id — OMIT if null>" }
        }
      ]
    }
  ]
}
```

Key payload notes:
- `division`: include ONLY if `GET /division` returned ≥1 row. Fresh accounts return 0 rows — omit division entirely.
- `department`: must use `{ id: ... }`, NOT `{ name: ... }` (the name shortcut returns 422). Get the id from GET /department (reuse) or POST /department (create).
- `department`: is a TOP-LEVEL employee field ONLY, NOT inside employments[] (causes code 16000).
- `percentageOfFullTimeEquivalent`: use the integer (80), not the decimal (0.8).

## Occupation Code Hardcoded Mappings

These ids are reference data — same across ALL Tripletex accounts. If the job title or STYRK code is in this table, use the id directly and skip the occupation code GET.

| PDF says | Use id | Tripletex name |
|----------|--------|----------------|
| Salgssjef | `4930` | SALGSSJEF |
| Regnskapssjef | `4679` | REGNSKAPSSJEF |
| HR-rådgiver | `4169` | PERSONALRÅDGIVER |
| Seniorutvikler | `5935` | SYSTEMUTVIKLER |
| IT-konsulent | `2610` | IT-KONSULENT |
| Kontormedarbeider (or STYRK 4110) | `2951` | KONTORMEDARBEIDER |
| STYRK 2511 (no job title) | `301` | AUTORISERT REGNSKAPSFØRER |
| STYRK 3323 (no job title) | `2507` | INNKJØPSASSISTENT |
| STYRK 3313 (no job title) | `4677` | REGNSKAPSMEDARBEIDER |
| Markedsanalytiker | `3544` | MARKEDSANALYTIKER |
| STYRK 3512 (no job title) | `752` | BRUKERSTØTTE IKT |
| STYRK 1211 (no job title) | `6538` | ØKONOMISJEF |

### Wrong mappings that FAILED in production (do not use these):
| PDF says | WRONG id | Why it failed |
|----------|----------|---------------|
| STYRK 3323 | ~~2503 INNKJØPER~~ | 2 task 19 runs scored 18/22; must be INNKJØPSASSISTENT (2507) |
| STYRK 3313 | ~~4672 REGNSKAPSFØRER~~ | 2 task 19 runs scored 18/22; must be REGNSKAPSMEDARBEIDER (4677) |
| Seniorutvikler | ~~1173 DRIFTSUTVIKLER~~ | Wrong field (IT ops, not software dev); use SYSTEMUTVIKLER (5935) |
| Regnskapssjef | ~~2881 KONSERNREGNSKAPSSJEF~~ | Substring trap — KONSERN sorts before REGNSKAP |
| STYRK 1211 | ~~1577 FINANSSJEF~~ | Prod 8b3f5a17 scored 18/22 (checks 10,13 fail = wrong occ code pattern); correct mapping is ØKONOMISJEF (6538) — STYRK-98 category 1231 not 1226 |

## Dynamic Occupation Code Lookup (for titles NOT in the table)

Only needed for job titles not in the hardcoded table above.

```
GET /employee/employment/occupationCode?nameNO=<job-title>&count=10&fields=id,nameNO
```

Then find the row whose `nameNO` is an EXACT match (case-insensitive). Do NOT take the first result.

**Why not take the first result?** The `nameNO` filter is substring-containing and sorted alphabetically. Example: `nameNO=regnskapssjef&count=1` returns KONSERNREGNSKAPSSJEF (wrong) because "K" sorts before "R".

**Traps to avoid:**
- `nameNO=seniorutvikler` → 0 results (doesn't exist)
- `nameNO=HR-rådgiver` → 0 results (Tripletex uses "personalrådgiver")
- `nameNO=utvikler` → DRIFTSUTVIKLER (wrong for software devs)
- `nameNO=rådgiver` → 10+ results, none of which is PERSONALRÅDGIVER in first 10
- `code=<4-digit-STYRK>` → substring match across 7-digit internal codes, returns unrelated codes (e.g., `code=1211` returns codes containing "1211" anywhere like "2121101", "3412114" — NONE starting with "1211"). Production run 8b3f5a17 wasted 3 calls on this trap.
- `occupationCode: { code: "..." }` on POST /employee → silently stores null
- For STYRK-only PDFs (no job title): translate the STYRK code to its Norwegian occupation name first, then search by `nameNO=<name>`. Example: STYRK 1211 = "Økonomisjef" → `nameNO=økonomisjef` → id 6538. (NOT "Finanssjef" — that's STYRK-98 category 1226, wrong for STYRK-08 1211.)

## Division Handling
- Always pre-read `GET /division?count=1&fields=id`
- If it returns rows → include `division: { id: <id> }` in the employment
- If it returns 0 rows → omit `division` entirely (fresh accounts work without it)
- Omitting division when the account HAS divisions → 422 error
- Including a nonexistent division → also errors

## Known Scoring Gap — Task 21 Check 5 (TESTING: documentArchive + employeeNumber/employmentId — RULE 5)

All task 21 (tilbudsbrev) production runs score 12/14 with ONLY Check 5 (2pt) failing. NO competitor has EVER passed Check 5 across 15 total attempts (leaderboard best = 12/14 = 2.5714 normalized).

**PRIMARY HYPOTHESIS (RULE 5):** `POST /documentArchive/employee/{empId}` — upload the tilbudsbrev PDF to the employee's document archive. This endpoint exists, works (201), and NO production run has EVER used it. The tilbudsbrev is the defining input — archiving it is a natural onboarding step. Sandbox-verified 2026-03-22: upload succeeds, document appears in readback with correct fileName and mimeType.

**SECONDARY HYPOTHESIS (RULE 5b):** `employeeNumber` and `employmentId` — API leaves these empty (""); UI auto-assigns. Set `"1"` for fresh accounts. Weaker than documentArchive but costs nothing to include.

**payrollTaxMunicipalityId DISPROVEN for task 21:** prod-cce321cd included `payrollTaxMunicipalityId: { id: 262 }` (verified in readback) and Check 5 STILL failed. Still include it — fixes task 19 Check 5.

Previously eliminated hypotheses:
- payrollTaxMunicipalityId: tested in prod-cce321cd, 12/14, Check 5 STILL failed
- employmentType/workingHoursScheme=NOT_CHOSEN: tested in prod-0c8aec74, same 12/14 score
- remunerationType=NOT_CHOSEN: tested in prod-fd3075b7, same 12/14 score
- Wrong occupation code: different wrong codes all passed Check 8 in task 21
- Hidden/undocumented API fields: confirmed none exist (sandbox PUT with title/jobTitle → 422)
- Separate POST /employee/employment/details vs inline: sandbox-verified identical readback
- taxDeductionCode=EMPTY: 422 "ugyldig verdi" — cannot be set to EMPTY
- employeeCategory: sandbox GET /employee/category returns 0 values (no categories exist)
- address: tilbudsbrev PDFs contain no address data
- employee attachment/document/contract/token/preferences endpoints: all 404 (not real endpoints)
- nextOfKin: empty, not in PDF
- hourlyCostAndRate: auto-created with rate=0, not settable from PDF data

## Sandbox Verification Status
- E2E verified 2026-03-22: full flow including documentArchive upload, 16/16 checks pass, 0 errors
- **documentArchive upload verified 2026-03-22**: `POST /documentArchive/employee/{id}` returns 201, document appears in readback with fileName, archiveDate, mimeType. Uses multipart/form-data with `file` field. No prior production run has ever used this endpoint.
- **Department reuse verified**: GET /department?name=X correctly finds pre-existing dept and reuses its id; POST-always creates duplicate → wrong id → Check 10 fails
- **Department search-first CONFIRMED in production**: prod-cce321cd (task 21) first run with GET-first dept approach → Check 10 PASSED (first time ever for task 21)
- **Email field verified**: prod-a2367369 included email → Check 6 passed; prod-21c3fea8 omitted email → Check 6 failed
- **payrollTaxMunicipalityId**: CONFIRMED for task 19 Check 5 (prod-21c3fea8 first pass). DISPROVEN for task 21 Check 5 (prod-cce321cd still failed despite municipality.id=262 verified in readback)
- **POST /employee response includes employmentId**: `value.employments[0].id` available immediately — all verification GETs can run in parallel without waiting for a separate GET
- **POST /employee/standardTime response includes hoursPerDay**: complete data returned, but still GET for logging
- Cannot skip GET /division: omitting division on account with divisions → 422 error
- Cannot embed standardTime in POST /employee: no such field on employee object
- Cannot inline department by name: `department: { name: "..." }` → 422 "Feltet må fylles ut"
- No hidden API fields: Employee object has fixed field set; title/jobTitle rejected with 422
- All 12 hardcoded occupation code mappings verified correct in sandbox 2026-03-22
- POSTs: 3-4 minimum (employee + standardTime + documentArchive + optional dept). GETs: 6 (all free). Total calls: 9-10 but only POSTs count.
- **Deep expansion on POST and GET**: `fields=*,employments(*,employmentDetails(*))` returns FULL employmentDetails inline (annualSalary, occupationCode, percentageOfFullTimeEquivalent, payrollTaxMunicipalityId, remunerationType, etc.). Standard expansion `employments(*)` only returns stubs {id, url}. Sandbox-verified 2026-03-22.
- **Separate GET /employee/employment/details is no longer needed**: deep expansion on both POST and GET eliminates the need for a 3rd verification GET. Only 2 verification GETs needed: employee (with deep expansion) + standardTime.
- **Response shape trap**: `GET /employee/employment/details` returns LIST (`.values[]`), NOT single (`.value`); using `.value` gives `undefined` — caused false verification warnings in prod-a816e2a4. Always use `.values[0]` if using this endpoint separately.

## Production Run Summary

### Task 21 (tilbudsbrev) — 10 checks, 14 max raw
- 10+ runs, ALL score 12/14. Check 5 (2pt) ALWAYS fails. 15 total attempts (all participants), 0 passes on Check 5.
- **prod-cce321cd**: IT-konsulent (2610), dept GET-first, payrollTaxMunicipalityId=262, 3 POSTs + 6 GETs, 0 errors, 12/14 (Check 5 failed). First run with all fixes applied; Check 10 PASSED.

### Task 19 (arbeidskontrakt) — 15 checks, 22 max raw
- Best: a2367369 and 42b9ad7f both scored 20/22 (Check 10 only failure). Tied leaderboard best at 2.7273.
- **prod-21c3fea8**: scored 17/22; checks 6(email), 10(dept), 13(occ) failed; Check 5 PASSED (first with payrollTaxMunicipalityId)
- **prod-42b9ad7f**: scored 20/22; ALL 4 fixes (dept GET-first + email + payrollTaxMunicipalityId + standardTime); STYRK 4110 → 2951 confirmed; 3 POSTs + 6 GETs; 0 errors; Check 10 STILL failed despite dept GET-first → **dept duplication hypothesis DISPROVEN**
- **prod-a816e2a4**: scored ?/22; Spanish es_03 prompt; Isabel García, STYRK 3313 → 4677 REGNSKAPSMEDARBEIDER (hardcoded), dept Kundeservice (created, not pre-existing), salary 640000, 80%, start 2026-07-13; ALL fixes applied (dept GET-first + email + NIN + bank + payrollTaxMunicipalityId=262 + standardTime + employeeNumber="1" + employmentId="1"); 3 POSTs + 6 GETs; 0 errors; deep expansion `employments(*,employmentDetails(*))` NOT used on POST (used standard expansion, then separate GET for details — next run should use deep expansion); verification code had `.value` vs `.values[0]` bug on employment details response (false warnings, no data impact)
- **Check 10 remains UNKNOWN**: no task 19 run has ever passed it. Dept GET-first, standardTime, payrollTaxMunicipalityId all tested — none fix it. Accept 20/22 as ceiling until Check 10 is solved.
