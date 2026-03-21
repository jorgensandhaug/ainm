# Codex Reflection Summary — prod-2026-03-21-220050396Z-e6437825

## 1. Task

Create a customer invoice for Havbris AS (org.nr 924693576) with three product lines:
- Opplæring (3296) at 5400 kr, 25% MVA
- Skylagring (6620) at 6850 kr, 15% MVA (næringsmiddel)
- Analyserapport (8441) at 13750 kr, 0% MVA (avgiftsfri)

Norwegian-language prompt. Create-only (do not send).

## 2. Reflection

**What went well:**
- Read only the trusted standard, then immediately wrote and executed the script — no time wasted on AGENTS.md or openapi.json re-reading
- Used the proven comma-separated `number=3296,6620,8441` product query (OR semantics) — resolved all 3 products in one call
- Reused `product.vatType.id` (3=25%, 31=15%, 6=0%) on invoice lines instead of spending a `/ledger/vatType` call
- Included in-script fallback logic for product resolution (catalog read if comma-separated returns fewer than expected)
- Bank-account repair handled correctly in-script without re-reading customer or products
- Correct invoice totals: `amountExcludingVatCurrency=26000`, `amountCurrency=28377.5`

**What went poorly:**
- Nothing. The run was optimal.

**Mistakes:**
- None. Zero avoidable errors, zero wasted calls.

## 3. Call Efficiency

**The run was minimal-call.** 6 API calls total, 0 avoidable errors.

| # | Call | Status | Purpose |
|---|------|--------|---------|
| 1 | `GET /customer?organizationNumber=924693576&fields=*` | 200 | Resolve customer (id=108330637) |
| 2 | `GET /product?number=3296,6620,8441&fields=*` | 200 | Resolve all 3 products in one call |
| 3 | `POST /invoice?sendToCustomer=false` | 422 | Bank-account validation (expected on fresh account) |
| 4 | `GET /ledger/account?isBankAccount=true&fields=*` | 200 | Find bank account for repair |
| 5 | `PUT /ledger/account/377373129` | 200 | Set bank account number |
| 6 | `POST /invoice?sendToCustomer=false` | 201 | Invoice created successfully |

**Wasted calls:** None.

**Theoretical minimum:**
- Without bank-account issue: 3 calls (customer + products + invoice)
- With bank-account issue: 6 calls (3 core + 3 repair)
- This run hit the bank-account issue, so 6 is the floor.

**Lower-call path for next agent:** Same path — this was already optimal.
1. `GET /customer?organizationNumber=...&fields=*`
2. `GET /product?number=X,Y,Z&fields=*` (comma-separated, OR semantics)
3. `POST /invoice?sendToCustomer=false` with `product: { id }` and `vatType: { id: product.vatType.id }`
4. If 422 bank-account → `GET /ledger/account?isBankAccount=true&fields=*` → `PUT /ledger/account/{id}` → retry POST

## 4. Root Causes

No failures or inefficiencies to diagnose. The run followed the proven optimal path established by prior production runs (Sierra SL, Montanha Lda, Ridgepoint Ltd).

## 5. Sandbox Verification

- Confirmed the 3-call core path in the persistent sandbox: customer resolve → product resolve → `POST /invoice?sendToCustomer=false` succeeded with `amountExcludingVatCurrency=26000`
- Sandbox product numbers are very large (e.g. `9459732933`), which caused a 422 on the comma-separated `number` query ("Listen med ID-er må være en kommaseparert liste med positive heltall") — this is a sandbox artifact only; production 4-digit numbers work fine (proven 4 times)
- Invoice creation with `vatType: { id: product.vatType.id }` succeeded in sandbox (0% only, so `amountCurrency=26000`)

## 6. Playbook Changes

Updated existing files (no new files created):
- `./trusted-standards/create-customer-invoice.md` — added 4th production confirmation of comma-separated number query approach (Havbris AS / e6437825, Norwegian prompt, 6 calls 0 errors)
- `./task-playbooks/create-customer-invoice.md` — same production confirmation entry

No changes to AGENTS.md tables (same trusted standard and playbook names).

## 7. Commit

- **Hash:** `c8cd6fef`
- **Message:** `tripletex playbook: create-customer-invoice — add 4th production confirmation of comma-separated number query (e6437825, Havbris AS / 924693576, products 3296+6620+8441, Norwegian prompt, 6 calls 0 avoidable errors); third run achieving optimal 6-call path (3 core + 3 bank-account repair)`

## 8. Reusable Heuristics

1. **Comma-separated `number=X,Y,Z` is the proven product resolver** — 4 production confirmations now (Sierra SL, Montanha Lda, Ridgepoint Ltd, Havbris AS). Always use this as the primary approach for exact-number existing-product invoices.

2. **Always reuse `product.vatType.id`** — products in production consistently carry correct vatType.id values (3=25%, 31=15%, 6=0%). No `/ledger/vatType` call needed for exact-number existing-product create-only invoices.

3. **Bank-account repair adds exactly 3 calls** — the pattern is stable: GET account → PUT with `bankAccountNumber: "12345678903"` → retry same POST. The optimal floor with bank-account repair is 6 calls.

4. **Norwegian prompts work identically to English/Spanish/Portuguese** — no special handling needed for Norwegian product names or task descriptions.

5. **Read only the trusted standard, then execute immediately** — this run avoided the timeout trap that killed the first Ridgepoint Ltd attempt (spent 300s reading docs). The pattern: read trusted-standard → write script → run script.

6. **Include in-script fallback for product resolution** — even though the comma-separated query has been reliable, the fallback to `GET /product?count=1000&fields=*` costs nothing if not triggered and prevents a wasted call if the primary query returns partial results.
