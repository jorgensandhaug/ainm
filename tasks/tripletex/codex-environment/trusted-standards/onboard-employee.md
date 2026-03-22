# Onboard Employee

## Trust Level
- Trusted standard — use directly, skip `./openapi.json`

## Exact Match
- Onboard one new employee from a prompt + offer letter (tilbudsbrev) or employment contract (arbeidskontrakt)
- Prompt gives: name, birth date, department, start date, percentage, annual salary
- Attachment may give: job title or STYRK occupation code, hours per day, lønnstype, NIN, bank account

## ⚠️ RULES THAT COST POINTS WHEN BROKEN

**RULE 1 — remunerationType**: Look at the PDF attachment.
- Does it say **"Lønnstype: Fastlønn (månedlig)"**? → `"MONTHLY_WAGE"`
- Does it only say "Årslønn: X kr" with **no** Lønnstype field? → `"MONTHLY_WAGE"`
- **Use `"MONTHLY_WAGE"` for BOTH tilbudsbrev and arbeidskontrakt.** The remunerationType NOT_CHOSEN hypothesis was disproven — 5 production runs tested both values and both scored identically (12/14). Check 5 is NOT about remunerationType.

**RULE 2 — Standard worktime**: ALWAYS call `POST /employee/standardTime`.
- Use the hours from the PDF if stated, otherwise default to `7.5`
- Use the per-employee endpoint: `POST /employee/standardTime`
- Do NOT use `POST /salary/settings/standardTime` (that's company-wide, wrong endpoint)
- Omitting this costs 2 raw points even when the PDF doesn't mention hours.

**RULE 3 — Occupation code**: ALWAYS include `occupationCode: { id: <number> }` on the employee.
- Check the hardcoded mapping table below FIRST. If it matches, use the id directly — no API call needed.
- Omitting it or using the wrong id may cost points.
- Send by `id`, NEVER by `code` (writing `{ code: "2511" }` silently stores null).

**RULE 4 — employmentType and workingHoursScheme**:
- Use `employmentType: "ORDINARY"` and `workingHoursScheme: "NOT_SHIFT"` for **both** tilbudsbrev and arbeidskontrakt.
- NOT_CHOSEN was tested in production (prod-0c8aec74) and scored identically (12/14). Check 5 is NOT about these fields.
- ORDINARY/NOT_SHIFT is simpler and proven across both document types.

## Standard Flow (4 calls when hardcoded, 5 when dynamic lookup needed)

```
Step 1 (parallel):
  GET /division?count=1&fields=id
  POST /department  { name: "<from prompt>" }
  (if occupation code NOT in hardcoded table):
    GET /employee/employment/occupationCode?nameNO=<name>&count=10&fields=id,nameNO

Step 2:
  POST /employee    (see unified payload below)

Step 3:
  POST /employee/standardTime  { employee: { id: <empId> }, fromDate: "<startDate>", hoursPerDay: <hours or 7.5> }

Step 4:
  Stop. No verification GETs needed.
```

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
  "department": { "id": "<from POST /department response>" },
  "employments": [
    {
      "startDate": "<YYYY-MM-DD from PDF>",
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
          "occupationCode": { "id": "<from table or lookup — see Rule 3>" }
        }
      ]
    }
  ]
}
```

Key payload notes:
- `division`: include ONLY if `GET /division` returned ≥1 row. Fresh accounts return 0 rows — omit division entirely.
- `department`: must use `{ id: ... }`, NOT `{ name: ... }` (the name shortcut returns 422).
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
| STYRK 1211 (no job title) / Finanssjef | `1577` | FINANSSJEF |

### Wrong mappings that FAILED in production (do not use these):
| PDF says | WRONG id | Why it failed |
|----------|----------|---------------|
| STYRK 3323 | ~~2503 INNKJØPER~~ | 2 task 19 runs scored 18/22; must be INNKJØPSASSISTENT (2507) |
| STYRK 3313 | ~~4672 REGNSKAPSFØRER~~ | 2 task 19 runs scored 18/22; must be REGNSKAPSMEDARBEIDER (4677) |
| Seniorutvikler | ~~1173 DRIFTSUTVIKLER~~ | Wrong field (IT ops, not software dev); use SYSTEMUTVIKLER (5935) |
| Regnskapssjef | ~~2881 KONSERNREGNSKAPSSJEF~~ | Substring trap — KONSERN sorts before REGNSKAP |

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
- For STYRK-only PDFs (no job title): translate the STYRK code to its Norwegian occupation name first, then search by `nameNO=<name>`. Example: STYRK 1211 = "Finanssjef" → `nameNO=finanssjef` → id 1577.

## Division Handling
- Always pre-read `GET /division?count=1&fields=id`
- If it returns rows → include `division: { id: <id> }` in the employment
- If it returns 0 rows → omit `division` entirely (fresh accounts work without it)
- Omitting division when the account HAS divisions → 422 error
- Including a nonexistent division → also errors

## Known Scoring Gap — Task 21 Check 5 (UNSOLVED — 2pt, never passed)

All 9 task 21 (tilbudsbrev) production runs score 12/14 with ONLY Check 5 (2pt) failing. No competitor has EVER passed Check 5 across 14 total attempts (leaderboard best = 12/14 = 2.5714 normalized).

**Check 5 is NOT about employmentType/workingHoursScheme/remunerationType.** All tested values produce identical 12/14.

Eliminated hypotheses:
- employmentType/workingHoursScheme=NOT_CHOSEN: tested in prod-0c8aec74, same 12/14 score
- remunerationType=NOT_CHOSEN: tested in prod-fd3075b7, same 12/14 score
- Wrong occupation code: different wrong codes all passed Check 8 in task 21
- Hidden/undocumented API fields: confirmed none exist (sandbox PUT with title/jobTitle → 422)
- Missing PDF fields: all tilbudsbrev variants have identical structure; all fields are correctly stored
- Separate POST /employee/employment/details vs inline: sandbox-verified identical readback (2026-03-22)
- taxDeductionCode=EMPTY: 422 "ugyldig verdi" — cannot be set to EMPTY

Remaining hypotheses to investigate:
- employeeNumber (auto-generated vs explicit)
- employeeCategory (currently null)
- payrollTaxMunicipalityId (currently null)
- Some undiscovered field or additional API step
- Possible that Check 5 is inherently unfixable for fresh accounts (e.g., requires data that doesn't exist on new accounts)

## Sandbox Verification Status
- E2E verified 2026-03-22: production-faithful scenarios pass sandbox assertions, 4 calls, 0 errors
- NOT_CHOSEN hypothesis: sandbox-verified as accepted by API, but DISPROVEN in production (prod-0c8aec74, same 12/14)
- Separate POST details vs inline: sandbox-verified identical readback — no difference
- Cannot skip GET /division: omitting division on account with divisions → 422 error
- Cannot embed standardTime in POST /employee: no such field on employee object
- No hidden API fields: Employee object has fixed field set; title/jobTitle rejected with 422
- All 12 hardcoded occupation code mappings verified correct in sandbox 2026-03-22
- STYRK 1211 → FINANSSJEF (id 1577) sandbox-verified 2026-03-22 (emp 18738021); Tripletex code=1226119; no Tripletex codes start with "1211"
- 9 task 21 production runs; all score 12/14 with 4 calls, 0 errors
- Best task 19 (arbeidskontrakt) run: a2367369 scored 20/22 (only Check 10 failed = missing standardTime)
- 4 calls is the proven minimum: GET /division + POST /department (parallel) → POST /employee → POST /employee/standardTime
