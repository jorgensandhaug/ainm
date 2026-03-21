# Codex Reflection: create-project (e3fd9f40)

## 1. Task

Create project "Implementering Nordhav" linked to customer Nordhav AS (org.nr 957080138) with project manager Silje Ødegård (silje.degard@example.org). Norwegian Bokmål prompt.

## 2. Reflection

**What went well:**
- Recognized exact match to `create-project` trusted standard immediately
- Read the trusted standard before writing any code (as required)
- Executed the proven 3-call path without deviation
- 0 errors, 0 wasted calls
- Manager Ø/ASCII email mismatch handled correctly (trusted standard already covered this pattern from run 826557990)

**What went poorly:** Nothing. The run was clean.

**Mistakes:** None.

## 3. Call Efficiency

**Minimal-call: YES** — 3 calls, 0 errors.

| # | Call | Purpose | Status |
|---|------|---------|--------|
| 1 | `GET /customer?organizationNumber=957080138&count=10&fields=*` | Resolve customer ID | 200, 1 hit |
| 2 | `GET /employee?email=silje.degard@example.org&assignableProjectManagers=true&count=10&fields=*` | Resolve manager ID | 200, 1 hit |
| 3 | `POST /project` | Create project | 201 |

**Wasted calls:** 0

**Lower-call path:** None exists. Sandbox re-proof on 2026-03-21 confirmed:
- Nested `customer: { organizationNumber }` without `name` → 422
- Nested `customer: { name, organizationNumber }` → 201 but `customer=null` (silently drops link)
- Nested `projectManager: { firstName, lastName, email }` without `id` → 422 "Prosjektleder" required

The 3-call path is the proven minimum for this task shape.

## 4. Root Causes

No failures to diagnose. The run followed the trusted standard exactly.

## 5. Sandbox Verification

Re-tested two nested-object shortcuts:
1. `POST /project` with `customer: { organizationNumber }` + `projectManager: { email }` → **422** (`customer.name: Kan ikke være null.`)
2. `POST /project` with `customer: { name, organizationNumber }` + `projectManager: { firstName, lastName, email }` → **422** (`Feltet "Prosjektleder" må fylles ut.`)

Both shortcuts fail. The 3-call minimum is unchanged across 15 consecutive production runs.

## 6. Playbook Changes

Updated existing files (committed by parallel session `e87d2750`):
- `trusted-standards/create-project.md` — added 15th production confirmation (e3fd9f40) and sandbox re-proof of nested-object 422s
- `task-playbooks/create-project.md` — added 15th production confirmation

No new playbooks or trusted standards created. No AGENTS.md changes needed.

## 7. Commit

Commit `e87d2750` (by parallel session): `tripletex playbook: create-supplier — add 10th production confirmation (a66e419b, ...)` — included the create-project updates alongside create-supplier updates.

## 8. Reusable Heuristics

1. **3-call minimum is hard**: For the `existing-customer-by-orgNumber + existing-manager-by-email` shape, no 2-call or 1-call shortcut exists. Do not waste time trying nested objects.
2. **Ø/ASCII email mismatch is safe**: When the prompt name uses `Ø` but the email uses `degard`, the single exact-email hit is sufficient. No name disambiguation read needed.
3. **Language independence confirmed**: 15 runs across en/pt/es/nb/nn/fr/de all use the identical 3-call path. Prompt language never changes the flow.
4. **Read the trusted standard, not memory**: The standard has all the edge cases documented. Never write from recall.
5. **`assignableProjectManagers=true` is mandatory**: Plain employee search can return employees who cannot be assigned as project managers. Always use the filter.
