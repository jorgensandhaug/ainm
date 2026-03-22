# Codex Reflection: prod-2026-03-22-045400782Z-d49da665

## Task

Register supplier invoice INV-2026-4194 from Viento SL (org 933672905), 19350 NOK gross (25% VAT included), account 6540 (servicios de oficina). Spanish prompt, text-only (no PDF). Task type: T11 — register supplier invoice.

## Reflection

**What went well:**
- Correctly identified this as a T11 text-only supplier invoice task
- Read the trusted standard before writing the script
- Used `importDocument` (not direct `POST /ledger/voucher`) — correct approach
- Used `supplier.ledgerAccount.id` from POST response to avoid extra GET for account 2400
- Correctly separated postings PUT and booking PUT into two calls
- VAT calculation correct (15480 net, 3870 VAT, 19350 gross)
- XML structure was valid and accepted

**What went poorly:**
- **CRITICAL**: First script assumed `importDocument` returns `{ value: {...} }` but it actually returns `{ values: [...] }` — script crashed accessing `.value.id` on undefined
- The crash happened AFTER `importDocument` succeeded (201), creating an orphaned supplierInvoice entity
- Retry created a SECOND supplier (108524299 + 108524341) and SECOND supplierInvoice entity
- Scorer found duplicate/broken state → **0/8 score** (0/4 checks passed)

**Why it happened:**
- The trusted standard and playbook did not document the response shape difference between `importDocument` (`.values`) and other endpoints (`.value`)
- The agent used memory/assumption rather than defensive parsing (e.g., `imp.value?.id ?? imp.values?.[0]?.id`)
- No awareness that `importDocument` is not idempotent — each call creates a new SI entity regardless of invoice number

## Call Efficiency

**Was it minimal?** No.

| Call | Endpoint | Status | Outcome |
|------|----------|--------|---------|
| 1 (wasted) | POST /supplier | 201 | Created supplier 108524299 — orphaned by crash |
| 2 (wasted) | GET /ledger/account | 200 | Data lost on crash |
| 3 (wasted) | POST importDocument | 201 | Created orphaned SI entity — CANNOT be deleted |
| 4 | POST /supplier | 201 | Created duplicate supplier 108524341 |
| 5 | GET /ledger/account | 200 | Got expense account id |
| 6 | POST importDocument | 201 | Created second SI entity + voucher |
| 7 | PUT postings | 200 | Set correct postings |
| 8 | PUT book | 200 | Booked voucher as number 1 |

**Total: 8 calls (3 wasted from crash). Ideal: 5 calls.**

**Exact lower-call path for next agent (5 calls):**
1. `POST /supplier` → extract `.value.id` AND `.value.ledgerAccount.id`
2. `GET /ledger/account?number=6540&isApplicableForSupplierInvoice=true&fields=*` → extract `.values[0].id`
3. `POST /ledger/voucher/importDocument` (EHF XML) → extract **`.values[0].id`** and **`.values[0].version`**
4. `PUT /ledger/voucher/{id}?sendToLedger=false` → set postings → extract `.value.version`
5. `PUT /ledger/voucher/{id}?sendToLedger=true` → book → verify `.value.number > 0`

## Root Causes

1. **Response shape mismatch**: `importDocument` returns `{ values: [...] }` (plural) while all other endpoints return `{ value: {...} }` (singular). The trusted standard did not document this, and the agent assumed the common `.value` pattern.

2. **Non-idempotent importDocument**: Each `importDocument` call creates a new supplierInvoice entity, even for the same invoice number. The crash-retry cycle created duplicates that cannot be cleaned up via API, causing the scorer to find broken state.

3. **No defensive parsing**: The script used `imp.value.id` directly instead of `imp.values?.[0]?.id ?? imp.value?.id`, which would have survived the response shape difference.

4. **Outdated common-endpoints.md**: Line 777 of `common-endpoints.md` recommended direct `POST /ledger/voucher` over `importDocument` for supplier invoices — directly contradicting the trusted standard. This stale guidance could mislead future agents.

