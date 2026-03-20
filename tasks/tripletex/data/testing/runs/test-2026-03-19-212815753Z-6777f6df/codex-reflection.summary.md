## 1. Task

Post-run learning pass for the create-customer run.

Required follow-up completed:
- reflected on the original run
- proved the correct path in sandbox with Bun + TypeScript only
- updated learning docs
- made one git commit
- wrote this summary

## 2. Reflection

What went well:
- the scored task itself used the correct minimal write path: one `POST /customer`
- no unnecessary `GET` was used in the scored run
- the write response was used as verification, which matched the score-critical fields

What went poorly:
- I spent one wasted shell call on `br list`; `br` was not installed, and it had no value for this exact Tripletex create task
- OpenAPI navigation was briefly sloppy: the first schema slice I opened was a later customer-related/read-only representation, not the actual `#/components/schemas/Customer` used by `POST /customer`
- that did not cause a bad API call, but it was wasted investigation time and a weak assumption risk

Correct approach:
- match task to the existing create-customer playbook immediately
- confirm `/customer` `post` request body points to `#/components/schemas/Customer`
- ignore other similarly named customer/account schemas unless the endpoint actually references them
- send one minimal `POST /customer`
- verify from `201 {"value": {...}}`
- stop

## 3. Root Causes

- Over-followed a general environment instruction (`br list`) instead of prioritizing the task-local fastest path.
- Used broad text search in `openapi.json`, which surfaced unrelated customer-shaped schemas before the endpoint-linked one.
- The docs did not explicitly warn that `openapi.json` contains multiple misleading customer-related schemas, some read-only.

## 4. Sandbox Verification

I proved the path with a fresh sandbox-only script in the run scripts directory, using the provided sandbox credentials and one API write.

Verified flow:
- `POST https://kkpqfuj-amager.tripletex.dev/v2/customer`
- Basic Auth username `0`, password = provided session token
- payload only:
  ```json
  {
    "name": "Playbook Verification AS 1773955827896",
    "email": "playbook-1773955827896@example.no",
    "organizationNumber": "558278978"
  }
  ```

Observed result:
- `201 Created`
- wrapper shape: `{"value": {...}}`
- returned fields matched payload exactly
- returned defaults also included:
  - `invoiceSendMethod: "EMAIL"`
  - `emailAttachmentType: "ATTACHMENT"`
- created sandbox customer id: `108146780`

This confirms the correct solution shape is still:
- no pre-read
- no follow-up `GET`
- one minimal `POST /customer`
- verify from the write response

## 5. Playbook Changes

Updated existing playbook. No new playbook created.

Changed files:
- [AGENTS.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md)
- [create-customer.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-customer.md)

Exact playbook paths changed:
- [create-customer.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-customer.md)

What changed:
- added a general AGENTS rule: when multiple similar schemas exist, trust the schema directly referenced by the chosen endpoint
- sharpened the create-customer playbook with:
  - the `{"value": {...}}` response shape
  - the OpenAPI navigation trap around misleading customer/account schemas
  - explicit verification guidance from the write response

## 6. Commit

Git commit hash:
- `c016ceddb70c31f24aeea0fb7dd5a8278abfc7e2`

Git commit message:
- `tripletex playbook: sharpen create customer guidance`

## 7. Reusable Heuristics

- For Tripletex, start from endpoint-to-schema linkage, not keyword search alone.
- If a create task exactly matches a playbook, treat that playbook as the default path unless the prompt adds constraints.
- On simple create tasks, a failed local shell helper is noise; do not let repo tooling checks delay the API plan.
- When `POST` returns the scored fields in `value`, that is primary verification; do not add a `GET`.
- If `openapi.json` shows several similar schemas, nearby/read-only shapes are not evidence; only the schema referenced by the operation matters.