## 1. Task

Post-run learning pass for the scored Tripletex task: create three departments, `HR`, `Salg`, `Økonomi`.

## 2. Reflection

What went well:
- The production run matched `./trusted-standards/create-department.md` exactly.
- It used the correct one-call batch path: `POST /department/list`.
- It preserved the exact Unicode name `Økonomi`.
- It verified from the write response only and avoided follow-up reads.

What went poorly:
- No API-path mistake happened in the scored run.
- The only gap was documentation coverage: the existing department docs already encoded the right path, but did not yet record this exact Norwegian `HR` / `Salg` / `Økonomi` production proof.

Correct approach:
- Treat this prompt family as an exact trusted-standard match.
- Send one batch write with minimal `{ "name": ... }` objects.
- Trust `201` + `values[]` even if `fullResultSize=0`.

## 3. Call Efficiency

This run was minimal-call.

API calls used:
- `POST /department/list`

Wasted calls:
- None.

Exact lower-call path for the next agent:
- `POST /department/list` with:
```json
[
  { "name": "HR" },
  { "name": "Salg" },
  { "name": "Økonomi" }
]
```
- Verify from `values[]`.
- Stop.

There is no realistic lower-call replacement than one write call for this exact task shape.

## 4. Root Causes

Why the run succeeded:
- Exact-match trusted standard existed and was followed directly.
- The task did not require any prerequisite lookup, manager link, or update flow.
- The script built the URL safely relative to a base URL that already included `/v2`.

Why future agents could still fail:
- They may waste a read on `GET /department`.
- They may split the task into three `POST /department` calls.
- They may mistrust a successful batch response because `fullResultSize` stays `0`.
- They may accidentally transliterate `Økonomi` or over-send optional fields like `departmentNumber`.

## 5. Sandbox Verification

Persistent sandbox proof used only sandbox credentials.

Verified path:
- One `POST /department/list`
- Payload names: `Ref HR 365623`, `Ref Salg 365623`, `Ref Økonomi 365623`

Observed result:
- `201 Created`
- `values[]` returned all three created departments
- Returned ids: `917645`, `917646`, `917647`
- `displayName` matched each submitted name
- `isInactive=false` for all three
- `fullResultSize=0` despite successful creation

This re-proved that the production path was already the true floor.

## 6. Playbook Changes

Updated existing docs. No new trusted standard or playbook created.

Changed paths:
- `./AGENTS.md`
- `./trusted-standards/common-endpoints.md`
- `./trusted-standards/create-department.md`
- `./task-playbooks/create-department.md`

What changed:
- Added this exact Norwegian production proof to the department guidance.
- Reinforced that `POST /department/list` is still the one-call floor for `HR` / `Salg` / `Økonomi`.
- Reinforced that `values[]`, not `fullResultSize`, is the correct verification source.

## 7. Commit

Commit hash:
- `5f37ca5cbbbe2462c7bb032e05f3e29f2dcd1c8f`

Commit message:
- `tripletex playbook: document minimal department batch path`

## 8. Reusable Heuristics

- For pure multi-department create prompts, default to one `POST /department/list`.
- Use name-only payloads unless the prompt explicitly scores extra fields.
- Preserve prompt text exactly, including non-ASCII department names.
- Never add a discovery `GET /department` for this exact create shape.
- Never split a plain multi-create prompt into repeated single-create writes.
- For batch create verification, trust `201` + `values[]` even when wrapper metadata says `fullResultSize=0`.