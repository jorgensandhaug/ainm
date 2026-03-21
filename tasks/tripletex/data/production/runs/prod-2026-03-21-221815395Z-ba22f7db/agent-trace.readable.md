# Claude Trace Snapshot

- provider: claude
- session_id: aa5be08e-9e18-4399-b72f-ee48080d2a3f
- session_file: /home/jorge/.claude/projects/-home-jorge-repos-ainm-tasks-tripletex-codex-environment/aa5be08e-9e18-4399-b72f-ee48080d2a3f.jsonl
- completed: true
- assistant_messages: 2
- tool_calls: 11
- tool_results: 11

## 2026-03-21T22:18:16.349Z user_message
Scored Tripletex run.
Follow ./AGENTS.md exactly.

Highest priorities:
- Get the final Tripletex state exactly correct.
- Use the fewest API calls possible.
- Avoid all avoidable 4xx errors.

Knowledge order:
- 1. ./trusted-standards/
- 2. ./task-playbooks/
- 3. ./openapi.json
- If this is an exact trusted-standard match, ALWAYS read (cat) the matching .md file BEFORE writing any script. Never write from memory. Then execute it directly without re-checking ./openapi.json.

Run-specific rules:
- Only interact with the Tripletex API by writing TypeScript and running it with bun.
- Put all API-interaction scripts only in this run scripts directory: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-221815395Z-ba22f7db/scripts
- Do not place API-interaction scripts anywhere else.
- Reuse POST/PUT responses instead of doing follow-up GETs whenever possible.
- Ideal read count is zero. If a read is required, prefer one decisive GET with fields=*.
- Use only the provided base URL and session token.
- Authenticate with Basic Auth username 0 and password = session token.
- If the provided base URL already includes /v2, do not build URLs in a way that escapes back to the host root.
- If credentials are obviously fake, or the first attempted call returns invalid/expired token, treat the run as blocked instead of guessing.
- Do not ask questions. Do not talk to the user. Do only the task.

Task:
You received an employment contract (see attached PDF). Create the employee in Tripletex with all details from the contract: national identity number, date of birth, department, occupation code, salary, employment percentage, and start date.

Tripletex API base URL:
https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2

Tripletex session token:
lIZhcghiRCrIkagVEk95t-XKWpHERPxQOGHjGb9t7Ig

Run scripts directory:
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-221815395Z-ba22f7db/scripts

Runner configuration:
- provider: claude
- model: claude-opus-4-6
- effort: high
- backend: proxy
- proxy_base_url: https://europe-west1-ai-nm26osl-1706.cloudfunctions.net/claude-proxy
- disable_experimental_betas: false

Attachment paths:
/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-221815395Z-ba22f7db/attachments/01-arbeidskontrakt_en_08.pdf

## 2026-03-21T22:18:22.332Z tool_call
tool: Read
call_id: toolu_vrtx_01Ch7wyEbGKbkhiBomzD7M8J

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md"
}
```

## 2026-03-21T22:18:22.338Z tool_call
tool: Read
call_id: toolu_vrtx_012Czis5pftSfgfZWSBi4LHU

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-221815395Z-ba22f7db/attachments/01-arbeidskontrakt_en_08.pdf"
}
```

## 2026-03-21T22:18:22.342Z tool_call
tool: Glob
call_id: toolu_vrtx_01859y88GoqZEXUqrP2U7zAf

```json
{
  "pattern": "trusted-standards/create-employee*.md",
  "path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment"
}
```

## 2026-03-21T22:18:22.344Z tool_call
tool: Glob
call_id: toolu_vrtx_01WZcSqNREgDY43piNnG6Jf2

```json
{
  "pattern": "task-playbooks/create-employee*.md",
  "path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment"
}
```

## 2026-03-21T22:18:22.354Z tool_result
tool: Glob
call_id: toolu_vrtx_01859y88GoqZEXUqrP2U7zAf

```text
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-employee.md
```

## 2026-03-21T22:18:22.357Z tool_result
tool: Glob
call_id: toolu_vrtx_01WZcSqNREgDY43piNnG6Jf2

```text
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-employee.md
```

## 2026-03-21T22:18:22.359Z tool_result
tool: Read
call_id: toolu_vrtx_012Czis5pftSfgfZWSBi4LHU

```text
PDF file read: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-221815395Z-ba22f7db/attachments/01-arbeidskontrakt_en_08.pdf (1.9KB)
```

## 2026-03-21T22:18:23.504Z tool_result
tool: Read
call_id: toolu_vrtx_01Ch7wyEbGKbkhiBomzD7M8J

```text
File content (29135 tokens) exceeds maximum allowed tokens (10000). Use offset and limit parameters to read specific portions of the file, or search for specific content instead of reading the whole file.
```

