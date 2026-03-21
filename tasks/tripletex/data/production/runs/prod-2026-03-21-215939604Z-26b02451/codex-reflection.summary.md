# Codex Reflection Summary

## Task
Reverse a bank-returned payment for Windkraft GmbH (Org.-Nr. 823566441) on invoice "Wartung" (29500 NOK ex-VAT) so the invoice shows the open amount again. German-language prompt.

## Reflection
The run executed flawlessly with zero mistakes:
- Immediately recognized this as an exact match for the `reverse-customer-invoice-payment` trusted standard
- Read the trusted standard before writing any script
- Wrote a single TypeScript script implementing the canonical 2-call path
- The `GET /invoice?customerOrgNumber=823566441...` returned exactly 1 invoice (`count=1`), so no multi-invoice local filtering was needed
- The payment voucher was correctly extracted from postings using the `type=null` + `Betaling:` description fallback matcher
- `PUT /ledger/voucher/608890368/:reverse?date=2026-03-21` succeeded immediately, producing reverse voucher `609174125`
- No verification read was added (correct for score-optimal path)
- No 4xx errors occurred

## Call Efficiency
**The run was minimal-call (2 calls, 0 errors).**

| # | Call | Status | Purpose |
|---|------|--------|---------|
| 1 | `GET /invoice?customerOrgNumber=823566441&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))` | 200 | Locate paid invoice and extract payment voucher ID |
| 2 | `PUT /ledger/voucher/608890368/:reverse?date=2026-03-21` | 200 | Reverse the payment |

**Wasted calls: 0.**
The 2-call path is the theoretical minimum for this task shape (must locate invoice, then reverse payment). No lower-call path exists.

## Root Causes
No errors or inefficiencies to diagnose. The run followed the trusted standard exactly as designed.

## Sandbox Verification
Created a full disposable fixture in the persistent sandbox to re-verify the 2-call path:
- Created customer `108436765`, order `402040369`, invoice `2147642910` (383) with ex-VAT 29500
- Paid with incoming payment type `32813747` (Kontant)
- **Call 1**: `GET /invoice/2147642910?fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))` — found payment posting with `type=null`, `description="Betaling: Faktura nummer 383..."`, `amountCurrency=-29500`, `voucherId=609175821`, `account.number=1500`
- **Call 2**: `PUT /ledger/voucher/609175821/:reverse?date=2026-03-21` — produced reverse voucher `609175824`
- **Verification**: `amountCurrencyOutstanding=29500` (invoice fully reopened)

Sandbox confirms the production path is correct and optimal.

## Playbook Changes
Updated existing files only — no new files created:
- `./trusted-standards/reverse-customer-invoice-payment.md` — added production re-proof bullet for `823566441` + `29500` + `Wartung` (German prompt, 9th overall production confirmation, first `de` prompt confirmation) and sandbox re-proof with disposable invoice `383`
- `./task-playbooks/reverse-customer-invoice-payment.md` — added observed production confirmation for the same German-prompt run

## Commit
- **Hash**: `266e2759`
- **Message**: `tripletex playbook: reverse-customer-invoice-payment — add 9th production confirmation (26b02451, German prompt, Windkraft GmbH / 823566441 / Wartung / 29500 / 2 calls 0 errors), first de-prompt confirmation; canonical 2-call path re-confirmed with single-invoice result and type=null fallback matcher`

## Reusable Heuristics
1. **The canonical 2-call path for payment reversal is fully proven across 9 production runs and 7+ sandbox proofs** — no evidence exists for a lower-call alternative. Languages confirmed: en, es, pt, nb, nn, de, fr.
2. **`customerOrgNumber` is a valid and efficient query parameter on `GET /invoice`** — it narrows the search by customer organization number without needing a separate `GET /customer` call first.
3. **The `type=null` fallback matcher is essential** — payment postings frequently have `type=null` rather than `INCOMING_PAYMENT`; the unique negative `Betaling: ...` description is the reliable discriminator.
4. **`account` can be `null`** — do not require `account.number=1500` in the payment posting matcher.
5. **Use `amountExcludingVatCurrency` for local filtering** — not `amountExVat` or `amountExVatCurrency` (nonexistent fields that silently return `undefined`).
6. **Skip the verification read in scored runs** — the reverse write itself is the scored side effect; the optional proof read costs one call with no score benefit.
7. **German prompts use the same task shape** — `Stornieren Sie die Zahlung` = reverse the payment; `zurückgebucht` = returned/reversed by bank; `offenen Betrag` = open/outstanding amount.
