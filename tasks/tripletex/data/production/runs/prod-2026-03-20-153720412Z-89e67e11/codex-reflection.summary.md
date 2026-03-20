## 1. Task

Post-run learning pass for a production Tripletex task that registered supplier `Silveroak Ltd`, org no `811867500`, email `faktura@silveroakltd.no`.

## 2. Reflection

What went well:
- Original run chose the correct exact-match trusted standard.
- Original run used the correct minimal payload: `name`, `organizationNumber`, `email`.
- Original run verified from the `201 {"value": ...}` write response and did not waste a follow-up `GET`.

What went poorly:
- I re-read `task-playbooks/create-supplier.md` even though `trusted-standards/create-supplier.md` already matched exactly and explicitly says to skip extra re-checking for exact matches.
- The docs were already mostly correct, but they did not spell out the specific ambiguity from this run: a lone email that looks invoice-oriented, such as `faktura@...`, still belongs in `email` unless the prompt explicitly asks for a separate invoice/billing email.

Correct approach:
- Read the trusted standard.
- Recognize exact match.
- Write one bun TypeScript script in the run `scripts/` dir.
- `POST /supplier` once with only `name`, `organizationNumber`, `email`.
- Reuse `response.value` and stop.

## 3. Call Efficiency

The original run was minimal-call.

API calls used:
- `POST /supplier`

Wasted API calls:
- none

Exact lower-call path for the next agent:
- same path; there is no lower-call path than one successful `POST /supplier` for this task shape

Lower-call replacement for the non-API inefficiency:
- skip playbook/spec re-reading when `trusted-standards/create-supplier.md` already matches exactly

## 4. Root Causes

- Mild over-verification habit: I read the secondary playbook despite already having an exact trusted standard.
- Missing explicit doc wording for invoice-looking contact emails created a potential future mapping mistake, even though this run itself mapped correctly.

## 5. Sandbox Verification

Used only sandbox credentials.

Verified path:
- `POST /supplier` with payload:
  - `name`: `Codex Reflection Supplier Faktura 321000003`
  - `organizationNumber`: `321000003`
  - `email`: `faktura-321000003@example.no`

Result:
- `201 Created`
- returned supplier `id=108247477`
- returned `email="faktura-321000003@example.no"`
- returned `invoiceEmail=""`
- returned sparse `postalAddress` and `physicalAddress` links
- no follow-up `GET` needed

Proof from sandbox:
- a lone invoice-looking address still succeeds as plain `email`
- no evidence that `invoiceEmail` should be sent for this task shape
- one write remains the canonical path

## 6. Playbook Changes

Updated existing docs; created no new files.

Changed paths:
- `trusted-standards/create-supplier.md`
- `trusted-standards/common-endpoints.md`
- `task-playbooks/create-supplier.md`

What changed:
- clarified that a single invoice-looking contact address such as `faktura@...` still maps to `email`
- clarified that agents should not remap that lone address to `invoiceEmail` unless the prompt explicitly asks for a separate invoice/billing email
- recorded new sandbox verification proving this exact nuance

`AGENTS.md` unchanged.

## 7. Commit

Commit hash:
- `6bddb1200dbebfcd122cb643884047bec8595d96`

Commit message:
- `tripletex playbook: clarify supplier email mapping`

## 8. Reusable Heuristics

- For exact trusted-standard matches, stop at the trusted standard; do not spend time on playbook/spec rereads.
- For plain supplier-create tasks, default to one `POST /supplier`.
- Use only prompt-required fields.
- Map one lone prompt email to `email`.
- Do not infer `invoiceEmail` from the address text alone, including `faktura@...`.
- Trust `response.value` for verification when it already contains the scored fields.
- Ignore sparse auto-returned address links unless the prompt explicitly scores address fields.