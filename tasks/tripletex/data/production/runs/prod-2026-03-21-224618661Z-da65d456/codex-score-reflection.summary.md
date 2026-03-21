# Score Reflection: prod-2026-03-21-224618661Z-da65d456

## 1. Task Attribution

- **Prompt**: "El cliente Olivares SL (org. nº 866946108) tiene una factura pendiente de 43300 NOK sin IVA por 'Sesión de formación'. Registre el pago completo de esta factura."
- **Task shape**: register-customer-invoice-payment (Spanish prompt)
- **Attributed task**: T18 (register customer invoice payment) — T2 tier, max score 4
- **Inference status**: `ambiguous` (candidate_count=2)
- **Reason for ambiguity**: 4 tasks (07, 08, 16, 18) received new attempts in the same capture window; the scorer could not uniquely attribute this run's submission. Our run's submission (`571c173b`, queued 22:47:06) was still in "scoring" status at the after-capture time (22:47:35).
- **Concurrent task 18 submission**: `4d83f5f0` (queued 22:45:17, completed 22:46:33) scored `8/8 raw, normalized=4, 3/3 checks passed` — this was a different run that completed before ours.

## 2. Correctness Verdict

- **Likely correctness**: 1.0 (perfect)
- **Evidence**: The run executed the exact trusted standard path: located invoice `2147575475` with `amountOutstanding=54125`, paid with `paymentTypeId=28417664` ("Betalt til bank", debit 1920), and the response confirmed `amountOutstanding=0`. The concurrent task 18 submission scored `3/3 checks passed` on the same task shape, and our execution was identical in structure.
- **Score not directly observed**: Our submission was still scoring at capture time. However, given perfect execution matching 14 prior production confirmations, correctness is virtually certain.
- **Task 18 best_score**: 4/4 (already at T2 ceiling before this run)

## 3. Efficiency Verdict

- **Calls**: 3 (GET /invoice → GET /invoice/paymentType → PUT /invoice/:payment)
- **Errors**: 0
- **Verdict**: Minimal-call. This matches the proven canonical 3-call floor for standalone invoice payment with no cached same-run paymentTypeId.
- **No wasted calls**: Every call was necessary. No 2-call standalone shortcut exists (exhaustively proven across 15+ sandbox and production verifications).
- **Estimated normalized score**: 4/4 — the concurrent task 18 run also scored 4/4 with an identical call pattern.

## 4. Likely Root Cause

No issues. This run was a clean, optimal execution of the trusted standard. The only artifact-level limitation is the `ambiguous` inference status, which is a scoring pipeline timing issue (multiple concurrent submissions), not a run quality issue.

## 5. What Went Right

1. **Trusted standard followed exactly**: Read the standard first, then wrote and executed a single script with no iteration.
2. **Correct field expansions**: Used `fields=*,customer(*),orderLines(*),orders(*,orderLines(*))` on GET /invoice and `fields=*,debitAccount(*),creditAccount(*)` on GET /invoice/paymentType — avoided the common pitfall of using `fields=*` alone.
3. **Query params on PUT**: All payment parameters sent as query params, not JSON body — avoided the common 422 pitfall.
4. **Live outstanding amount used**: Paid `54125` (the invoice's `amountOutstanding`) rather than the prompt's ex-VAT `43300` — correctly handles 25% VAT inclusion.
5. **Date params included**: Both `invoiceDateFrom` and `invoiceDateTo` provided — avoided the 422 for missing date params.
6. **Spanish prompt handled correctly**: Description matching used `formación` and `sesión` to identify the correct invoice regardless of prompt language.
7. **Zero retries**: Script ran once with no errors, no retries, no fallback logic needed.

## 6. What To Change Next Time

**Nothing to change** — this run is the reference execution for this task shape. For future runs:

1. Continue following the trusted standard at `./trusted-standards/register-customer-invoice-payment.md` for all exact-match invoice payment tasks.
2. If a same-run earlier step already resolved a `paymentTypeId`, reuse it to achieve the 2-call path.
3. Do not attempt to embed `paymentType(*)` in the invoice GET — it returns 400.
4. Do not attempt `/ledger/paymentType` — it returns 404.
5. The 3-call floor is proven optimal for standalone payment tasks across 15 production confirmations in 7 languages (nb, en, es, pt, fr, de, nn).
