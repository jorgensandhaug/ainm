## 1. Task
Post-run learning pass for a failed exact-match supplier-create run: create supplier `Sonnental GmbH`, org no. `957072445`, email `faktura@sonnentalgmbh.no`, then improve docs/playbooks from what was learned.

## 2. Reflection
What went well:
- Original run matched `./trusted-standards/create-supplier.md` correctly.
- It used the correct minimal intended production path: one `POST /supplier`.
- It did not waste follow-up reads after failure.

What went poorly:
- Production credentials were unusable; first write returned `403 {"error":"Invalid or expired token"}`.
- The docs had no explicit rule that this exact `403` should be treated as credential-blocked, so that heuristic was implicit rather than codified.

Correct approach:
- For this task shape, send exactly one `POST /supplier` with `name`, `organizationNumber`, `email`.
- If that first call returns `403 Invalid or expired token`, stop immediately and classify as blocked credentials.

## 3. Call Efficiency
Original run was minimal-call for the blocked run.

API calls used:
- `POST /supplier` once

Wasted API calls:
- None

Exact lower-call path for next agent on same task shape:
- With usable credentials: one call, `POST /supplier`, verify from `response.value`, stop.
- With unusable credentials that are not obviously fake up front: one call is still the realistic minimum to discover the block; after `403 Invalid or expired token`, stop.

## 4. Root Causes
- Root cause of failure: provided production session token was invalid or expired.
- Root cause of doc gap: AGENTS/playbooks documented `401` auth issues but not the observed decisive `403 Invalid or expired token` case.
- No payload-shape mistake happened; the request shape was correct for this task.

## 5. Sandbox Verification
Verified in persistent sandbox with one write only:
- `POST /supplier`
- Payload used: `Codex Reflection Supplier 197052414`, `197052414`, `supplier-197052414@example.no`
- Result: supplier `id=108246914`
- Response preserved scored fields directly in `value`
- Response also included `ledgerAccount.id=424190921`
- Response again auto-returned sparse `postalAddress` and `physicalAddress` links, confirming they do not justify a follow-up `GET`

Proved correct solution path:
- one `POST /supplier`
- no pre-read
- no post-create `GET`

## 6. Playbook Changes
Updated existing docs; created nothing new.

Changed paths:
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-supplier.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-supplier.md`

What changed:
- Added explicit rule: `403 {"error":"Invalid or expired token"}` means credential-blocked run; do not retry alternate endpoints/auth guesses.
- Added supplier-specific pitfall notes to stop after that auth failure.
- Added fresh sandbox re-verification evidence for the one-call supplier-create path.

## 7. Commit
Commit hash:
- `3cbdc3dcb5d51c70c483185386a2851fb7020e70`

Commit message:
- `tripletex playbook: tighten supplier create auth guidance`

## 8. Reusable Heuristics
- Exact supplier create with prompt-provided `name` + generic email + `organizationNumber`: use one `POST /supplier`.
- Map one generic prompt email to `email`, not `invoiceEmail`.
- Ignore sparse auto-returned `postalAddress`/`physicalAddress` links unless prompt scores address fields.
- Do not pre-read `/supplier` for fresh-account create tasks.
- Do not follow a successful supplier create with `GET /supplier/{id}` when `response.value` already contains scored fields.
- If first write returns `403 Invalid or expired token`, treat as blocked credentials, not as payload or endpoint uncertainty.