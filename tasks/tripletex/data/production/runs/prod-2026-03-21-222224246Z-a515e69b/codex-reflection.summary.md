# Codex Reflection Summary

## Task
Register 30 hours for Randi Lunde (randi.lunde@example.org) on activity "Analyse" in project "Sikkerheitsrevisjon" for Dalheim AS (org.nr 950103175), hourly rate 850 kr/t. Create an unsent project invoice based on the registered hours.

## Reflection
**What went well:**
- Correctly identified the task as an exact trusted-standard match for `register-project-hours-and-create-project-invoice.md`
- Read the trusted standard before writing the script (as required)
- Correctly handled the >24h split (30h = 24 + 6) using `POST /timesheet/entry/list` batch
- Correctly identified "Analyse" as non-chargeable and skipped the project-hourly-rate branch
- Used `GET /ledger/vatType` to get the correct 25% VAT type (id=3)
- Final invoice state was correct: `amountExcludingVatCurrency=25500` (30×850), `amountCurrencyOutstanding=31875` (with 25% VAT)

**What went poorly:**
- Used the old `POST /order` + `PUT /order/:invoice` two-call path instead of the single-call `POST /invoice` that the create-from-scratch variant had already proven
- Used the optimistic bank-account approach (no proactive GET), which hit the missing-bank-account error on `PUT /order/:invoice`, triggering the 3-call recovery (failed PUT + GET /ledger/account + PUT /ledger/account + retry PUT)
- This was the 3rd production run to hit missing bank account on this task shape (after Soleil SARL and Fjelltopp AS), showing the optimistic default was a poor bet

## Call Efficiency
**Not minimal.** 10 calls, 1 error. Optimal was 7 calls, 0 errors (or 8 with bank fix, 0 errors).

**Actual calls (10, 1 error):**
1. GET /employee
2. GET /project
3. GET /activity/>forTimeSheet
4. POST /timesheet/entry/list (24h + 6h batch)
5. GET /ledger/vatType
6. POST /order
7. PUT /order/:invoice → **FAILED 422** (missing bank account)
8. GET /ledger/account
9. PUT /ledger/account
10. PUT /order/:invoice (retry, success)

**Optimal path (7-8 calls, 0 errors):**
1. GET /employee
2. GET /project (with customer)
3. GET /activity/>forTimeSheet
4. POST /timesheet/entry/list (24h + 6h batch)
5. GET /ledger/vatType ‖ GET /ledger/account (parallel, 2 calls)
6. (conditional) PUT /ledger/account if bank number missing
7. POST /invoice?sendToCustomer=false

**Wasted calls:**
- POST /order (replaced by embedding orders in POST /invoice)
- PUT /order/:invoice failed attempt (eliminated by proactive bank check)
- PUT /order/:invoice retry (replaced by single POST /invoice)

**Savings:** 3 calls saved on unconfigured accounts (10→7 configured, 10→8 unconfigured), 1 error eliminated.

## Root Causes
1. **Trusted standard specified the old optimistic path.** The standard explicitly said "keep the optimistic branch as canonical" — this was wrong given production evidence showing ~37.5% of accounts lack bank account configuration.
2. **POST /invoice not yet proven for existing entities.** The create-from-scratch variant used `POST /invoice` but the existing-entity flow still used the 2-call `POST /order` + `PUT /order/:invoice`. Nobody had tested whether `POST /invoice` works with existing customer/project IDs.
3. **orders[0].customer was a hidden requirement.** The first sandbox test of `POST /invoice` failed because `customer` was only in the root payload, not inside `orders[0]`. This is a Tripletex-specific pitfall undocumented in the API.

## Sandbox Verification
1. **POST /invoice for existing entities:** Confirmed that `POST /invoice?sendToCustomer=false` with `customer` in both root and `orders[0]`, plus `project` and `orderLines` in `orders[0]`, creates the invoice + order in 1 call. Returns `amountExcludingVatCurrency`, `projectInvoiceDetails`, and `orders[0].id`. Requires explicit `invoiceDueDate`.
2. **End-to-end proactive path:** Confirmed the full 7-call path (GET emp → GET proj → GET act → POST ts/list → GET vat ‖ GET acct → POST invoice) on 30h × 850 on dates 2026-12-01/2026-12-02, returning `amountExcludingVatCurrency=25500` with `projectInvoiceDetails.length=1`, 0 errors.
3. **orders[0].customer pitfall:** Confirmed that omitting `customer` from `orders[0]` returns `422 orders.customer: Kan ikke være null.`

## Playbook Changes
**Updated existing files (no new files created):**
- `./trusted-standards/register-project-hours-and-create-project-invoice.md`:
  - Standard Flow steps 6-8: replaced `POST /order` + `PUT /order/:invoice` with parallel `GET /ledger/vatType` + `GET /ledger/account` → conditional `PUT /ledger/account` → `POST /invoice`
  - Payload Rules: added `POST /invoice` requirements (`orders[0].customer`, `invoiceDueDate`)
  - Reuse From Write Response: replaced POST /order + PUT /order/:invoice with POST /invoice
  - Known Recovery Branches: replaced old optimistic/proactive tradeoff with new proactive-only default
  - Sandbox Status: added 3 new proofs (POST /invoice for existing entities, orders[0].customer pitfall, full 7-call proactive path)
  - Added 9th production confirmation (Dalheim AS / a515e69b)
- `./task-playbooks/register-project-hours-and-create-project-invoice.md`:
  - Minimal Safe Flow: replaced POST /order + PUT /order/:invoice with POST /invoice + proactive bank check
  - Recommended Shapes: replaced order payload with direct invoice payload
  - Exact-Match Fast Path: updated to POST /invoice + proactive bank check
  - Verification Shape: updated from PUT /order/:invoice to POST /invoice
  - Avoidable Mistakes: replaced old bank-check guidance with new proactive default + POST /invoice pitfalls
  - Added production confirmation and sandbox proofs

## Commit
- Hash: `edbe77e4`
- Message: `tripletex playbook: register-project-hours — replace POST /order + PUT /order/:invoice with POST /invoice (saves 1 call), switch to proactive bank check default...`

## Reusable Heuristics
1. **POST /invoice replaces POST /order + PUT /order/:invoice** for all variants of this task shape (existing entities AND create-from-scratch). Saves 1 call. Requires `customer` in both root and `orders[0]`, plus explicit `invoiceDueDate`.
2. **Proactive bank check is strictly better than optimistic** when POST /invoice is used: same 7 calls on configured accounts, 8 vs 10 calls on unconfigured, 0 vs 1 error. The parallel GET /ledger/account adds 0 wall-clock time.
3. **Production bank-account miss rate is ~37.5%** (3/8 runs). With this rate, the proactive approach has better expected call count AND eliminates all 4xx errors.
4. **POST /timesheet/entry/list** is always preferred for >24h tasks over individual POST calls (saves N-1 calls).
5. **"Analyse" activity is consistently non-chargeable** across production runs (Bergvik AS, Waldstein GmbH, Fjelltopp AS, Dalheim AS). Skip the project-hourly-rate branch when activity is non-chargeable.
6. **Never omit GET /ledger/vatType** even on sandbox 0%-only accounts — taxable production accounts have 25% VAT and omitting it creates wrong invoice totals.
