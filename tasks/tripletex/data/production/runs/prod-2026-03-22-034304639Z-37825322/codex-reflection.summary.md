# Reflection: prod-2026-03-22-034304639Z-37825322

## Task

Spanish prompt: find one overdue customer invoice, register a 35 NOK reminder fee (debit 1500 / credit 3400), create and send a fee invoice, register a partial payment of 5000 NOK on the overdue invoice. Exact match for trusted standard `overdue-invoice-reminder-fee-and-partial-payment`.

## Reflection

**What went well:**
- Agent correctly identified the exact-match trusted standard via glob matching
- Read the trusted standard and playbook before writing any script
- Script was correctly structured for the optimal 6-call path
- All known pitfalls were avoided: explicit `row: 1`/`row: 2` on voucher postings, `orders[].orderLines[]` structure on fee invoice, omitted `vatType` (API defaults to 0%), proper `values`/`value` response parsing
- Agent correctly stopped and reported "blocked" when the proxy token was expired, per run-specific rules

**What went poorly:**
- The proxy token `PO3vtYa5iFb46dzxX6hzBXNSMzUTMZxPpAXWYp2Knb0` was already expired when the run started — 403 on the very first GET
- Scored 0/10 with all 6 checks failed because zero API calls succeeded
- 55 seconds elapsed between task receipt (03:43:05) and first API call attempt (03:44:00), consumed by reading trusted standard + playbook + writing script; this delay is normal for the tool-call latency but contributed nothing since the token was already dead

**What mistakes happened:**
- None on the agent's part. The 0/10 score is entirely due to infrastructure (expired proxy token). The script was correct.

## Call Efficiency

**Was the run minimal-call?** N/A — zero calls succeeded due to expired proxy token.

**Would the script have been minimal-call?** Yes. The script targeted exactly 6 calls:
1. `GET /invoice?...&fields=*,customer(*)` — locate overdue invoice
2. `GET /invoice/paymentType?...&fields=*,debitAccount(*),creditAccount(*)` — resolve payment type
3. `GET /ledger/account?number=1500,3400&fields=*` — resolve account IDs
4. `POST /ledger/voucher` — book manual reminder fee
5. `POST /invoice` — create and send fee invoice
6. `PUT /invoice/{id}/:payment?paymentDate=...&paymentTypeId=...&paidAmount=5000` — partial payment

**Wasted calls:** 0 (no calls executed)

**Can the 6-call path be reduced to 5?**
- Investigated in sandbox on 2026-03-22: invoice postings include account 1500 id (`424190806`) but NOT account 3400. Therefore `GET /ledger/account?number=1500,3400` cannot be eliminated — 3400 is only obtainable from the ledger account endpoint.
- `paymentTypeId` is mandatory on the payment PUT (422 without it), so the paymentType GET cannot be eliminated.
- The 6-call path is the proven floor. No 5-call standalone shortcut exists.

## Root Causes

| Cause | Impact | Mitigation |
|-------|--------|------------|
| Expired proxy token | 0/10 score, zero API calls succeeded | Infrastructure issue outside agent control; agent correctly detected and reported blocked |
| AGENTS.md too large (30872 tokens) | Read tool failed with token limit; agent fell back to glob matching | Not a problem for this run since glob matching worked; but could be an issue for tasks needing AGENTS.md-only guidance |

## Sandbox Verification

Full 6-call end-to-end re-verified on 2026-03-22 in persistent sandbox:
- Setup: created fixture invoice `#529` (`id=2147672215`, customer `108124240`, amount `10000`, due `2026-02-15`)
- Call 1: `GET /invoice` → found 8 overdue invoices, selected fixture → 200
- Call 2: `GET /invoice/paymentType` → payment type `32813747` (debit account 1900) → 200
- Call 3: `GET /ledger/account?number=1500,3400` → 1500=`424190806`, 3400=`424191002` → 200
- Call 4: `POST /ledger/voucher` → voucher `609301160` (number 761) → 201
- Call 5: `POST /invoice` → fee invoice `#530` (`amountCurrency=35`) → 201
- Call 6: `PUT /invoice/{id}/:payment` → remaining outstanding `5000` → 200
- Total: 6 calls, 0 errors

Additional investigation: checked whether invoice response postings contain account 3400 — they do not. Only account 1500 appears in invoice postings. The `GET /ledger/account` call remains mandatory.

## Playbook Changes

Updated existing files (no new files created):
- `trusted-standards/overdue-invoice-reminder-fee-and-partial-payment.md` — added blocked production run note, sandbox re-verification on 2026-03-22, account-skip investigation result
- `task-playbooks/overdue-invoice-reminder-fee-and-partial-payment.md` — added blocked production run note, sandbox re-verification, account-skip investigation result

No AGENTS.md changes needed (task mapping already correct).

## Commit

- Hash: `38df192e`
- Message: `tripletex playbook: overdue-invoice-reminder-fee-and-partial-payment — add 10th production run (prod-2026-03-22-034304639Z-37825322, Spanish prompt, fee 35, BLOCKED by expired proxy token 403, scored 0/10); script was correctly structured for 6-call path; sandbox re-verified 2026-03-22: full 6-call end-to-end 0 errors; investigated account-skip optimization: invoice postings contain 1500 id but NOT 3400 — ledger/account GET cannot be eliminated; 6 calls confirmed as hard floor across 9 clean production runs + 1 blocked run`

## Reusable Heuristics

1. **Expired proxy token = immediate block**: when the proxy returns `403 "Invalid or expired proxy token"`, the run is blocked. Do not retry or guess — report blocked immediately. The agent handled this correctly.
2. **6 calls is the hard floor for this task shape**: 3 mandatory reads (invoice locate, payment type, ledger accounts) + 3 mandatory writes (voucher, fee invoice, payment). No shortcut eliminates any of the reads.
3. **Invoice postings contain account 1500 but not 3400**: even though the overdue invoice's auto-generated postings include the receivables account (1500) with its id, the reminder income account (3400) is never present in invoice postings. The `GET /ledger/account` call cannot be skipped.
4. **AGENTS.md size limit**: at 30872 tokens, AGENTS.md exceeds the 10000-token Read tool limit. Agents must use offset/limit or fall back to glob matching. This didn't cause issues here but could for tasks needing AGENTS.md-only guidance.
5. **Time from task receipt to first API call matters**: 55 seconds is typical for read-standard-write-script-run flow. With already-expired tokens, even faster startup wouldn't help. But for tokens with tight TTLs, minimizing startup time could save a run.
