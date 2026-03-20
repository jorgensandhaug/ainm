## 1. Task
Post-run learning pass for the production task: create customer `Río Verde SL` with Norwegian organization number `919234830`, address `Solveien 5, 4006 Stavanger`, and email `post@rio.no`.

## 2. Reflection
The scored run went well. It matched the existing exact trusted standard for create-customer, used the correct one-call branch `POST /customer`, preserved Unicode in `Río`, mapped the prompt’s generic Spanish `Correo` field to `email`, and reused the write response for verification instead of adding reads.

What went poorly: no scored-run API mistake happened, but the documentation set lacked explicit Spanish-language proof for this exact customer-create shape. The standard was already correct; the gap was evidence density, not execution logic.

## 3. Call Efficiency
The run was minimal-call.

Exact scored path:
1. `POST /customer`

Wasted calls: none.

Lower-call replacement path for the next agent: none exists. This task needs one write to create the customer, and the `201 {"value": ...}` body already proves the scored fields. The next agent should follow the same path:
1. `POST /customer` with only `name`, `email`, `organizationNumber`, and `postalAddress { addressLine1, postalCode, city }`
2. Verify from `response.value`
3. Stop

## 4. Root Causes
There was no scored-run API error. The only root-cause gap was documentation coverage:
- Spanish-language create-customer evidence was not explicit enough in the customer docs.
- That could tempt a future agent to overthink prompt language, add a spec re-check, or invent `invoiceEmail`/`physicalAddress`.

Correct approach remains:
- treat Spanish prompt prose as irrelevant for this exact shape
- map one generic email label such as `Correo` to `email`
- preserve Unicode exactly
- do not pre-read or post-read

## 5. Sandbox Verification
Used persistent sandbox only.

Proof run:
- `POST /customer`
- payload: `Río Verde Reflection 017503 AS`, `999017503`, `post-reflection-017503@rio.no`, `Solveien 5`, `4006`, `Stavanger`
- response: `201`
- returned customer id: `108286045`

What the sandbox proved:
- one-call create still works for the same shape
- accented Unicode name was preserved exactly
- `response.value.postalAddress` already contained the scored address fields
- Tripletex still auto-returned only a sparse `physicalAddress` link, which is not a reason to add a follow-up `GET`

## 6. Playbook Changes
Updated existing docs; no new trusted standard or playbook created.

Changed paths:
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/create-customer.md`
- `/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/create-customer.md`

What changed:
- added explicit 2026-03-20 production proof for the Spanish-language `Río Verde SL` run
- added matching persistent-sandbox proof for the same shape
- expanded the create-customer language note from French/German to French/German/Spanish

## 7. Commit
Commit hash: `3af816d480c2b6e1edabe6f9b2968f9018ce1040`

Commit message: `tripletex playbook: add spanish create-customer proof`

## 8. Reusable Heuristics
- Exact create-customer shape with Norwegian org number + one generic email + optional one ordinary mailing address is still a one-write task: `POST /customer`.
- Do not spend `GET /customer` before a fresh-account create-customer task.
- Do not spend `GET /customer/{id}` after a successful `201` if `response.value` already has the scored fields.
- Map localized generic email labels such as `Correo` to `email`, not `invoiceEmail`.
- If the prompt gives one ordinary address, send only `postalAddress`.
- Ignore sparse auto-returned `physicalAddress` links unless the prompt explicitly asked for a separate visiting/physical address.
- Preserve accented Unicode customer and city strings exactly as prompted.