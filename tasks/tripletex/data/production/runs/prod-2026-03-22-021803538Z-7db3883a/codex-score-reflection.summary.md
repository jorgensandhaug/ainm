# Score-Aware Reflection — prod-2026-03-22-021803538Z-7db3883a

## Task Attribution

- **tx_task_id**: 10
- **Tier**: T2 (max score: 4)
- **Task shape**: Create order → invoice → register full payment
- **Prompt language**: French
- **Customer**: Colline SARL / 953795493
- **Products**: Rapport d'analyse (6272) at 30600, Heures de conseil (7628) at 2350

## Correctness Verdict

**PERFECT.** correctness = 1.0, score_raw = 8/8, 5/5 checks passed.

No issues with the final Tripletex state. Order created, invoice generated, payment fully settled (outstanding = 0).

## Efficiency Verdict

**normalized_score = 3/4.** The run lost 1 point to the efficiency penalty despite using only 5 API calls and 0 errors.

Leaderboard context:
- T10 best_score before: 3 (20 attempts)
- T10 best_score after: 3 (21 attempts — this run)
- This run **tied** the all-time best. No run has ever scored 4/4 on T10.

Since the best_score across 21 attempts is still 3, and sandbox investigation has exhaustively disproved all 4-call hypotheses, **3/4 appears to be the ceiling** for this task shape. The scoring formula penalizes the 5 mandatory read calls (customer, product, paymentType) even though none can be eliminated.

The missing point is an inherent efficiency tax from requiring 3 GETs + 1 POST + 1 PUT = 5 total calls. There is no known way to reduce this further:
- `customer: { organizationNumber }` inline → 422
- `product: { number }` inline → orphaned lines
- Hardcoded `paymentTypeId` → 422
- Omitted `paymentTypeId` → 422

## Likely Root Cause

No root cause for error — the run was optimal. The 1-point efficiency gap is structural: the scoring formula does not award max score for 5-call flows on T2 tasks. This is a hard ceiling, not a fixable issue.

## What Went Right

1. **Immediate trusted-standard match** — no time wasted reading AGENTS.md, openapi.json, or playbook
2. **Single script, single execution** — no retries, no debug scripts, no wasted calls
3. **All proven patterns applied correctly**: comma-separated product lookup, `String(p.number)` comparison, `pts[0]` payment type selection, `paidAmount=0.01` seed
4. **90s wall time** — well within the 300s budget
5. **Tied the all-time best score** for T10 (3/4) on the first attempt with this prompt variant
6. **First French-language confirmation** proving language invariance across nb/en/es/pt/nn/fr

## What To Change Next Time

**Nothing.** This run is at the proven ceiling for T10. The canonical 5-call path is the optimal execution:

1. `GET /customer?organizationNumber=...&fields=*`
2. `GET /product?number=X,Y&fields=*`
3. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
4. `POST /order` with embedded `orderLines`
5. `PUT /order/{id}/:invoice?invoiceDate=...&sendToCustomer=false&paymentTypeId=...&paidAmount=0.01&paymentTypeIdRestAmount=...`

The only theoretical improvement would be discovering a way to eliminate one of the 3 read calls, but all such hypotheses have been exhaustively disproved in sandbox. The next agent should execute the same 5-call path identically.
