# Codex Reflection Summary

## 1. Task

Register supplier invoice for Lumière SARL (org 904564184), invoice INV-2026-5683, 75500 NOK gross, account 7140 (services de bureau), 25% VAT. French-language prompt.

## 2. Reflection

**What went well:**
- Read the trusted standard before writing any script (as mandated by AGENTS.md)
- Used the correct direct `POST /ledger/voucher` path (not importDocument)
- Hard-coded `vatType: { id: 1 }` for 25% VAT (skipping GET /ledger/vatType)
- Zero 4xx errors
- Correct postings: debit 60400 on 7140 with vatType 1, credit -75500 on supplier 2400, system VAT 15100 on row 0
- Voucher auto-booked as number 1
- Description "services de bureau" preserved exactly from prompt

**What went poorly:**
- Used 4 API calls when 3 would have sufficed — the `GET /ledger/voucherType?name=Leverandørfaktura` call was unnecessary because `POST /ledger/voucher` accepts `voucherType: { name: "Leverandørfaktura" }` directly

**No mistakes** in correctness — all postings, amounts, descriptions, and supplier data were correct. The only issue was 1 wasted API call.

## 3. Call Efficiency

**Run was NOT minimal-call.** Used 4 calls; optimal is 3.

| # | Call | Needed? |
|---|------|---------|
| 1 | `POST /supplier` | Yes — creates supplier, returns supplier.id + ledgerAccount.id |
| 2 | `GET /ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=*` | Yes — account id required (number-only fails with 422) |
| 3 | `GET /ledger/voucherType?name=Leverandørfaktura&fields=*` | **NO — WASTED** |
| 4 | `POST /ledger/voucher` | Yes — creates and auto-books voucher |

**Wasted call:** `GET /ledger/voucherType` — `POST /ledger/voucher` accepts `voucherType: { name: "Leverandørfaktura" }` directly without needing the id first.

**Optimal 3-call path for next agent:**
1. `POST /supplier` → get `supplier.id` + `supplier.ledgerAccount.id`
2. `GET /ledger/account?number=<N>&isApplicableForSupplierInvoice=true&fields=*` → get expense account id
3. `POST /ledger/voucher` with `voucherType: { name: "Leverandørfaktura" }`, hard-coded `vatType: { id: 1 }` for 25%

## 4. Root Causes

The trusted standard previously documented a 4-call path with `GET /ledger/voucherType` as step 3. The agent correctly followed the documented standard. The root cause of the extra call was the standard itself — it hadn't been tested whether `voucherType: { name }` works (it does, as confirmed by sandbox testing during this reflection).

The voucherType name-based resolution was already documented as working for `Lønnsbilag` (payroll) vouchers since 2026-03-21 but wasn't applied to `Leverandørfaktura` supplier invoices until now.

## 5. Sandbox Verification

Sandbox tests performed (2026-03-22):

1. **`account: { number: 7140 }` in postings** → 422 "Kan ikke være null" for account.name — **FAILS**
2. **`account: { number: 7140, name: "correct name" }` in postings** → 422 "Feltet må fylles ut" for account — **FAILS**
3. **`voucherType: { name: "Leverandørfaktura" }` in POST /ledger/voucher** → 201, voucher 609264034 auto-booked as number 720 — **WORKS**
4. **Full 3-call path end-to-end** (POST supplier → GET account → POST voucher with voucherType by name) → 201, voucher 609264396 auto-booked as number 721, description "services de bureau" preserved, 3 correct postings — **WORKS**

Conclusions:
- `GET /ledger/account` remains mandatory — there is no way to skip it (account id required)
- `GET /ledger/voucherType` is unnecessary — skip it and use name-based resolution
- The voucherType id varies across instances (sandbox: 9744845, production: 10826337) but the name "Leverandørfaktura" is stable

## 6. Playbook Changes

Updated 4 existing files (no new files created):

| File | Change |
|------|--------|
| `trusted-standards/register-supplier-invoice.md` | Reduced Standard Flow from 4 to 3 calls; added VoucherType by Name section; updated Minimal-Call Claim from 4→3 (25% VAT) and 5→4 (non-25%); updated Payload Rules to use name not id; updated OpenAPI/Sandbox Status with 3-call proof |
| `task-playbooks/register-supplier-invoice.md` | Reduced Proven Best Path from 4 to 3 calls; updated voucher payload shape to use name; added voucherType pitfall; updated importDocument call count comparison |
| `trusted-standards/common-endpoints.md` | Added Leverandørfaktura to voucherType name-based resolution rule; generalized pattern for all standard voucher types; updated supplier-invoice note to skip GET lookup |
| `AGENTS.md` | Updated supplier-invoice canonical path from 4→3 calls; updated voucherType endpoint note; updated supplier-invoice task note |

## 7. Commit

```
8d610d8c tripletex playbook: register-supplier-invoice — reduce canonical path from 4 calls to 3 by skipping GET /ledger/voucherType; POST /ledger/voucher accepts voucherType: { name: "Leverandørfaktura" } directly (sandbox-verified 2026-03-22, voucher 609264396 auto-booked as number 721); also confirmed account: { number: N } does NOT work in postings (422) so GET /ledger/account remains mandatory; production run c290243c (French prompt, Lumière SARL / 904564184 / INV-2026-5683 / 75500 / 7140 / 25%) used 4 calls 0 errors — next run should use 3; update trusted-standard, playbook, common-endpoints, and AGENTS.md
```

## 8. Reusable Heuristics

1. **`POST /ledger/voucher` accepts `voucherType: { name: "..." }` for ANY standard voucher type** — never spend a call on `GET /ledger/voucherType` when you know the canonical name. Confirmed for both `Lønnsbilag` and `Leverandørfaktura`.

2. **Account id is ALWAYS required in postings** — `account: { number: N }` and `account: { number: N, name: "..." }` both fail with 422. `GET /ledger/account` cannot be skipped.

3. **VoucherType id varies across instances but the name does not** — sandbox id=9744845, production id=10826337 for the same "Leverandørfaktura" type. Name-based resolution is actually MORE portable than id-based.

4. **When an optimization is proven for one voucher type, test it for others** — the voucherType name-based resolution was known to work for Lønnsbilag since 2026-03-21 but wasn't applied to Leverandørfaktura until this reflection exposed the wasted call.

5. **For 25% VAT supplier invoices on fresh accounts, the absolute minimum is 3 calls**: POST supplier + GET account + POST voucher. No call can be eliminated further.
