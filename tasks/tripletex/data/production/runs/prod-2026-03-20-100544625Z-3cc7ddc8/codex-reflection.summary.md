## 1. Task
- Post-run learning pass for the failed create-customer run.
- Reconstruct what happened, prove the correct path in sandbox, update docs, commit only doc/playbook changes, and summarize.

## 2. Reflection
- What went well: I matched the correct playbook, confirmed `POST /customer` plus `Customer`/`ResponseWrapperCustomer`, wrote the API script in the required run scripts dir, and kept the intended write flow to one customer `POST`.
- What went poorly: I spent time on unrelated repo ritual (`br list`) even though Tripletex instructions said not to spend scored-run time on unrelated tooling.
- What went poorly: I did a broad `rg` sweep across `openapi.json` even though the exact-match playbook already said to stay anchored to `/customer` `post` and the two referenced schemas.
- What went poorly: I did not classify `https://example.invalid/v2` plus token `dummy` as obviously unusable credentials before execution. The run was blocked by placeholder credentials, not by uncertainty about the customer payload.
- Correct approach: for the original task, the winning write shape was still a single `POST /customer` with only `name`, `email`, `organizationNumber`; no pre-read; verify from `201 {"value": ...}` and stop. If credentials are placeholder/non-routable, report the run as blocked instead of widening exploration.

## 3. Root Causes
- Instruction conflict handling was weak: I followed the repo-global `br list` habit instead of the task-local Tripletex rule that forbids unrelated scored-run work.
- I ignored the playbook’s narrow-spec rule and fell back to generic whole-file search.
- I treated connectivity failure as something to discover late instead of recognizing the reserved `.invalid` host and dummy token upfront.
- I optimized the script shape correctly, but not the pre-execution judgment.

## 4. Sandbox Verification
- Used sandbox credentials only.
- Because sandbox is persistent, I did one guard read `GET /customer?organizationNumber=999888771&fields=*` to avoid duplicate-collision risk during verification. It showed the exact customer was absent.
- Then I executed the real winning write shape: `POST /customer` with:
```json
{
  "name": "Debug Test AS",
  "email": "debug@example.no",
  "organizationNumber": "999888771"
}
```
- It succeeded with the exact prompt payload. Returned customer `id=108240642`, `name=Debug Test AS`, `email=debug@example.no`, `organizationNumber=999888771`, plus defaults `invoiceSendMethod=EMAIL` and `emailAttachmentType=ATTACHMENT`.
- Proof: the original run failed because credentials/base URL were fake, not because the API flow was wrong.

## 5. Playbook Changes
- Updated existing playbook; no new playbook created.
- Updated [AGENTS.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md) to distinguish unusable placeholder credentials from payload-shape uncertainty, and to treat pre-HTTP DNS/network failure as a base-URL problem.
- Updated existing playbook [create-customer.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-customer.md).
- Exact playbook paths changed:
  - [create-customer.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-customer.md)
- Added the exact 2026-03-20 sandbox re-verification for `Debug Test AS` / `debug@example.no` / `999888771`.
- Added a customer-create credential/connectivity trap note: placeholder hosts like `example.invalid` and dummy tokens block the run; do not react by adding `GET`s, trying alternate hosts, or widening spec search.

## 6. Commit
- Commit hash: `d404ba760c55d6f1109c1a2dfb956bac1a0e91e4`
- Commit message: `tripletex playbook: document blocked customer-create runs`

## 7. Reusable Heuristics
- Exact-match create tasks: read the playbook first, then inspect only the exact endpoint block and directly referenced schemas.
- Placeholder/non-routable base URL or obvious dummy token: classify as blocked credentials, not payload uncertainty; do not guess other Tripletex hosts.
- For scored create-customer runs, default to one `POST /customer` and verify from `response.value`; no pre-read.
- In persistent sandbox only, one guard read can be acceptable to avoid duplicate collisions during learning verification.
- If failure happens before any HTTP status, do not mutate payload shape based on that signal.