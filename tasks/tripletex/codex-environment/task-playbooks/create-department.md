# Create Department

## Scope

Use for tasks like:
- create one new department
- create several new departments where the prompt gives the names directly
- no update, delete, or lookup of an existing department is requested

## Verified Findings

Sandbox verification on 2026-03-19 showed:
- `POST /department` succeeds with a minimal payload containing only `name`
- `POST /department/list` succeeds with an array of minimal department objects and is the more efficient path when the prompt asks for multiple new departments
- neither flow needed `departmentNumber`, `departmentManager`, or a pre-read
- the write responses already proved the created `id`, `name`, `displayName`, and `isInactive=false`
- single create returned `{"value": {...}}`
- batch create returned `{"values": [...]}` with all created departments

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
- Verify the requested names directly from the write response
- Reuse returned ids only if a later step depends on them

## When Not To Pre-Read

- Do not `GET /department` first for a normal create task
- Do not add sandbox idempotency reads to a scored create prompt
- Do not fetch departments again if the write response already proves the scored fields

## Extra Fields Only When The Prompt Implies Them

- Send `departmentNumber` only if the prompt explicitly requires it
- Send `departmentManager` only if the prompt explicitly requires it and you already have the correct employee id
- Otherwise, prefer the minimal `name`-only payload
