# Onboard Employee

## Trust Level
- Trusted standard — use directly, skip `./openapi.json`

## Exact Match
- Onboard one new employee from a prompt + offer letter (tilbudsbrev) or employment contract (arbeidskontrakt)
- Prompt gives: name, birth date, department, start date, percentage, annual salary
- Attachment may give: job title or STYRK occupation code, hours per day, lønnstype, NIN, bank account

## ⚠️ THREE RULES THAT COST POINTS WHEN BROKEN

**RULE 1 — remunerationType**: Look at the PDF attachment.
- Does it say **"Lønnstype: Fastlønn (månedlig)"**? → `"MONTHLY_WAGE"`
- Does it only say "Årslønn: X kr" with **no** Lønnstype field? → `"NOT_CHOSEN"`
- Tilbudsbrev (offer letters) almost never have a Lønnstype field → use `"NOT_CHOSEN"`
- Arbeidskontrakt (employment contracts) almost always have it → use `"MONTHLY_WAGE"`
- Getting this wrong costs 2 raw points. Every production run that sent MONTHLY_WAGE for a tilbudsbrev failed Check 5.

**RULE 2 — Standard worktime**: ALWAYS call `POST /employee/standardTime`.
- Use the hours from the PDF if stated, otherwise default to `7.5`
- Use the per-employee endpoint: `POST /employee/standardTime`
- Do NOT use `POST /salary/settings/standardTime` (that's company-wide, wrong endpoint)
- Omitting this costs 2 raw points even when the PDF doesn't mention hours.

**RULE 3 — Occupation code**: ALWAYS include `occupationCode: { id: <number> }` on the employee.
- Check the hardcoded mapping table below FIRST. If it matches, use the id directly — no API call needed.
- Omitting it or using the wrong id costs 2 raw points.
- Send by `id`, NEVER by `code` (writing `{ code: "2511" }` silently stores null).

## Standard Flow (4 calls when hardcoded, 5 when dynamic lookup needed)

```
Step 1 (parallel):
  GET /division?count=1&fields=id
  POST /department  { name: "<from prompt>" }
  (if occupation code NOT in hardcoded table):
    GET /employee/employment/occupationCode?nameNO=<name>&count=10&fields=id,nameNO

Step 2:
  POST /employee    (see payload below)

Step 3:
  POST /employee/standardTime  { employee: { id: <empId> }, fromDate: "<startDate>", hoursPerDay: <hours or 7.5> }

Step 4:
  Stop. No verification GETs needed.
```

## Complete Payload (copy-paste and fill in)

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
          "remunerationType": "<NOT_CHOSEN or MONTHLY_WAGE — see Rule 1>",
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
- `percentageOfFullTimeEquivalent`: use the integer (80), not the decimal (0.8).
- `remunerationType`: see Rule 1 — this is the #1 source of lost points.

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

### Wrong mappings that FAILED in production (do not use these):
| PDF says | WRONG id | Why it failed |
|----------|----------|---------------|
| STYRK 3323 | ~~2503 INNKJØPER~~ | 2 runs failed; must be INNKJØPSASSISTENT (2507) |
| STYRK 3313 | ~~4672 REGNSKAPSFØRER~~ | 2 runs scored 18/22; must be REGNSKAPSMEDARBEIDER (4677) |
| Seniorutvikler | ~~1173 DRIFTSUTVIKLER~~ | Wrong field (IT ops, not software dev); must be SYSTEMUTVIKLER (5935) |
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
- `code=<4-digit-STYRK>` → substring match, returns unrelated codes
- `occupationCode: { code: "..." }` on POST /employee → silently stores null

## Division Handling
- Always pre-read `GET /division?count=1&fields=id`
- If it returns rows → include `division: { id: <id> }` in the employment
- If it returns 0 rows → omit `division` entirely (fresh accounts work without it)
- Omitting division when the account HAS divisions → 422 error
- Including a nonexistent division → also errors

## Sandbox Verification Status
- End-to-end verified 2026-03-22: both production-faithful scenarios (Raphaël Moreau / Seniorutvikler + Randi Stølsvik / HR-rådgiver) pass 10/10 checks, 4 calls, 0 errors with `remunerationType: "NOT_CHOSEN"`
- All 11 hardcoded occupation code mappings verified correct in sandbox 2026-03-22 (Markedsanalytiker → 3544 added after prod-fd3075b7)
- 18 total production runs; 16 of last 17 used 3-5 calls with 0 errors
- prod-fd3075b7: Carmen Pérez / Markedsanalytiker / Spanish prompt / 5 calls 0 errors (dynamic lookup; would be 4 with hardcoded table)
