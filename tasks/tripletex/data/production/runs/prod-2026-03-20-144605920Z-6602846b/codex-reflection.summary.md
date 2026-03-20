## 1. Task

Post-run learning pass for the production task: create customer `Solmar SL`, org no `879505631`, address `Parkveien 49, 4611 Kristiansand`, email `post@solmar.no`.

## 2. Reflection

What went well:
- Production run used the correct exact-match trusted standard.
- Execution path was correct: one `POST /customer`, verify from `response.value`, stop.
- No unnecessary Tripletex reads and no `4xx`.

What went poorly:
- I did extra non-API local work before the write: opened the secondary playbook even though the trusted standard already matched exactly, and listed the scripts directory before creating the script.
- Those steps did not hurt API-call score, but they wasted wall-clock time and attention.

Correct approach:
- For this exact task shape, trust `./trusted-standards/create-customer.md` immediately.
- Build the minimal payload with `name`, `email`, `organizationNumber`, and one `postalAddress`.
- Execute one `POST /customer`.
- Verify only from the `201 {"value": ...}` body.

## 3. Call Efficiency

The production run was minimal-call for Tripletex API usage.

API calls used:
- `POST /customer`

Wasted Tripletex API calls:
- None.

Lower-call path for the next agent:
- No lower-call path exists for this exact task shape.
- Exact path: one `POST /customer`, then stop if `response.value` already contains the scored fields.

Local non-API inefficiencies to avoid next time:
- Do not re-read the playbook when the trusted standard already matches exactly.
- Do not inspect the scripts directory unless there is an actual file-collision risk.

## 4. Root Causes

Minor inefficiencies came from over-validation habits:
- I double-checked the playbook despite an exact trusted-standard match.
- I checked the scripts directory even though creating a new uniquely named script was enough.

Potential future failure modes for similar tasks:
- Adding `GET /customer` to look for duplicates.
- Adding `GET /customer/{id}` after a successful create.
- Misreading the returned sparse `physicalAddress` link as a missing-field problem.
- Mapping localized generic email labels like `Correo` to `invoiceEmail` instead of `email`.
- Inventing `physicalAddress` or `invoiceEmail` when the prompt does not ask for them.

## 5. Sandbox Verification

Used only sandbox credentials.

Proof run:
- Wrote and ran `scripts/sandbox_verify_create_customer.ts`.
- Executed one sandbox call: `POST https://kkpqfuj-amager.tripletex.dev/v2/customer`.

Sandbox payload shape:
- `name`: `Solmar Reflection 6602846b AS`
- `email`: `post-reflection-6602846b@solmar.no`
- `organizationNumber`: `999660284`
- `postalAddress.addressLine1`: `Parkveien 49`
- `postalAddress.postalCode`: `4611`
- `postalAddress.city`: `Kristiansand`

Sandbox result:
- Created customer `id=108246353`
- Response returned exact scored postal fields
- Response also auto-returned sparse `physicalAddress`
- Response defaulted `invoiceSendMethod=EMAIL` and `emailAttachmentType=ATTACHMENT`
- No follow-up `GET` was needed

## 6. Playbook Changes

Updated existing artifacts; created no new files.

Changed paths:
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-customer.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-customer.md`

What changed:
- Added explicit guidance that localized generic email labels such as `Correo` still map to `email`, not `invoiceEmail`.
- Added a new 2026-03-20 persistent-sandbox verification datapoint for the `Parkveien 49 / 4611 / Kristiansand` postal-address shape.
- Reinforced that the sparse returned `physicalAddress` link is not a reason for an extra read.

## 7. Commit

Commit hash:
- `c0d6c0b832a25d99349c1a9e828d6e80281f36e7`

Commit message:
- `tripletex playbook: refine create-customer fast path`

## 8. Reusable Heuristics

- Exact-match trusted standard beats extra spec/playbook checking.
- For standard Norwegian create-customer tasks, default to one `POST /customer`.
- Reuse `response.value`; do not add post-create reads when it already proves the scored fields.
- One normal address means `postalAddress` only.
- One generic email, even if labeled `Correo`, means `email`.
- Sparse auto-generated links in write responses are usually not verification failures by themselves.