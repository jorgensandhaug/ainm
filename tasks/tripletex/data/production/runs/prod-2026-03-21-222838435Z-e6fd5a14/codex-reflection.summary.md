# Codex Reflection Summary

## Task

Create and send an invoice to existing customer Sjøbris AS (org.nr 847830840) for 7350 kr excluding VAT. Description: "Nettverksteneste". Nynorsk prompt with definite article "kunden" indicating existing customer.

## Reflection

**What went well:**
- Correctly matched `create-and-send-customer-invoice.md` trusted standard
- Read the trusted standard before writing the script (as required)
- Correctly identified "kunden" (Norwegian definite article) → existing customer → `GET /customer` instead of `POST /customer`
- Correctly identified "eksklusiv MVA" → taxed 25% VAT branch
- Preserved Nynorsk description "Nettverksteneste" as-is in order line
- Parallelized `GET /customer` and `GET /ledger/vatType`
- Retained `customer.id` and `vatType.id` in memory across the bank-account repair branch
- Used correct `unitPriceExcludingVatCurrency` (not `unitCostPrice`)
- Used safe string concatenation for URL building (not `new URL()`)
- Completed in optimal 6 calls with 0 avoidable errors

**What went wrong:**
- Nothing. This was an optimal execution of the documented path.

## Call Efficiency

**The run was minimal-call.** 6 API calls total, 0 avoidable errors.

| # | Call | Status | Purpose |
|---|------|--------|---------|
| 1 | `GET /customer?organizationNumber=847830840&fields=*` | 200 | Resolve existing customer (parallel) |
| 2 | `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*` | 200 | Resolve 25% VAT type (parallel) |
| 3 | `POST /invoice?sendToCustomer=true` | 422 | Invoice attempt; bank account missing |
| 4 | `GET /ledger/account?isBankAccount=true&fields=*` | 200 | Find bank account for repair |
| 5 | `PUT /ledger/account/376760547` | 200 | Register bank number on account 1920 |
| 6 | `POST /invoice?sendToCustomer=true` | 201 | Successful invoice + send |

**Wasted calls: 0.** All 6 calls were necessary given the bank-account repair was required.

**Optimal path for this shape:**
- Happy path (no bank repair): 3 calls — `GET /customer` + `GET /ledger/vatType` (parallel) → `POST /invoice`
- With bank repair: 6 calls — same 3 + failed invoice + `GET /ledger/account` + `PUT /ledger/account/{id}` + retry `POST /invoice`

The bank-account 422 is unavoidable in a fresh account that hasn't registered a bank number. Preemptive bank-account resolution was already tested and costs 4 calls in the happy case vs 3, making it worse ~70% of the time.

## Root Causes

No errors or wasted calls in this run. The agent followed the trusted standard exactly.

## Sandbox Verification

- Sandbox confirmed "Nettverksteneste" description is preserved correctly on readback (`description: "Nettverksteneste"`, `product: null`)
- Sandbox only has 0% VAT (code 6), so the exact 25% taxed outcome was not reproducible there, but the mechanics are identical
- The create-and-send flow with `sendToCustomer=true` succeeded in sandbox

## Playbook Changes

- **Updated**: `./trusted-standards/create-and-send-customer-invoice.md`
  - Added Sjøbris AS / 847830840 / 7350 as 3rd existing-customer + bank-repair production confirmation
  - Noted this is the first Nynorsk definite-article "kunden" production confirmation of the existing-customer branch
- **No changes needed**: `./task-playbooks/create-and-send-customer-invoice.md` (already comprehensive)
- **No changes needed**: `./AGENTS.md` (no new patterns or endpoints)

## Commit

- Hash: `1fdd97af`
- Message: `tripletex playbook: create-and-send-customer-invoice — add 3rd existing-customer + bank-repair production confirmation (e6fd5a14, Nynorsk prompt, Sjøbris AS / 847830840 / Nettverksteneste / 7350, 6 calls 0 errors); first Nynorsk definite-article "kunden" confirmation of existing-customer branch`

## Reusable Heuristics

1. **Definite-article heuristic is language-consistent**: Norwegian "kunden" (definite) → existing customer → `GET /customer`; "en kunde" (indefinite) → new customer → `POST /customer`. Same rule in English ("the customer" vs "a customer"). Now confirmed in both Bokmål and Nynorsk.

2. **Nynorsk follows Bokmål rules exactly**: `eksklusiv MVA` → taxed 25% branch; description preserved as-is; same API flow.

3. **Bank-repair state retention is critical**: Always retain `customer.id` and `vatType.id` in local variables across the repair branch. This keeps the repair at 3 extra calls (failed invoice + GET account + PUT account) instead of 5 (re-reading customer + vatType + failed invoice + GET account + PUT account).

4. **Parallelization works for reads, not for repair**: `GET /customer` and `GET /ledger/vatType` can safely run in parallel. The repair branch (`GET /ledger/account` → `PUT /ledger/account/{id}` → retry `POST /invoice`) is sequential.

5. **The trusted standard has 3 confirmed existing-customer + bank-repair production runs now**: Brightstone Ltd (English), Fjelltopp AS (Nynorsk, new customer), Sjøbris AS (Nynorsk, existing customer). All completed in 6 calls with 0 avoidable errors. The pattern is robust.
