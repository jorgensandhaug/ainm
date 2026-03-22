# Reflection Summary — prod-2026-03-22-114839904Z-d81827fe

## 1. Task
Reverse a registered customer invoice payment for Luz do Sol Lda (org 962812384), invoice "Sessão de formação" (41100 NOK ex-VAT). Portuguese prompt. The payment was returned by the bank — reverse it so the invoice shows the outstanding amount again.

## 2. Reflection
**What went well:**
- Immediately matched the trusted standard (`reverse-customer-invoice-payment.md`)
- Read the trusted standard before writing the script (as required)
- Wrote and executed the script without delay — no wasted time reading AGENTS.md, openapi.json, or playbooks
- Used correct field names (`amountExcludingVatCurrency`) for the local filter
- Fallback matcher correctly handled `type=null` payment posting
- Included a verification GET after the reverse write (good logging practice)
- 1 write + 2 free GETs = optimal execution

**What went poorly:** Nothing. This is the 16th consecutive optimal run for this task shape across 7 languages (en/nb/nn/es/fr/de/pt).

**Mistakes:** None. Zero 4xx errors, zero wasted calls.

## 3. GET Strategy
The run used an appropriate GET strategy:
- **Before write**: 1 decisive `GET /invoice?customerOrgNumber=962812384&...&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))` — returned full invoice data including all postings with voucher expansion, enabling payment voucher identification without additional reads
- **After write**: 1 verification `GET /invoice/2147702146?fields=*,customer(*),orderLines(*),postings(*,voucher(*),account(*))` — confirmed `amountCurrencyOutstanding=51375` (reopened to full invoice amount including 25% VAT)

**Gap identified**: The trusted standard previously said "stop" after the reverse write (step 3) and made the verification GET optional (step 4). This contradicted the AGENTS.md logging rules which mandate GET readbacks after every write. Fixed in this reflection by making the verification GET step 3 (mandatory).

## 4. Root Causes
No errors or issues in this run. The task shape is fully solved and stable:
- 16 consecutive production runs with 0 errors
- Language-independent (confirmed across en/nb/nn/es/fr/de/pt)
- Multi-invoice filtering works correctly when multiple invoices exist for the same customer
- `type=null` fallback matcher handles all observed payment posting shapes
- `account=null` is accepted without extra resolver reads

## 5. Sandbox Verification
No sandbox verification needed for this reflection. The task shape has been exhaustively proven across 16 production runs and 10+ sandbox proofs. No new hypotheses to test.

## 6. Playbook Changes
Updated 3 files:

**`./trusted-standards/reverse-customer-invoice-payment.md`**:
- Made verification GET mandatory (step 3) instead of optional (step 4)
- Removed "stop" directive from step 3
- Updated "Reuse From Read / Write Responses" to remove "only if you plan the optional verification read" qualifier
- Updated "Verification" section to say step 3 is MANDATORY
- Added 16th production confirmation (d81827fe, Portuguese, 962812384/41100/Sessão de formação)

**`./task-playbooks/reverse-customer-invoice-payment.md`**:
- Added 16th production confirmation with full details including verification GET
- Updated "Minimal Flow" step 6 from "Stop" to "Verify (mandatory — GETs are FREE)"
- Updated "Exact-Match Fast Path" to show 1 write + 2 free GETs as the canonical path
- Updated "Verification Shape" to reflect mandatory verification
- Cleaned up "Avoidable Mistakes" (removed redundant "do not spend an automatic final GET" since verification is now mandatory)

**`./AGENTS.md`**:
- Updated reverse-payment gotcha to reflect 16 consecutive optimal runs and mandatory verification GET

## 7. Commit
- Hash: `a91d51cef`
- Message: `tripletex playbook: reverse-customer-invoice-payment — 16th consecutive optimal run (d81827fe, Portuguese prompt, 962812384/Sessão de formação/41100), make verification GET mandatory`

## 8. Reusable Heuristics
1. **Verification GETs are mandatory, not optional.** The AGENTS.md logging rules override any trusted standard that says "stop" or "skip the GET". Every write must be followed by a GET readback.
2. **Trusted standard consistency matters.** When AGENTS.md rules evolve (e.g., adding mandatory logging GETs), trusted standards must be updated to avoid contradictory advice that confuses future agents.
3. **16 consecutive optimal runs = fully stable standard.** At this point, no further sandbox verification is needed for the exact same task shape. Focus reflection time on documentation consistency instead.
4. **The `type=null` fallback matcher is the production default.** In 16 runs, the payment posting has ALWAYS been `type=null`. The `INCOMING_PAYMENT` / `INCOMING_PAYMENT_OPPOSITE` typed posting path has never been exercised in production, but remains as a priority check for safety.
5. **Multi-invoice local filtering works reliably.** The `amountExcludingVatCurrency` filter has correctly isolated target invoices in 4+ production runs where multiple invoices existed for the same customer (count=2 and count=3 cases both confirmed).
