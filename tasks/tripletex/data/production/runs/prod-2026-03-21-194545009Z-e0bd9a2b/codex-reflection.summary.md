# Reflection Summary — prod-2026-03-21-194545009Z-e0bd9a2b

## Run Identity
- **Task shape**: register-foreign-currency-customer-invoice-payment
- **Prompt language**: French
- **Customer**: Océan SARL / 863081793
- **Invoice**: 12,689 EUR ex-VAT, original rate 11.28 NOK/EUR, settlement rate 10.71 NOK/EUR (disagio)
- **Score**: 50% (2/4 checks passed)

## What Happened
The script executed 3 API calls with 0 errors:
1. `GET /invoice?fields=*,currency(*)` — found 1 invoice, 0 foreign-currency candidates
2. `GET /invoice/paymentType?fields=*,debitAccount(*)` — selected bank payment type
3. `PUT /invoice/{id}/:payment` — registered simple payment (full outstanding 15,861.25 NOK)

The invoice was definitively NOK (`amount === amountCurrency = 15,861.25`, which equals 12,689 × 1.25 VAT). A genuine EUR invoice at rate 11.28 would have had `amount ≈ 178,915 NOK`.

**Checks 1-2 passed** (payment registered, correct amount). **Checks 3-4 failed** (no disagio booking on account 8160).

## Root Cause
The script implemented the NOK fallback for payment but **omitted the manual disagio voucher**. The trusted standard already documented the 5-call NOK fallback flow (calls 4-5: GET /ledger/account + POST /ledger/voucher), but the agent's script stopped after call 3.

## Correct Approach (5 calls)
1. `GET /invoice?fields=*,currency(*)` — detect NOK invoice
2. `GET /invoice/paymentType?fields=*,debitAccount(*)` — select bank payment type
3. `PUT /invoice/{id}/:payment` — simple payment (`paidAmount = amountOutstanding`, no FX params)
4. `GET /ledger/account?number=1920,8160&fields=id,number` — resolve account IDs
5. `POST /ledger/voucher?sendToLedger=true` — manual disagio voucher:
   - Row 1: debit 8160 (Valutatap) +7,232.73
   - Row 2: credit 1920 (Bankinnskudd) −7,232.73
   - `vatType: { id: 0 }` on both postings

Disagio amount: `12,689 × |11.28 − 10.71| = 12,689 × 0.57 = 7,232.73 NOK`

## Sandbox Investigations
| Script | Finding |
|--------|---------|
| `sandbox-voucher-with-row.ts` | Manual voucher 8160/1920 with `row: 1`/`row: 2` succeeds (voucher 609122714) |
| `sandbox-test-8160-1500.ts` | Voucher 8160/1500 without `customer.id` → 422 "Kunde mangler" |
| `sandbox-test-1500-with-customer.ts` | Voucher 8160/1500 with `customer: { id }` succeeds (voucher 609127910) |
| `sandbox-find-fx-posting.ts` | Auto-FX voucher structure on EUR invoices: 1920/1500/8160/1500 |

## Documentation Updates
- **Trusted standard**: Added explicit disagio voucher template (Row 1: 8160 +fxAmount, Row 2: 1920 −fxAmount), added 3 sandbox proofs, added production failure entry
- **Playbook**: Updated FX formula to use absolute value, added disagio direction (debit 8160, credit 1920), added production failure entry

## Optimal Call Count
- **EUR invoice**: 3 calls (auto-FX by `:payment`)
- **NOK invoice with manual agio/disagio**: 5 calls
- This run: 3 calls (missing calls 4-5) → 50%

## Cross-Reference
- Run 86050544 scored 100% with the same 5-call NOK fallback (agio case: 12,301 EUR, rate 10.83→11.83)
