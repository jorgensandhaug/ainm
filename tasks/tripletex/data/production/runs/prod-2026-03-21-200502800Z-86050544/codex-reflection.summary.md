# Codex Reflection Summary

## Task
Register payment on a 12301 EUR customer invoice to Bølgekraft AS (org.nr 830993940). Original exchange rate 10.83 NOK/EUR, settlement rate 11.83 NOK/EUR. Register payment and book the currency gain (agio) on the correct account. Nynorsk prompt.

## Reflection
**What went well:**
- Agent correctly read the trusted standard before writing code
- Script contained both EUR and NOK fallback paths inline (lesson from prior 0% runs)
- Correctly detected NOK invoice (`amount === amountCurrency`) and triggered NOK fallback
- Used `fields=*,currency(*)` on invoice GET and `fields=*,debitAccount(*)` on paymentType GET (avoiding Traps 2-4)
- Used `row: 1` and `row: 2` in voucher postings (avoiding Trap 6)
- Correct agio calculation: 12301 × (11.83 − 10.83) = 12301 NOK
- No wasted calls, no errors

**What went poorly:**
- Nothing. The run executed the trusted standard's NOK fallback path exactly as documented.

**Mistakes:**
- None in this run. This is the first successful NOK-fallback production run with manual agio.

## Call Efficiency
**The run was minimal-call.** 5 calls, 0 errors — exactly the documented minimum for the NOK fallback path.

| Call | Endpoint | Purpose |
|------|----------|---------|
| 1 | `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&fields=*,currency(*)` | Locate invoice |
| 2 | `GET /invoice/paymentType?fields=*,debitAccount(*)` | Resolve bank payment type |
| 3 | `PUT /invoice/2147632528/:payment?paymentDate=2026-03-21&paymentTypeId=37104879&paidAmount=15376.25` | Register simple payment |
| 4 | `GET /ledger/account?number=1920,8060&fields=id,number` | Resolve account IDs for voucher |
| 5 | `POST /ledger/voucher?sendToLedger=true` | Book manual agio (12301 NOK on 8060) |

**Wasted calls:** 0

**Can call 4 be eliminated?** No. Sandbox-proven: `POST /ledger/voucher` with `account: { number: 1920 }` → 422 ("account.name: Kan ikke være null"). With `account: { number: 1920, name: "Bankinnskudd" }` → 422 ("Internt felt (account): Feltet må fylles ut"). The `account: { id }` format is the only one that works. `GET /ledger/account` is mandatory.

**Lower-call path for next agent:** 5 calls is the minimum for NOK fallback. For EUR invoices, the path is 3 calls (the `:payment` endpoint auto-books FX gain/loss). No further reduction is possible.

## Root Causes
No failures in this run. Historical root causes for this task shape (documented in trusted standard):
1. **0% runs:** Script without NOK fallback exits on error; agent using `row: 0` in voucher → 422
2. **50% runs:** NOK fallback registers payment but skips manual agio voucher; silent query param ignore causes wrong invoice selection
3. **This run (100%):** All traps avoided by reading and following the trusted standard exactly

## Sandbox Verification
- **`account: { number }` in voucher:** Confirmed fails with 422. Tested both `{ number: 1920 }` (error: "account.name: Kan ikke være null") and `{ number: 1920, name: "Bankinnskudd" }` (error: "Internt felt (account): Feltet må fylles ut"). Only `{ id: <int> }` works. The `GET /ledger/account` call is mandatory in the NOK fallback path.
- **5-call minimum:** No optimization possible. All 5 calls serve non-redundant purposes.

## Playbook Changes
Updated existing files (no new files created):

1. **`./trusted-standards/register-foreign-currency-customer-invoice-payment.md`:**
   - Added Production Confirmation History section with this run (86050544)
   - Fixed "Exact Match" criteria: changed "foreign-currency invoice" to "target invoice (may be EUR or NOK)"
   - Fixed "Do Not Use" section: removed exclusion of NOK invoices (the standard handles both via inline fallback)
   - Added sandbox proof that `account: { number }` and `account: { number, name }` both fail in voucher postings

2. **`./task-playbooks/register-foreign-currency-customer-invoice-payment.md`:**
   - Fixed "Do not use for" section: removed NOK invoice exclusion
   - Added Trap 8: `account: { number }` without ID causes 422
   - Enhanced pitfall summary with `account: { number, name }` failure detail
   - Added Production Confirmations section with this run

## Commit
- Hash: `49fea17b`
- Message: `tripletex playbook: register-foreign-currency-customer-invoice-payment — add 1st NOK-fallback production confirmation (86050544, Nynorsk prompt, Bølgekraft AS / 830993940 / 12301 EUR rate 10.83→11.83, 5 calls 0 errors), fix Do Not Use section to include NOK fallback, add Trap 8 (account:{number} fails in voucher), sandbox-prove GET /ledger/account is mandatory`

## Reusable Heuristics
1. **`account: { id }` is the only working format for voucher postings.** Neither `{ number }` nor `{ number, name }` resolves to a valid account. Always use `GET /ledger/account?number=X,Y&fields=id,number` to resolve IDs first.
2. **NOK fallback adds exactly 2 calls over the EUR path** (account lookup + manual voucher). This is irreducible — the voucher API has no alternative reference format.
3. **The "Do Not Use" section of a trusted standard must stay consistent with its fallback paths.** If the standard handles both EUR and NOK cases, do not exclude NOK invoices from the match criteria.
4. **Agio on NOK invoices = promptEurAmount × (settlementRate − originalRate).** Use the prompt's stated EUR ex-VAT amount, not the NOK outstanding.
5. **First NOK-fallback success confirms the full 5-call path works end-to-end in production.** Prior runs either scored 50% (payment only, no agio) or 0% (no fallback or row:0 error). This run proves: simple payment + account lookup + manual voucher with row:1+ = correct.
