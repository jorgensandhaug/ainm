# Codex Reflection: prod-2026-03-21-201703889Z-3386d6a5

## 1. Task

Register payment on a 10781 EUR invoice to Elvdal AS (org.nr 964825114) at original rate 11.03 NOK/EUR, with customer paying at 11.41 NOK/EUR (agio/gain). Book the FX difference on the correct account (8060). Nynorsk prompt.

## 2. Reflection

**What went well:**
- Correctly identified this as an exact match for the `register-foreign-currency-customer-invoice-payment` trusted standard
- Read the trusted standard before writing any code
- Script correctly handled both EUR and NOK paths with inline fallback
- Used `fields=*,currency(*)` on invoice lookup (avoided Trap 2)
- Used `fields=*,debitAccount(*)` on paymentType lookup (avoided Trap 3)
- Filtered by `debitAccount.isBankAccount` not top-level fields (avoided Trap 4)
- Detected NOK invoice (`amount === amountCurrency`) and used manual agio path (avoided Trap 5)
- Used `row: 1` and `row: 2` in voucher (avoided Trap 6)
- Did NOT create manual voucher for EUR path (avoided Trap 7)
- Used `account: { id }` from ledger lookup (avoided Trap 8)
- 5 calls, 0 errors, correct agio amount (4096.78 NOK on 8060)

**What went poorly:**
- Nothing. This was a clean, optimal run.

**Mistakes:**
- None. All 8 documented API traps were correctly avoided.

## 3. Call Efficiency

**Verdict: Minimal-call run (5 calls, 0 errors)**

The 5-call count is the proven minimum for the NOK fallback path:

| # | Call | Purpose |
|---|------|---------|
| 1 | `GET /invoice?invoiceDateFrom=...&invoiceDateTo=...&fields=*,currency(*)` | Find the invoice |
| 2 | `GET /invoice/paymentType?fields=*,debitAccount(*)` | Resolve bank payment type |
| 3 | `PUT /invoice/{id}/:payment` | Register simple payment (amountOutstanding → 0) |
| 4 | `GET /ledger/account?number=1920,8060&fields=id,number` | Resolve account IDs for voucher |
| 5 | `POST /ledger/voucher?sendToLedger=true` | Book agio on 8060 |

**Wasted calls:** Zero.

**Lower-call path for next agent:** The run used `GET /ledger/account?number=1920,8060` for Call 4, but sandbox verification proved that `debitAccount.id` from Call 2's paymentType response can be reused as the bank account in the voucher. This reduces Call 4 to `GET /ledger/account?number=8060` (or `8160` for disagio) — same call count but cleaner because it uses the actual bank account from the payment type rather than hardcoding 1920.

## 4. Root Causes

No failures in this run. For reference, this task shape has caused failures in prior runs due to:
- Not implementing the manual voucher in the NOK fallback path (50% in e0bd9a2b)
- Not having a NOK fallback at all (0% in 67c52406)
- Using `row: 0` in voucher postings (0% in earlier run)
- Silent query param ignores and missing field expansions (50% in earlier runs)

All of these are now documented as Traps 1-8 in the playbook and avoided by the trusted standard.

## 5. Sandbox Verification

Three sandbox tests were run:

1. **`account: { number: 1920 }` in voucher → 422** — re-confirmed that account IDs are required, cannot skip the ledger account lookup
2. **PaymentType `debitAccount.id` reuse in voucher → 201** — proved that the bank account ID from `GET /invoice/paymentType` can be reused in `POST /ledger/voucher` postings (vouchers 609133621, 609134241)
3. **Disagio with paymentType `debitAccount.id` → 201** — proved the same optimization works for disagio (voucher 609134244)

**Key finding:** The `GET /ledger/account` call in the NOK fallback only needs to resolve the agio/disagio account (8060 or 8160), not the bank account (1920). The bank account ID is already available from the paymentType's `debitAccount.id`.

## 6. Playbook Changes

Updated existing files (no new files created):

- **`./trusted-standards/register-foreign-currency-customer-invoice-payment.md`**:
  - Added production confirmation for run 3386d6a5 (2nd NOK-fallback agio)
  - Updated Call 4 to `GET /ledger/account?number=8060` instead of `number=1920,8060`
  - Updated voucher template to use `<paymentTypeBankAcctId>` instead of `<bankAcctId>`
  - Updated agio/disagio direction sections to reference paymentType debitAccount
  - Added sandbox proof for debitAccount.id reuse (vouchers 609133621, 609134241, 609134244)

- **`./task-playbooks/register-foreign-currency-customer-invoice-payment.md`**:
  - Added production confirmation for run 3386d6a5
  - Updated Trap 8 fix to reference paymentType debitAccount reuse
  - Updated script pattern and Company-Currency Fallback section
  - Added pitfall note about bank account reuse

## 7. Commit

- **Hash:** `f14f2926`
- **Message:** `tripletex playbook: register-foreign-currency-customer-invoice-payment — add 2nd NOK-fallback agio production confirmation (3386d6a5, Nynorsk prompt, Elvdal AS / 964825114 / 10781 EUR rate 11.03→11.41, 5 calls 0 errors), document paymentType debitAccount.id reuse optimization (sandbox-proven vouchers 609133621/609134241/609134244: bank account from paymentType can replace hardcoded 1920 in manual agio/disagio vouchers, GET /ledger/account only needs 8060 or 8160)`

## 8. Reusable Heuristics

1. **PaymentType bank account reuse:** The `debitAccount.id` from `GET /invoice/paymentType?fields=*,debitAccount(*)` can be reused directly in `POST /ledger/voucher` postings. No need to separately look up account 1920 via `GET /ledger/account`.

2. **NOK fallback is the common case:** In all production runs of this task shape so far, the invoice has been in NOK (company currency), not EUR. The script must always include the NOK fallback path with manual agio voucher.

3. **5 calls is the floor for NOK fallback:** Cannot be reduced further because:
   - Call 1 (invoice lookup) is required to find the invoice
   - Call 2 (paymentType) is required to get the bank payment type ID
   - Call 3 (payment) is required to register the payment
   - Call 4 (ledger account) is required to get the agio/disagio account ID (cannot use `account: { number }` in vouchers)
   - Call 5 (voucher) is required to book the FX difference manually

4. **Agio vs disagio direction matters:** Settlement rate > original rate = agio (gain) → debit bank, credit 8060. Settlement rate < original rate = disagio (loss) → debit 8160, credit bank.

5. **The prompt's EUR amount is ex-VAT:** Match against `amountExcludingVat` (NOK) or `amountExcludingVatCurrency` (EUR). The full outstanding = prompt amount × 1.25.
