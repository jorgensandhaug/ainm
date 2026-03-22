# Post-Run Reflection: prod-2026-03-22-054826843Z-dec75cfd

## 1. Task

Set fixed price 170650 NOK on project "Projet d'automatisation" for Rivière SARL (org 852968737). Project manager Nathan Martin (nathan.martin@example.org). Invoice 25% of fixed price (42662.5 NOK) as milestone payment. French prompt: "Fixez un prix forfaitaire".

## 2. Reflection

**What went well:**
- Correctly identified the task as `set-project-fixed-price-and-invoice-partial-payment` (not the lifecycle standard)
- Read the trusted standard before writing any script
- Used the `POST /invoice?sendToCustomer=false` optimization (1 call instead of old `POST /order` + `PUT /order/:invoice` = 2 calls)
- Correctly used the proactive hedge branch: parallelized `PUT /project` + `GET /ledger/vatType` + `GET /ledger/account`
- Found and fixed the missing bank account before the invoice write → 0 errors
- PM email matched on the initial project read → no separate `GET /employee` needed
- Customer matched via nested `customer.organizationNumber` → no separate `GET /customer` needed

**What went poorly:**
- Nothing. The run was optimal for the update-needed + missing-bank branch.

**Mistakes:**
- None. All 6 calls were necessary and no avoidable 4xx errors occurred.

## 3. Call Efficiency

**Was the run minimal-call?** Yes.

The production path was:
1. `GET /project?name=...&count=50&fields=*,customer(*),projectManager(*)` — found project with fixedprice=0, isFixedPrice=false, correct customer and PM already linked
2. `PUT /project/402064765` — set isFixedPrice=true, fixedprice=170650 (parallelized)
3. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-22&fields=*` — got 25% VAT (id=3) (parallelized)
4. `GET /ledger/account?isBankAccount=true&fields=*` — found account 1920 with empty bankAccountNumber (parallelized)
5. `PUT /ledger/account/489507817` — fixed bank account with bankAccountNumber=12345678903
6. `POST /invoice?sendToCustomer=false` — created invoice 2147677955

**Wasted calls:** 0

**Canonical call counts for this task family:**
- Skip-PUT (project already has correct fixedprice): **3 calls**
- Update-needed + configured bank: **5 calls**
- Update-needed + missing bank: **6 calls** ← this run

**Lower-call path the next agent should follow:** Same path. This was already optimal.

## 4. Root Causes

No issues to diagnose. The run executed the trusted standard correctly.

Notable: This is the first production run to successfully use `POST /invoice?sendToCustomer=false` with embedded `orders[]` on the correct entities. Prior runs either used the old `POST /order` + `PUT /order/:invoice` (7 calls for missing-bank) or used `POST /invoice` but on wrong entities (Brückentor GmbH failure). This confirms the 1-call saving holds in production.

## 5. Sandbox Verification

Persistent-sandbox verification on 2026-03-22 with arithmetic `170650 * 0.25 = 42662.5`:

- **Update-needed proactive hedge** (bank already configured from prior sandbox run): 5 measured calls
  - `GET /project` → parallel(`PUT /project` + `GET /ledger/vatType` + `GET /ledger/account`) → `POST /invoice`
  - Invoice returned `amountExcludingVatCurrency=42662.5`, `amountCurrencyOutstanding=53328.13`

- **Skip-PUT branch** (project already had correct fixedprice from update-needed run): 3 measured calls
  - `GET /project` → `GET /ledger/vatType` → `POST /invoice`
  - Invoice returned `amountExcludingVatCurrency=42662.5`, `amountCurrencyOutstanding=53328.13`

Both branches confirmed. No lower-call alternative found.

## 6. Playbook Changes

Updated existing files (no new files created):

- **`./trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md`**
  - Added prod-dec75cfd run entry: first production confirmation of POST /invoice on update-needed+missing-bank branch (6 calls vs old 7)
  - Added sandbox verification entry for 2026-03-22
  - Updated bank-missing statistics: 12th update-needed run, 10/12 missing (83%)

- **`./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md`**
  - Added prod-dec75cfd run entry with same details
  - Added sandbox verification entry for 2026-03-22
  - Updated bank-missing statistics in Exact-Match Fast Path section (9/11 → 10/12, 82% → 83%)
  - Updated bank-missing statistics in Avoidable Mistakes section (9/11 → 10/12, 82% → 83%)

No AGENTS.md changes needed — task matching table and disambiguation rules are already correct.

## 7. Commit

- **Hash:** `f63126f6`
- **Message:** `tripletex playbook: set-project-fixed-price-and-invoice-partial-payment — add prod-dec75cfd run entry (French prompt, Rivière SARL / 852968737 / Projet d'automatisation / nathan.martin@example.org / 170650 / 25%, 6 calls 0 errors, amountExcludingVatCurrency=42662.5 / amountCurrencyOutstanding=53328.13); first production confirmation of POST /invoice path on update-needed+missing-bank branch (6 calls vs old 7 with POST /order + PUT /order/:invoice); 12th update-needed run: 10/12 missing bank (83%); sandbox re-verified 2026-03-22: update-needed=5 calls, skip-PUT=3 calls`

## 8. Reusable Heuristics

1. **POST /invoice production-confirmed**: The `POST /invoice?sendToCustomer=false` with embedded `orders[]` is now production-confirmed on the update-needed+missing-bank branch. It saves 1 call vs the old `POST /order` + `PUT /order/:invoice` path on every branch. Always use `POST /invoice` for this task family.

2. **Bank missing rate is 83%**: After 12 update-needed production runs, 10 had missing bank accounts. The proactive hedge (parallel `GET /ledger/account` with `PUT /project` + `GET /ledger/vatType`) remains the clear default. Expected calls: 5.83 + 0 errors (hedge) vs 6.5 + 0.83 errors (optimistic).

3. **French prompt signals**: "Fixez un prix forfaitaire" = update existing project. "Projet d'automatisation" is a reused project name across French prompts (also appeared in Cascade SARL run). The task shape is always update-existing, never create-new.

4. **PM always matches on project read**: In all 12+ update-needed runs where the project existed, the PM was always already correctly linked. The expanded `GET /project?fields=*,customer(*),projectManager(*)` consistently proves the PM without needing a separate `GET /employee`. Keep this as the default assumption, but still check `projectManager.email` equality.

5. **Decimal milestone amounts**: `170650 * 0.25 = 42662.5` was accepted directly. Never round milestone amounts to whole NOK — Tripletex handles decimals correctly.
