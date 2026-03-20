## Task

Post-run learning pass for production run `prod-2026-03-20-062726300Z-721c40f2`: reflect on original run, prove correct solution path in sandbox only, update learning artifacts, commit only `AGENTS.md` and playbook changes, then write this summary.

## Reflection

What went well:
- Original run chose the correct task match: simple create-customer.
- Original run used correct auth format, correct endpoint `POST /customer`, correct minimal payload, and verified from the `201` write response only.
- No unnecessary Tripletex `GET` calls. No `4xx`. Final side effect was correct.

What went poorly:
- Spec inspection was noisy and wider than needed.
- It ran a broad `rg` over `openapi.json` for generic terms like `name`, `email`, `organizationNumber`, `postalAddress`, `invoiceEmail`, etc.
- That produced a huge irrelevant dump from the spec and added local-tool overhead/context noise.
- It also spent one useless local call on `pwd`.

Correct approach:
- For this exact task shape, read the matching playbook.
- Inspect only `/customer` `post`, `#/components/schemas/Customer`, and `#/components/schemas/ResponseWrapperCustomer`.
- Write one script in the run scripts dir.
- `POST /customer` once with only `name`, `email`, `organizationNumber`.
- Verify from `response.value` and stop.

## Root Causes

- Missing explicit instruction in the system/playbook to avoid broad whole-spec keyword search on exact-match create tasks.
- Weak assumption: more spec grep equals safer execution. Here it added noise, not safety.
- Local efficiency discipline was weaker than API efficiency discipline.
- No API-shape mistake happened; the mistake was pre-write navigation overhead.

## Sandbox Verification

Used only provided sandbox creds at `https://kkpqfuj-amager.tripletex.dev/v2`.

Proof run:
- Script: `/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-062726300Z-721c40f2/scripts/verify-create-customer-reflection.ts`
- Flow: one `POST /customer`, zero reads
- Payload fields only: `name`, `email`, `organizationNumber`
- Result: `201 Created`
- Verified response:
  - `id`: `108236365`
  - `name`: `Reflection Learning 88227505 AS`
  - `email`: `reflection-88227505@example.no`
  - `organizationNumber`: `988227505`
  - `invoiceSendMethod`: `EMAIL`
  - `emailAttachmentType`: `ATTACHMENT`

This re-proved the winning path: one write, verify from response body, stop.

## Playbook Changes

Updated existing playbook. No new playbook created.

Changed learning artifacts:
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-customer.md`

Exact playbook paths changed:
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-customer.md`

What changed:
- Added explicit guidance in `AGENTS.md` to use narrow endpoint/schema extraction for exact-match playbook tasks.
- Added explicit warning in `AGENTS.md` against broad whole-spec keyword searches for common fields.
- Updated `create-customer.md` with a 2026-03-20 re-verification note.
- Added `create-customer.md` guidance to inspect only `/customer` `post` + `Customer` + `ResponseWrapperCustomer`.
- Added `create-customer.md` note that broad whole-file keyword search is an efficiency mistake for this task shape.

## Commit

- Commit hash: `d9f9672a86b797a76fa48c268e83158a1f587264`
- Commit message: `tripletex playbook: tighten create-customer spec navigation`

## Reusable Heuristics

- If a playbook exactly matches a pure create task, trust the playbook and inspect only the exact endpoint block plus referenced write/response schemas.
- Broad `openapi.json` grep on generic field names is usually local waste, not safety.
- Distinguish API efficiency from local-tool efficiency; both matter.
- For Tripletex create flows, prefer proving correctness from the write response before considering any read.
- When the run already has zero `4xx` and correct side effects, the useful learning may be tooling/navigation discipline, not endpoint shape.