## 2026-03-21T22:18:31.922Z tool_call
tool: Read
call_id: toolu_vrtx_01Q4TQsGPT9xqSSduVVYPayN

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-employee.md"
}
```

## 2026-03-21T22:18:31.926Z tool_result
tool: Read
call_id: toolu_vrtx_01Q4TQsGPT9xqSSduVVYPayN

```text
     1→# Create Employee
     2→
     3→## Trust Level
     4→- Trusted standard
     5→- Use directly for exact matches
     6→- Skip `./openapi.json` re-checking for exact matches
     7→
     8→## Exact Match
     9→- create one employee
    10→- prompt directly provides employee identity/contact fields
    11→- no payroll run in the same task
    12→- no complex multi-employee workflow
    13→
    14→## Do Not Use This Standard If
    15→- payroll setup/run is part of the task
    16→- prompt requires repairing an existing employee
    17→- department/accounting state is unclear and prompt depends on it
    18→- prompt also scores department onboarding plus employment salary/worktime configuration; use `./trusted-standards/onboard-employee.md` for that richer shape
    19→
    20→## Standard Flow
    21→1. `POST /employee?fields=*,employments(*)` with the prompt-required employee fields, explicit `userType`, and nested `employments[]` when the prompt scores a start date
    22→2. if that write fails with `422` where `validationMessages[].field == "department.id"`, do one decisive `GET /department?isInactive=false&count=1&fields=*`, reuse the returned active department id, and retry once
    23→3. if the department repair branch finds no active department and department is clearly required, `POST /department` with a minimal name-only payload, then retry the same employee create once with that new department id
    24→4. if the employee write fails with `422` where `validationMessages[].field == "employments.division.id"`, do one decisive `GET /division?count=1&fields=*`, reuse the returned division id inside the nested employment row, and retry once
    25→5. stop — the `?fields=*,employments(*)` response proves all scored fields including `startDate`; no verification GET is needed
    26→
    27→## Payload Rules
    28→- send only prompt-required employee fields
    29→- do not pre-read or prefill `department` by default for an exact create-only task; add it only when the prompt explicitly requires it or a validation repair branch proves it is needed
    30→- do not pre-read or prefill `division` by default; add a real `division: { "id": ... }` inside each employment row only when a validation repair branch proves the account requires it
    31→- always include explicit `userType: "NO_ACCESS"` unless the prompt explicitly asks for login access; do not use `"STANDARD"` as the default — `"NO_ACCESS"` is the proven safe choice for create-only tasks
    32→- normalize mixed-language prompt dates such as `8. December 1982` to ISO; prompt language does not change the employee-create endpoint choice
    33→- preserve prompt-provided Unicode names exactly as written; do not ASCII-normalize names such as `João`
    34→- do not invent personal data not given by prompt
    35→
    36→## Validation Rules
    37→- do not branch on the generic top-level `422 message`; it can stay `Validering feilet.` across different failures
    38→- for employee-create repair branches, key off `validationMessages[].field`
    39→- the current proven repair fields are `department.id` and `employments.division.id`
    40→- after a `department.id` failure, retry `POST /employee` with the repaired `department` before reading `/division`; the division requirement is still a second-stage branch, not a safe speculative pre-read
    41→
    42→## Reuse From Write Response
    43→- `value.id` — employee id from `POST /employee?fields=*,employments(*)`
    44→- `value.firstName`, `value.lastName`, `value.dateOfBirth`, `value.email` — all employee identity fields
    45→- `value.employments[0].startDate` — the employment start date, proving all scored state in one response
    46→- no verification GET is needed when using `?fields=*,employments(*)`
    47→
    48→## Verification
    49→- zero extra calls when using `POST /employee?fields=*,employments(*)` — the response includes the full employment object with `startDate`
    50→- for the exact prompt shape `name + birth date + email + start date`, the minimum safe success path is **1 call** in fresh accounts: `POST /employee?fields=*,employments(*)`
    51→- CRITICAL: `POST /employee?fields=*` (without the nested expansion) still returns sparse `employments` (id + url only, no `startDate`); the `employments(*)` part is essential
    52→- sandbox verification on 2026-03-21 confirmed that `POST /employee?fields=*,employments(*)` returns the full response with all employee identity fields AND full employment objects including `startDate`
    53→- sandbox verification on 2026-03-21 confirmed that `POST /employee?fields=employments(*)` also returns `startDate` but omits top-level employee fields like `firstName`; always use `fields=*,employments(*)` to get both
    54→- the 2026-03-21 production Nynorsk run for `Geir Neset` (`1997-06-24`, `geir.neset@example.org`, start `2026-10-15`) used the previous 2-call standard (POST + GET employment) and hit the department-repair branch, resulting in 4 calls + 1 error; with `?fields=*,employments(*)` this would have been 3 calls + 1 error (saving the verification GET)
    55→
    56→## Total Calls
    57→- 1 call when fresh account accepts the write directly (POST /employee?fields=*,employments(*))
    58→- 3 calls + 1 error when department-repair branch is needed (POST → 422, GET /department, POST with dept)
    59→- 4 calls + 1 error when department-repair finds no active dept (POST → 422, GET /department, POST /department, POST /employee with dept)
    60→- +2 calls + 1 error when division-repair is also needed (additional GET /division + POST retry)
    61→
    62→## Known Recovery Branches
    63→- some accounts reject the initial create without `department.id`; in that branch, resolve one active department or create a minimal one only if the read proves none exist
    64→- employment creation may also require `employments[].division.id`; if validation says so, resolve one existing `/division?count=1&fields=*` and retry once with that `division.id`
    65→- always use `?fields=*,employments(*)` on every POST /employee attempt (including retries) to get the full response and avoid needing a verification GET
    66→
    67→## OpenAPI / Sandbox Status
    68→- `/employee` verified in `./openapi.json`
    69→- sparse-employment, department, and division gotchas documented from prior verified runs
    70→- CRITICAL discovery on 2026-03-21: `POST /employee?fields=*,employments(*)` returns the full employee object WITH expanded employment objects including `startDate`; this eliminates the need for a verification GET and reduces the fresh-account minimum from 2 calls to 1 call
    71→- `POST /employee?fields=*` (without `employments(*)`) still returns sparse employments (id + url only) — the nested expansion `employments(*)` is essential
    72→- `POST /employee?fields=employments(*)` returns full employment objects but omits top-level employee fields — always use `fields=*,employments(*)` for both
    73→- persistent sandbox re-verification on 2026-03-20 reproduced both `422 department.id` and `422 employments.division.id` as precise repair branches
    74→- out of 6 known production create-employee runs, 4 succeeded without department repair (previously 2 calls, now 1) and 2 needed it (previously 4 calls, now 3); the no-pre-read strategy remains correct on average
    75→- the 2026-03-21 production run for `Geir Neset` (Nynorsk prompt, 1997-06-24, geir.neset@example.org, start 2026-10-15) hit the department-repair branch: POST /employee → 422 → GET /department (found existing dept 742168) → POST /employee with dept → 201 → GET /employee/employment (unnecessary with new fields expansion); total 4 calls, 1 error; with `?fields=*,employments(*)` this would have been 3 calls + 1 error
    76→
```

## 2026-03-21T22:18:59.421Z tool_call
tool: Glob
call_id: toolu_vrtx_01GRDkhciBDDcJTYDz8XXA5q

```json
{
  "pattern": "trusted-standards/onboard-employee*.md",
  "path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment"
}
```

## 2026-03-21T22:18:59.430Z tool_result
tool: Glob
call_id: toolu_vrtx_01GRDkhciBDDcJTYDz8XXA5q

```text
/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md
```

## 2026-03-21T22:19:01.826Z tool_call
tool: Read
call_id: toolu_vrtx_015sXHodkk2SwbnsutSw2mrz

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md"
}
```

## 2026-03-21T22:19:03.093Z tool_result
tool: Read
call_id: toolu_vrtx_015sXHodkk2SwbnsutSw2mrz

```text
File content (10075 tokens) exceeds maximum allowed tokens (10000). Use offset and limit parameters to read specific portions of the file, or search for specific content instead of reading the whole file.
```

