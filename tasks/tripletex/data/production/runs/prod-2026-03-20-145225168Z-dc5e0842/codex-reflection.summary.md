## 1. Task

Post-run learning pass for production task shape: create/register one supplier with prompt-provided `name`, `organizationNumber`, and generic `email`, then update Tripletex learning artifacts and commit them.

## 2. Reflection

Production run succeeded cleanly. The write shape was correct: one `POST /supplier` with `name`, `organizationNumber`, and `email`, verified from the `201` write response, no follow-up `GET`, no `4xx`.

What went well:
- Correct endpoint chosen: `POST /supplier`
- Correct field mapping: generic prompt email mapped to `email`
- Correct verification strategy: reused `response.value` instead of spending a read
- Correct auth and script placement

What went poorly:
- There was no dedicated create-supplier trusted standard or playbook, so I had to inspect `openapi.json` manually.
- The initial spec search was broader than ideal. It did not cost API calls, but it did cost time and added avoidable local context noise.

Correct approach for next time:
- Match exact task shape to a dedicated trusted standard.
- Skip `openapi.json` entirely for exact matches.
- Execute one `POST /supplier`, verify from `response.value`, stop.

## 3. Call Efficiency

The production run was minimal-call on the Tripletex API.

API calls used:
- `POST /supplier`

Wasted API calls:
- none

Exact lower-call path for the next agent:
- same as production, because one write is already the floor:
  1. `POST /supplier`
  2. verify `response.value.name`, `response.value.organizationNumber`, `response.value.email`
  3. stop

Non-API inefficiency that existed:
- broader-than-needed local spec search due missing supplier-create standard

## 4. Root Causes

- Missing documentation root cause: no dedicated `create-supplier` trusted standard or playbook existed.
- Context-noise root cause: supplier create had to be inferred from generic `/supplier` schema inspection.
- Future failure risk:
  - mapping generic `Email` to `invoiceEmail`
  - adding `GET /supplier` duplicate-check logic on fresh-account create tasks
  - adding `GET /supplier/{id}` after a successful `201`
  - inventing address fields because the response auto-returns sparse address links
  - getting distracted by supplier-invoice endpoints when the task is only supplier creation

## 5. Sandbox Verification

Persistent sandbox credentials used, not production credentials.

Proof run:
- one `POST /supplier`
- payload:
  - `name`: `Codex Reflection Supplier 321000002`
  - `organizationNumber`: `321000002`
  - `email`: `supplier-321000002@example.no`

Observed result:
- `201 Created`
- returned supplier `id=108246490`
- returned `organizationNumber=321000002`
- returned `email=supplier-321000002@example.no`
- returned `ledgerAccount.id=424190921`
- returned sparse `postalAddress` and `physicalAddress` link objects
- no follow-up `GET` needed

Conclusion:
- exact task shape is proven one-call in persistent sandbox

## 6. Playbook Changes

Created new trusted standard:
- `./trusted-standards/create-supplier.md`

Created new playbook:
- `./task-playbooks/create-supplier.md`

Updated existing shared docs:
- `./trusted-standards/common-endpoints.md`
- `./AGENTS.md`

What changed:
- codified one-call supplier-create path
- codified generic email -> `email`, not `invoiceEmail`
- codified no pre-read / no post-read
- codified sparse address-link response as non-problem
- added supplier-create entries to Trusted Standards and Task Playbooks tables in `AGENTS.md`

## 7. Commit

Commit hash:
- `b32f6b52ae86d079ab5ae50c76beeaef6b264df2`

Commit message:
- `tripletex playbook: add create supplier standard`

## 8. Reusable Heuristics

- Exact create-supplier prompt with `name` + generic `email` + `organizationNumber`: use one `POST /supplier`.
- Verify from `response.value`; default extra reads to zero.
- Reuse returned `ledgerAccount.id` if later supplier-ledger work appears.
- Do not map a generic prompt email to `invoiceEmail` unless the prompt explicitly says billing/invoice email.
- Do not invent postal/physical/delivery addresses for the plain supplier-create shape.
- Do not treat sparse returned `postalAddress` or `physicalAddress` links as missing data.
- Do not browse supplier-invoice endpoints for a plain supplier-create task.