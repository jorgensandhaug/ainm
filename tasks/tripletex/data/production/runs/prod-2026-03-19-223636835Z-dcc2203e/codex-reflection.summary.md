## 1. Task

Post-run learning pass for the customer-create run that created `Bergwerk GmbH`.
Required sequence completed:
- reflected on the original run
- verified the correct path in sandbox with a TypeScript `bun` script in the run scripts directory
- updated the existing customer playbook and `AGENTS.md`
- made one git commit
- prepared this final summary

## 2. Reflection

What went well:
- The scored run ultimately used the correct endpoint: `POST /customer`.
- It reused the write response for verification and avoided a follow-up `GET`.
- It mapped the single address to `postalAddress`, which is the correct shape for this task.

What went poorly:
- There was a wasted detour into unrelated repo tooling: `br list` was attempted and failed with `127`.
- OpenAPI exploration was broader than necessary before the write.
- I briefly normalized `Tromsø` to `Tromso` in the script before correcting it. That was a near-miss on a scored string field.

Correct approach:
- Match the task to `./task-playbooks/create-customer.md`.
- Confirm only `POST /customer` and the referenced `Customer` and `Address` schema shape in `openapi.json`.
- Send one `POST /customer` with exact prompt strings:
  - `name`
  - `organizationNumber`
  - `email`
  - `postalAddress.addressLine1`
  - `postalAddress.postalCode`
  - `postalAddress.city`
- Verify directly from `response.value`.
- Stop.

## 3. Root Causes

- Higher-level workspace habit leaked into a scored Tripletex run: unrelated tooling (`br list`) was attempted even though it did not help solve the API task.
- I followed the default “prefer ASCII when editing” instinct too mechanically and almost degraded a scored prompt value (`Tromsø`).
- I did not narrow exploration aggressively enough after the playbook already indicated the winning path.

## 4. Sandbox Verification

Sandbox credentials only were used.
Verification script path:
- `/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-19-223636835Z-dcc2203e/scripts/verify-create-customer-sandbox.ts`

What it proved:
- A single `POST /customer` is sufficient for customer creation with:
  - `name`
  - `organizationNumber`
  - `email`
  - `postalAddress`
- No pre-read is needed.
- No follow-up `GET` is needed.
- `response.value` contains enough to verify the scored fields.
- Unicode prompt text round-trips correctly: `postalAddress.city` came back as exact `Tromsø`.
- Defaults were returned in the write response:
  - `invoiceSendMethod: "EMAIL"`
  - `emailAttachmentType: "ATTACHMENT"`

Observed sandbox result:
- created customer id: `108159831`
- organization number: `999165818`
- email: `reflection-59916580@example.com`

## 5. Playbook Changes

Updated an existing playbook. No new playbook was created.

Changed paths:
- `./AGENTS.md`
- `./task-playbooks/create-customer.md`

What changed:
- Added a general rule in `AGENTS.md` to avoid unrelated repo/tooling detours during scored Tripletex runs.
- Added a general rule in `AGENTS.md` to preserve prompt-provided scored strings exactly and not ASCII-normalize/transliterate them.
- Extended `create-customer.md` with sandbox proof that one `POST /customer` with `postalAddress` preserves exact Unicode city values like `Tromsø`.
- Added explicit guidance in `create-customer.md` to preserve non-ASCII address text exactly as given.

## 6. Commit

Git commit:
- hash: `1763cfb75d30fe7423b7ed7c4a915706f9576767`
- message: `tripletex playbook: tighten customer create guidance`

## 7. Reusable Heuristics

- If the prompt exactly matches an existing playbook, do not spend time on repo rituals, task trackers, or broad schema browsing.
- For create-customer tasks, default to one `POST /customer` and verify from `response.value`.
- For a single ordinary address, use only `postalAddress` unless the prompt explicitly asks for a distinct physical/visiting address.
- Treat all prompt-provided scored strings as exact data. Do not transliterate `ø`, `å`, accents, punctuation, or spacing.
- Prefer `email` for a single generic prompt email; do not invent `invoiceEmail` unless billing/invoice email is explicitly requested.
- Reuse write responses aggressively. If the `201` body already proves the state, stop.