# Codex Reflection Summary

## Task
Create and send an invoice to the existing customer Bølgekraft AS (org.nr 892362416) for 34150 kr excluding VAT. The invoice is for "Vedlikehald" (Maintenance). Nynorsk prompt with definite article "kunden" indicating existing customer.

## Reflection
Everything went well. The agent:
- Correctly identified "kunden" (Nynorsk definite article) → existing customer → `GET /customer`
- Correctly identified "eksklusiv MVA" → taxed 25% branch → select exact 25% vatType from filtered outgoing VAT result
- Correctly used description-only order line for "Vedlikehald" (no product numbers in prompt → no product creation needed)
- Parallelized `GET /customer` + `GET /ledger/vatType` in a single `Promise.all`
- Retained `customer.id` and `vatType.id` in memory across the bank-account repair branch
- Used correct field `unitPriceExcludingVatCurrency` (not `unitCostPrice`)
- Used `sendToCustomer=true` on the invoice POST to handle send in the same write
- No wasted calls, no avoidable errors

Result: 6 API calls, 0 avoidable errors. Invoice #1 created with `amountExcludingVatCurrency=34150`, `amountCurrency=42687.5` (34150 × 1.25).

## Call Efficiency
**The run was minimal-call.** 6 calls is the theoretical minimum for this task shape with bank-account repair:

| # | Call | Status | Purpose |
|---|------|--------|---------|
| 1 | `GET /customer?organizationNumber=892362416&fields=*` | 200 | Resolve existing customer (id=108460752) |
| 2 | `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-22&fields=*` | 200 | Find 25% VAT (id=3) |
| 3 | `POST /invoice?sendToCustomer=true` | 422 | Bank account missing — expected repair branch |
| 4 | `GET /ledger/account?isBankAccount=true&fields=*` | 200 | Find invoice account 1920 (id=478375694) |
| 5 | `PUT /ledger/account/478375694` | 200 | Register bank account number |
| 6 | `POST /invoice?sendToCustomer=true` | 201 | Invoice created and sent |

- **Wasted calls: 0**
- Without bank-account repair the minimum would be 3 calls; with repair it is 6. The run hit 6 exactly.
- Calls 1 and 2 were parallelized via `Promise.all`.

## Root Causes
No errors or inefficiencies. The bank-account repair branch (calls 3-5) is account-specific and unavoidable when the fresh production account lacks a registered bank account number.

## Sandbox Verification
- Confirmed sandbox still has only 0% VAT (code 6) — 25% not available there, so exact taxed outcome not reproducible in sandbox
- Created test customer and invoice with description "Vedlikehald" and 0% VAT in sandbox — succeeded
- Readback confirmed: `description: "Vedlikehald"`, `product: null`, `unitPriceExcludingVatCurrency: 34150` — description preserved exactly, no product needed for description-only lines
- Sandbox did NOT require bank-account repair (already registered from prior runs)
- Pattern: existing-customer + description-only + bank-repair is fully stable across all verified languages

## Playbook Changes
Updated existing files (no new files created):
- `./trusted-standards/create-and-send-customer-invoice.md` — added Bølgekraft AS production confirmation as 2nd Nynorsk definite-article "kunden" existing-customer proof
- `./task-playbooks/create-and-send-customer-invoice.md` — added same confirmation; noted this is the 13th consecutive optimal run across en/nb/nn/es/fr/de

## Commit
- **Hash**: `257ffdb8`
- **Message**: `tripletex playbook: create-and-send-customer-invoice — add 13th production confirmation (7b40806a, Nynorsk prompt, Bølgekraft AS / 892362416 / Vedlikehald / 34150, 6 calls 0 errors); 2nd Nynorsk definite-article "kunden" existing-customer confirmation after Sjøbris AS; sandbox-verified description preserved exactly with product: null; 13 consecutive optimal runs across en/nb/nn/es/fr/de confirm the standard is fully language-independent and stable`

## Reusable Heuristics
1. **Nynorsk "kunden" = existing customer**: Definite article in Nynorsk works the same as Bokmål "kunden", English "the customer", German "den Kunden" — use `GET /customer` not `POST /customer`.
2. **"eksklusiv MVA" = taxed 25%**: Select exact 25% row from filtered outgoing VAT result; never fall back to 0%.
3. **Description-only lines need no product**: When the prompt gives only a service description without product numbers, `POST /invoice` with `description` + `count` + `unitPriceExcludingVatCurrency` + `vatType` is sufficient; readback shows `product: null`.
4. **Bank-account repair costs exactly 3 extra calls**: failed invoice + GET account + PUT account; retain `customer.id` and `vatType.id` across the repair to avoid re-reading them.
5. **Parallel GET /customer + GET /vatType**: These have no dependency; always parallelize them to reduce wall-clock time.
6. **Standard is language-independent**: 13 consecutive optimal runs across 6 languages (en, nb, nn, es, fr, de) confirm no language-specific branching is needed.
