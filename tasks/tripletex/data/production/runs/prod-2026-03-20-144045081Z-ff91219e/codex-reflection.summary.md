## 1. Task
Post-run learning pass for exact task shape: create one Norwegian customer with prompt-provided `name`, `email`, `organizationNumber`, then tighten reusable guidance.

## 2. Reflection
What went well:
- Original run used correct Tripletex path: one authenticated `POST /customer`.
- Payload was minimal and correct.
- Verification reused `response.value`; no extra Tripletex read.

What went poorly:
- I read both trusted standard and playbook even though trusted standard already exact-matched.
- I also did local environment checks (`ls`, `bun --version`) not needed for this task shape.

Correct approach:
- Match exact trusted standard immediately.
- Write one bun script in run scripts dir.
- `POST /customer` with only prompt fields.
- Verify from `response.value`.
- Stop.

## 3. Call Efficiency
Run was minimal-call on the Tripletex API.

API calls used:
- `POST /customer`

Wasted API calls:
- None.

Exact lower-call path next agent should follow:
- One `POST /customer` with:
```json
{
  "name": "<prompt name>",
  "email": "<prompt email>",
  "organizationNumber": "<prompt org number>"
}
```
- Trust `201 {"value": {...}}`.
- No `GET /customer`.
- No `GET /customer/{id}`.

## 4. Root Causes
- Mild over-preparation habit: I checked secondary docs after the trusted standard already resolved the task.
- I optimized for certainty in local prep, not for fastest exact-match execution.
- This did not hurt API-call score here, but it is still weaker than the ideal operating pattern.

## 5. Sandbox Verification
Used sandbox creds only.

Proof run:
- One bun TypeScript script in run scripts dir
- One `POST /customer`
- Response returned:
  - `id=108246240`
  - `name=Codex Reflection 722064 AS`
  - `email=codex-reflection-722064@example.no`
  - `organizationNumber=999722064`
  - `invoiceSendMethod=EMAIL`
  - `emailAttachmentType=ATTACHMENT`

Conclusion:
- Correct solution path for this task shape remains one write only.
- Write response is sufficient proof; no follow-up read needed.

## 6. Playbook Changes
Updated existing guidance; created no new files.

Changed paths:
- [AGENTS.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md)
- [trusted-standards/create-customer.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-customer.md)
- [trusted-standards/common-endpoints.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md)
- [task-playbooks/create-customer.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-customer.md)

What changed:
- Made one-call customer create fast path more explicit.
- Added explicit warning against `GET /customer` pre-read and `GET /customer/{id}` follow-up read.
- Added explicit warning against speculative invoice-delivery fields for standard shape.
- Added fresh sandbox proof entry from this follow-up run.
- Clarified that exact trusted-standard match is enough; no extra playbook/openapi re-check needed in scored run.

## 7. Commit
- Hash: `c570e88b9cc62a6af736b041854e6ed880064e07`
- Message: `tripletex playbook: tighten create-customer fast path`

## 8. Reusable Heuristics
- Exact trusted-standard match beats extra exploration.
- For plain Norwegian customer-create tasks, assume canonical path is one `POST /customer`.
- Reuse `response.value`; treat it as primary verification.
- Do not invent `invoiceEmail`, `invoiceSendMethod`, or `physicalAddress` unless prompt explicitly requires them.
- Avoid duplicate-check reads on fresh-account create tasks.
- If no scored field is missing from the write response, stop.