## Sandbox Verification

Sandbox E2E test (2026-03-22) confirmed:

| Endpoint | Response wrapper | Key fields |
|---|---|---|
| POST /supplier | `.value` | `.value.id`, `.value.ledgerAccount.id` (= account 2400) |
| GET /ledger/account | `.values` | `.values[0].id` |
| POST importDocument | **`.values`** | `.values[0].id`, `.values[0].version` |
| PUT /ledger/voucher | `.value` | `.value.version`, `.value.number` |

- Full 5-call path succeeded: supplier 108524808 → account 424191132 → voucher 609323090 (version 1 → 3 → 6) → booked as number 772
- SupplierInvoice entity created automatically from XML with correct amounts
- `supplier.ledgerAccount.id` (424190921) confirmed as account 2400's id — no extra GET needed

## Playbook Changes

**Updated existing files** (not new):

1. **`./trusted-standards/register-supplier-invoice.md`**:
   - Added response shape documentation for each step (`.value` vs `.values`)
   - Added "CRITICAL: importDocument is NOT idempotent" section
   - Documented `supplier.ledgerAccount.id` as source for account 2400 in minimal-call claim
   - Added response shape pitfall as first item in Known Pitfalls
   - Added prod-d49da665 entry with 0/8 score and root cause

2. **`./task-playbooks/register-supplier-invoice.md`**:
   - Added response shape annotations to Proven Best Path steps
   - Added non-idempotency warning section
   - Added response shape and account-2400 pitfalls
   - Added prod-d49da665 entry with 0/8 score

3. **`./trusted-standards/common-endpoints.md`**:
   - **Corrected line 777**: Changed from "use direct POST /ledger/voucher" to "ALWAYS use importDocument"
   - Added `supplier.ledgerAccount.id` tip for account 2400
   - Expanded importDocument response shape documentation

4. **`./AGENTS.md`**:
   - Added non-idempotency warning for importDocument
   - Updated 5-call canonical path with correct response extraction patterns
   - Removed stale 4-call direct-voucher path reference

## Commit

```
341c56f2 tripletex playbook: register-supplier-invoice — document importDocument response shape (.values[0] not .value) and non-idempotency (prod-d49da665, Spanish prompt, Viento SL / 933672905 / INV-2026-4194 / 19350 / 6540 / 25%, scored 0/8)
```

Files changed: `AGENTS.md`, `trusted-standards/register-supplier-invoice.md`, `trusted-standards/common-endpoints.md`, `task-playbooks/register-supplier-invoice.md`

## Reusable Heuristics

1. **importDocument returns `.values[0]`, not `.value`** — this is the single most important pitfall for supplier invoice tasks. Every script MUST use `.values[0]` on importDocument and `.value` on all other endpoints. Use a defensive parser: `const v = res.values?.[0] ?? res.value;`

2. **importDocument is not idempotent** — each call creates a new supplierInvoice entity. If the script crashes after importDocument, there is NO safe retry. Parse the response correctly on the first attempt.

3. **POST /supplier provides account 2400 for free** — `response.value.ledgerAccount.id` IS the supplier liability account. Do NOT waste a GET call looking up account 2400 separately.

4. **Response shape table for T11/T20 scripts**:
   - POST /supplier → `.value`
   - GET /ledger/account → `.values`
   - POST importDocument → `.values` (EXCEPTION)
   - PUT /ledger/voucher → `.value`

5. **Minimum call floor for fresh supplier + 25% VAT = 5 calls** — cannot be reduced further. Two PUTs are mandatory (postings then book). GET for expense account is mandatory (no `account: { number: N }` shortcut).

6. **common-endpoints.md stale guidance** — periodically audit common-endpoints.md for contradictions with trusted standards. Stale entries (like the old "use direct POST /ledger/voucher" guidance) can mislead agents.
