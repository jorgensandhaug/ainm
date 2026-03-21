# Codex Reflection Summary

## 1. Task

Create and send an invoice to the customer Ironbridge Ltd (org no. 841254546) for 28500 NOK excluding VAT. Description: System Development. English prompt.

## 2. Reflection

**What went well:**
- Correctly matched trusted standard `create-and-send-customer-invoice.md`
- Correctly detected "the customer" (English definite article) → existing customer → `GET /customer` instead of `POST /customer`
- Parallelized `GET /customer` and `GET /ledger/vatType` (no dependency between them)
- Used description-only order lines (no unnecessary `POST /product` or `GET /product` since no product numbers in prompt)
- Correctly selected 25% VAT from dynamic lookup (`vatType.id=3`)
- Used `unitPriceExcludingVatCurrency` (not the nonexistent `unitCostPrice`)
- Used default `sendToCustomer=true` (no separate `:send` call)
- Retained `customer.id` and `vatType.id` across the bank-account repair branch (avoided 2 wasted re-reads)
- Used minimal `PUT /ledger/account/{id}` with `bankAccountNumber: "12345678903"` for bank repair

**What went poorly:**
- Nothing. The run followed the trusted standard exactly and achieved the optimal call count.

**Mistakes:**
- None. Zero avoidable errors.

## 3. Call Efficiency

**The run was minimal-call.** 6 API calls, 0 avoidable errors.

| # | Call | Status | Purpose |
|---|------|--------|---------|
| 1 | `GET /customer?organizationNumber=841254546&fields=*` | 200 | Resolve existing customer (parallel with #2) |
| 2 | `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*` | 200 | Resolve 25% VAT type (parallel with #1) |
| 3 | `POST /invoice?sendToCustomer=true` | 422 | Bank account missing (unavoidable in fresh accounts) |
| 4 | `GET /ledger/account?isBankAccount=true&fields=*` | 200 | Find invoice account 1920 for repair |
| 5 | `PUT /ledger/account/377193269` | 200 | Register bank account number |
| 6 | `POST /invoice?sendToCustomer=true` | 201 | Invoice created successfully |

**Wasted calls:** 0

**Lower-call path:** Not possible. The 6-call path (2 parallel reads + failed invoice + 2 repair + retry) is the proven minimum for the existing-customer + bank-repair variant. The happy path (no bank repair) would be 3 calls. Preemptive bank-account checking was tested in sandbox and found suboptimal (~70% of runs don't need repair, costs 1 extra call in happy path).

**Final state:**
- Invoice #1, id=2147647390
- `amountExcludingVatCurrency=28500`
- `amountCurrency=35625` (28500 × 1.25)
- Customer: Ironbridge Ltd (id=108330336)

## 4. Root Causes

No failures in this run. The optimal execution was achieved because:
1. The trusted standard was read before writing the script
2. The definite-article heuristic was correctly applied
3. State was retained across the bank-repair branch
4. No speculative pre-reads or unnecessary product operations

## 5. Sandbox Verification

Sandbox investigation confirmed:
- `GET /ledger/account?number=1920&isBankAccount=true` returns exactly one result (the invoice account), confirming `number=1920` filter works for targeted lookup
- Multiple bank accounts exist (1920, 1930, 1950) but only 1920 has `isInvoiceAccount=true`
- 3-way parallel `[GET /customer + GET /ledger/vatType + GET /ledger/account]` took 131ms but this preemptive approach adds 1 unnecessary call in ~70% of runs, confirming the reactive approach is optimal
- Sandbox only has VAT code 6 (0%), confirming dynamic VAT lookup remains essential (production has the full set including code 3 at 25%)

No new alternative lower-call path was discovered. 6 calls remains the minimum for the bank-repair case.

## 6. Playbook Changes

**Updated existing files (no new files created):**

1. `./trusted-standards/create-and-send-customer-invoice.md`:
   - Added explicit parallelization instruction for steps 1+3a in the existing-customer description-only variant ("parallelize steps 1 and 3a — they have no dependency on each other")
   - Added Ironbridge Ltd (124d9ed3) as production confirmation: English, existing customer, bank repair, 6 calls, 0 errors

2. `./task-playbooks/create-and-send-customer-invoice.md`:
   - Added Ironbridge Ltd as production confirmation with same details

Both edits were included in commit `41d97405` by a concurrent reflection process.

## 7. Commit

- **Hash:** `41d97405`
- **Message:** `tripletex playbook: create-and-send-customer-invoice — add existing-product handling for existing-customer variant (GET /product instead of POST /product/list to avoid 422), add German definite-article heuristic ("den Kunden"), add CRITICAL string comparison pitfall (product.number and vatType.number are strings not numbers), add Brückentor GmbH production confirmation (804379010, 3 product lines, multi-VAT 25%+15%+0%, 11 calls actual vs 7 optimal due to existing-product + string-comparison bugs)`
- **Note:** My Ironbridge Ltd confirmation edits were included in this concurrent commit along with other reflection changes.

## 8. Reusable Heuristics

1. **English definite article "the customer X" → existing customer**: Use `GET /customer` not `POST /customer`. This mirrors Norwegian "kunden", Nynorsk "kunden", and German "den Kunden". Now confirmed across 5+ production runs.

2. **Parallelize independent reads**: When resolving an existing customer and VAT type, these calls have no dependency — always parallelize them. The trusted standard now explicitly states this.

3. **Retain state across bank repair**: When `POST /invoice` fails with the bank-account 422, retain `customer.id` and `vatType.id` in memory. Do not re-read them. This saves 2 calls (8→6 total). Every production run that retained state completed in 6 calls; the one that didn't (Étoile SARL) took 8.

4. **Description-only vs product-line distinction**: When the prompt gives only a service description (e.g. "System Development") without product numbers in parentheses, use description-only order lines with `POST /invoice`. No `POST /product` or `GET /product` needed. `product: null` on readback is correct for this variant.

5. **Reactive bank repair > preemptive**: Do not add `GET /ledger/account` to every flow. ~70% of production runs don't need bank repair. The preemptive approach costs 4 calls minimum (vs 3 reactive happy path) with no wall-clock benefit.

6. **Bank account number `12345678903`**: This is the proven-safe value for `PUT /ledger/account/{id}`. It passes mod-11 validation. Do not improvise a different number unless this one collides.

7. **6 calls is the floor for existing-customer + bank-repair**: 2 parallel reads + 1 failed invoice + 1 GET account + 1 PUT account + 1 retry invoice. No way to reduce further without either preemptive checking (worse on average) or hardcoding account IDs (unsafe, IDs vary across accounts).