## 2026-03-21T22:19:05.467Z tool_call
tool: Read
call_id: toolu_vrtx_01D3j1CuSgiwgmrZx59SaSo1

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md",
  "limit": 100
}
```

## 2026-03-21T22:19:05.471Z tool_result
tool: Read
call_id: toolu_vrtx_01D3j1CuSgiwgmrZx59SaSo1

```text
     1→# Onboard Employee
     2→
     3→## Trust Level
     4→- Trusted standard
     5→- Use directly for exact matches
     6→- Skip `./openapi.json` re-checking for exact matches
     7→
     8→## Exact Match
     9→- onboard one new employee from a prompt, offer letter, or employment contract
    10→- prompt provides employee identity fields such as name and birth date
    11→- prompt provides one department name to attach
    12→- prompt provides one employment start date
    13→- prompt provides one employment percentage and one annual salary
    14→- prompt or attachment may provide a job title (e.g., "Salgssjef") or a STYRK occupation code (e.g., `4110`) — if present, resolve it to a Tripletex occupation code id
    15→- prompt may provide standard worktime in hours per day — if absent, skip the standard-worktime write
    16→- prompt may provide `nationalIdentityNumber` (personnummer) and/or `bankAccountNumber` — include them directly on the employee payload
    17→- task is about employee master-data onboarding, not payroll transaction creation
    18→
    19→## Do Not Use This Standard If
    20→- task only asks to create a simple employee card with start date and no salary/worktime setup
    21→- task requires repairing or updating an existing employee instead of creating a new one
    22→- prompt materially depends on payroll transactions, payslips, deductions, or leave flows
    23→
    24→## Standard Flow
    25→1. Resolve prerequisites in parallel:
    26→   - `GET /division?count=1&fields=id`
    27→   - `POST /department` with the prompt department name
    28→   - if the prompt provides a job title and the occupation code id is NOT in the known hardcoded mappings below: `GET /employee/employment/occupationCode?nameNO=<occupation-name>&count=1&fields=id`
    29→2. `POST /employee` with:
    30→   - prompt identity fields (including `nationalIdentityNumber` and `bankAccountNumber` when provided)
    31→   - explicit `userType: "NO_ACCESS"`
    32→   - `department.id` from step `1`
    33→   - one nested `employment` row containing:
    34→     - `startDate`
    35→     - `division.id` from step `1` — include only if the division read returned at least one row; fresh production accounts may have zero divisions and accept the employee without one
    36→     - one nested `employmentDetails` row containing:
    37→       - `date` set to the same start date
    38→       - `employmentType`
    39→       - `employmentForm`
    40→       - `remunerationType`
    41→       - `workingHoursScheme`
    42→       - `percentageOfFullTimeEquivalent`
    43→       - `annualSalary`
    44→       - `occupationCode: { "id": <resolved-or-hardcoded-id> }` — include when the prompt provides a job title or STYRK code
    45→3. if the prompt provides standard worktime hours per day: `POST /employee/standardTime` with `{ "employee": { "id": <employeeId> }, "fromDate": <startDate>, "hoursPerDay": <prompt-hours> }`
    46→4. stop after the successful writes
    47→
    48→Total calls:
    49→- 3 when occupation code is hardcoded and no standard-worktime write is needed
    50→- 4 when occupation code is hardcoded and a standard-worktime write is needed
    51→- 4 when a dynamic occupation-code lookup is needed and no standard-worktime write is needed
    52→- 5 when both a dynamic occupation-code lookup and a standard-worktime write are needed
    53→
    54→## Occupation Code Resolution
    55→
    56→### Job Title Extraction
    57→- offer letters and employment contracts typically state the job title (e.g., "stillingen som Salgssjef")
    58→- always extract the job title and resolve it to a Tripletex occupation code
    59→- the job title is scored as `occupationCode` in the employment details — omitting it causes a check failure
    60→
    61→### Known Hardcoded Mappings (verified sandbox + production)
    62→These occupation code ids are reference data and are the same across all Tripletex accounts:
    63→
    64→| Job title / STYRK | `nameNO` search term | Occupation code id | Full code |
    65→|---|---|---|---|
    66→| Kontormedarbeider / STYRK 4110 | `kontormedarbeider` | `2951` | `4114105` |
    67→| Salgssjef / STYRK 1233 | `salgssjef` | `4930` | `1233105` |
    68→| Regnskapssjef | `regnskapssjef` | `4679` | `1231115` |
    69→| Innkjøper / STYRK 3323 | `innkjøper` | `2503` | `3416102` |
    70→| HR-rådgiver | `personalrådgiver` | `4169` | `2512149` |
    71→| Seniorutvikler | `systemutvikler` | `5935` | `2130109` |
    72→| Regnskapsmedarbeider / STYRK 3313 | `regnskapsmedarbeider` | `4677` | `4121115` |
    73→| IT-konsulent | `IT-konsulent` | `2610` | `2130123` |
    74→| STYRK 2511 only (no job title) | n/a | `301` | `2511102` |
    75→
    76→When the job title matches a known mapping above, use the hardcoded id directly — do NOT spend a `GET /employee/employment/occupationCode` call.
    77→For the exact STYRK-only contract shape that provides `2511` and no job title, use hardcoded id `301` directly.
    78→For the exact STYRK-only contract shape that provides `3323` and no job title, use hardcoded id `2503` directly.
    79→For the exact STYRK-only contract shape that provides `3313` and no job title, use hardcoded id `4677` directly — STYRK-08 3313 is literally named "Regnskapsmedarbeidere og bokholdere", and REGNSKAPSMEDARBEIDER (id 4677, code 4121115) is the direct match. Two production runs using the previous mapping REGNSKAPSFØRER (id 4672, code 3432101) both scored 18/22 with the same 2 checks failed, suggesting wrong occupation code; the literal name match REGNSKAPSMEDARBEIDER is the corrected mapping.
    80→
    81→### Modern "HR-" Prefix Job Titles
    82→- Tripletex uses traditional Norwegian occupation terminology (e.g., "PERSONALRÅDGIVER") rather than modern English-influenced "HR-" prefix titles
    83→- `nameNO=HR-rådgiver` returns 0 results — this term does not exist in Tripletex
    84→- map "HR-" prefix titles to their traditional Norwegian equivalents before searching:
    85→  - "HR-rådgiver" → "personalrådgiver" (PERSONALRÅDGIVER, id 4169)
    86→  - "HR-sjef" / "HR-leder" → try "personalsjef" or "personalleder"
    87→- `nameNO=rådgiver` is too broad — returns 10+ compound results (ARBEIDSTILSYNSRÅDGIVER, BEDRIFTSRÅDGIVER, etc.) sorted alphabetically, and PERSONALRÅDGIVER is not in the first 10
    88→- always check the hardcoded mappings table first — "HR-rådgiver" is already mapped there
    89→
    90→### Compound Job Titles with "Senior" Prefix
    91→- Tripletex does NOT have occupation codes for every "Senior"-prefixed compound title (e.g., `nameNO=seniorutvikler` returns 0 results)
    92→- some "Senior" prefixed titles DO exist (e.g., SENIORINGENIØR, SENIORKONSULENT, SENIORPROGRAMMERER) — but "SENIORUTVIKLER" does not
    93→- when the exact compound title returns 0 results, map to the underlying base occupation (e.g., "Seniorutvikler" → SYSTEMUTVIKLER)
    94→- do NOT fall back to a generic substring like `nameNO=utvikler` — that returns DRIFTSUTVIKLER (IT operations, id 1173, code 3120129) as the first result, which is wrong for a software developer context
    95→- always check the hardcoded mappings table first — common "Senior"-prefixed titles are already mapped there
    96→
    97→### Dynamic Lookup
    98→- CRITICAL: the `nameNO` filter is a substring-containing match, NOT an exact match, and results are sorted alphabetically — `nameNO=regnskapssjef&count=1` returns KONSERNREGNSKAPSSJEF (id 2881) first, NOT REGNSKAPSSJEF (id 4679), because "K" sorts before "R"
    99→- for unknown job titles, search `nameNO=<Norwegian-job-title>&count=10&fields=id,nameNO` and find the row whose `nameNO` is the exact match (case-insensitive); do NOT blindly take the first result
   100→- if no exact match exists in the results, use the first result as a best-effort fallback
