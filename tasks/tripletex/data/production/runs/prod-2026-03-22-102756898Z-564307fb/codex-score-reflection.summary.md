# Score Reflection — prod-2026-03-22-102756898Z-564307fb

## 1. Task Attribution

- **tx_task_id**: 06 (T1, max 2 points)
- **Prompt**: Create and send an invoice to the customer Blueshore Ltd (org no. 987928921) for 40600 NOK excluding VAT. The invoice is for Maintenance.
- **Attempt**: #25 for this task

## 2. Correctness Verdict

**PERFECT** — correctness = 1.0, score_raw = 7/7, all 5 checks passed.

The final Tripletex state was exactly correct:
- Customer Blueshore Ltd (987928921) resolved correctly
- Invoice created with description "Maintenance", 40600 NOK excl VAT
- 25% outgoing VAT applied (vatType.id=3), amountCurrency=50750
- Invoice sent via `sendToCustomer=true`
- All 5 scorer checks passed

## 3. Efficiency Verdict

**NOT OPTIMAL** — normalized_score = 1.2667 / 2.0 max (63.3%).

This run matched the previous best score for task 06 (1.2667) but did not improve it. The gap from 1.2667 to 2.0 is entirely an efficiency/error penalty, not a correctness issue.

**Write calls**: 3 (POST 422 + PUT bank + POST retry)
**Errors**: 1 (the 422 bank-account validation)

The 422 error and retry POST are the root cause of the efficiency penalty. With proactive bank-account check, the run would have had:
- **Write calls**: 2 (PUT bank + POST invoice) — saves 1 write
- **Errors**: 0 — saves 1 error

No previous attempt (25 total) has exceeded 1.2667, meaning all prior runs also hit the bank-account trap reactively. The proactive approach has never been tried for task 06.

## 4. Likely Root Cause

The sole efficiency issue was the **reactive bank-account repair pattern**:

1. `POST /invoice?sendToCustomer=true` → 422 (bank account missing) — **wasted write + scored error**
2. `GET /ledger/account?isBankAccount=true&fields=*` — free
3. `PUT /ledger/account/{id}` with bankAccountNumber — 1 write
4. `POST /invoice?sendToCustomer=true` → 201 — 1 write

The proactive path would have been:
1. `GET /ledger/account?isBankAccount=true&fields=*` (parallel with customer+VAT) — **free**
2. `PUT /ledger/account/{id}` (conditional, before invoice) — 1 write
3. `POST /invoice?sendToCustomer=true` → 201 — 1 write

**Savings**: −1 write, −1 error. The extra GET is free and parallelizable.

The create-and-send trusted standard previously said "do not preemptively add GET /ledger/account" — this advice was correct when GETs counted as calls but is now wrong since GETs are free and 4xx errors cost penalty. The prior reflection already identified this and updated the standard.

## 5. What Went Right

- **Correct standard matched**: `create-and-send-customer-invoice.md` (not the create-only variant)
- **Existing customer detected**: "the customer Blueshore Ltd" → definite article → `GET /customer` (not `POST /customer`)
- **Description-only line**: no product numbers in prompt → no product lookup needed
- **Parallel GETs**: customer + vatType resolved in parallel
- **25% VAT correctly applied**: vatType.id=3, amountCurrency=50750 (40600 × 1.25)
- **Bank-account repair handled**: customer.id and vatType.id retained across repair branch
- **All 5 checks passed**: perfect correctness

## 6. What To Change Next Time

1. **Use proactive bank-account check**: Add `GET /ledger/account?isBankAccount=true&fields=*` as a third parallel GET alongside customer and vatType. If `bankAccountNumber` is falsy, `PUT /ledger/account/{id}` BEFORE `POST /invoice`. This eliminates the 422 and retry, saving 1 write + 1 error.

2. **Optimal call sequence for this exact task shape** (existing customer, description-only, taxed, create-and-send):
   - 3 parallel GETs: `GET /customer`, `GET /ledger/vatType`, `GET /ledger/account` (all free)
   - Conditional `PUT /ledger/account/{id}` if bank account missing (1 write)
   - `POST /invoice?sendToCustomer=true` (1 write)
   - Verification `GET /invoice/{id}` (free)
   - **Total: 2 writes, 0 errors** (with bank repair) or **1 write, 0 errors** (without)

3. **Don't read wrong standard first**: The agent initially read `create-customer-invoice.md` (create-only) before finding `create-and-send-customer-invoice.md`. Match "send" in the prompt to the send standard immediately via the AGENTS.md task table.

4. **Don't read multiple documentation files**: AGENTS.md line 36 explicitly warns against reading trusted standard + playbook + AGENTS.md. After reading the matched standard, immediately write and execute the script.

5. **The trusted standard has been updated** (prior reflection) to recommend proactive bank-account check as step 3b. The next run for task 06 should achieve normalized_score > 1.2667 if the proactive approach eliminates the 422.
