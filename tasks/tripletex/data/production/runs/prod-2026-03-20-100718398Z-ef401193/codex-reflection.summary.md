## Task
Post-run learning pass for the failed create-customer run with prompt creds `https://example.invalid/v2` + `dummy`: reflect, prove the correct path in sandbox, update learning docs, commit only the doc changes.

## Reflection
- Good: matched the exact customer-create playbook, confirmed `POST /customer` in `openapi.json`, used a Bun TypeScript script in the allowed run scripts dir, and relied on write-response verification logic.
- Poor: after seeing an obviously fake host and token, I still spent time on a doomed network attempt and then extra local inspection of run metadata/spec context that could not change the outcome.
- Mistakes: one wasted connect attempt to `example.invalid`, plus unnecessary follow-up searches/reads after the blocker was already decisive.
- Correct approach: for this task shape, confirm the narrow `POST /customer` flow locally, then if creds are clearly placeholders, stop and report blocked. With real creds, do one `POST /customer` with only `name`, `email`, `organizationNumber`, then verify from the `201 {"value": ...}` response.

## Root Causes
- Missing explicit stop-rule in docs for obviously fake base URLs/tokens.
- Weak assumption: I treated a credential/connectivity blocker as if it might still be an API-shape problem.
- Over-exploration habit: after a decisive blocker, I still inspected `request.json`, `manifest.json`, and broader context instead of stopping.

## Sandbox Verification
- Used only the provided persistent sandbox creds.
- Re-confirmed the exact spec path: `POST /customer`, request schema `Customer`, response schema `ResponseWrapperCustomer`.
- Proved the winning flow with one write and zero reads:
  - Payload: `{"name":"Codex Post Run 372928 AS","email":"codex-post-run-372928@example.no","organizationNumber":"999372928"}`
  - Result: `201 Created`, `value.id=108240652`
  - Verified directly from the write response: same `name`, `email`, `organizationNumber`
  - Also observed defaults: `invoiceSendMethod=EMAIL`, `emailAttachmentType=ATTACHMENT`

## Playbook Changes
- Updated an existing playbook; no new playbook created.
- Updated [AGENTS.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md) to make placeholder-credential handling explicit, including that obviously fake host+token pairs can be treated as blocked without a doomed network call.
- Updated [task-playbooks/create-customer.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-customer.md) to record the new sandbox proof and the create-customer credential/connectivity trap.
- Exact playbook paths changed:
  - [task-playbooks/create-customer.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-customer.md)

## Commit
- `cddad3b`
- `tripletex playbook: handle blocked create-customer credentials`

## Reusable Heuristics
- Exact-match create-customer task: confirm only `/customer` `POST` + `Customer` + `ResponseWrapperCustomer`; do not widen spec search.
- Minimal winning payload remains `{name,email,organizationNumber}` unless the prompt explicitly adds address or invoicing requirements.
- If base URL is a reserved placeholder like `example.invalid` and token is obvious dummy text, treat the run as blocked; do not try alternate hosts or extra API reads.
- If creds look real and the request fails before any HTTP status, treat that as connectivity/credential failure, not a hint to change payload shape.
- Standard customer-create verification should come from the `201` write response; no follow-up `GET` is needed.