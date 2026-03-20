## 1. Task

Post-run learning pass for the customer-creation run. Required work:
- reflect on mistakes and correct flow
- verify correct flow in sandbox
- update playbook system
- commit only `AGENTS.md` and `task-playbooks/` docs
- provide final summary

## 2. Reflection

What went well:
- I checked `openapi.json` before writing.
- I used Basic Auth correctly.
- I reused the `POST` response as final verification instead of doing a follow-up `GET`.
- The task still succeeded.

What went poorly:
- I inserted an unnecessary pre-read: `GET /customer?organizationNumber=...&fields=*`.
- I added update/idempotency logic for a task that was plainly “create a customer”.
- That extra branch made the script longer and the API flow less efficient than necessary.

Correct approach:
- For a simple customer-create task on a scored run, confirm `POST /customer` and send one minimal payload with the requested fields.
- Verify requested fields directly from the `201` write response.
- Stop.

## 3. Root Causes

- I overweighted the “sandbox may be persistent” note and underweighted the explicit “real submissions use a fresh Tripletex account” rule.
- I optimized for idempotency instead of score.
- I treated “possible duplicate” as a reason to read first even though the prompt was a straightforward create task.
- I did not convert the general rule “Create single entity: one targeted POST” into the concrete execution choice for this task.

## 4. Sandbox Verification

I proved the corrected path with a zero-read sandbox script:
- Script: `/home/jorge/repos/ainm/tasks/tripletex/data/testing/runs/test-2026-03-19-211633572Z-2ec9eaf6/scripts/sandbox_verify_create_customer.ts`
- API flow: one `POST /customer`
- Payload used:
  - `name`: `Reflection Learning 347050 AS`
  - `email`: `post+347050@reflection-learning.no`
  - `organizationNumber`: `934705034`

Observed result:
- Created customer id `108145182`
- Response echoed the requested fields correctly
- Response also showed defaulted fields like `invoiceSendMethod=EMAIL` and `emailAttachmentType=ATTACHMENT`
- No pre-read was needed
- No follow-up verification read was needed

Correct solution shape for the original task:
- `POST /customer` with:
  - `name`: `Reflection Smoke Test AS`
  - `email`: `post@reflection-smoke.no`
  - `organizationNumber`: `999888777`

## 5. Playbook Changes

Created new playbook:
- `./task-playbooks/create-customer.md`

Updated system doc:
- `./AGENTS.md`

Exact playbook paths changed in repo state/commit:
- `tasks/tripletex/codex-environment/task-playbooks/create-customer.md`
- `tasks/tripletex/codex-environment/task-playbooks/create-and-send-customer-invoice.md`

Note:
- The learning edit was the new `create-customer.md`.
- `create-and-send-customer-invoice.md` was not changed for this learning, but it was already present and got included because the `task-playbooks/` directory was untracked in this repo state.

Key documentation change:
- Added an explicit rule to avoid sandbox-idempotency reads in scored create tasks unless the prompt implies update/delete/existing-object lookup.
- Added a dedicated create-customer playbook documenting the one-call `POST` default.

## 6. Commit

- Commit hash: `f6da43d`
- Commit message: `tripletex playbook: add customer creation guidance`

## 7. Reusable Heuristics

- If the task is “create one entity” and the prompt provides all fields, default to one `POST`.
- Treat fresh-account competition assumptions as primary; do not import sandbox-persistence defenses into scored runs unless the prompt requires them.
- For Tripletex writes, trust the write response first; do not add verification `GET`s unless the response lacks a scored field.
- Add lookup logic only for update/delete/locate-existing tasks, not for plain creates.
- When a general rule says “single entity => one targeted POST”, force that into the concrete API plan before coding.