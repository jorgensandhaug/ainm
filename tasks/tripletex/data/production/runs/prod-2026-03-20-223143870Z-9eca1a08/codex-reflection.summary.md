## Task

Post-run learning pass for the scored Tripletex run that created three departments: `Lager`, `Økonomi`, `Drift`.

## Reflection

What went well:
- Original run matched the existing exact trusted standard.
- Used one write call: `POST /department/list`.
- Reused write response only; no follow-up `GET`.
- Preserved prompt names exactly, including `Ø`.

What went poorly:
- No API-path mistake happened.
- Main gap was doc coverage: the department docs already proved German/multilingual batch-create, but they did not explicitly record this Spanish prompt plus exact Unicode-name preservation.

Correct approach:
- Treat exact multi-department create as one-call batch create.
- Send only minimal `name` objects.
- Trust `values[]` from the `201` write response.
- Stop.

## Call Efficiency

The scored run was minimal-call.

Calls used:
- `POST /department/list`

Wasted API calls:
- None.

Exact lower-call path for the next agent:
- `POST /department/list` with:
```json
[
  { "name": "Lager" },
  { "name": "Økonomi" },
  { "name": "Drift" }
]
```

Avoid:
- `GET /department` pre-reads
- splitting into three `POST /department` calls
- `GET /department/{id}` verification reads
- mistrusting a successful batch write because wrapper `fullResultSize` is `0`

## Root Causes

No scoring miss in the original run.

Small documentation weakness:
- multilingual evidence existed, but this exact Spanish prompt family was not recorded explicitly
- Unicode-preservation for department names like `Økonomi` was implied globally, not stated in the department-specific docs

Pitfalls for future agents:
- ASCII-normalizing `Økonomi`
- building URLs with a leading slash against a base URL that already ends in `/v2`
- assuming persistent-sandbox duplicate names justify a production pre-read
- treating `fullResultSize=0` as a failed batch create when `values[]` is correct

## Sandbox Verification

Used persistent sandbox credentials only.

Proof run:
- one `POST /department/list`
- payload names:
  - `Lager sandbox 20260320-223143`
  - `Økonomi sandbox 20260320-223143`
  - `Drift sandbox 20260320-223143`

Returned created departments in `values[]`:
- `917197` `Lager sandbox 20260320-223143`
- `917198` `Økonomi sandbox 20260320-223143`
- `917200` `Drift sandbox 20260320-223143`

What this proved:
- one-call batch path still works
- exact Unicode names survive unchanged in response
- no prerequisite read or follow-up read needed

## Playbook Changes

Updated existing docs, created no new files.

Changed files:
- `trusted-standards/create-department.md`
- `task-playbooks/create-department.md`

Changes made:
- added Spanish exact-match evidence for the three-department shape
- added explicit guidance to preserve non-ASCII department names exactly
- added sandbox re-proof note that `POST /department/list` preserves `Økonomi`-style names in `values[]`

Not changed:
- `AGENTS.md`
- `trusted-standards/common-endpoints.md`

Reason not changed:
- no endpoint shape, prerequisite rule, or canonical low-call path changed

## Commit

Commit hash:
- `6e1f7b562be7bb6c43dda600f4ecf45c1ab06d75`

Commit message:
- `tripletex playbook: tighten create-department guidance`

## Reusable Heuristics

- Exact multi-department create: default to one `POST /department/list`.
- For this shape, minimal payload is enough: send only `name`.
- Verify from `values[]`, not from wrapper metadata.
- Preserve prompt strings exactly, including non-ASCII letters.
- If trusted standard exactly matches, do not re-open `openapi.json` during the scored run.
- Persistent sandbox duplication risk does not justify production discovery reads for fresh-account pure-create tasks.