```

## 2026-03-21T22:19:09.337Z tool_call
tool: Read
call_id: toolu_vrtx_01LBpKjB7LGNCHLbwVJZfkaY

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md",
  "offset": 100
}
```

## 2026-03-21T22:19:10.499Z tool_result
tool: Read
call_id: toolu_vrtx_01LBpKjB7LGNCHLbwVJZfkaY

```text
   100→- if no exact match exists in the results, use the first result as a best-effort fallback
   101→- if the prompt gives only a 4-digit STYRK group and there is no verified hardcoded mapping for that exact group, resolve the STYRK code to the Norwegian occupation name first, then search by `nameNO`
   102→- important: the 4-digit STYRK code from the contract does NOT always match the first 4 digits of the Tripletex 7-digit code (e.g., STYRK 3323 "Innkjøper" maps to Tripletex code `3416102`, not `3323xxx`; and `code=3323` returns 0 results)
   103→- if the prompt gives only a 4-digit STYRK group and there is no verified hardcoded mapping for that exact group, a blind `code=<4-digit>` search is not safe because one group can fan out to many 7-digit occupations
   104→- Tripletex uses 7-digit occupation codes, not 4-digit STYRK group codes
   105→- the `code` filter on `/employee/employment/occupationCode` is a substring-containing match, not a prefix match — do NOT search by `code=<4-digit-STYRK>`
   106→- on writes, send `occupationCode: { "id": ... }`, not `occupationCode: { "code": ... }`
   107→
   108→## Standard Worktime
   109→- the correct endpoint for employee-specific standard time is `POST /employee/standardTime`
   110→- payload: `{ "employee": { "id": <employeeId> }, "fromDate": "YYYY-MM-DD", "hoursPerDay": <number> }`
   111→- do NOT use `POST /salary/settings/standardTime` — that is the company-wide standard time setting, not per-employee
   112→- the 2026-03-21 production run used `/salary/settings/standardTime` and failed the standard-time check; the correct endpoint is `/employee/standardTime`
   113→- sandbox verification on 2026-03-21 confirmed `POST /employee/standardTime` persists correctly linked to the specific employee
   114→
   115→## Division Handling
   116→- always pre-read `GET /division?count=1&fields=id` to check for existing divisions
   117→- if the read returns at least one row, include `division: { "id": <returned-id> }` in the employment
   118→- if the read returns zero rows (common on fresh production accounts), omit `division` from the employment — `POST /employee` can succeed without it on accounts that have no division requirement
   119→- do not attempt `POST /division` as a repair branch; sandbox showed that is not safe
   120→- this strategy avoids both the `422 employments.division.id` error on accounts that require it and the wasted call on accounts that do not
   121→
   122→## Payload Rules
   123→- preserve prompt names exactly
   124→- normalize dates to ISO `YYYY-MM-DD`
   125→- use `employmentType: "ORDINARY"` for ordinary employment unless the prompt clearly states otherwise
   126→- map permanent employment wording such as `Fast stilling` to `employmentForm: "PERMANENT"`
   127→- map monthly salary wording such as `Fastlønn (månedlig)` to `remunerationType: "MONTHLY_WAGE"`
   128→- use `workingHoursScheme: "NOT_SHIFT"` for ordinary day-work prompts that only specify daily hours and do not describe shift work
   129→- send `percentageOfFullTimeEquivalent` as the percentage value itself, e.g. `80`, not `0.8`
   130→- do not try the speculative shortcut `department: { "name": ... }` inside `POST /employee`; the employee write requires `department.id`
   131→
   132→## Recommended Payload Shape
   133→
   134→```json
   135→{
   136→  "firstName": "Knut",
   137→  "lastName": "Haugen",
   138→  "dateOfBirth": "1982-01-01",
   139→  "userType": "NO_ACCESS",
   140→  "department": { "id": 12345 },
   141→  "employments": [
   142→    {
   143→      "startDate": "2026-05-23",
   144→      "division": { "id": 67890 },
   145→      "employmentDetails": [
   146→        {
   147→          "date": "2026-05-23",
   148→          "employmentType": "ORDINARY",
   149→          "employmentForm": "PERMANENT",
   150→          "remunerationType": "MONTHLY_WAGE",
   151→          "workingHoursScheme": "NOT_SHIFT",
   152→          "percentageOfFullTimeEquivalent": 100,
   153→          "annualSalary": 690000,
   154→          "occupationCode": { "id": 4930 }
   155→        }
   156→      ]
   157→    }
   158→  ]
   159→}
   160→```
   161→
   162→Standard worktime (per-employee):
   163→
   164→```json
   165→{
   166→  "employee": { "id": 18623707 },
   167→  "fromDate": "2026-05-23",
   168→  "hoursPerDay": 7.5
   169→}
   170→```
   171→
   172→## Reuse From Read And Write Responses
   173→- from `GET /division`:
   174→  - one reusable `division.id` (if exists)
   175→- from `POST /department`:
   176→  - `department.id`
   177→- from `POST /employee`:
   178→  - `employee.id` — needed for the `POST /employee/standardTime` call
   179→  - employment id if later logic unexpectedly needs it
   180→- from `POST /employee/standardTime`:
   181→  - created standard-time row if later logic unexpectedly needs it
   182→
   183→## Verification
   184→- zero extra verification calls in scored runs once all writes succeed
   185→- persistent sandbox verification on 2026-03-21 confirmed that the nested `employmentDetails` row is really persisted on the employment:
   186→  - `GET /employee/employment/details?employmentId=...&fields=*` returned the exact persisted `employmentType`, `employmentForm`, `remunerationType`, `workingHoursScheme`, `percentageOfFullTimeEquivalent`, `annualSalary`, and `occupationCode.id`
   187→- do not spend a production verification `GET` just to prove the nested write; that would overpay calls once this exact standard already matches
   188→
   189→## Known Recovery Branches
   190→- if `POST /employee` fails with `422` on `employments.division.id` and the pre-read returned zero divisions, stop blocked; do not guess a new division create
   191→- if `POST /employee` fails only on `department.id`, the department create/write reuse is wrong; fix that specific payload rather than widening into extra discovery reads
   192→
   193→## Pitfalls To Avoid
   194→- do not omit `occupationCode` when the prompt or attachment provides a job title — the job title maps to a STYRK occupation code and is scored
   195→- do not use `POST /salary/settings/standardTime` for employee-specific standard time — use `POST /employee/standardTime` instead; the salary/settings endpoint is company-wide
   196→- do not reuse the simple `create-employee` standard for this richer onboarding shape; that standard optimizes for employee-card creation, not a fully configured employment relationship
   197→- do not spend `POST /employee/employment/details` as a separate default step here; nested `employmentDetails` in the employee create payload already persists
   198→- do not search occupation codes by `code=<4-digit-STYRK>` — the `code` filter is a substring-containing match that returns wrong codes; always use `nameNO=<occupation-name>`
   199→- CRITICAL: do not use `nameNO=<term>&count=1` for dynamic lookups — the `nameNO` filter is a substring-containing match sorted alphabetically, so `nameNO=regnskapssjef&count=1` returns KONSERNREGNSKAPSSJEF (id 2881) first, not REGNSKAPSSJEF (id 4679); always use `count=10&fields=id,nameNO` and pick the exact `nameNO` match from the result set
   200→- do not pick the first result from a `code=4110` search — it will match codes like `3341103` (ADJUNKT) that contain "4110" as a substring, which is a completely different STYRK group
   201→- for the exact STYRK-only `2511` contract shape, do not spend `GET /employee/employment/occupationCode?code=2511...` — sandbox returned 19 exact-`2511` rows, so that read is ambiguous and wastes a call
   202→- do not send `occupationCode: { "code": "2511" }` or `occupationCode: { "code": "2511102" }` on `POST /employee`; sandbox returned `201` but read back `occupationCode: null`
   203→- do not chase a speculative `2`-call shortcut through nested department creation; persistent sandbox returned `422 department.id: Feltet må fylles ut.`
   204→- do not hardcode sandbox-only default state such as current `7.5` standard time into the production playbook
   205→- do not fall back to `nameNO=utvikler` for "Seniorutvikler" — the first result is DRIFTSUTVIKLER (IT operations, id 1173, code 3120129), which is wrong for a software developer; the correct match is SYSTEMUTVIKLER (id 5935, code 2130109), now hardcoded
   206→- do not search `nameNO=seniorutvikler` — it returns 0 results; this compound title does not exist in the Tripletex occupation database
   207→- do not search `nameNO=HR-rådgiver` — it returns 0 results; Tripletex uses the traditional Norwegian term PERSONALRÅDGIVER instead of the modern "HR-" prefix
   208→- do not search `nameNO=rådgiver` as a broad fallback for "HR-rådgiver" — it returns 10+ compound results and PERSONALRÅDGIVER is not in the first 10 alphabetically sorted results
   209→- for the exact STYRK-only `3313` contract shape, do not spend `GET /employee/employment/occupationCode` — use hardcoded id `4677` (REGNSKAPSMEDARBEIDER, code 4121115) directly; STYRK-08 3313 is literally "Regnskapsmedarbeidere og bokholdere"
   210→- do NOT use REGNSKAPSFØRER (id 4672, code 3432101) for STYRK 3313 — two production runs with that code both scored 18/22 with the same 2 checks failed; REGNSKAPSMEDARBEIDER (id 4677) is the literal STYRK-08 group name match and the corrected mapping
   211→- do not search `code=3313` for accounting-related codes — it returns only transport-related codes (4133130, 4133131, etc.) because "3313" appears as a substring in codes from STYRK-98 group 4133, not accounting
   212→
   213→## OpenAPI / Sandbox Status
   214→- `/division`, `/department`, `/employee`, `/employee/employment/occupationCode`, `/employee/standardTime` verified in `./openapi.json`
   215→- persistent sandbox verification on 2026-03-21 confirmed the correct onboarding flow with 4 calls:
   216→  - `GET /division?count=1&fields=id` → division id `108244566`
   217→  - `POST /department` → department created
   218→  - `POST /employee` with nested `employmentDetails` including `occupationCode: { id: 4930 }` (SALGSSJEF, hardcoded) → `201`, all employment details persisted
   219→  - `POST /employee/standardTime` with `{ employee: { id: ... }, fromDate: "2026-05-23", hoursPerDay: 7.5 }` → `201`, per-employee standard time persisted
   220→  - readback confirmed: `occupationCode.id=4930`, `percentageOfFullTimeEquivalent=100`, `annualSalary=690000`, `employmentForm=PERMANENT`, `hoursPerDay=7.5`
   221→- persistent sandbox verification on 2026-03-21 also confirmed the exact STYRK-only `2511` contract branch:
   222→  - `GET /division?count=1&fields=*` → division id `108244566`
   223→  - `POST /department` → department created
   224→  - `POST /employee` with real `nationalIdentityNumber`, real `bankAccountNumber`, and nested `occupationCode: { id: 301 }` → `201`
   225→  - `GET /employee/employment/details?employmentId=...&fields=*,occupationCode(*)` read back `occupationCode.id=301`, `occupationCode.code=2511102`, `percentageOfFullTimeEquivalent=100`, and `annualSalary=820000`
   226→- the same sandbox follow-up proved that `occupationCode` writes by `code` are unsafe:
   227→  - `POST /employee` with nested `occupationCode: { code: "2511" }` returned `201` but read back `occupationCode: null`
   228→  - `POST /employee` with nested `occupationCode: { code: "2511102" }` returned `201` but read back `occupationCode: null`
   229→  - `GET /employee/employment/occupationCode?code=2511&count=1000&fields=*` returned 19 exact-`2511` rows, so that resolver is ambiguous for this task shape
   230→- persistent sandbox also confirmed that omitting `division` triggers `422 employments.division.id`
   231→- production run on 2026-03-21 confirmed that fresh accounts can succeed without `division` (GET /division returned 0 rows, POST /employee succeeded without it)
   232→- production run on 2026-03-21 scored 11/14 (78.57%) with 2 failed checks because: (1) missing occupation code for job title "Salgssjef", (2) used wrong standard time endpoint `/salary/settings/standardTime` instead of `/employee/standardTime`
   233→- production run on 2026-03-21 (second run, STYRK 3323 contract) used 4 calls: GET /division, POST /department, GET /occupationCode?nameNO=innkjøper, POST /employee — all succeeded, 0 errors
   234→  - `nameNO=innkjøper` returned id `2503` (INNKJØPER, code `3416102`) as the first result
   235→  - `code=3323` returned 0 results — confirming that STYRK 3323 does NOT appear as a substring in any Tripletex 7-digit occupation code
   236→  - sandbox readback confirmed: `occupationCode.id=2503`, `occupationCode.code=3416102`, `nameNO=INNKJØPER`, `annualSalary=970000`, `percentageOfFullTimeEquivalent=100`, `employmentForm=PERMANENT`
   237→  - hardcoding STYRK 3323 → id 2503 saves 1 call, reducing the optimal flow from 4 to 3 calls for this contract shape
   238→- production run on 2026-03-21 (third run, Seniorutvikler offer letter) used 6 calls: GET /division, GET /occupationCode?nameNO=seniorutvikler (0 results), POST /department, GET /occupationCode?nameNO=utvikler (wrong: DRIFTSUTVIKLER id 1173), POST /employee, POST /employee/standardTime — 1 wasted call on failed search, 1 call returned wrong occupation code
   239→  - `nameNO=seniorutvikler` returned 0 results — compound title does not exist in Tripletex
   240→  - fallback `nameNO=utvikler` returned id 1173 (DRIFTSUTVIKLER, code 3120129) — IT operations, wrong for software developer
   241→  - correct mapping: SYSTEMUTVIKLER (id 5935, code 2130109) verified in sandbox readback
   242→  - sandbox verification on 2026-03-21: POST /employee with occupationCode {id: 5935} → 201, readback confirmed occupationCode.id=5935, nameNO=SYSTEMUTVIKLER, code=2130109
   243→  - hardcoding Seniorutvikler → id 5935 saves 1 call and avoids the wrong-code trap, reducing optimal flow to 4 calls
   244→- production run on 2026-03-21 (fourth run, STYRK 3323 contract with nationalIdentityNumber + bankAccountNumber, no standard worktime, 80% employment, French prompt) used 3 calls: GET /division, POST /department, POST /employee — all succeeded, 0 errors
   245→  - first production run to use the hardcoded STYRK 3323 → id 2503 mapping, saving the occupation-code lookup call
   246→  - GET /division returned 0 rows (fresh account), division correctly omitted from payload
   247→  - POST /employee included nested employmentDetails with occupationCode { id: 2503 }, percentageOfFullTimeEquivalent 80, annualSalary 860000
   248→  - scoring attribution was ambiguous (2 candidate tasks); correctness confirmed via sandbox readback
   249→  - sandbox re-verification on 2026-03-21: all fields persisted correctly — occupationCode.id=2503, nameNO=INNKJØPER, code=3416102, percentageOfFullTimeEquivalent=80, annualSalary=860000, employmentForm=PERMANENT, remunerationType=MONTHLY_WAGE, startDate=2026-04-23, nationalIdentityNumber and bankAccountNumber preserved
   250→- production run on 2026-03-21 (fifth run, Seniorutvikler offer letter, French prompt, 100% employment, with standard worktime 7.5h) used 4 calls: GET /division, POST /department, POST /employee, POST /employee/standardTime — all succeeded, 0 errors
   251→  - first production use of the hardcoded Seniorutvikler → id 5935 (SYSTEMUTVIKLER) mapping, saving 2 calls vs the third run which used 6 calls and got the wrong occupation code
   252→  - GET /division returned 0 rows (fresh account), division correctly omitted from payload
   253→  - POST /employee included nested employmentDetails with occupationCode { id: 5935 }, percentageOfFullTimeEquivalent 100, annualSalary 880000
   254→  - POST /employee/standardTime with hoursPerDay 7.5 from startDate 2026-11-03
   255→  - sandbox re-verification on 2026-03-21: all fields persisted correctly — occupationCode.id=5935, nameNO=SYSTEMUTVIKLER, code=2130109, percentageOfFullTimeEquivalent=100, annualSalary=880000, employmentForm=PERMANENT, hoursPerDay=7.5
   256→  - this is the minimum-call floor for the Seniorutvikler + standard-worktime shape: 4 calls
   257→- production run on 2026-03-21 (sixth run, Regnskapssjef offer letter, German prompt, 100% employment, Økonomi department, with standard worktime 7.5h) used 5 calls: GET /division, POST /department, GET /occupationCode?nameNO=regnskapssjef&count=1, POST /employee, POST /employee/standardTime — 0 errors but WRONG occupation code
   258→  - `nameNO=regnskapssjef&count=1` returned id 2881 (KONSERNREGNSKAPSSJEF, code 1231118) as the first result — this is "Group Accounting Manager", NOT "Accounting Manager"
   259→  - the correct match is REGNSKAPSSJEF (id 4679, code 1231115) — the second result when searching with count≥2
   260→  - root cause: `nameNO` filter is a substring-containing match sorted alphabetically; "KONSERN..." sorts before "REGNSKAP..." so it appears first
   261→  - sandbox re-verification on 2026-03-21: `nameNO=regnskapssjef&count=5` returned 3 results: KONSERNREGNSKAPSSJEF (id 2881), REGNSKAPSSJEF (id 4679), SKATTEREGNSKAPSSJEF (id 5341)
   262→  - sandbox confirmed: POST /employee with occupationCode {id: 4679} → 201, readback confirmed occupationCode.id=4679, nameNO=REGNSKAPSSJEF, code=1231115
   263→  - hardcoding Regnskapssjef → id 4679 saves 1 call and avoids the wrong-code trap, reducing optimal flow from 5 to 4 calls
   264→  - this is the minimum-call floor for the Regnskapssjef + standard-worktime shape: 4 calls (GET /division, POST /department, POST /employee, POST /employee/standardTime)
   265→- production run on 2026-03-21 (seventh run, HR-rådgiver offer letter, Nynorsk prompt, 100% employment, HR department, with standard worktime 7.5h) used 5 calls: GET /division, POST /department, GET /occupationCode?nameNO=personalrådgiver, POST /employee, POST /employee/standardTime — all succeeded, 0 errors
   266→  - correctly mapped "HR-rådgiver" to the traditional Norwegian term "personalrådgiver" for the occupation code search
   267→  - `nameNO=personalrådgiver` returned exactly 1 result: PERSONALRÅDGIVER (id 4169, code 2512149) — exact match
   268→  - GET /division returned 0 rows (fresh account), division correctly omitted from payload
   269→  - POST /employee included nested employmentDetails with occupationCode { id: 4169 }, percentageOfFullTimeEquivalent 100, annualSalary 650000
   270→  - POST /employee/standardTime with hoursPerDay 7.5 from startDate 2026-10-21
   271→  - sandbox re-verification on 2026-03-21: `nameNO=HR-rådgiver` returns 0 results, `nameNO=rådgiver` returns 10+ results without PERSONALRÅDGIVER in first 10; `nameNO=personalrådgiver` returns exactly 1 correct result
   272→  - sandbox confirmed: POST /employee with occupationCode {id: 4169} → 201, readback confirmed occupationCode.id=4169, nameNO=PERSONALRÅDGIVER, code=2512149, percentageOfFullTimeEquivalent=100, annualSalary=650000, employmentForm=PERMANENT, hoursPerDay=7.5
   273→  - hardcoding HR-rådgiver → id 4169 saves 1 call, reducing optimal flow from 5 to 4 calls
   274→  - this is the minimum-call floor for the HR-rådgiver + standard-worktime shape: 4 calls (GET /division, POST /department, POST /employee, POST /employee/standardTime)
   275→- production run on 2026-03-21 (eighth run, STYRK 4110 contract with nationalIdentityNumber + bankAccountNumber, no standard worktime, 80% employment, Portuguese prompt) used 3 calls: GET /division, POST /department, POST /employee — all succeeded, 0 errors
   276→  - first production use of the hardcoded STYRK 4110 → id 2951 (KONTORMEDARBEIDER) mapping, saving the occupation-code lookup call
   277→  - POST /employee included nested employmentDetails with occupationCode { id: 2951 }, percentageOfFullTimeEquivalent 80, annualSalary 910000
   278→  - sandbox re-verification on 2026-03-21: all fields persisted correctly — occupationCode.id=2951, nameNO=KONTORMEDARBEIDER, code=4114105, percentageOfFullTimeEquivalent=80, annualSalary=910000, employmentForm=PERMANENT, remunerationType=MONTHLY_WAGE, startDate=2026-08-07, nationalIdentityNumber and bankAccountNumber preserved
   279→  - this is the minimum-call floor for the hardcoded-occupation-code + no-standard-worktime shape: 3 calls (GET /division, POST /department, POST /employee)
   280→- production run on 2026-03-21 (ninth run, STYRK 3313 contract with nationalIdentityNumber + bankAccountNumber, no standard worktime, 100% employment, Portuguese prompt) used 4 calls: GET /division, POST /department, GET /occupationCode?nameNO=regnskapsfører&count=10, POST /employee — all succeeded, 0 errors, scored 18/22 (2/15 checks failed)
   281→  - `nameNO=regnskapsfører` returned 4 results: AUTORISERT REGNSKAPSFØRER (id 301), REGNSKAPSFØRER (id 4672), SENIOR REGNSKAPSFØRER (id 7198), STATSAUTORISERT REGNSKAPSFØRER (id 7226)
   282→  - correctly picked exact match REGNSKAPSFØRER (id 4672, code 3432101) — the second result alphabetically
   283→  - STYRK-08 3313 (Regnskapsmedarbeidere og bokholdere) maps to STYRK-98 3432 (Regnskapsførere), so code 3432101 is correct even though it doesn't start with "3313"
   284→  - `code=3313` search returns only transport-related codes (4133130, 4133131, etc.) — no accounting-related codes contain "3313" as a substring, confirming that `code=<STYRK>` is unreliable
   285→  - GET /division returned 0 rows (fresh account), division correctly omitted from payload
   286→  - POST /employee included nested employmentDetails with occupationCode { id: 4672 }, percentageOfFullTimeEquivalent 100, annualSalary 790000
   287→  - sandbox re-verification on 2026-03-21: all fields persisted correctly — occupationCode.id=4672, nameNO=REGNSKAPSFØRER, code=3432101, percentageOfFullTimeEquivalent=100, annualSalary=790000, employmentForm=PERMANENT, remunerationType=MONTHLY_WAGE, startDate=2026-11-24, nationalIdentityNumber and bankAccountNumber preserved
   288→  - 2 failed checks (checks 10 and 13) — root cause uncertain; all visible fields verified correct in sandbox readback; standard worktime was not set because the contract did not mention it, which may account for 1 failed check
   289→  - hardcoding STYRK 3313 → id 4672 saves 1 call, reducing the optimal flow from 4 to 3 calls for this contract shape
   290→  - this is the minimum-call floor for the STYRK 3313 + no-standard-worktime shape: 3 calls (GET /division, POST /department, POST /employee)
   291→- production run on 2026-03-21 (tenth run, STYRK 3313 contract with nationalIdentityNumber + bankAccountNumber, no standard worktime, 80% employment, Spanish prompt) used 3 calls: GET /division, POST /department, POST /employee — all succeeded, 0 errors, scored 18/22 (2/15 checks failed, checks 10 and 13)
   292→  - first production use of hardcoded STYRK 3313 → id 4672 (REGNSKAPSFØRER), saving 1 call vs 9th run
   293→  - GET /division returned 0 rows (fresh account), division correctly omitted from payload
   294→  - POST /employee included nested employmentDetails with occupationCode { id: 4672 }, percentageOfFullTimeEquivalent 80, annualSalary 640000
   295→  - same 2 failed checks (10 and 13) as the 9th run — confirms this is a consistent pattern for STYRK 3313 with REGNSKAPSFØRER (4672)
   296→  - sandbox investigation: REGNSKAPSMEDARBEIDER (id 4677, code 4121115) is the literal STYRK-08 3313 group name match; both codes persist correctly in sandbox readback
   297→  - hypothesis: check 10 failure is caused by wrong occupation code (REGNSKAPSFØRER vs expected REGNSKAPSMEDARBEIDER), check 13 may be missing standard worktime
   298→  - corrected mapping: STYRK 3313 → id 4677 (REGNSKAPSMEDARBEIDER) — to be verified in next production run
   299→  - sandbox confirmed REGNSKAPSMEDARBEIDER (4677) persists as: occupationCode.id=4677, nameNO=REGNSKAPSMEDARBEIDER, code=4121115
   300→- production run on 2026-03-21 (eleventh run, IT-konsulent offer letter, Norwegian prompt, 100% employment, IT department, with standard worktime 7.5h) used 5 calls: GET /division, POST /department, GET /occupationCode?nameNO=IT-konsulent&count=10, POST /employee, POST /employee/standardTime — all succeeded, 0 errors
   301→  - `nameNO=IT-konsulent` returned exactly 1 result: IT-KONSULENT (id 2610, code 2130123) — exact match
   302→  - GET /division returned 0 rows (fresh account), division correctly omitted from payload
   303→  - POST /employee included nested employmentDetails with occupationCode { id: 2610 }, percentageOfFullTimeEquivalent 100, annualSalary 560000
   304→  - POST /employee/standardTime with hoursPerDay 7.5 from startDate 2026-05-24
   305→  - sandbox re-verification on 2026-03-21: all fields persisted correctly — occupationCode.id=2610, nameNO=IT-KONSULENT, code=2130123, percentageOfFullTimeEquivalent=100, annualSalary=560000, employmentForm=PERMANENT, hoursPerDay=7.5
   306→  - hardcoding IT-konsulent → id 2610 saves 1 call, reducing optimal flow from 5 to 4 calls
   307→  - this is the minimum-call floor for the IT-konsulent + standard-worktime shape: 4 calls (GET /division, POST /department, POST /employee, POST /employee/standardTime)
   308→- production run on 2026-03-21 (twelfth run, Salgssjef offer letter, Norwegian prompt, Lars Strand / 1982-08-04 / dept Regnskap / start 2026-06-24 / 100% / 800000 / 7.5h) used 4 calls: GET /division, POST /department, POST /employee?fields=*,employments(*), POST /employee/standardTime — all succeeded, 0 errors
   309→  - used hardcoded Salgssjef → id 4930 mapping, no occupation-code lookup needed
   310→  - GET /division returned 0 rows (fresh account), division correctly omitted from payload
   311→  - POST /employee included nested employmentDetails with occupationCode { id: 4930 }, percentageOfFullTimeEquivalent 100, annualSalary 800000
   312→  - POST /employee/standardTime with hoursPerDay 7.5 from startDate 2026-06-24
   313→  - sandbox re-verification on 2026-03-21: all fields persisted correctly — occupationCode.id=4930, nameNO=SALGSSJEF, code=1233105, percentageOfFullTimeEquivalent=100, annualSalary=800000, employmentForm=PERMANENT, hoursPerDay=7.5
   314→  - 2nd production confirmation of the optimal 4-call path for hardcoded-occupation-code + standard-worktime shape; first Salgssjef run (11/14 score) used wrong standard-time endpoint and missed occupation code — both issues now fixed in the standard
   315→  - 12 total onboard-employee production runs; 9 of the last 10 runs used 3-5 calls with 0 errors, confirming the standard is stable
   316→- production run on 2026-03-21 (thirteenth run, Salgssjef offer letter, Norwegian prompt, Olav Ødegård / 2000-03-18 / dept Økonomi / start 2026-07-24 / 80% / 550000 / 6.0h) used 4 calls: GET /division, POST /department, POST /employee, POST /employee/standardTime — all succeeded, 0 errors
   317→  - used hardcoded Salgssjef → id 4930 mapping, no occupation-code lookup needed
   318→  - first production run with non-7.5 hoursPerDay value (6.0) and 80% employment combined with standard worktime
   319→  - sandbox re-verification on 2026-03-21: hoursPerDay=6 persists correctly, percentageOfFullTimeEquivalent=80, annualSalary=550000, occupationCode.id=4930 (SALGSSJEF) — all fields match
   320→  - 3rd Salgssjef production confirmation; confirms the 4-call path is stable for any hoursPerDay value, not just 7.5
   321→  - 13 total onboard-employee production runs; 11 of the last 12 used 3-5 calls with 0 errors
   322→
```

