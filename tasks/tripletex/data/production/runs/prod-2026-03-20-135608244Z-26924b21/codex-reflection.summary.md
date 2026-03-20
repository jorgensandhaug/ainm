## 1. Task

Post-run learning pass for the production task: create customer `Greenfield Ltd`, org no `872154442`, address `Sjøgata 85, 7010 Trondheim`, email `post@greenfield.no`, then validate the correct path in sandbox and update docs.

## 2. Reflection

What went well:
- Original run used the correct low-call path: one `POST /customer`, zero Tripletex reads, verify from `response.value`.
- Payload shape was correct: `name`, `organizationNumber`, `email`, `postalAddress.addressLine1`, `postalAddress.postalCode`, `postalAddress.city`.
- Unicode was preserved correctly.

What went poorly:
- I still read the playbook after finding an exact trusted-standard match. That was unnecessary local overhead.
- I also checked the scripts directory before writing. Safe, but not part of the minimal decision path.

Mistakes:
- No API mistake happened in production.
- No extra Tripletex call was burned.
- The docs were missing one response-shape nuance: `POST /customer` can auto-return a sparse `physicalAddress` link even when only `postalAddress` was sent.

Correct approach:
- Match exact trusted standard.
- Write one bun TypeScript script in the run scripts dir.
- `POST /customer`.
- Verify only the scored fields from `response.value`.
- Ignore sparse non-scored link objects like auto-returned `physicalAddress`.

## 3. Root Causes

- Habitual over-confirmation: I read both trusted standard and playbook even though the trusted standard already covered the exact task.
- Missing doc note: the customer-create docs said not to send `physicalAddress`, but did not say the response may still include one as a sparse link object.
- Because that nuance was undocumented, a future agent could waste a follow-up `GET` or wrongly think the payload was incomplete.

## 4. Sandbox Verification

Used sandbox credentials only, via bun TypeScript in the allowed run scripts dir.

Proof run:
- Script: `scripts/verify-create-customer-sandbox.ts`
- Call count: 1 Tripletex API call
- Endpoint: `POST /customer`
- Payload:
  - `name`: `Codex Reflection 269241 AS`
  - `organizationNumber`: `999269241`
  - `email`: `codex-reflection-269241@example.no`
  - `postalAddress.addressLine1`: `Sjøgata 85`
  - `postalAddress.postalCode`: `7010`
  - `postalAddress.city`: `Trondheim`

Observed response:
- Customer created with `id=108245322`
- Returned scored fields matched exactly
- Returned defaults included `invoiceSendMethod=EMAIL` and `emailAttachmentType=ATTACHMENT`
- Response also included a sparse `physicalAddress` link object with only `id` and `url`

Proved solution shape:
- Standard customer create remains a one-call `POST /customer`
- Zero verification reads needed
- Sparse `physicalAddress` in the write response is ignorable for this task shape

## 5. Playbook Changes

Updated existing docs:
- `tasks/tripletex/codex-environment/AGENTS.md`
- `tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md`
- `tasks/tripletex/codex-environment/task-playbooks/create-customer.md`

Committed trusted standard path:
- `tasks/tripletex/codex-environment/trusted-standards/create-customer.md`

Changes made:
- Added the new customer-create response-shape gotcha to `AGENTS.md`
- Added a customer endpoint verification note to `trusted-standards/common-endpoints.md`
- Clarified in `trusted-standards/create-customer.md` that sparse auto-generated `physicalAddress` should be ignored unless explicitly requested
- Added sandbox proof and verification guidance to `task-playbooks/create-customer.md`

## 6. Commit

- Commit hash: `2a106ddb7341d4000a12f7a7694649dc3aaf5d4e`
- Commit message: `tripletex playbook: clarify customer create verification`

## 7. Reusable Heuristics

- For exact trusted-standard matches, stop at the trusted standard. Do not also read the playbook unless something materially differs.
- For plain customer-create tasks, the winning path is one `POST /customer` and direct verification from `response.value`.
- Send only prompt-required fields. For one normal address, use only `postalAddress`.
- Do not invent `physicalAddress` or `invoiceEmail`.
- If the write response includes extra sparse link objects, do not spend a `GET` unless the prompt scores those fields.
- Treat write responses as authoritative unless a scored field is missing.