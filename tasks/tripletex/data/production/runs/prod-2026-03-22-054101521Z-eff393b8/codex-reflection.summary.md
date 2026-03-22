# Post-Run Reflection: prod-2026-03-22-054101521Z-eff393b8

## Task

Create a customer invoice for Colline SARL (org 942447647) with three product lines:
- Service réseau (1340) — 10500 NOK, 25% VAT
- Stockage cloud (9754) — 11000 NOK, 15% VAT (alimentaire)
- Session de formation (7005) — 5850 NOK, 0% VAT (exonéré)

French-language prompt. Create-only (no send).

## Reflection

**What went well:**
- Exact trusted-standard match identified immediately (`create-customer-invoice.md`)
- Read the trusted standard before writing any script
- Used comma-separated `number=1340,9754,7005` product query — resolved all 3 products in one call
- Products carried correct `vatType.id` values: `3` (25%), `31` (15%), `6` (0%) — no `/ledger/vatType` call needed
- Bank-account repair triggered correctly on 422, recovered in 3 additional calls
- Script included fallback to `count=1000` if comma query returned incomplete results (not needed here)
- Final totals correct: `amountExcludingVatCurrency=27350`, `amountCurrency=31625`
- 0 avoidable errors

**What went poorly:**
- Nothing. The run was optimal.

**Mistakes:**
- None.

## Call Efficiency

**The run was minimal-call.** 6 API calls total: 3 core + 3 bank-account repair.

| # | Call | Result |
|---|------|--------|
| 1 | `GET /customer?organizationNumber=942447647&fields=*` | 200 — customer id=108530200 |
| 2 | `GET /product?number=1340,9754,7005&fields=*` | 200 — 3 products with vatType.id 3/31/6 |
| 3 | `POST /invoice?sendToCustomer=false` | 422 — bank account missing |
| 4 | `GET /ledger/account?isBankAccount=true&fields=*` | 200 — account 1920 |
| 5 | `PUT /ledger/account/489290391` | 200 — bankAccountNumber set |
| 6 | `POST /invoice?sendToCustomer=false` | 201 — invoice id=2147677673 |

**Wasted calls:** 0
**Avoidable errors:** 0

**Theoretical minimum:** 3 calls (if bank account already set up). With bank-account repair, 6 calls is the floor.

**Lower-call path for next agent:** Same as executed:
1. `GET /customer?organizationNumber=...&fields=*`
2. `GET /product?number=X,Y,Z&fields=*` (comma-separated, OR semantics)
3. `POST /invoice?sendToCustomer=false` — reuse `product.vatType.id` on each line
4–6. Conditional bank-account repair if 422

## Root Causes

No failures to diagnose. The run executed the documented optimal path without deviation.

## Sandbox Verification

- **Comma-separated product query:** `GET /product?number=1340,9754,7005&fields=*` returned all 3 products in sandbox — confirmed
- **Product vatType inheritance:** Products created in sandbox with `vatType.id=3` (25%), invoice lines correctly inherited — confirmed
- **3-call invoice creation:** `GET /customer` → `GET /product?number=...` → `POST /invoice?sendToCustomer=false` produced `amountExcludingVatCurrency=27350` — matches production excl amount
- **Note:** Sandbox has only vatType.id=3 (25%) for outgoing VAT, so `amountCurrency=34187.5` (all 25%) vs production `amountCurrency=31625` (mixed 25%/15%/0%). The excl total and flow path are the same.

## Playbook Changes

**Updated existing files (no new files created):**
- `./trusted-standards/create-customer-invoice.md` — added prod-eff393b8 run entry (French prompt, Colline SARL, 6 calls, 0 errors, fifth comma-separated query confirmation, fourth optimal 6-call path, first French-language confirmation)
- `./task-playbooks/create-customer-invoice.md` — added same prod-eff393b8 run entry

No changes to `AGENTS.md` or `common-endpoints.md` needed — the French language was already listed in the supported prompts section, and the comma-separated product query and bank-account repair flows were already fully documented.

## Commit

- **Hash:** `b84774ea`
- **Message:** `tripletex playbook: create-customer-invoice — add prod-eff393b8 run entry (French prompt, Colline SARL / 942447647 / 1340+9754+7005 / 25%+15%+0%, 6 calls 0 errors, amountExcludingVatCurrency=27350 / amountCurrency=31625); fifth comma-separated number query confirmation; fourth optimal 6-call path; first French-language confirmation for this task shape`

## Reusable Heuristics

1. **Comma-separated `number=X,Y,Z` is now proven across 5+ production runs** (en, es, pt, nb, nn, fr) as the primary product resolver for exact-number prompts. It returns OR semantics and resolves all products in one call.
2. **Product `vatType.id` values are stable across fresh production accounts:** `3` (25%), `31` (15%), `6` (0%). Reusing them with `vatType: { id: product.vatType.id }` on invoice lines always produces correct mixed-VAT totals.
3. **No `/ledger/vatType` call is ever needed** for exact-number existing-product create-only invoices when the product read returns reusable `vatType.id`.
4. **Bank-account repair adds exactly 3 calls** (GET bank account, PUT bankAccountNumber, retry POST invoice). This is unavoidable on fresh accounts and is not an error.
5. **French-language prompts** ("Créez une facture", "TVA", "alimentaire", "exonéré") follow the same standard path as all other languages — no special handling needed.
6. **The comma-separated `number=` query can fail with 422** if product numbers exceed integer range (sandbox had numbers like `9459732933`). Production accounts use small 4-digit numbers that always work. This is a sandbox-only concern, not a production risk.
