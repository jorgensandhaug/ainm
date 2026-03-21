# Reflection Summary — prod-2026-03-21-193537525Z-840df81a

## 1. Task

Register payment on a foreign-currency (18687 EUR) customer invoice to Solmar SL (org. nr 877276260), where the exchange rate changed from 10.33 to 10.87 NOK/EUR. Book the FX gain (agio) to the correct account (8060).

Task 27, 8th attempt. Best score before: 1.5 (50%). Best score after: 1.5 (50%).

## 2. Reflection

**What went well:**
- Correctly used `fields=*,currency(*)` on the invoice read — detected NOK invoice
- Script had proper NOK fallback logic — unlike the 67c52406 run (0% score) which had no fallback
- Payment registered successfully, invoice closed (amountOutstanding=0)
- 3 API calls, 0 errors — call-efficient for the approach used
- Read the trusted standard before writing the script (following AGENTS.md instructions)

**What went poorly:**
- Checks 3-4 failed: no agio was booked on account 8060
- The trusted standard at the time explicitly said "Do NOT try to manually book agio/disagio via POST /ledger/voucher — it will corrupt the accounting state and score 0%"
- This guidance was **wrong** — the earlier 0% from manual vouchers was caused by using `row: 0` (system-reserved), not by the concept of manual vouchers itself
- The agent followed the trusted standard correctly but the standard had incorrect advice

**Root mistake:**
The trusted standard's blanket ban on manual agio vouchers was based on a misdiagnosis of the earlier 0% failure. The real cause was `row: 0` in POST /ledger/voucher, which Tripletex universally rejects as "system-generated." Using `row: 1` works fine.

## 3. Call Efficiency

**Was the run minimal-call?** Yes, for the approach used (simple payment only). 3 calls, 0 errors.

**Wasted calls:** None for the approach taken. The problem was a missing step (manual agio voucher), not wasted calls.

**Correct lower-call path for the next agent (NOK invoice variant — 5 calls):**
1. `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=<date+1>&fields=*,currency(*)` — find invoice, detect NOK
2. `GET /invoice/paymentType?fields=*,debitAccount(*)` — find bank payment type
3. `PUT /invoice/{id}/:payment?paymentDate=<date>&paymentTypeId=<id>&paidAmount=<amountOutstanding>` — simple payment
4. `GET /ledger/account?number=1920,8060&fields=id,number` — resolve account IDs for agio voucher
5. `POST /ledger/voucher?sendToLedger=true` — manual agio voucher with `row: 1`+

**For EUR invoice variant — 3 calls (unchanged):**
1. GET /invoice
2. GET /invoice/paymentType
3. PUT /invoice/:payment with paidAmount + paidAmountCurrency → auto-agio

## 4. Root Causes

1. **Misdiagnosed failure:** The earlier 0% run that used manual vouchers was blamed on "corrupting the accounting state." Sandbox investigation proved the actual cause was `row: 0` being system-reserved in Tripletex. ALL accounts (1920, 8060, 7100, 7140, 3000, 4300, 1500, 1900, 8160) reject row 0. Using row 1+ succeeds.

2. **Wrong trusted standard guidance:** The standard said "never manual voucher" when it should have said "use manual voucher with row=1+ for NOK fallback." This locked the agent into a 50% ceiling.

3. **Invoice currency mismatch:** The production account creates the invoice as NOK (amount=23358.75 NOK = 18687 EUR × 1.25) despite the task describing a EUR invoice. The `:payment` endpoint only auto-books FX on genuine foreign-currency invoices.

## 5. Sandbox Verification

All proofs performed on persistent sandbox `kkpqfuj-amager.tripletex.dev`:

| Test | Result |
|------|--------|
| `POST /ledger/voucher` with `row: 0` on 7100/7140 | 422 — "systemgenererte" |
| `POST /ledger/voucher` with `row: 0` on 1920/8060 | 422 — "systemgenererte" |
| `POST /ledger/voucher` with `row: 0` on 3000/4300 | 422 — "systemgenererte" |
| `POST /ledger/voucher?sendToLedger=true` with `row: 1` on 7100/7140 | 201 — voucher 609117555 |
| `POST /ledger/voucher?sendToLedger=true` with `row: 1` on 1920/8060 (agio) | 201 — voucher 609118154 |
| NOK invoice payment + manual agio voucher (full flow) | Invoice closed, 8060 posting verified |
| `GET /ledger/account?number=1920,8060&fields=id,number` | Returns exactly 2 accounts |
| EUR invoice auto-agio (invoice 2147631702, 18687 EUR) | Payment created disagio posting automatically |
| Auto-generated FX posting structure (voucher 339) | acct 8160/1500 pair — different from manual 1920/8060 |

