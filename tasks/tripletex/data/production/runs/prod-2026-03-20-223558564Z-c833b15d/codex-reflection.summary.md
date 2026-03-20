# Task

Create customer `Colline SARL` with organization number `939137599`, email `post@colline.no`, and postal address `Kirkegata 77, 4611 Kristiansand`.

# Reflection

The scored run went well. It matched `./trusted-standards/create-customer.md` exactly, used the canonical one-write branch, and reused the `POST /customer` response as final verification. No speculative read, no follow-up read, no 4xx.

Nothing went poorly in the API flow itself. The only gap was documentation coverage: the system already covered Norwegian and German-language variants, but this run added concrete production proof that the same one-call path also stays correct for a French-language prompt with an ordinary Norwegian customer payload.

The correct approach was exactly what the run used: one `POST /customer` with only `name`, `email`, `organizationNumber`, and `postalAddress`, then stop after verifying `response.value`.

# Call Efficiency

The run was minimal-call.

- Total production calls used: `1`
- Wasted calls: `none`
- Exact lower-call path for the next agent: `POST /customer`

There is no realistic lower-call replacement for this exact task shape. Any added `GET /customer`, `GET /customer/{id}`, `GET /ledger/...`, spec re-check, or duplicate-check read would be wasted.

# Root Causes

- No production mistake occurred. The trusted standard already matched the task exactly.
- The only learning gap was evidence coverage, not execution logic: the docs said prompt language should not matter, but they had stronger explicit German examples than French ones.
- A future agent could still waste calls if it overreacts to French prompt prose, treats `E-mail` as `invoiceEmail`, or chases the auto-returned sparse `physicalAddress` link with a follow-up read.

# Sandbox Verification

Persistent sandbox proof used the provided sandbox credentials only.

- Script: `/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-223558564Z-c833b15d/scripts/create-customer-sandbox-proof.ts`
- Call path: one `POST /customer`
- Payload: `Colline Reflection c833b15d SARL`, `999833115`, `post-reflection-c833b15d@colline.no`, `Kirkegata 77`, `4611`, `Kristiansand`
- Result: `201` with customer `id=108285083`
- Proof points from `response.value`: exact `name`, `email`, `organizationNumber`, `postalAddress.addressLine1`, `postalAddress.postalCode`, `postalAddress.city`
- Observed non-blocking detail: Tripletex also auto-returned sparse `physicalAddress.id/url`; no follow-up read needed

This re-proved that the exact task family remains a one-call branch even for French-language prompt semantics.

# Playbook Changes

Updated existing artifacts. No new trusted standard or playbook created.

- Updated [AGENTS.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md)
- Updated [common-endpoints.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md)
- Updated [create-customer.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-customer.md)
- Updated [create-customer.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-customer.md)

Changes recorded:

- Added a new create-customer gotcha in `AGENTS.md` stating that French and German prompt prose does not change the one-call customer-create branch for ordinary Norwegian customer fields.
- Extended the common-endpoints customer note to include French/German prompt-language stability and explicit `E-mail` to `email` mapping.
- Added production proof from `Colline SARL` and persistent-sandbox proof from `Colline Reflection c833b15d SARL` to the trusted standard.
- Added the same production and sandbox proof to the customer playbook and tightened the language note from German-only to French-or-German.

# Commit

- Commit hash: `6ad25db`
- Commit message: `tripletex playbook: record french create-customer proof`

# Reusable Heuristics

- If the prompt is exact create-one-customer with prompt-provided `name`, Norwegian `organizationNumber`, one generic email, and at most one ordinary mailing address, default to one `POST /customer`.
- Preserve prompt strings exactly. Non-Norwegian prose language does not justify changing the payload shape.
- Map generic labels like `E-mail`, `Email`, `E-post`, or `Correo` to `email`, not `invoiceEmail`.
- If the prompt gives only one normal address, send only `postalAddress`.
- Ignore sparse auto-generated `physicalAddress` links in the `201` response unless the prompt explicitly asked for a separate physical/visiting address.
- Do not spend pre-read or post-read calls on create-customer exact matches.