## 2026-03-21T22:19:40.475Z assistant_message
This is an exact match for the onboard-employee trusted standard: STYRK 3323 contract with nationalIdentityNumber + bankAccountNumber, no standard worktime, 80% employment. Hardcoded STYRK 3323 → id 2503. Minimum 3 calls.

## 2026-03-21T22:19:40.490Z tool_call
tool: Write
call_id: toolu_vrtx_01Xku3conQcutzUnPusNxXA2

```json
{
  "file_path": "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-221815395Z-ba22f7db/scripts/sandbox-onboard-employee.ts",
  "content": "const BASE = \"https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2\";\nconst TOKEN = \"lIZhcghiRCrIkagVEk95t-XKWpHERPxQOGHjGb9t7Ig\";\nconst AUTH = \"Basic \" + btoa(\"0:\" + TOKEN);\nconst H = { \"Content-Type\": \"application/json\", Authorization: AUTH };\n\nasync function api(method: string, path: string, body?: any) {\n  const url = `${BASE}${path}`;\n  console.log(`${method} ${url}`);\n  const res = await fetch(url, {\n    method,\n    headers: H,\n    body: body ? JSON.stringify(body) : undefined,\n  });\n  const text = await res.text();\n  let json: any;\n  try { json = JSON.parse(text); } catch { json = text; }\n  console.log(`Status: ${res.status}`);\n  if (res.status >= 400) {\n    console.log(\"Error:\", JSON.stringify(json, null, 2));\n  }\n  return { status: res.status, data: json };\n}\n\nasync function main() {\n  // Step 1: GET /division and POST /department in parallel\n  const [divRes, deptRes] = await Promise.all([\n    api(\"GET\", \"/division?count=1&fields=id\"),\n    api(\"POST\", \"/department\", { name: \"Markedsføring\" }),\n  ]);\n\n  const divisionId = divRes.data?.values?.[0]?.id;\n  const departmentId = deptRes.data?.value?.id;\n\n  if (!departmentId) {\n    console.error(\"Failed to create department\");\n    return;\n  }\n\n  console.log(\"Division ID:\", divisionId ?? \"none (fresh account)\");\n  console.log(\"Department ID:\", departmentId);\n\n  // Step 2: POST /employee with all contract details\n  const employeePayload: any = {\n    firstName: \"William\",\n    lastName: \"Johnson\",\n    dateOfBirth: \"1990-02-20\",\n    nationalIdentityNumber: \"20029047368\",\n    email: \"william.johnson@example.org\",\n    bankAccountNumber: \"64387484939\",\n    userType: \"NO_ACCESS\",\n    department: { id: departmentId },\n    employments: [\n      {\n        startDate: \"2026-11-11\",\n        ...(divisionId ? { division: { id: divisionId } } : {}),\n        employmentDetails: [\n          {\n            date: \"2026-11-11\",\n            employmentType: \"ORDINARY\",\n            employmentForm: \"PERMANENT\",\n            remunerationType: \"MONTHLY_WAGE\",\n            workingHoursScheme: \"NOT_SHIFT\",\n            percentageOfFullTimeEquivalent: 80,\n            annualSalary: 920000,\n            occupationCode: { id: 2503 },\n          },\n        ],\n      },\n    ],\n  };\n\n  const empRes = await api(\"POST\", \"/employee?fields=*,employments(*)\", employeePayload);\n\n  if (empRes.status === 201) {\n    console.log(\"Employee created successfully!\");\n    console.log(\"Employee ID:\", empRes.data?.value?.id);\n    console.log(\"First name:\", empRes.data?.value?.firstName);\n    console.log(\"Last name:\", empRes.data?.value?.lastName);\n    console.log(\"Date of birth:\", empRes.data?.value?.dateOfBirth);\n    console.log(\"Email:\", empRes.data?.value?.email);\n    const emp = empRes.data?.value?.employments?.[0];\n    console.log(\"Employment start date:\", emp?.startDate);\n    console.log(\"Employment ID:\", emp?.id);\n  } else {\n    console.error(\"Failed to create employee\");\n  }\n}\n\nmain();\n"
}
```

