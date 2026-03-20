## 1. Task

Post-run learning for the production task: create project `Migração Montanha` for customer `Montanha Lda` (`986713344`) with project manager `Bruno Pereira` (`bruno.pereira@example.org)`.

## 2. Reflection

What went well:
- Production side effect was correct on the first API attempt.
- The run used the correct trusted path: resolve customer by `organizationNumber`, resolve manager by `email` with `assignableProjectManagers=true`, then `POST /project`.
- The write response was reused for verification; no follow-up Tripletex reads were spent.

What went poorly:
- I still did extra local `openapi.json` inspection before writing, even though the task was an exact match for the existing trusted standard.
- That did not cost API calls, but it was still wasted scored-run time and unnecessary local work.

Correct approach:
- For this exact task shape, trust the existing create-project standard immediately.
- Go straight to the 3-call Tripletex path and stop after verifying the `POST /project` response.

## 3. Call Efficiency

This production run was minimal-call from the Tripletex API perspective.

Wasted API calls:
- None.

Exact lower-call path for the next agent:
1. `GET /customer?organizationNumber=986713344&count=10&fields=*`
2. `GET /employee?email=bruno.pereira@example.org&assignableProjectManagers=true&count=10&fields=*`
3. `POST /project` with:
```json
{
  "name": "Migração Montanha",
  "startDate": "2026-03-20",
  "customer": { "id": ... },
  "projectManager": { "id": ... }
}
```

Why there is no realistic 2-call path:
- The prompt provided customer `organizationNumber` and manager `email`, not numeric ids.
- The trusted/publicly proven path links `customer` and `projectManager` by id.
- Trying to skip either resolver read would be speculative and higher-risk than the proven 3-call path.

## 4. Root Causes

- I did not fully trust the exact-match trusted standard, so I re-opened `openapi.json`.
- The issue was process discipline, not API-shape uncertainty.
- There was no API-side mistake; only pre-write local over-checking.

## 5. Sandbox Verification

Sandbox proof used only sandbox credentials and a TS script in the run scripts directory.

Proof result:
- Discovered customer: `Reflection Learning 347050 AS` (`934705034`), id `108145182`
- Discovered assignable manager: `simen.sandhaug@gmail.com`, id `18441996`
- Created project: id `401964671`, name `Codex Reflection Project 1774031814798`, `startDate=2026-03-20`

Sandbox script call log:
1. broad customer discovery
2. exact customer proof for one duplicate org candidate
3. exact customer proof for the unique candidate
4. broad assignable-manager discovery
5. exact manager proof by email
6. `POST /project`

Meaning:
- Sandbox needed extra discovery calls only because the follow-up run had to find a reusable example customer/manager first.
- Once identifiers were known, the canonical task shape remained the same 3-call path:
  - `GET /customer?organizationNumber=...`
  - `GET /employee?email=...&assignableProjectManagers=true`
  - `POST /project`

## 6. Playbook Changes

Updated existing guidance. No new trusted standard or playbook was created.

Changed files:
- [AGENTS.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md)
- [trusted-standards/create-project.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-project.md)
- [task-playbooks/create-project.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-project.md)

What changed:
- Added explicit production confirmation that the exact create-project shape is still a minimal 3-call path.
- Added an explicit warning not to spend pre-write `openapi.json` re-checking on this exact trusted-standard match.
- Added an explicit warning not to add `GET /project`, `GET /customer/{id}`, or `GET /employee/{id}` verification reads.

## 7. Commit

Commit hash:
- `a5c4d1f725a3562f6542d07ce856f124efaee4e1`

Commit message:
- `tripletex playbook: tighten create-project fast path`

## 8. Reusable Heuristics

- If the prompt is exact `create project + existing customer org number + existing manager email`, default to the 3-call path and stop.
- `email` search on `/employee` is containing, so exact-match locally on `employee.email`.
- Keep prompt `customer.name` and manager name only as tie-breakers, not hard requirements, once one exact org/email hit remains.
- If `startDate` is omitted, use the run date.
- For exact trusted-standard matches, extra local spec-checking is waste.
- If the `POST /project` response already proves `name`, `startDate`, `customer.id`, and `projectManager.id`, do not spend any verification read.