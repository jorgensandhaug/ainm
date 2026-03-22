# Codex Reflection Summary

## Task
Register payment on customer invoice for Estrela Lda (org. nr 808808773), 2336 EUR originally at 11.17 NOK/EUR, now paid at 12.13 NOK/EUR. Book the exchange rate difference (agio) to the correct account.

## Reflection
**What went well:**
- Read the trusted standard (`register-foreign-currency-customer-invoice-payment.md`) before writing any code
- Script correctly handled both EUR and NOK paths with inline fallback
- Correctly detected the invoice as NOK (amount === amountCurrency = 2920)
- Used the exact 5-call NOK fallback flow: invoice lookup → paymentType → simple payment → accountLookup(8060) → manual agio voucher
- Correct agio calculation: 2336 × (12.13 − 11.17) = 2336 × 0.96 = 2242.56 NOK
- Correct posting directions: debit bank (+2242.56), credit 8060 (−2242.56)
- Reused `debitAccount.id` from paymentType for the bank account in the voucher (not hardcoded 1920)
- 0 errors, all API calls succeeded on first attempt

**What went poorly:**
- Nothing. The run was clean and optimal.

**Documentation gap found:**
- The trusted standard's Call 1 recommended `fields=*,currency(*)` but `customer(*)` was also needed for org number matching. The script correctly added it, but this was not documented. Fixed in this reflection.

## Call Efficiency
**The run was minimal-call.** 5 scored calls + 2 free verification GETs = exactly what the trusted standard prescribes for the NOK fallback path.

| Call | Endpoint | Purpose | Result |
|------|----------|---------|--------|
| 1 | `GET /invoice?...fields=*,currency(*),customer(*)` | Locate invoice | Found `2147700242`, NOK, outstanding=2920 |
| 2 | `GET /invoice/paymentType?fields=*,debitAccount(*)` | Resolve payment type | `39894695` ("Betalt til bank", debitAccount 1920) |
| 3 | `PUT /invoice/{id}/:payment?paidAmount=2920` | Register simple payment | amountOutstanding → 0 |
| 4 | `GET /ledger/account?number=8060` | Resolve agio account ID | id=500648324 |
| 5 | `POST /ledger/voucher?sendToLedger=true` | Book manual agio | voucher `609421887` |
| Free | `GET /invoice/{id}?fields=*,...` | Verify payment | amountOutstanding=0, amountCurrencyOutstanding=0 |
| Free | `GET /ledger/voucher/{id}?...` | Verify voucher | 1920: +2242.56, 8060: −2242.56 |

**Wasted calls:** 0
**4xx errors:** 0
**Lower-call path:** None exists for NOK fallback. 5 calls is the proven minimum (8 consecutive production confirmations).

## Root Causes
No failures to analyze. The run matched the trusted standard exactly.

The only improvement identified was a documentation gap: the trusted standard's Call 1 said `fields=*,currency(*)` but `customer(*)` is also required for org number matching. Without it, `customer.organizationNumber` is `undefined`. This was sandbox-verified and the standard has been updated.

## Sandbox Verification
1. **`fields=*,currency(*)` customer expansion test**: Confirmed `customer` returns as `{ id, url }` stub with `organizationNumber: undefined` — `customer(*)` is REQUIRED
2. **`fields=*,currency(*),customer(*)` test**: Confirmed fully expanded customer with `organizationNumber`
3. **Multi-account lookup test**: `GET /ledger/account?number=8060,8160` returns both accounts — could batch agio+disagio lookup in one call, but unnecessary since direction is known at script time
4. **PaymentType test**: No agio-related info in paymentType response — account lookup cannot be skipped

## Playbook Changes
Updated existing trusted standard and playbook (no new files created):

- `./trusted-standards/register-foreign-currency-customer-invoice-payment.md`:
  - Call 1 fields expansion updated from `fields=*,currency(*)` to `fields=*,currency(*),customer(*)`
  - Added mandatory rule explaining `customer(*)` is required for org number matching
  - Added `customer.organizationNumber` as filter step 1 in the local filtering list
  - Added production confirmation for this run (8th consecutive NOK-fallback, 7th agio)
  - Added sandbox proof for `customer(*)` requirement

- `./task-playbooks/register-foreign-currency-customer-invoice-payment.md`:
  - Call 1 fields expansion updated to include `customer(*)`
  - Added `customer(*)` requirement note and customer filter step
  - Added production confirmation for this run

- `./AGENTS.md`:
  - Updated FX payment canonical path to include both EUR (3 calls) and NOK fallback (5 calls)
  - Added `customer(*)` as REQUIRED expansion
  - Updated NOK fallback guidance to point to manual agio/disagio voucher path

## Commit
- Hash: `22a3a1e9`
- Message: `tripletex playbook: foreign-currency payment — add 8th consecutive optimal run (07f71ed1, Estrela Lda/808808773, Portuguese), require customer(*) expansion on GET /invoice`

## Reusable Heuristics
1. **Always use `customer(*)` in GET /invoice fields**: Without it, `customer.organizationNumber` is `undefined`, making customer matching impossible. This applies to both regular and FX payment paths.
2. **NOK fallback is the dominant path**: All 8+ production runs of this task shape hit the NOK fallback (invoice `amount === amountCurrency`). The EUR auto-FX path exists but has never triggered in production for this prompt family.
3. **5 calls is the minimum for NOK fallback**: invoice → paymentType → payment → accountLookup → voucher. No shortcut exists.
4. **Reuse `debitAccount.id` from paymentType**: The bank account for the manual agio voucher should come from the paymentType's `debitAccount.id`, not from a hardcoded 1920 or separate lookup.
5. **Agio direction**: debit bank (+fxAmount), credit 8060 (−fxAmount). Disagio direction: debit 8160 (+fxAmount), credit bank (−fxAmount).
6. **FX amount formula**: `promptEurAmount × |settlementRate − originalRate|`, always positive.
7. **Row numbering**: Always use `row: 1` and `row: 2` in voucher postings. Row 0 is system-reserved and causes 422.
