# Create Department

## Scope

Use for tasks like:
- create one new department
- create several new departments where the prompt gives the names directly
- no update, delete, or lookup of an existing department is requested

If the prompt already exactly matches `./trusted-standards/create-department.md`, stop there and execute the trusted standard directly instead of re-confirming the same endpoint here.

## Verified Findings

Sandbox verification on 2026-03-19 showed:
- `POST /department` succeeds with a minimal payload containing only `name`
- `POST /department/list` succeeds with an array of minimal department objects and is the more efficient path when the prompt asks for multiple new departments
- neither flow needed `departmentNumber`, `departmentManager`, or a pre-read
- the write responses already proved the created `id`, `name`, `displayName`, and `isInactive=false`
- single create returned `{"value": {...}}`
- batch create returned `{"values": [...]}` with all created departments
- a successful batch-create response can still show top-level `fullResultSize=0`; verify from `values[]`, not that metadata
- exact Unicode department names survive the batch write unchanged; do not transliterate names such as `Økonomi`

Production and sandbox re-verification on 2026-03-20 showed:
- an exact German prompt asking for three named departments was still a pure exact-match create flow
- one `POST /department/list` remained sufficient for perfect correctness
- no language-specific branch, pre-read, or follow-up verification read was needed
- an exact Spanish prompt asking for `Lager`, `Økonomi`, and `Drift` was the same exact-match flow
- one sandbox `POST /department/list` with `Lager`, `Økonomi`, and `Drift`-shaped names returned the same names in `values[]`
- an exact Norwegian prompt asking for `HR`, `Salg`, and `Økonomi` was the same exact-match flow
- the production run and same-day persistent-sandbox re-proof both stayed on the one-call floor: `POST /department/list` only
- an exact Norwegian prompt asking for `Lager`, `Regnskap`, and `Kvalitetskontroll` was the same exact-match flow
- one same-day persistent-sandbox `POST /department/list` with `Lager Reflection cbae44a2`, `Regnskap Reflection cbae44a2`, and `Kvalitetskontroll Reflection cbae44a2` again returned the created names in `values[]` while top-level `fullResultSize` stayed `0`

Production and sandbox re-verification on 2026-03-21 showed:
- an exact Portuguese prompt asking for `IT`, `Kvalitetskontroll`, and `Regnskap` was still the same exact-match flow
- one production `POST /department/list` created all three requested departments with zero reads and zero errors
- an exact German prompt asking for `Logistikk`, `Salg`, and `Drift` was the same exact-match flow: one `POST /department/list`, 201, 7/7 score (normalized 2), zero errors
- an exact Nynorsk prompt asking for `Produksjon`, `Lager`, and `Kvalitetskontroll` was the same exact-match flow: one `POST /department/list`, 201, 7/7 score (normalized 2), zero errors
- the sandbox batch-create response still shows top-level `fullResultSize=0`, so verification must continue to trust `values[]`
- a Nynorsk prompt asking for `Produksjon`, `Kvalitetskontroll`, and `HR` was the same exact-match flow: one `POST /department/list`, 201, 1 call 0 errors; short ASCII-only names like `HR` need no special handling

## Minimal Safe Flow

1. Confirm `POST /department` and `POST /department/list` in `./openapi.json`
2. If the prompt asks for one department, `POST /department` with only the requested fields
3. If the prompt asks for multiple departments, `POST /department/list` with an array of minimal objects
4. Verify directly from the write response body
5. Stop

## Exact-Match Fast Path

- If the prompt only asks to create multiple departments and provides the names directly, send one batch request:

```json
[
  { "name": "Økonomi" },
  { "name": "Innkjøp" },
  { "name": "Regnskap" }
]
```

- Use `POST /department/list`
- Do not spend a discovery `GET`
- Do not split the work into repeated `POST /department` calls unless the prompt only asks for a single department
- Treat that single batch write as the call floor for exact multi-department create prompts
- Do not change the endpoint choice just because the prompt is written in German, French, or another supported language
- Preserve the prompt-provided department names exactly; do not ASCII-normalize `Ø`

## Single-Create Payload Shape

For a single department create, the winning payload is typically:

```json
{
  "name": "Økonomi"
}
```

## OpenAPI Navigation Trap

- `openapi.json` exposes both `/department` and `/department/list`
- Do not stop after finding `POST /department` if the prompt asks for several new departments
- For multi-create prompts, the batch endpoint is usually the better scoring path because it reduces call count without adding ambiguity

## Verification Shape

- Single create:
  - expect `201 Created`
  - expect `{"value": {...}}`
- Batch create:
  - expect `201 Created`
  - expect `{"values": [...]}` in the same order as the submitted payload
  - do not require `fullResultSize` to equal the number of created departments
- Verify the requested names directly from the write response
- Reuse returned ids only if a later step depends on them

## When Not To Pre-Read

- Do not `GET /department` first for a normal create task
- Do not add sandbox idempotency reads to a scored create prompt
- Do not fetch departments again if the write response already proves the scored fields
- Do not treat duplicate-looking names in a persistent sandbox as a reason to pre-read during a fresh-account production run; the standard production path is still the direct create write

## Extra Fields Only When The Prompt Implies Them

- Send `departmentNumber` only if the prompt explicitly requires it
- Send `departmentManager` only if the prompt explicitly requires it and you already have the correct employee id
- Otherwise, prefer the minimal `name`-only payload
