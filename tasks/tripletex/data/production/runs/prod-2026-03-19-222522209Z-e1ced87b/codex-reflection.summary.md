## Task

Post-run learning pass for the department-creation run. Required work: reflect, verify correct sandbox path, update playbooks/`AGENTS.md`, commit docs changes, summarize.

## Reflection

Original run got the scored state right: three requested departments were created, with zero `GET`s and zero `4xx`s. That part was good.

Main mistake: I stopped after finding `POST /department` and used 3 separate writes. `openapi.json` also exposed `POST /department/list`, which would have created all three departments in 1 call. For a scored run, that was the better path.

Other weakness: I did not check `./task-playbooks/` first, though no matching playbook existed yet. I also did not scan far enough past `/department` to notice the adjacent batch endpoint even though the earlier ripgrep output already hinted at `DepartmentList_postList`.

Correct approach for the original task should have been:
1. confirm `POST /department/list` in `openapi.json`
2. send one array payload with the three `{name}` objects
3. verify directly from `response.values`
4. stop

## Root Causes

- Incomplete OpenAPI inspection: I validated `/department` and the `Department` schema, but did not inspect the nearby `/department/list` path before acting.
- Efficiency underweighted: I optimized for safe correctness and low reads, but not enough for lowest write count.
- Missing playbook coverage: no department playbook existed, so there was no local reminder to check for a batch create path.

## Sandbox Verification

Used sandbox credentials only. No original-production credentials reused.

Verified two paths via TypeScript scripts in the run scripts directory:
- Single-create proof: `POST /department` with only `{ "name": ... }` succeeded for 3 unique sandbox departments and returned `{"value": {...}}` with `id`, `name`, `displayName`, `isInactive=false`.
- Batch-create proof: `POST /department/list` with 3 minimal objects succeeded in 1 call and returned `{"values": [...]}` with all 3 created departments.

Batch verification result:
- `Sandbox Batch Økonomi batch-reflection-20260319` -> id `859950`
- `Sandbox Batch Innkjøp batch-reflection-20260319` -> id `859951`
- `Sandbox Batch Regnskap batch-reflection-20260319` -> id `859952`

Conclusion: the correct high-score path for multi-department create prompts is `POST /department/list`, not repeated `POST /department`.

## Playbook Changes

Created a new playbook, not an update to an existing one.

Paths changed:
- `./task-playbooks/create-department.md`
- `./AGENTS.md`

What changed:
- Added a new `Create department` playbook entry to the Task Playbooks table in `AGENTS.md`
- Added a department-specific gotcha to `AGENTS.md` pointing agents toward `POST /department/list` for multi-create prompts
- Added `./task-playbooks/create-department.md` documenting:
  - single-create minimal path with `POST /department`
  - multi-create fast path with `POST /department/list`
  - response shapes
  - no-pre-read guidance
  - minimal payload guidance

## Commit

`b99fcfab76fa24734f23c8a2b1616b9ad17e4669`

`tripletex playbook: add department creation fast path`

## Reusable Heuristics

- When a prompt asks to create several same-type objects, always scan for a sibling batch endpoint like `/<resource>/list` before writing.
- Ripgrep hits for `*List_postList` are a strong signal; do not ignore them after finding a working single-object endpoint.
- Zero reads is not enough for best score; also minimize write count.
- If a write response already proves the scored fields, verify from that response and stop.
- When no playbook exists for a task shape, create one if sandbox verification reveals a materially better path.