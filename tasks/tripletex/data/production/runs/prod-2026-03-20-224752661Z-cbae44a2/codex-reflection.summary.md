## 1. Task
Post-run learning pass for the scored Tripletex task: create three departments `Lager`, `Regnskap`, `Kvalitetskontroll`, audit call efficiency, prove the path in sandbox, update docs, and commit the learning.

## 2. Reflection
What went well:
- Production execution matched the exact trusted-standard shape.
- Used the correct one-call branch: `POST /department/list` with the three prompt names.
- Reused the write response for verification; no follow-up `GET`.
- Avoided `4xx` and avoided the `/v2` URL-join trap.

What went poorly:
- I still spent local reasoning time re-reading `common-endpoints.md` after the exact trusted standard already matched.
- That did not cost API calls, but it was still wasted operator work for a 300s scored run.

Correct approach:
- For this exact task shape, stop at [create-department.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-department.md), execute one batch write, verify from `values[]`, stop.

## 3. Call Efficiency
This run was minimal-call.

- API calls used: `1`
- Wasted API calls: `0`
- Realistic lower-call path: none; `POST /department/list` once is the floor.

Exact next-agent path:
1. `POST /department/list`
2. Body: `[{"name":"Lager"},{"name":"Regnskap"},{"name":"Kvalitetskontroll"}]`
3. Verify exact names from `values[]`
4. Ignore top-level `fullResultSize`
5. Stop

Non-API waste only:
- Unnecessary local read of `common-endpoints.md` after exact trusted-standard match.

## 4. Root Causes
- Over-validation habit: I double-checked repo guidance that was already superseded by the exact trusted standard.
- Doc gap: the department standard did not explicitly say to skip `common-endpoints.md` on exact match, so I added that instruction.

## 5. Sandbox Verification
Persistent sandbox proof used only sandbox credentials and one TypeScript `bun` script in the run scripts dir.

Executed path:
- `POST /department/list` with
  - `Lager Reflection cbae44a2`
  - `Regnskap Reflection cbae44a2`
  - `Kvalitetskontroll Reflection cbae44a2`

Observed result:
- One successful write
- `fullResultSize=0`
- `values[]` returned exact names in order
- Returned ids: `918333`, `918334`, `918335`

Conclusion:
- Same one-call floor holds in persistent sandbox.
- `fullResultSize=0` is still non-failing metadata for successful batch create.

## 6. Playbook Changes
Updated existing docs; created no new files.

Changed paths:
- [trusted-standards/create-department.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-department.md)
- [task-playbooks/create-department.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-department.md)

What changed:
- Trusted standard now explicitly says not to re-read `common-endpoints.md` or `openapi.json` for this exact match.
- Playbook now explicitly says to stop at the trusted standard when the prompt already exactly matches it.

## 7. Commit
- Hash: `47472c244f10608d43894ee19a7452f78de69629`
- Message: `tripletex playbook: re-confirm department batch create floor`

## 8. Reusable Heuristics
- Exact trusted-standard match beats extra repo/spec browsing.
- For multi-department pure-create prompts, default to one `POST /department/list`, never repeated `POST /department`.
- Never add `GET /department` for a plain create task.
- Verify from `values[]`; do not misread `fullResultSize=0` as failure.
- Preserve prompt department names exactly; no normalization, no invented fields.