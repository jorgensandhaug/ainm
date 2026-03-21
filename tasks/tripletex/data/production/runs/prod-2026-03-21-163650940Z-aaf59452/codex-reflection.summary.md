# Codex Reflection Summary

## Task
Register supplier invoice for `Luna SL` (org nr `966941901`) in Tripletex. Invoice `INV-2026-7337`, date 2026-03-13, due 2026-04-12, description `Programvarelisens`, net 38900, VAT 25% (9725), gross 48625, expense account 6340. PDF also contained supplier address (Fjordveien 86, 3015 Drammen) and bank account (36204404121).

## Reflection

**What went well:**
- Run executed perfectly: 5 API calls, 0 errors, 0 retries
- All PDF data correctly extracted: supplier name, org nr, address, bank account, invoice details, amounts, expense account
- Followed the trusted standard exactly
- Used `values[0]` correctly for importDocument response (avoiding the bug from earlier runs)
- Used explicit `row: 1` and `row: 2` on PUT postings (avoiding the 422 bug from earlier runs)
- Included `postalAddress` and `bankAccountPresentation` in POST /supplier (avoiding the 7/10 score from earlier runs that omitted these)
- No VAT rounding issues (38900 x 1.25 = 48625 exactly)

**What went poorly:**
- Nothing mechanically wrong. The run followed all known best practices.
- However, the `GET /ledger/vatType` call was unnecessary for 25% VAT — `vatType.id=1` is stable and could have been hard-coded.

## Call Efficiency

**Production run used 5 calls. The true minimum is 4 calls for 25% incoming VAT.**

| # | Call | Needed? |
|---|------|---------|
| 1 | `POST /supplier` | Yes — creates supplier with address + bank |
| 2 | `GET /ledger/account?number=6340&isApplicableForSupplierInvoice=true&fields=*` | Yes — account ID varies per instance |
| 3 | `GET /ledger/vatType?typeOfVat=INCOMING&vatDate=2026-03-13&fields=*` | **No** — `vatType.id=1` for 25% incoming is stable |
| 4 | `POST /ledger/voucher/importDocument` | Yes — creates supplierInvoice object |
| 5 | `PUT /ledger/voucher/{id}?sendToLedger=false` | Yes — sets correct postings |

**Wasted call:** Call 3 (`GET /ledger/vatType`). For 25% incoming VAT, `vatType: { id: 1 }` can be hard-coded directly in the PUT postings.

**Optimal 4-call path for next run (25% VAT):**
1. `POST /supplier` (with address + bank from PDF)
2. `GET /ledger/account?number=<N>&isApplicableForSupplierInvoice=true&fields=*`
3. `POST /ledger/voucher/importDocument` (valid EHF XML)
4. `PUT /ledger/voucher/{id}?sendToLedger=false` (with `vatType: { id: 1 }`, `row: 1`/`row: 2`)

## Root Causes

The unnecessary vatType lookup was a legacy from when the trusted standard was written. The standard was conservative: look up the VAT type dynamically every time. But across all production and sandbox instances tested (2026-03-20 through 2026-03-21), `vatType.id=1` has always been the standard 25% incoming VAT type. No evidence of it varying across instances.

The sandbox test also confirmed that `account: { number: 6340 }` does NOT work in PUT postings — Tripletex requires `account.name` when resolving by number, so the `GET /ledger/account` cannot be eliminated.

## Sandbox Verification

Two sandbox tests were run:

**Test 1 — Can we skip GETs?**
- `account: { number: 6340 }` in PUT -> **FAILED** (422: `account.name` cannot be null)
- `vatType: { id: 1 }` hard-coded in PUT -> **PASSED** (correct postings, VAT auto-generated)

**Test 2 — Full 4-call path proof:**
- Supplier `108377138`, voucher `609037638`
- 4 calls, 0 errors
- Final postings: expense row amount=20000, amountGross=25000, vatType.id=1; supplier row -25000; system VAT row 5000
- Correct result, identical to the 5-call path

## Playbook Changes

Updated existing files (no new files created):

1. **`./trusted-standards/register-supplier-invoice.md`**
   - Standard Flow: renamed to "Standard Flow (25% VAT — most common)", removed step 3 (GET vatType), added note for non-25% VAT
   - Minimal-Call Claim: updated from 5 to 4 calls for 25% VAT, added sandbox proof reference
   - Payload Rules: split VAT resolution into 25% (hard-coded) vs non-25% (lookup)
   - Added production run data for `Luna SL` and sandbox proof of 4-call path

2. **`./task-playbooks/register-supplier-invoice.md`**
   - Proven Best Path: updated to 4-call path for 25% VAT
   - Exact Minimal Flow: restructured into 4 sub-sections by supplier-status x VAT-rate
   - VAT Resolution Rules: 25% hard-codes `vatType.id=1`, non-25% still uses lookup
   - Reusable Heuristics: added hard-coded vatType rule and account-by-number limitation

## Commit

```
5e48fbd1 tripletex playbook: supplier invoice 4-call path — skip vatType lookup for 25% incoming VAT
```

Files changed:
- `trusted-standards/register-supplier-invoice.md`
- `task-playbooks/register-supplier-invoice.md`

## Reusable Heuristics

1. **Hard-code `vatType: { id: 1 }` for 25% incoming VAT** — saves 1 API call per supplier invoice registration. Stable across all tested instances.
2. **`account: { number: ... }` does NOT work in PUT postings** — Tripletex requires the full account object (with name) when resolving by number; the GET /ledger/account lookup remains mandatory.
3. **Always extract ALL supplier data from PDF** — address and bank account cost 0 extra calls but are scored. This was already learned from the Fjelltopp AS run and correctly applied here.
4. **Always use `values[0]`** for importDocument response, never `value`. This was already learned and correctly applied.
5. **Always use explicit `row: 1` and `row: 2`** on PUT postings. This was already learned and correctly applied.
6. **The new canonical minimum for fresh-account 25% VAT supplier invoice is 4 calls**, not 5.
