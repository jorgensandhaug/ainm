## 1. Task

Post-run learning pass for the customer-creation run that created `Fjordkraft AS` with org no. `974938901`, address `Sjøgata 51, 9008 Tromsø`, email `post@fjordkraft.no`.

## 2. Reflection

What went well:
- Core API path was correct: one `POST /customer`, no pre-read, no follow-up `GET`.
- The write response was reused for verification, which matched scoring guidance.
- The production run completed successfully with the requested fields present.

What went poorly:
- I spent extra local effort resolving whether to use `postalAddress` vs `physicalAddress` even though the task only gave one ordinary address.
- I attempted `br list` because of higher-level repo instructions, but `br` was not installed, so that was wasted setup work.
- The existing customer playbook did not say explicitly that a single normal address should map to `postalAddress` only.

Correct approach:
- For a standard customer-create prompt with one ordinary address, send a single `POST /customer` with `name`, `organizationNumber`, `email`, and `postalAddress.addressLine1/postalCode/city`.
- Verify directly from the `201 {"value": {...}}` response and stop.

## 3. Root Causes

- Missing playbook precision: `create-customer.md` said to include address only when implied, but did not specify the minimal address field mapping.
- Over-caution on schema interpretation: seeing both `postalAddress` and `physicalAddress` in `Customer` led to unnecessary hesitation.
- Environment mismatch: repo-level instruction said to use `br`, but this session did not have `br` available.

## 4. Sandbox Verification

Used sandbox credentials only, via a TypeScript script in the allowed run scripts directory:
- Script: `/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-19-220754610Z-e32000d2/scripts/sandbox-verify-create-customer.ts`

Proved solution shape:
- One `POST https://kkpqfuj-amager.tripletex.dev/v2/customer`
- Payload fields only:
  - `name`
  - `organizationNumber`
  - `email`
  - `postalAddress.addressLine1`
  - `postalAddress.postalCode`
  - `postalAddress.city`

Sandbox result:
- Created customer id `108154573`
- Name `Codex Reflection Customer 1773958201110`
- Org no. `582011109`
- Email `codex-reflection-1773958201110@example.com`
- `postalAddress` returned correctly with `Sjøgata 51`, `9008`, `Tromsø`
- No `GET` was needed
- No `physicalAddress` was needed
- No `4xx` occurred

## 5. Playbook Changes

Updated existing playbook. No new playbook created.

Files changed:
- `./task-playbooks/create-customer.md`
- `./AGENTS.md`

What changed:
- Added explicit guidance that one ordinary customer address should be mapped to `postalAddress`.
- Added the exact minimal address shape: `addressLine1`, `postalCode`, `city`.
- Added guidance not to invent `physicalAddress` unless the prompt explicitly asks for a separate physical/visiting address.
- Added that the `201` write response is sufficient to verify stored address fields.

## 6. Commit

Commit hash:
- `6cfb0ffe8fd484a8938e701dce04cf61ea5e6aa0`

Commit message:
- `tripletex playbook: clarify customer address mapping`

## 7. Reusable Heuristics

- If a create-customer prompt gives one normal address and no address-type distinction, default to `postalAddress`, not both address fields.
- When `POST /customer` returns the requested fields in `value`, treat that as final verification and avoid any extra `GET`.
- If a schema exposes multiple related address objects, prefer the minimal field set that matches the prompt exactly; do not infer extra address semantics.