# Codex Reflection: prod-2026-03-22-054216330Z-de228487

## Task
Register supplier invoice from PDF (T20). German prompt: "Lieferantenrechnung erhalten (beigefügte PDF)". Supplier: Nordlicht GmbH / 871162069 / Nygata 53, 9008 Tromsø. Invoice INV-2026-7611, 2026-04-06, due 2026-05-06. Net 35650, VAT 25% 8912, Gross 44562. Account 6300. Bank 28390913577.

## Reflection
**Score: 0% (0/0 checks passed). 0 API calls made. Completion reason: timeout (305s).**

The agent correctly identified this as a T20 exact match, read the PDF, globbed for the trusted standard, and read `register-supplier-invoice-from-pdf.md`. All 4 tool calls completed by timestamp 05:42:34 — less than 20 seconds into the run. Then the agent produced **zero assistant messages** and **zero further tool calls** for the remaining ~280 seconds until timeout. The agent stalled in its thinking phase processing the trusted standard content and never wrote or executed a script.

This is the second consecutive T20 timeout — prod-4c255d98 (Portuguese prompt) had the identical failure pattern: read standard → stall in thinking → timeout → 0 API calls → 0% score.

### What went well
- Correct task identification (T20 from PDF)
- Correct trusted standard matched (`register-supplier-invoice-from-pdf.md`)
- PDF was read and all invoice data could be extracted
- All prerequisite reads completed in <20s — plenty of time for 5 API calls

### What went poorly
- The agent never wrote a single line of code
- Zero assistant messages produced — the model was entirely stuck in thinking
- The entire 300s budget was wasted
- This is a known failure mode already documented in AGENTS.md, yet it still happened

## Call Efficiency
**The run was not minimal-call — it made 0 calls. The optimal path is 5 calls.**

Wasted calls: N/A (no calls made).

Optimal 5-call path:
1. `POST /supplier` — extract supplierId + `ledgerAccount.id` (account 2400)
2. `GET /ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=id,number` — expense account only
3. `POST /ledger/voucher/importDocument` — EHF XML → `.values[0].id` and `.values[0].version`
4. `PUT /ledger/voucher/{id}?sendToLedger=false` — postings with vatType:{id:1}
5. `PUT /ledger/voucher/{id}?sendToLedger=true` — book with voucherType "Leverandørfaktura"

Key optimization discovered: POST /supplier response includes `ledgerAccount: { id: <2400-id> }`, eliminating the need for a separate GET for account 2400. Previous runs that used a separate GET made 6 calls instead of 5.

## Root Causes
1. **Primary: Agent thinking timeout.** The model read the trusted standard (277 lines) and entered a thinking phase from which it never emerged. No script was written, no API calls were made. The 300s budget expired during thinking.
2. **Contributing: No guardrail for thinking timeout.** The agent infrastructure does not interrupt or time-box the model's thinking phase. If the model stalls in reasoning, there is no recovery mechanism.
3. **Contributing: Standard length.** The trusted standard is 277 lines with detailed XML templates, posting rules, and history. The large content volume may contribute to thinking stalls by giving the model too much to process before acting.

## Sandbox Verification
- **5-call E2E verified** in sandbox (2026-03-22):
  - POST /supplier → 201, supplierId=108531831, ledgerAccount.id=424190921
  - GET /ledger/account?number=6300&isApplicableForSupplierInvoice=true → expenseAccountId=424191117
  - POST /ledger/voucher/importDocument → voucherId=609329159, version=1
  - PUT /ledger/voucher/609329159?sendToLedger=false → version=3
  - PUT /ledger/voucher/609329159?sendToLedger=true → booked as number 780
  - **5 calls, 0 errors**
- **Comma-separated account query verified**: `number=6300,2400` returns both accounts in a single GET (alternative fallback)
- **ledgerAccount.id from supplier response verified**: POST /supplier response always includes `ledgerAccount: { id: 424190921 }` which is account 2400

## Playbook Changes
Updated existing files (no new files created):

- **`./trusted-standards/register-supplier-invoice-from-pdf.md`**:
  - Added bold TIMEOUT warning at the top of the file
  - Updated step 1 to explicitly document `ledgerAccount.id` extraction
  - Updated step 2 to clarify it only needs the expense account (not 2400)
  - Updated step 4 to use `step-1-response.value.ledgerAccount.id` for credit account
  - Added TIMEOUT pitfall as first item in Pitfalls section
  - Added "do NOT waste a separate GET for account 2400" pitfall
  - Added note after flow section explaining why no separate GET for 2400 is needed

- **`./task-playbooks/register-supplier-invoice-from-pdf.md`**:
  - Updated proven best path to document ledgerAccount.id extraction from step 1
  - Added TIMEOUT as first critical rule
  - Added "do NOT waste separate GET for account 2400" rule
  - Added prod-de228487 to production run history table

- **`./AGENTS.md`**:
  - Updated supplier invoice disambiguation section to reference both timeout runs (prod-4c255d98 + prod-de228487)
  - Strengthened wording: "IMMEDIATELY write the script and run it. Do not hesitate, do not read any additional files, do not re-process the standard content."

## Commit
- **Hash**: `94eacfef`
- **Message**: `tripletex playbook: register-supplier-invoice-from-pdf — add prod-de228487 run entry (German prompt, Nordlicht GmbH / 871162069 / INV-2026-7611 / 35650+8912=44562 / account 6300 / 25%, 0 calls 0% score, TIMEOUT); second consecutive timeout failure (after prod-4c255d98); root cause: agent read trusted standard then stalled in thinking for 305s without producing any output; key fixes: (1) added bold TIMEOUT warning to top of trusted standard + pitfalls section, (2) documented ledgerAccount.id extraction from POST /supplier response to eliminate separate GET for account 2400 (true 5-call path), (3) updated step 2 to clarify expense-account-only GET, (4) added comma-separated number=XXXX,2400 as fallback technique; sandbox-verified 2026-03-22: 5 calls 0 errors with ledgerAccount.id from supplier response`
- **Files changed**: AGENTS.md, trusted-standards/register-supplier-invoice-from-pdf.md, task-playbooks/register-supplier-invoice-from-pdf.md

## Reusable Heuristics
1. **Thinking timeout is the #1 killer for T20.** Two consecutive runs (4c255d98, de228487) scored 0% with 0 API calls because the agent stalled after reading the trusted standard. The standard's TIMEOUT warning must be the first thing the agent sees.
2. **Extract `ledgerAccount.id` from POST /supplier response.** Every supplier POST response includes `ledgerAccount: { id }` which is always account 2400. This saves 1 API call (5 vs 6). Never make a separate GET for account 2400.
3. **Comma-separated account numbers work.** `GET /ledger/account?number=6300,2400` returns both accounts in a single call. This is a fallback if the supplier response is not used for 2400.
4. **After reading a trusted standard, the very next action must be writing a script.** No additional file reads, no thinking pauses. The information is sufficient; the risk is running out of time.
5. **Long trusted standards (>200 lines) may cause thinking stalls.** Consider whether the standard can be shortened by moving history/proofs to the playbook and keeping only the executable recipe in the trusted standard.
