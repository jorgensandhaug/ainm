# Reflection Summary — prod-2026-03-21-205937817Z-bc688ea1

## Task

Reconcile bank statement (CSV) with open invoices in Tripletex. Spanish prompt: "Concilia el extracto bancario (CSV adjunto) con las facturas abiertas en Tripletex." CSV had 11 lines: 5 incoming customer payments (Sánchez SL ×2, Pérez SL ×1, Romero SL ×2), 3 outgoing supplier payments (González SL ×1, Rodríguez SL ×2), 1 Bankgebyr (-1083.95), 1 Skattetrekk Inn (+1269.93), 1 Skattetrekk Ut (-600.07). Task 23, attempt 7.

## Reflection

**What went poorly**: The agent scored 0/1 because it **timed out** (`completion_reason: "timeout"`) without executing a single API call. No scripts directory was created, meaning no TypeScript was ever written. The agent consumed the entire 300s budget reading documentation files (AGENTS.md, trusted standard, openapi.json, playbooks) without progressing to execution.

**What should have happened**: The agent should have:
1. Read the CSV attachment (~2s)
2. Recognized the exact trusted standard match (`reconcile-bank-statement-open-invoices.md`)
3. Read that one trusted standard file (~3s)
4. Written one comprehensive TypeScript script (~10s)
5. Executed it with `bun` (~15s)
6. Total: ~30s, well within the 300s budget

**Root cause**: This is the second timeout failure for this exact task shape (the earlier English run also timed out debugging supplier scripts). The agent prioritized documentation reading over execution, violating the AGENTS.md rule: "After reading the matched standard, immediately write and execute the script."

## Call Efficiency

The run used **0 API calls** — it timed out before executing any. This is the worst possible outcome.

**Optimal path (11 calls)**:
1. 5 parallel reads: `/invoice`, `/invoice/paymentType`, `/supplier`, `/supplierInvoice`, `/ledger/account` (accounts 1920,2400,2600,7770,8050)
2. 5 sequential `PUT /invoice/{id}/:payment` for customer invoice payments
3. 1 `POST /ledger/voucher` combining all supplier payments + non-invoice lines (12 postings: 3 supplier ×2 + 1 Bankgebyr ×2 + 1 Skattetrekk In ×2 + 1 Skattetrekk Out ×2)

**Total optimal: 11 calls, 0 wasted**. This matches the proven floor from English run 4, Nynorsk run 2, and Portuguese run.

## Root Causes

1. **Timeout from documentation over-reading**: The agent spent 300s reading files instead of writing and executing the script. The trusted standard contains all needed information; no additional spec reading was required.
2. **Missing Skattetrekk Inn (+) in trusted standard**: The non-invoice line type table only listed Skattetrekk as outgoing (Ut -). This CSV had an incoming Skattetrekk (+1269.93), which was not explicitly documented — though the general posting pattern (debit 1920, credit 2600) is straightforward to derive.

## Sandbox Verification

Full reconciliation flow verified in sandbox (voucher #426, id 609153461):
- Created 3 customers, 2 suppliers, 1 product, 5 invoices via orders
- Ran the exact trusted standard flow: 5 parallel reads → 5 customer payments → 1 combined voucher
- All 5 customer payments registered correctly (outstanding → 0)
- Combined voucher had 12 postings:
  - Rows 1-2: González SL supplier payment (2400 debit 10150, 1920 credit -10150)
  - Rows 3-4: Rodríguez SL supplier payment (2400 debit 5800, 1920 credit -5800)
  - Rows 5-6: Rodríguez SL supplier payment (2400 debit 18400, 1920 credit -18400)
  - Rows 7-8: Bankgebyr (7770 debit 1083.95, 1920 credit -1083.95)
  - Rows 9-10: Skattetrekk Inn (1920 debit 1269.93, 2600 credit -1269.93)
  - Rows 11-12: Skattetrekk Ut (2600 debit 600.07, 1920 credit -600.07)
- All postings verified via `GET /ledger/voucher/{id}?fields=*,postings(*)`

## Playbook Changes

Updated existing files (no new files created):

1. **`./trusted-standards/reconcile-bank-statement-open-invoices.md`**:
   - Added Skattetrekk refund (Inn +) row to non-invoice line type table
   - Added Skattetrekk Inn example to posting code block
   - Added Spanish run (bc688ea1) timeout failure to production results
   - Added TIMEOUT RISK as first critical pitfall
   - Updated sandbox verification note with voucher #426

2. **`./task-playbooks/reconcile-bank-statement-open-invoices.md`**:
   - Added Skattetrekk refund (Inn +) row to non-invoice line type table
   - Added Spanish run timeout failure to production results section
   - Strengthened Critical Timing Rule with two-timeout evidence and explicit "15s execution, 285s wasted" framing
   - Updated sandbox verification note

## Commit

- **Hash**: `aafca3de`
- **Message**: `tripletex playbook: reconcile-bank-statement — add 8th production result (bc688ea1, Spanish prompt, TIMED OUT 0/1 — agent spent 300s reading docs, 0 API calls), add Skattetrekk Inn (+) refund row to non-invoice line type tables in both trusted standard and playbook, add TIMEOUT RISK pitfall warning, strengthen Critical Timing Rule with two-timeout evidence, sandbox-verify voucher #426 with Bankgebyr + Skattetrekk Inn/Ut (12 postings)`
- **Files changed**: `trusted-standards/reconcile-bank-statement-open-invoices.md`, `task-playbooks/reconcile-bank-statement-open-invoices.md`

## Reusable Heuristics

1. **Timeout kills score entirely**: A 0-call timeout scores worse than a partially-correct 11-call execution. The agent MUST prioritize execution speed over documentation thoroughness for exact trusted-standard matches.
2. **One trusted standard is sufficient**: For this task shape, reading `reconcile-bank-statement-open-invoices.md` alone provides everything needed. Do NOT also read AGENTS.md, openapi.json, or the playbook — that's 3 extra file reads that consume ~60-120s of the 300s budget.
3. **Skattetrekk can appear in both directions**: Inn (+) is a tax refund (debit 1920, credit 2600); Ut (-) is a tax withholding (debit 2600, credit 1920). Both use account 2600 "Forskuddstrekk".
4. **Non-invoice lines are the scoring bottleneck**: 6/7 previous production attempts scored 0.6 because Check 1 (non-invoice bookings) failed. The combined voucher MUST include Bankgebyr, Skattetrekk, and Renteinntekter postings alongside supplier payments.
5. **11 calls is the proven optimal floor**: 5 parallel reads + N customer payments + 1 combined voucher. No further reduction is possible without sacrificing correctness.
6. **Prompts vary by language; CSV is always Norwegian**: Column headers are always `Dato;Forklaring;Inn;Ut;Saldo` regardless of prompt language (Spanish, Portuguese, French, German, English, Nynorsk).
