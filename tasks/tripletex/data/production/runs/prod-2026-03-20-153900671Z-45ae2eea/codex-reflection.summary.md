## 1. Task

Post-run learning pass for the production task: create project `Actualización Dorada` linked to customer `Dorada SL` (`organizationNumber=800043328`) with project manager `Carmen Rodríguez` (`carmen.rodriguez@example.org`), then update Tripletex learning artifacts and commit them.

## 2. Reflection

What went well:
- Production side effect was correct.
- API path used only the necessary entity lookups plus the create write.
- Write-response reuse was correct; no verification `GET /project/{id}` was added.

What went poorly:
- I still spent scored-run time re-reading `openapi.json` and playbook details even though `trusted-standards/create-project.md` was already an exact match.
- I treated missing prompt `startDate` as a spec ambiguity instead of using an explicit documented default.
- I inspected schema fragments that did not reduce API-call risk for this exact trusted-standard shape.

Correct approach:
- For this exact task shape, trust the standard and go straight to:
  - `GET /customer?organizationNumber=...&count=10&fields=*`
  - `GET /employee?email=...&assignableProjectManagers=true&count=10&fields=*`
  - `POST /project`
- If prompt omits `startDate`, send run date in ISO format.

## 3. Call Efficiency

API-call efficiency: minimal-call.

Production API calls used:
1. `GET /customer?...`
2. `GET /employee?...assignableProjectManagers=true...`
3. `POST /project`

Wasted API calls:
- None.

Lower-call path for the next agent:
- Same 3-call path for this exact shape.
- There is no realistic 2-call path unless the prompt already gives the exact `customer.id` and `projectManager.id`.

Non-API waste in the original run:
- Extra local spec reading.
- Extra local schema grep.
- Those cost time, not API score.

## 4. Root Causes

- Trusted-standard discipline was too weak: I verified too much after already confirming exact match.
- `startDate` guidance in project docs was not explicit enough for prompts that omit a date.
- I optimized for certainty from spec text instead of certainty from the already-proven standard.

## 5. Sandbox Verification

Used only sandbox credentials.

Proof steps:
- Discovery read found reusable sandbox customer `Reflection Smoke Test AS` (`id=108144219`, `organizationNumber=999888777`).
- Discovery read found assignable project manager `Simen Sandhaug f675e571` (`id=18441996`, `email=simen.sandhaug@gmail.com`).
- Exact-path proof then used:
  - `GET /customer?organizationNumber=999888777&count=10&fields=*`
  - `GET /employee?email=simen.sandhaug@gmail.com&assignableProjectManagers=true&count=10&fields=*`
  - `POST /project` with `startDate=2026-03-20`
- Result: project created successfully as `id=401960233`; write response already proved `name`, `startDate`, `customer.id`, and `projectManager.id`.

Verified conclusion:
- Existing-customer-by-org-number + existing-manager-by-email project creation is a proven 2-read + 1-write path.
- Run-date default for omitted `startDate` is valid.

## 6. Playbook Changes

Updated existing files; created no new files.

Changed paths:
- `AGENTS.md`
- `trusted-standards/common-endpoints.md`
- `trusted-standards/create-project.md`
- `task-playbooks/create-project.md`

What changed:
- Added explicit low-call create-project path.
- Added explicit rule: if prompt omits `startDate`, default to run date.
- Clarified local exact filtering:
  - customer uniqueness by returned `organizationNumber`
  - manager uniqueness by returned `email`
  - prompt names only as local tie-breakers
- Clarified that `POST /project` response is sufficient verification.

## 7. Commit

Commit hash:
- `7c14c574c3d6757d16da5330e7b910e5460e951f`

Commit message:
- `tripletex playbook: tighten create-project fast path`

## 8. Reusable Heuristics

- Exact trusted-standard match: stop re-reading broad spec; execute standard.
- Create-project task with existing customer + existing manager: default to 3 API calls.
- Never omit `startDate` on project create; if missing in prompt, use run date.
- Use `assignableProjectManagers=true` on manager lookup; plain employee hit is not enough.
- `GET /employee?email=...` is containing search; exact-match locally before reuse.
- Do not spend `GET /project/{id}` after successful `POST /project` when write response already proves the scored fields.