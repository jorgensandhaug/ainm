# Codex Reflection Summary

## Task
Create and send an invoice to existing customer Nordhav AS (org.nr 876520427) for 7850 kr excluding VAT. Invoice for "Analyserapport". Bokmål prompt with definite article "kunden" indicating existing customer.

## Reflection
The run executed the optimal path for this task shape:
- **Correct standard matched**: `create-and-send-customer-invoice` (not the order-based or create-only variants)
- **Correct customer resolution**: "kunden" (definite article) → `GET /customer` instead of `POST /customer`
- **Correct VAT handling**: "eksklusiv MVA" → taxed 25% branch, dynamically resolved `vatType.id=3` from filtered outgoing VAT
- **Correct bank-repair branch**: retained `customer.id` and `vatType.id` across the repair, avoided re-reading either
- **Correct price field**: `unitPriceExcludingVatCurrency` (not the nonexistent `unitCostPrice`)
- **Correct send method**: default `sendToCustomer=true` on `POST /invoice` (no separate `:send` call)
- **No mistakes, no wasted calls, no avoidable errors**

This run validates the previously sandbox-blocked Nordhav/Analyserapport/7850 task shape in production. The sandbox analog (Nordhav Reflection 12c28001 AS / 999280012) was blocked because sandbox only exposes VAT code 6 (0%), while production has the full VAT set including code 3 (25%).

## Call Efficiency
**Minimal-call: YES** — 6 calls for the existing-customer + bank-repair branch, which is optimal.

| # | Call | Status | Purpose |
|---|------|--------|---------|
| 1 | `GET /customer?organizationNumber=876520427&fields=*` | 200 | Resolve existing customer (parallel) |
| 2 | `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*` | 200 | Resolve 25% VAT type (parallel) |
| 3 | `POST /invoice?sendToCustomer=true` | 422 | First attempt — bank account missing |
| 4 | `GET /ledger/account?isBankAccount=true&fields=*` | 200 | Find invoice bank account |
| 5 | `PUT /ledger/account/376779062` | 200 | Register bank account number |
| 6 | `POST /invoice?sendToCustomer=true` | 201 | Retry — success |

- **Wasted calls**: 0
- **Avoidable errors**: 0
- **Happy-path optimal**: 3 calls (if bank account already registered)
- **Bank-repair optimal**: 6 calls (this run)

## Root Causes
No mistakes in this run. The bank-account 422 on call #3 is unavoidable on fresh accounts where no bank account is registered — preemptive checking was previously proven to cost more (4 calls in happy path vs 3 sequential, no wall-clock benefit).

## Sandbox Verification
- Confirmed sandbox still exposes only VAT code 6 (0%) for `2026-03-21` — the 25% taxed branch remains untestable in sandbox
- Confirmed bank account 1920 (id=424190862) already has `bankAccountNumber=12345678903` from prior sandbox tests
- Sandbox state is consistent with all prior documentation; no new findings

## Playbook Changes
Updated existing files (no new files created):

1. **`./trusted-standards/create-and-send-customer-invoice.md`**: Added production confirmation for `Nordhav AS` / `876520427` / `Analyserapport` / `7850` / `eksklusiv MVA` — Bokmål existing-customer + bank-repair variant, 6 calls, 0 errors. This validates the previously sandbox-blocked task shape in production.

2. **`./task-playbooks/create-and-send-customer-invoice.md`**: Added same production confirmation in the pitfalls section.

## Commit
- **Hash**: `2de25c25`
- **Message**: `tripletex playbook: create-and-send-customer-invoice — add 16th production confirmation (2539fe07, Bokmål prompt, Nordhav AS / 876520427 / Analyserapport / 7850 eksklusiv MVA, existing customer "kunden" + bank repair, 6 calls 0 errors); validates previously sandbox-blocked Nordhav/Analyserapport/7850 task shape in production`

## Reusable Heuristics
1. **Definite article = existing customer**: Norwegian "kunden" (the customer) → `GET /customer`; "en kunde" (a customer) → `POST /customer`. Same in English: "the customer X" → GET, "a customer X" → POST.
2. **"eksklusiv MVA" = taxed 25% branch**: Always select exact 25% from dynamic VAT lookup. Never fall back to 0% or omit `vatType`.
3. **Bank-repair branch is 3 extra calls**: 1 failed invoice + 1 GET account + 1 PUT account + 1 retry = 6 total (vs 3 happy path). Retain `customer.id` and `vatType.id` across the repair to avoid re-reading.
4. **Do not preemptively check bank account**: The reactive try-first approach costs 3 calls in ~70% of runs (happy path) vs 4 calls always with preemptive checking.
5. **Description-only lines need no product creation**: When the prompt gives only a service description without product numbers, `POST /invoice` with `description`, `count`, `unitPriceExcludingVatCurrency`, and resolved `vatType` is sufficient.
6. **Sandbox cannot validate 25% VAT**: Sandbox only has code 6 (0%). Production has codes 3 (25%), 31 (15%), 32 (12%), 5 (0%), 52 (0%), 6 (0%). Trust production confirmations for the taxed branch.
