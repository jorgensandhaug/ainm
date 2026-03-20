## 1. Task

Do post-run learning for the exact customer-create session, prove the correct path in sandbox, update learning docs, make one scoped commit, and write this summary.

## 2. Reflection

What went well:
- Original Tripletex path was correct.
- Used the right endpoint: `POST /customer`.
- Reused the write response for verification.
- Avoided unnecessary Tripletex `GET`s.
- No Tripletex `4xx`.

What went poorly:
- Local exploration was broader than needed for an exact playbook match.
- Wasted local calls: `br list` failed, then `pwd`, customer-schema key enumeration, script-dir listing, and `bun --version`.
- Those did not hurt API score directly, but they spent budget and added noise.

Correct approach:
- Match prompt to `./task-playbooks/create-customer.md`.
- Confirm only `POST /customer` plus its referenced `Customer` and `ResponseWrapperCustomer` schemas in `./openapi.json`.
- Send minimal payload:
```json
{
  "name": "Same Agent Prompt Test AS",
  "email": "post@same-agent-prompt.no",
  "organizationNumber": "999888777"
}
```
- Verify from `response.value`.
- Stop.

## 3. Root Causes

- No explicit doc rule said to narrow exploration when a prompt is an exact playbook match.
- I followed a generic repo-start habit (`br list`) even though it was irrelevant once the create-customer playbook clearly matched.
- I over-validated locally by enumerating customer-related schemas instead of trusting the operation-linked schema.

## 4. Sandbox Verification

Used only the provided sandbox credentials.

Proof run:
- Wrote and ran a Bun TypeScript script in the allowed run scripts dir.
- Single API call: `POST https://kkpqfuj-amager.tripletex.dev/v2/customer`
- Payload fields only: `name`, `email`, `organizationNumber`

Returned `201` with:
- `id: 108155012`
- `customerNumber: 10009`
- `name: Codex Reflection Verify 20260319T221101Z AS`
- `email: verify-20260319t221101z@same-agent-prompt.no`
- `organizationNumber: 910000004`
- `invoiceSendMethod: EMAIL`
- `emailAttachmentType: ATTACHMENT`

This confirmed the minimal one-write path again. No follow-up `GET` needed.

## 5. Playbook Changes

Updated existing playbook. No new playbook created.

Changed paths:
- `./task-playbooks/create-customer.md`
- `./AGENTS.md`

What changed:
- Added an exact-match fast path to the customer-create playbook.
- Recorded re-verification that `name` + `email` + `organizationNumber` is sufficient.
- Tightened `AGENTS.md` to say: when a prompt is an exact playbook match, keep pre-write exploration narrow and avoid unrelated repo/tooling checks.

## 6. Commit

- Hash: `2d738a251c552ea44c6baea1faff7b56029fbc05`
- Message: `tripletex playbook: tighten create-customer fast path`

## 7. Reusable Heuristics

- If a prompt exactly matches a playbook, trust the playbook first and verify only the exact endpoint/schema it cites.
- For simple create-customer tasks, default to one `POST /customer` and zero reads.
- Treat the write response as the primary verification artifact.
- Broad schema fishing is usually worse than operation-linked schema confirmation.
- Generic repo-start rituals are optional; skip them when they do not change the API plan.