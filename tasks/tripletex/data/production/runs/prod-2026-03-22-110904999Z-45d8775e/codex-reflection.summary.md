# Codex Reflection Summary

## Task
Create and send an invoice to existing customer Bergvik AS (org.nr 890733751) for 28900 kr excluding MVA. Invoice for "Systemutvikling". Norwegian Bokmal prompt with definite article "kunden" (existing customer).

## Reflection

**What went well:**
- Correctly matched `create-and-send-customer-invoice.md` trusted standard (the 2026-03-21 run of the same task wrongly used the order-based standard)
- "kunden" (definite article) correctly triggered `GET /customer` instead of `POST /customer`
- "eksklusiv MVA" correctly mapped to hardcoded `vatType: { id: 3 }` (25%) — no `GET /ledger/vatType` call needed
- Description-only line (no product numbers) — no product creation needed
- Proactive bank check with `GET /ledger/account` caught missing bankAccountNumber BEFORE `POST /invoice`, avoiding a 422 error + retry
- All 4 calls succeeded (0 errors)

**What went poorly:**
- Nothing. This was a clean, optimal execution.

**Compared to previous run (2026-03-21):**
- 2026-03-21: 8 calls, 1 error (wrong flow: order-based standard, unnecessary product creation)
- 2026-03-22: 4 calls, 0 errors (correct flow: this standard with hardcoded vatType + proactive bank check)
- Improvement: 50% fewer calls, 100% fewer errors

## Call Efficiency

**Was the run minimal-call?** YES.

| # | Call | Type | Purpose |
|---|------|------|---------|
| 1 | `GET /customer?organizationNumber=890733751&fields=*` | free GET | Resolve existing customer (parallel with #2) |
| 2 | `GET /ledger/account?isBankAccount=true&fields=*` | free GET | Proactive bank check (parallel with #1) |
| 3 | `PUT /ledger/account/499922623` | write | Bank repair (bankAccountNumber was missing) |
| 4 | `POST /invoice` | write | Create + send invoice (201) |
| 5 | `GET /invoice/2147698564?fields=*,...` | free GET | Verification readback |

**Result:** 2 writes + 0 errors. This is the theoretical minimum for this task shape (existing customer + bank repair needed + 25% VAT + description-only line).

**Wasted calls:** 0.

**Lower-call path for same shape without bank repair:** If bankAccountNumber is already set, only 1 write needed (POST /invoice). Sandbox verified: 2 free GETs + 1 write + 0 errors.

## Root Causes

No issues in this run. For reference, the 2026-03-21 run of the same task had these root causes:
1. **Wrong standard selected** — order-based flow instead of create-and-send
2. **Unnecessary product creation** — description-only tasks don't need products
3. **No proactive bank check** — reactive approach caused 422 + retry
4. **GET /ledger/vatType instead of hardcoding** — vatType.id=3 is stable

All four were avoided in this run.

## Sandbox Verification

Confirmed the exact same flow in persistent sandbox:
- Created test customer `Sandbox Bergvik Test AS` (org 999890733)
- 2 free GETs (customer + bank check) -> bank already had number -> 1 write (POST /invoice) -> 201
- `amountExcludingVatCurrency=28900`, `amountCurrency=36125` (correct 25% VAT)
- `vatType.id=3`, `vatType.percentage=25` on readback
- Happy path (no bank repair): 3 calls (2 free + 1 write)
- Bank repair path: 4 calls (2 free + 2 writes)

## Playbook Changes

**Updated existing files (no new files created):**

1. `./trusted-standards/create-and-send-customer-invoice.md`
   - Updated Bergvik AS pitfall (line 117): replaced old "6-call reactive optimal" with new "4-call proactive optimal" proof
   - Updated product-line call counts (lines 122-125): removed GET /ledger/vatType from counts since vatType is now hardcoded

2. `./task-playbooks/create-and-send-customer-invoice.md`
   - Updated Bergvik AS entry (line 265): replaced old 6-call reference with new 4-call production proof

3. `./AGENTS.md`
   - Updated Bergvik AS disambiguation pitfall (line 158): added 4-call optimal path proof from 2026-03-22

## Commit

- Hash: `10bec117f602231dd25582c16e8926cd5ae1c878`
- Message: `tripletex playbook: create-and-send invoice — add Bergvik AS 2026-03-22 proof (4 calls 0 errors), update optimal path`

## Reusable Heuristics

1. **Hardcode vatType IDs** — `vatType: { id: 3 }` for 25% standard VAT is stable across sandbox and production; eliminates 1 GET call per run
2. **Proactive bank check** — `GET /ledger/account?isBankAccount=true&fields=*` in parallel with customer resolution; if bankAccountNumber is falsy, repair with PUT before POST /invoice; eliminates 1 failed POST + 1 retry (saves 1 write + 1 error)
3. **Definite article = existing customer** — Norwegian "kunden", English "the customer", German "den Kunden" -> use GET /customer, not POST /customer
4. **Description-only lines need no product calls** — when prompt gives only a service description without product numbers, POST /invoice handles it natively with `product: null`
5. **The optimal existing-customer + bank-repair + 25% VAT shape is 4 calls**: `GET /customer` || `GET /ledger/account` -> `PUT /ledger/account` -> `POST /invoice` (2 free + 2 writes + 0 errors)
6. **The optimal existing-customer + no-bank-repair + 25% VAT shape is 3 calls**: `GET /customer` || `GET /ledger/account` -> `POST /invoice` (2 free + 1 write + 0 errors)
