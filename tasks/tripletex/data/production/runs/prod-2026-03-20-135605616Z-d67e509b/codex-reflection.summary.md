## 1. Task

Post-run learning pass for the department-create production run.

Production task shape was exact-match: create three departments from prompt-provided names. Correct low-call path was one `POST /department/list` write and stop.

## 2. Reflection

What went well:
- Used exact trusted-standard shape.
- Chose one batch write instead of three single writes.
- Avoided all unnecessary `GET`s and all `4xx`s.
- Reused write response as verification.

What went poorly:
- I treated the run as done once the side effect succeeded, but did not capture a newly observed response quirk into docs during the scored run.
- The production response showed `fullResultSize=0` on a successful batch create. That could mislead future verification logic if an agent trusts wrapper metadata over `values[]`.

Mistakes:
- No API-flow mistake in the scored run.
- Documentation gap: the current guidance did not explicitly warn that `POST /department/list` may return correct `values[]` with misleading top-level list metadata.

Correct approach:
- For exact department-create prompts, go straight to `POST /department/list` for multiple names.
- Verify from `values[]` and returned department fields (`id`, `name`, `displayName`, `isInactive`).
- Ignore `fullResultSize` for batch-create verification.

## 3. Root Causes

- The docs already covered the minimal path, but not the batch-write wrapper quirk.
- Tripletex reuses list-style wrapper fields on a write response; those fields are not authoritative for create verification.
- Without an explicit note, a future agent could waste a recovery `GET` or wrongly think the batch write partially failed.

## 4. Sandbox Verification

Used sandbox credentials only. No reuse of production credentials.

Proof script:
- `/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-135605616Z-d67e509b/scripts/sandbox_verify_create_departments.ts`

Sandbox call:
- `POST /department/list`
- Payload names:
  - `Dept reflection-20260320 A`
  - `Dept reflection-20260320 B`
  - `Dept reflection-20260320 C`

Observed response:
- `201` success
- `values[]` contained all 3 created departments in submitted order
- Returned ids: `902055`, `902056`, `902057`
- Returned `displayName` matched `name`
- Returned `isInactive=false`
- Top-level wrapper still had `fullResultSize=0`

Corrected verified rule:
- For department batch create, trust `values[]`; do not use `fullResultSize` as success/count proof.

## 5. Playbook Changes

Updated existing:
- `AGENTS.md`
- `trusted-standards/common-endpoints.md`
- `task-playbooks/create-department.md`

Created/tracked canonical trusted standard:
- `trusted-standards/create-department.md`

Exact paths changed:
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-department.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-department.md`

Content added:
- explicit batch-create verification rule for `/department/list`
- explicit warning that `fullResultSize` can stay `0` on successful writes
- sandbox re-verification note dated `2026-03-20`

## 6. Commit

Commit hash:
- `072790b`

Commit message:
- `tripletex playbook: document department batch response quirk`

## 7. Reusable Heuristics

- For exact-match trusted standards, do not reopen discovery unless live behavior contradicts the standard.
- On Tripletex write responses, trust entity payloads first; wrapper metadata may be list-shaped noise.
- For batch create verification, `values[]` beats `fullResultSize`.
- If a scored run succeeds but reveals a response-shape quirk, capture it in docs immediately after via sandbox repro, not by re-touching production credentials.
- For multi-department creation, one `POST /department/list` is the canonical minimal path.