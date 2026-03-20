## Task

Post-run learning pass for the scored Tripletex employee-create run for `João Rodrigues`, including call audit, persistent-sandbox proof, documentation updates, one commit, and this summary.

## Reflection

The production run itself went well. It matched the exact trusted-standard employee shape, normalized the mixed-language dates correctly to `1980-09-05` and `2026-08-08`, preserved `João` exactly, and finished without any repair branch.

What was weaker was the documentation precision around the repair ladder. The employee docs already said to reserve `/division` for validation-driven repair, but they did not state the sequencing sharply enough. This session’s sandbox proof showed again that `/division` is not justified immediately after the first `422`; the second `POST /employee` is what proves whether division repair is actually needed.

The correct approach for the same production shape remains unchanged: optimistic fresh-account branch first, repair only on exact validation fields, and always verify `startDate` via `/employee/employment` if the create response is sparse.

## Call Efficiency

The production run was minimal-call.

Exact production path:
1. `POST /employee`
2. `GET /employee/employment?employeeId=...&fields=*`

Wasted calls: none.

Lower-call replacement path for next time: none. This exact shape is already at the current minimum safe floor for fresh accounts.

Why not 1 call:
- the successful `POST /employee` response still does not reliably prove `startDate`
- in this task shape, the decisive verification read remains `GET /employee/employment?employeeId=...&fields=*`

## Root Causes

- Fresh production accounts and the persistent sandbox diverge on employee prerequisites.
- The sandbox can require both `department.id` and later `employments.division.id`, while fresh production often accepts the direct create.
- The create response is still sparse: `userType` can echo as `null`, and `employments[]` can be link-only.
- The division requirement is sequentially revealed. Reading `/division` before the second `POST /employee` is a wasted-call trap.

## Sandbox Verification

Used only the provided sandbox credentials, via TypeScript + `bun`, in the run scripts directory.

Exact sandbox proof branch:
1. `POST /employee` -> `422 department.id`
2. `GET /department?isInactive=false&count=1&fields=*` -> reused department `837842`
3. `POST /employee` with `department.id` -> `422 employments.division.id`
4. `GET /division?count=1&fields=*` -> reused division `108244566`
5. `POST /employee` with `department.id` and `division.id` -> `201`, employee `18592303`
6. `GET /employee/employment?employeeId=18592303&fields=*` -> proved `startDate=2026-08-08`

Important proof points:
- final create response still had `userType: null`
- final create response still had link-only `employments[]`
- `/division` was only justified after the second `422`, not after the first one

## Playbook Changes

Updated existing files. No new trusted standard or playbook created.

Changed paths:
- `./AGENTS.md`
- `./trusted-standards/create-employee.md`
- `./task-playbooks/create-employee.md`

What changed:
- added the explicit sequencing rule: after `422 department.id`, retry `POST /employee` first
- documented the new sandbox proof for the Portuguese analog
- added the pitfall warning against speculative `GET /division` immediately after the first `422`

Did not update `./trusted-standards/common-endpoints.md` because the canonical endpoint shape and low-call production path did not change.

## Commit

Commit hash: `2707a90b04bd68449745f0f229ed1af8cfba1266`

Commit message: `tripletex playbook: tighten employee repair sequencing`

## Reusable Heuristics

- For exact create-one-employee prompts with `name + birth date + email + start date`, start with `POST /employee` using `userType: "NO_ACCESS"` and nested `employments`.
- In fresh accounts, assume the winning branch is still `POST /employee` then `GET /employee/employment`.
- Never pre-read `/department` or `/division` on this exact production shape.
- Route repairs only from `validationMessages[].field`, not from the generic `422` message.
- After `422 department.id`, repair department and retry the create before touching `/division`.
- Treat `response.value.userType === null` and link-only `employments[]` as normal sparse success behavior, not failure.
- Preserve Unicode names exactly; mixed-language date prose only needs ISO normalization.