## 6. Playbook Changes

**Updated existing trusted standard:** `./trusted-standards/register-foreign-currency-customer-invoice-payment.md`
- Replaced "Company-Currency Fallback" section: from "never manual voucher, accept 50%" to "5-call NOK fallback with manual agio voucher"
- Added complete NOK Fallback Flow (calls 3-5): simple payment → account lookup → agio voucher
- Documented `row: 0` pitfall as universal Tripletex restriction (not account-specific)
- Added agio amount formula: `promptEurAmount × (settlementRate − originalRate)`
- Updated Canonical Call Count: EUR=3, NOK=5
- Updated Known Recovery Branches: NOK → manual agio instead of simple-payment-only
- Updated script pattern: always book agio, never stop without it
- Updated Production Failure History: corrected root cause of earlier 0% (row 0, not "corruption")
- Added 6 new sandbox proofs

**Updated existing playbook:** `./task-playbooks/register-foreign-currency-customer-invoice-payment.md`
- Replaced Trap 6 (manual voucher ban) with Trap 6 (row=0 pitfall) + Trap 7 (EUR double-entry)
- Updated Company-Currency Fallback: from "simple payment only, max 50%" to manual agio with row=1+
- Updated script pattern with NOK fallback steps (a-d)
- Updated Canonical Call Count: EUR=3, NOK=5
- Updated Payment Rules: manual voucher required for NOK, forbidden for EUR
- Updated Pitfalls: added row=0, account:{number} restrictions

**Updated existing trusted standard:** `./trusted-standards/common-endpoints.md`
- Line 482: split into EUR branch (no manual voucher) and NOK branch (manual voucher with row=1+)

## 7. Commit

Changes were merged into commit `c0045ff0` by a parallel reflection process. All NOK fallback flow, row=1 pitfall, manual agio voucher format, and sandbox proofs are included in HEAD.

Files changed:
- `trusted-standards/register-foreign-currency-customer-invoice-payment.md`
- `trusted-standards/common-endpoints.md`
- `task-playbooks/register-foreign-currency-customer-invoice-payment.md`

## 8. Reusable Heuristics

1. **`row: 0` is universally system-reserved in Tripletex.** Every `POST /ledger/voucher` must use `row: 1` as the first posting row. This is not account-specific — it applies to ALL accounts including regular expense accounts.

2. **`POST /ledger/voucher` requires `sendToLedger=true` query param** to actually post to the ledger, plus `amountGross`/`amountGrossCurrency` (not `amount`) and explicit `vatType: { id: 0 }` for non-VAT entries.

3. **`account: { number: ... }` does NOT work in POST /ledger/voucher.** Must use `account: { id: ... }`. Account IDs must be resolved via `GET /ledger/account?number=<comma-separated>&fields=id,number`.

4. **When a trusted standard says "never do X because it caused 0%," verify the root cause.** The ban on manual vouchers was based on a misdiagnosis. The actual issue was a trivial format error (`row: 0`), not a fundamental API limitation.

5. **NOK invoices with FX prompts need manual agio.** The `:payment` endpoint only auto-books FX on genuine foreign-currency invoices. For NOK invoices, the simple payment closes the invoice, but agio must be booked via a separate `POST /ledger/voucher?sendToLedger=true`.

6. **Auto-generated FX postings use 1500/8060 (or 8160) pairs.** Manual agio vouchers should use 1920/8060 to avoid touching customer balance (1500), since the invoice is already closed.

7. **Agio amount for NOK fallback:** `promptEurAmount × (settlementRate − originalRate)`. Use the prompt's stated EUR amount (typically ex-VAT, matching 0% VAT on export invoices).

8. **The `number` query param on `/ledger/account` accepts comma-separated values** and returns exact matches — much more precise than `numberFrom`/`numberTo` which may return broad ranges.