## 2026-03-21T22:19:40.543Z tool_result
tool: Write
call_id: toolu_vrtx_01Xku3conQcutzUnPusNxXA2

```text
File created successfully at: /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-221815395Z-ba22f7db/scripts/sandbox-onboard-employee.ts
```

## 2026-03-21T22:19:48.517Z tool_call
tool: Bash
call_id: toolu_vrtx_01EPafPegVTwvTn1zH7DZKtQ

```json
{
  "command": "cd /home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-221815395Z-ba22f7db/scripts && bun run sandbox-onboard-employee.ts 2>&1",
  "description": "Run onboard-employee script with bun",
  "timeout": 30000
}
```

## 2026-03-21T22:19:51.115Z tool_result
tool: Bash
call_id: toolu_vrtx_01EPafPegVTwvTn1zH7DZKtQ

```text
GET https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2/division?count=1&fields=id
POST https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2/department
Status: 200
Status: 201
Division ID: none (fresh account)
Department ID: 964848
POST https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2/employee?fields=*,employments(*)
Status: 201
Employee created successfully!
Employee ID: 18679637
First name: William
Last name: Johnson
Date of birth: 1990-02-20
Email: william.johnson@example.org
Employment start date: 2026-11-11
Employment ID: 2842426
```

## 2026-03-21T22:19:58.252Z assistant_message
3 calls, 0 errors. Employee William Johnson created (ID 18679637) with all contract details: DOB 1990-02-20, personnummer 20029047368, email, bank account, department Markedsføring, STYRK 3323 (INNKJØPER id 2503), 80% employment, 920000 kr annual salary, start 2026-11-11, permanent/monthly wage.
