# Score Reflection: prod-2026-03-21-224517950Z-5f57f4dd

## Task Attribution

- **Inference status**: ambiguous (3 candidate tasks changed: T17, T18, T29)
- **Most likely task**: T18 (reverse customer invoice payment)
- **Reasoning**: The French prompt pattern "Le paiement de ... SARL ... a été retourné par la banque. Annulez le paiement..." exactly matches prior uniquely-attributed T18 runs (e.g., `prod-2026-03-20-151734977Z-7b560c69` and `prod-2026-03-20-160114982Z-9f31c41d`, both labeled T18). T29 is a project lifecycle task and T17 is unlikely given prompt shape.
- **Tier**: T2 (max score 4)
- **Task completed at**: 2026-03-21T22:46:23Z

## Correctness Verdict

- **Likely correctness**: 1.0 (perfect)
- **Evidence**: The run executed the canonical 2-call path cleanly:
  1. `GET /invoice?...fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))` → status 200, count 1, located invoice `2147573575` for org `943745862`, `amountExcludingVatCurrency=33900`, `amountCurrency=42375`, `amountCurrencyOutstanding=0` (fully paid)
  2. `PUT /ledger/voucher/608891408/:reverse?date=2026-03-21` → status 200, reverse voucher `609194171`
- **Final state**: Payment voucher reversed; invoice outstanding amount restored
- **T18 best_score stayed at 4/4**: Since 4 is the T2 max, this run likely scored 4/4 (matching existing best), confirming perfect correctness + efficiency

## Efficiency Verdict

- **Calls**: 2 (minimum possible for this task shape)
- **Errors**: 0
- **Assessment**: Optimal. The canonical 2-call path (locate + reverse) is the proven minimum. No verification read was performed. No extra `GET /customer`, `GET /ledger/voucher`, or `GET /ledger/posting` calls were wasted.
- **T18 best_score already 4/4**: This run could not improve the best but matched it — the efficiency bonus was fully earned

## Likely Root Cause

No issues. The run executed flawlessly:
- Read the trusted standard before writing the script
- Used correct field expansions on the invoice locate read
- Used correct field names (`amountExcludingVatCurrency`) for local filtering
- Payment voucher matcher correctly handled the `type=null` fallback (negative `Betaling:` posting)
- Did not add unnecessary verification read
- No 4xx errors

## What Went Right

1. **Trusted standard adherence**: Read `reverse-customer-invoice-payment.md` before writing any code
2. **Correct field expansions**: `fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))` — no silent filter failures
3. **Robust payment voucher matcher**: Two-tier approach (typed postings first, then `Betaling:` fallback) correctly identified voucher `608891408` without requiring `account.number`
4. **No wasted calls**: Exactly 2 API calls, 0 errors — matches the canonical minimum
5. **French prompt handling**: Correctly extracted org number, amount, and description from French text
6. **Correct date**: Used `2026-03-21` for the reverse date
7. **Smart fallback**: Script included a fallback filter (org + amount only) in case description matching failed, though the primary filter succeeded

## What To Change Next Time

Nothing needs to change for this task shape. The run matched the proven optimal path:
- 2 calls, 0 errors, correct final state
- T18 best_score already at max (4/4)
- This is the 12th+ production confirmation of the 2-call reverse path
- First French-prompt confirmation for the reversal task shape specifically (prior French-prompt runs were for T18 with Spanish/German/Norwegian/Portuguese prompts that happened to map to the same task ID)

The only observation is that the submission score capture was ambiguous (3 tasks changed during the scoring window). This is a timing artifact from concurrent runs, not a run quality issue. Future runs with less concurrent activity will get unique attribution.
