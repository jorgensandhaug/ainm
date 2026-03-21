# Codex Reflection — prod-2026-03-21-203449125Z-847457b2

## 1. Task

Register payment on a 2716 EUR invoice to Fossekraft AS (org.nr 928230651) at original rate 10.11 NOK/EUR. Customer paid at settlement rate 9.33 NOK/EUR. Book the currency loss (disagio) on the correct account. Nynorsk prompt.

## 2. Reflection

**What went well:**
- Agent read the trusted standard before writing any code — avoided all documented traps.
- Script included both EUR and NOK fallback paths inline — no timeout or second-script issues.
- Correctly identified the invoice as NOK (`amount === amountCurrency`) and used the 5-call NOK fallback.
- Correctly determined disagio (settlement 9.33 < original 10.11) and used account 8160.
- Disagio amount correctly calculated: 2716 x 0.78 = 2118.48 NOK.
- Voucher postings used `row: 1` and `row: 2` — no row-0 error.
- Reused `debitAccount.id` from paymentType instead of hardcoding 1920.
- 5 calls, 0 errors — clean execution.

**What went poorly:**
- Nothing. This was a textbook execution of the trusted standard.

**Why it worked:**
- The trusted standard now has comprehensive coverage of both agio and disagio paths, including the NOK fallback with manual voucher. All traps (silent query param ignore, missing currency expansion, row-0 restriction, account number rejection) are documented and were followed.

## 3. Call Efficiency

**Was the run minimal-call?** Yes — 5 calls is the proven minimum for the NOK fallback path.

**Call breakdown:**
1. `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&fields=*,currency(*)` — locate invoice
2. `GET /invoice/paymentType?fields=*,debitAccount(*)` — resolve bank payment type
3. `PUT /invoice/2147635477/:payment?paymentDate=2026-03-21&paymentTypeId=37201899&paidAmount=3395` — register simple payment
4. `GET /ledger/account?number=8160&fields=id,number` — resolve disagio account ID
5. `POST /ledger/voucher?sendToLedger=true` — book disagio (debit 8160 +2118.48, credit 1920 -2118.48)

**Wasted calls:** None.

**Can the count be reduced?**
No. Sandbox re-verified:
- `account: { number: 8160 }` -> 422 (name required)
- `account: { number: 8160, name: "Valutatap (disagio)" }` -> 422 (internal field missing)
- Payment response only returns posting stubs (`{ id, url }`) — no expanded account IDs to extract
- All 5 calls are irreducible for this path

**Lower-call path for next agent:** Same 5-call path. No improvement possible.

## 4. Root Causes

No errors or failures in this run. The run succeeded because:
- The trusted standard was comprehensive (built from 6 prior production runs including 3 failures).
- The script correctly implemented both EUR and NOK paths.
- Disagio direction (debit 8160, credit bank) was correctly documented and followed.

## 5. Sandbox Verification

Two sandbox tests performed:
1. **account number test**: Confirmed `account: { number: 8160 }` and `account: { number: 8160, name: "Valutatap (disagio)" }` both still fail with 422. `GET /ledger/account` cannot be eliminated.
2. **Payment response inspection**: `PUT /invoice/:payment` response contains `postings` as `[{ id, url }]` stubs and `voucher` as `{ id, url }` stub — no expanded account IDs available to skip the lookup. Confirmed 5-call minimum.

## 6. Playbook Changes

**Updated (not created):**
- `./trusted-standards/register-foreign-currency-customer-invoice-payment.md` — added production confirmation for 847457b2 as 1st full-score disagio run, confirming debit 8160 / credit bank direction
- `./task-playbooks/register-foreign-currency-customer-invoice-payment.md` — added production confirmation entry

No structural changes needed — the standard and playbook already had correct disagio documentation. This run validates the disagio path that was previously only sandbox-proven and had a 50% production failure (e0bd9a2b, which omitted the manual voucher).

## 7. Commit

```
3883d61b tripletex playbook: register-foreign-currency-customer-invoice-payment — add 1st disagio production confirmation (847457b2, Nynorsk prompt, Fossekraft AS / 928230651 / 2716 EUR rate 10.11->9.33, 5 calls 0 errors), confirms NOK-fallback disagio path: debit 8160 (+2118.48), credit bank (-2118.48), voucher 609139929; 3rd full-score NOK-fallback run overall, sandbox re-verified account:{number} still 422 and payment response lacks expanded account IDs confirming 5-call minimum
```

Files changed:
- `trusted-standards/register-foreign-currency-customer-invoice-payment.md`
- `task-playbooks/register-foreign-currency-customer-invoice-payment.md`

## 8. Reusable Heuristics

1. **Disagio direction is now production-proven**: debit 8160 (+fxAmount), credit bank (-fxAmount). Previously only sandbox-proven; the earlier production disagio attempt (e0bd9a2b) scored 50% because it omitted the manual voucher entirely.

2. **5 calls is the hard minimum for NOK fallback**: `account: { number }` does not work in voucher body, payment response does not expose account IDs, and paymentType/invoice are separate endpoints. No creative combination can reduce below 5.

3. **Both agio and disagio NOK-fallback paths are now production-confirmed at full score**: agio (86050544, 3386d6a5) on 8060 and disagio (847457b2) on 8160. The standard covers all four combinations (EUR agio, EUR disagio, NOK agio, NOK disagio).

4. **The EUR path (3 calls) has NOT been exercised in production** — every production run so far has been NOK fallback. If a genuine EUR invoice appears, the `:payment` endpoint auto-books FX, needing only 3 calls with no manual voucher.

5. **Prompt-level rate comparison determines agio vs disagio before any API call**: settlement < original -> disagio (8160), settlement > original -> agio (8060). This is deterministic from the prompt and should drive the `GET /ledger/account` call parameter.
