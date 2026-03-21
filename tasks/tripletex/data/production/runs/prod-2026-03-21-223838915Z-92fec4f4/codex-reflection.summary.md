# Codex Reflection: prod-2026-03-21-223838915Z-92fec4f4

## Task

Create and send an invoice to existing customer Sjøbris AS (org.nr 847830840) for 7350 kr eksklusiv MVA. Description: Nettverksteneste. Language: Nynorsk.

## Reflection

**What went well:**
- Correctly identified "kunden" (Norwegian definite article) → existing customer → used `GET /customer` instead of `POST /customer`
- Correctly identified "eksklusiv MVA" → taxed 25% ex-VAT branch, not no-VAT
- Parallelized `GET /customer` and `GET /ledger/vatType` in round 1
- Retained `customer.id` and `vatType.id` across the bank-account repair branch
- Used correct field name `unitPriceExcludingVatCurrency` (not `unitCostPrice`)
- Used known-good bank account number `12345678903`
- Preserved Nynorsk description "Nettverksteneste" exactly as prompted

**What went poorly:** Nothing. This was a clean execution with 0 avoidable errors.

**Mistakes:** None.

## Call Efficiency

**Verdict: minimal-call.** The run used 6 API calls with 0 wasted calls and 0 avoidable errors.

| # | Call | Status | Purpose |
|---|------|--------|---------|
| 1 | `GET /customer?organizationNumber=847830840&fields=*` | 200 | Resolve existing customer (parallel) |
| 2 | `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*` | 200 | Resolve 25% VAT type (parallel) |
| 3 | `POST /invoice?sendToCustomer=true` | 422 | Invoice attempt → bank account missing |
| 4 | `GET /ledger/account?isBankAccount=true&fields=*` | 200 | Find invoice bank account for repair |
| 5 | `PUT /ledger/account/376991191` | 200 | Register bank account number |
| 6 | `POST /invoice?sendToCustomer=true` | 201 | Invoice created and sent |

**Theoretical floors:**
- Happy path (bank account configured): 3 calls (2 parallel GETs + 1 POST invoice)
- Bank repair path: 6 calls (2 parallel GETs + failed POST + GET account + PUT account + retry POST)
- Preemptive bank check: 4.3 calls expected (worse than reactive 3.9, already proven suboptimal)

**Wasted calls:** 0

**Lower-call path for next agent:** Same path. No improvement possible.

## Root Causes

No errors or inefficiencies to diagnose. The agent followed the trusted standard exactly and achieved the optimal result.

## Sandbox Verification

- Confirmed minimal `PUT /ledger/account/{id}` payload `{ "bankAccountNumber": "12345678903" }` returns 200 (no extra fields needed)
- Confirmed sandbox bank account 1920 (id=424190862) already configured from prior runs
- Confirmed customer 847830840 does not exist in sandbox (production-only entity)
- No new findings beyond what was already documented

## Playbook Changes

**No changes made.** The run was a perfect execution of the already-optimized trusted standard. This is a repeat of the exact same task shape already confirmed in trusted-standard line 169 (previous Sjøbris AS / 847830840 / 7350 / Nettverksteneste production run). All heuristics, flow steps, and pitfall documentation remain correct and complete.

Files reviewed but not modified:
- `./trusted-standards/create-and-send-customer-invoice.md`
- `./task-playbooks/create-and-send-customer-invoice.md`
- `./AGENTS.md`

## Commit

No commit — no documentation changes were needed.

## Reusable Heuristics

1. **Nynorsk "kunden" = existing customer**: The definite article "kunden" in Nynorsk (same as Bokmål) indicates the customer already exists. Use `GET /customer?organizationNumber=...&fields=*`, not `POST /customer`.

2. **"eksklusiv MVA" = 25% taxed branch**: Norwegian wording (both `nb` and `nn`) "eksklusiv MVA" means the price is stated excluding VAT. Select an exact 25% row from the filtered outgoing VAT result. Do not treat as no-VAT.

3. **Reactive bank repair beats preemptive**: Expected value analysis (70/30 happy/repair split) confirms reactive approach (3.9 expected calls) beats preemptive (4.3 expected calls). Only repair when `POST /invoice` returns the bank-account 422.

4. **Retain state across repair**: Keep `customer.id` and `vatType.id` in memory when entering the bank-repair branch. Re-reading them wastes 2 calls (proven by Etoile SARL's 8-call run vs Fjelltopp AS's 6-call run).

5. **Minimal PUT payload works**: `PUT /ledger/account/{id}` with just `{ "bankAccountNumber": "12345678903" }` is sufficient. Extra fields like `id`, `number`, `name` are accepted but unnecessary.

6. **Same task can appear in multiple runs**: This was a repeat of a previously confirmed task shape. Agents should not assume each task identity is unique across runs.
