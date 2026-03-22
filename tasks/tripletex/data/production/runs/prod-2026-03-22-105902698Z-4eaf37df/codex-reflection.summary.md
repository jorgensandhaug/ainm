# Codex Reflection — Run 4eaf37df

## Task

Set fixed price 326550 NOK on project "Projet d'automatisation" for Cascade SARL (org 813648164). PM Hugo Bernard (hugo.bernard@example.org). Invoice 75% milestone (244912.5 NOK).

## Reflection

**What went well:**
- Correctly identified this as a `set-project-fixed-price-and-invoice-partial-payment` task (not lifecycle)
- Read the trusted standard before scripting
- Used `POST /invoice?sendToCustomer=false` with embedded `orders[]` (saves 1 write vs old POST /order + PUT /order/:invoice)
- Parallelized PUT /project + GET vatType + GET /ledger/account
- Proactive bank-account hedge found missing bank and fixed it pre-emptively (0 errors)
- PM matched from the expanded project read — no separate GET /employee needed
- Milestone amount 326550 × 0.75 = 244912.5 accepted directly as decimal

**What went poorly:**
- Nothing. Run was clean and optimal for its scenario.

**Mistakes:**
- None. All 3 writes were necessary, 0 errors.

## Call Efficiency

**The run was minimal-write for its scenario.**

| Call | Type | Purpose | Write? |
|------|------|---------|--------|
| GET /project?name=...&fields=*,customer(*),projectManager(*) | GET | Find project, prove PM + customer | No (free) |
| PUT /project/{id} | PUT | Set fixedprice=326550, isFixedPrice=true | Yes (write #1) |
| GET /ledger/vatType?typeOfVat=OUTGOING | GET | Resolve VAT (id=3, 25%) | No (free) |
| GET /ledger/account?isBankAccount=true | GET | Proactive bank check | No (free) |
| PUT /ledger/account/{id} | PUT | Fix missing bankAccountNumber | Yes (write #2) |
| POST /invoice?sendToCustomer=false | POST | Create 75% milestone invoice | Yes (write #3) |
| GET /invoice/{id} | GET | Verification | No (free) |
| GET /project/{id} | GET | Verification | No (free) |

**Total: 3 writes, 0 errors.** Score formula: `2 × (1 + 2/3) = 3.3333`

**Wasted calls:** None. All 3 writes were essential:
- PUT /project: fixedprice was 0, needed update to 326550
- PUT /ledger/account: bank account was empty (85% of fresh accounts are)
- POST /invoice: the invoice must be created

**Lower-call path:** Not possible for update-needed + missing-bank. The minimum is 3 writes. For update-needed + configured-bank, minimum is 2 writes (PUT project + POST invoice → 4.0). For skip-PUT (project already correct), minimum is 1 write (POST invoice → 4.0).

## Root Causes

No failures in this run. The run followed the proven optimal path from the trusted standard.

## Sandbox Verification

- Created fixture project with fixedprice=0, isFixedPrice=false
- Proved update-needed path: PUT /project + POST /invoice = **2 writes** (bank was configured in sandbox)
- Invoice returned `amountExcludingVatCurrency=244912.5` matching `326550 × 0.75`
- Outgoing VAT 25% (id=3) resolved correctly
- Project confirmed: fixedprice=326550, isFixedPrice=true
- No lower-write alternative exists

## Playbook Changes

Updated existing files (no new files created):
- `./trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md` — added 2nd Cascade SARL production confirmation (3 writes, POST /invoice, missing bank), updated stats to 13th update-needed run (11/13 = 85% missing bank), added sandbox re-proof
- `./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md` — added 2nd Cascade SARL production confirmation with write-only stats

## Commit

- Hash: `85a193fc`
- Message: `tripletex playbook: fixed-price invoice — add 2nd Cascade SARL run (4eaf37df, 3 writes 0 errors, POST /invoice)`

## Reusable Heuristics

1. **POST /invoice replaces POST /order + PUT /order/:invoice** — saves 1 write. Include both root `invoiceDate`/`invoiceDueDate` and `customer` in root + inside `orders[0]`.
2. **Proactive bank hedge is mandatory on update-needed branch** — 85% of fresh production accounts have missing bank. GET is free, conditional PUT only fires when needed.
3. **Skip-PUT branch stays optimistic** — no bank issues observed on this branch; do NOT add proactive bank check.
4. **Expanded project read resolves PM** — `GET /project?name=...&fields=*,customer(*),projectManager(*)` proves PM email without separate GET /employee.
5. **Decimal milestone amounts work** — 326550 × 0.75 = 244912.5 accepted directly, no rounding needed.
6. **Compare milestone against `amountExcludingVatCurrency`** — not `amountCurrencyOutstanding` (which includes VAT on taxable accounts).
7. **Write count is the scoring metric** — GETs are free. Use them liberally for verification and safety without score penalty.
