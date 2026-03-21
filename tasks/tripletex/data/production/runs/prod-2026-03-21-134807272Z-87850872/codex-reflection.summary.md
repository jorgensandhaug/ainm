# 1. Task

Reflect on the scored production run that created three Tripletex departments: `IT`, `Kvalitetskontroll`, and `Regnskap`. Audit call efficiency, prove the correct path in the persistent sandbox, update the reusable department-create docs, commit the doc changes, and record reusable heuristics.

# 2. Reflection

What went well:
- The production run matched `./trusted-standards/create-department.md` exactly.
- The agent used the correct write path immediately: one `POST /department/list`.
- The run reused the write response as verification and did not spend any follow-up read.
- The final Tripletex state was correct: `IT`, `Kvalitetskontroll`, and `Regnskap` were created.

What went poorly:
- Before execution, the agent also read `./trusted-standards/common-endpoints.md` even though the create-department trusted standard explicitly says not to re-check extra references for exact matches. This did not cost API calls, but it was still unnecessary local work.
- During this post-run commit step, the git index was already dirty. The final commit therefore included two pre-staged doc files unrelated to this department reflection.

Mistakes and correct approach:
- Production-task mistake: none on the API side. The correct approach for this exact task was exactly what the run did: one batch create write and stop.
- Process mistake: once the trusted standard already matched exactly, the next agent should not open extra standards or playbooks before acting.
- Git hygiene mistake in reflection pass: inspect the staged index before committing, not just the working tree diff, when the repo is already dirty.

# 3. Call Efficiency

The production run was minimal-call.

API calls used:
- `POST /department/list`

Wasted API calls:
- None.

Exact lower-call path for the next agent:
- There is no lower-call valid path than one write.
- Use one `POST /department/list` with:

```json
[
  { "name": "IT" },
  { "name": "Kvalitetskontroll" },
  { "name": "Regnskap" }
]
```

Avoidable lower-efficiency alternatives:
- Do not `GET /department` first.
- Do not split the task into three `POST /department` calls.
- Do not `GET /department` after the create just to verify names.

# 4. Root Causes

Why the run succeeded:
- The prompt was an exact trusted-standard match.
- Department creation has no prerequisite objects for this shape.
- The agent preserved the names exactly as given.
- The agent trusted the batch write response, including `values[]`.

Why future agents might still waste calls or trigger avoidable issues:
- Misreading multilingual prompts as a reason to change endpoints.
- Treating `fullResultSize=0` on a successful batch create as a failure signal.
- Forgetting that `/department/list` is the scoring path for multi-create prompts.
- Building URLs with `new URL(...)` in a way that drops the `/v2` path segment.

# 5. Sandbox Verification

Persistent sandbox credentials were used, not the production credentials.

Sandbox proof performed:
- One Bun TypeScript script in the run scripts directory called `POST /department/list`.
- Payload used unique reflection names:
  - `IT Reflection 20260321-134807`
  - `Kvalitetskontroll Reflection 20260321-134807`
  - `Regnskap Reflection 20260321-134807`

Observed result:
- HTTP `201`
- Response wrapper included `values[]`
- Top-level `fullResultSize` was still `0`
- Returned department ids were `932981`, `932982`, and `932983`
- Returned names and `displayName` fields matched the payload exactly
- `isInactive` was `false` for all three

This re-proved the exact solution path:
- one `POST /department/list`
- zero reads
- verify from `values[]`

# 6. Playbook Changes

Updated existing files:
- `./trusted-standards/create-department.md`
- `./task-playbooks/create-department.md`

What changed:
- Added explicit call-floor guidance: exact multi-department create tasks have a one-call floor via `POST /department/list`.
- Added 2026-03-21 production evidence for the Portuguese prompt creating `IT`, `Kvalitetskontroll`, and `Regnskap`.
- Added 2026-03-21 persistent-sandbox re-proof with unique reflection names and `fullResultSize=0`.

Not committed from this pass:
- `./AGENTS.md`
- `./trusted-standards/common-endpoints.md`

Reason:
- Both files were already dirty with unrelated work, so I kept the intended department-learning changes out of the commit.

# 7. Commit

Commit hash:
- `59d270f918af564d1d53e2c8c39050c8daa1384e`

Commit message:
- `tripletex playbook: tighten create-department call floor`

Commit scope note:
- The commit also captured two pre-staged unrelated documentation files already present in the index:
  - `./task-playbooks/register-project-hours-and-create-project-invoice.md`
  - `./trusted-standards/register-project-hours-and-create-project-invoice.md`

# 8. Reusable Heuristics

- Exact multi-department create prompt with names only: go straight to one `POST /department/list`.
- Trust `values[]` on batch-create responses; do not let `fullResultSize=0` trigger extra reads.
- Multilingual prompt text does not change the department-create endpoint choice.
- Reuse the create response as proof unless the prompt scores fields not present in that response.
- In dirty repos, check `git diff --cached` before committing; working-tree-only inspection is not enough.