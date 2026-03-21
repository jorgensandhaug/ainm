# Tripletex2 Sandbox CLI

`scripts/sandbox.ts` is the canonical operator interface for the Tripletex sandbox.

Use it for four things:

1. reset the sandbox as far back toward a clean slate as the API allows,
2. seed deterministic fixture state before a run,
3. run or verify one strategy against the real sandbox,
4. inspect live sandbox state directly.

The old research-specific reset wrapper still exists for compatibility, but new operator docs and agent workflows should start from this file.

## Why this exists

The sandbox is the proof surface.

That means the operator surface has to support:

- best-effort full cleanup of prior sandbox-created entities,
- explicit fixture setup when a strategy needs preconditions,
- deterministic strategy runs,
- direct inspection of resulting Tripletex state.

The repo cannot provision a fresh Tripletex company on demand, so `reset` is a best-effort cleanup pass over known sandbox-created entities. Where Tripletex exposes `DELETE`, the CLI deletes. Where it does not, the CLI neutralizes state when possible, for example by ending employments and removing future collisions on employee emails. Invoices are neutralized by credit-note flows because there is no invoice delete endpoint.

## Commands

### Reset

Best-effort cleanup over durable sandbox evidence:

```bash
bun scripts/sandbox.ts reset
```

Dry-run without mutating Tripletex:

```bash
bun scripts/sandbox.ts reset --dry-run
```

What `reset` uses as evidence:

- checked-in sandbox run artifacts under `runs/`
- sandbox verification artifacts under `research/verifications/`
- sandbox setup reports under `research/sandbox/apply/`

What `reset` does today:

- deletes deletable entities such as customers, suppliers, departments, products, projects, orders, vouchers, travel expenses, timesheet entries, project activities, project order lines, hourly rates, and accounting dimensions,
- ends employments and removes employee logon collisions by email-neutralizing created employees,
- closes divisions with `endDate`,
- neutralizes invoices with credit-note flows where possible.

What `reset` does not guarantee:

- a mathematically perfect fresh-account state,
- removal of every invoice or credit note object,
- cleanup of entity families where Tripletex exposes no safe delete or update path.

Every run writes a report under `research/sandbox/reset/`.

### Apply

Apply a checked-in fixture/setup plan:

```bash
bun scripts/sandbox.ts apply --plan research/sandbox/plans/example-three-employees.json
```

Dry-run the plan:

```bash
bun scripts/sandbox.ts apply --plan research/sandbox/plans/example-three-employees.json --dry-run
```

Apply reports are written under `research/sandbox/apply/`. Those reports feed back into future `reset` runs so setup-created entities are cleaned automatically later.

### Run

Run one deterministic strategy in sandbox mode with manual task/input pinning:

```bash
bun scripts/sandbox.ts run \
  --task 06 \
  --strategy 06.create-employee.v1 \
  --input-file research/proofs/task-06/task-06-proof-input.json
```

This writes a normal deterministic artifact and stage directory under `research/sandbox/runs/`.

### Verify

Canonical reset + optional setup + deterministic run + verification-plan inspection:

```bash
bun scripts/sandbox.ts verify \
  --task 06 \
  --strategy 06.create-employee.v1 \
  --input-file research/proofs/task-06/task-06-proof-input.json
```

With explicit setup first:

```bash
bun scripts/sandbox.ts verify \
  --task 06 \
  --strategy 06.create-employee.v1 \
  --input-file research/proofs/task-06/task-06-proof-input.json \
  --setup-plan research/sandbox/plans/example-three-employees.json
```

If you have already cleaned and seeded the sandbox manually and do not want another cleanup pass:

```bash
bun scripts/sandbox.ts verify \
  --task 06 \
  --strategy 06.create-employee.v1 \
  --input-file research/proofs/task-06/task-06-proof-input.json \
  --no-reset
```

`verify` still writes the normal research verification report under `research/verifications/task-XX/`.

### Request

Raw request escape hatch for operators and agents:

```bash
bun scripts/sandbox.ts request GET /customer --query organizationNumber=123456789 --query fields=*
```

With a JSON body:

```bash
bun scripts/sandbox.ts request POST /department --body-json '{"name":"Sandbox Ops"}'
```

Or from a file:

```bash
bun scripts/sandbox.ts request POST /customer --body-file tmp/customer.json
```

### Inspect

Pretty JSON read helper for direct state inspection:

```bash
bun scripts/sandbox.ts inspect get /invoice/12345 --query 'fields=*,customer(*),orders(*,orderLines(*))'
```

`inspect` is just a constrained `GET` wrapper over the same live sandbox credentials.

## Setup Plan Format

Setup plans are JSON files with schema `tripletex2.sandbox-plan.v1`.

Shape:

```json
{
  "schemaVersion": "tripletex2.sandbox-plan.v1",
  "planId": "example-plan",
  "initialValues": {
    "startDate": "2026-03-21"
  },
  "steps": [
    {
      "stepId": "create-customer",
      "method": "POST",
      "path": "/customer",
      "body": {
        "name": "Fixture Customer"
      },
      "capture": {
        "customerId": "value.id"
      }
    },
    {
      "stepId": "create-project",
      "method": "POST",
      "path": "/project",
      "body": {
        "name": "Fixture Project",
        "customer": {
          "id": "{{customerId}}"
        }
      }
    }
  ]
}
```

Rules:

- `initialValues` seeds reusable template variables before any request runs.
- `{{variableName}}` can be used in `path`, `query`, and `body`.
- `capture` stores response values by dotted path for later steps.
- if a string value is exactly one template expression, the original scalar type is preserved, so captured numeric ids stay numeric.
- `continueOnError` is optional; otherwise the plan stops at the first failed step.

Example file:

- [`research/sandbox/plans/example-three-employees.json`](../research/sandbox/plans/example-three-employees.json)

## Credential Source

The CLI loads credentials from:

1. `TRIPLETEX_TEST_BASE_URL` and `TRIPLETEX_TEST_SESSION_TOKEN`, or
2. [`tasks/tripletex2/.sandbox.env`](../.sandbox.env)

## Current Limitations

- Verification-plan coverage is still task-by-task, not universal.
- Batch-create endpoints that return arrays are supported in the setup-plan runner and partially supported in reset discovery through task-aware artifact supplements.
- Best-effort reset is intentionally aggressive for sandbox-created entities, but it is still evidence-driven, not true sandbox reprovisioning.
