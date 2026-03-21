# Score Reflection — prod-2026-03-21-194143438Z-8e978a3e

## Task Attribution

- **tx_task_id**: 10
- **Tier**: T2 (tasks 9–18), max score = 4
- **Prompt language**: Portuguese
- **Task shape**: create order → invoice → register full payment (exact trusted-standard match)
- **Customer**: Solmar Lda (org. 867069526)
- **Products**: Sessão de formação (4466) @ 35600 NOK, Licença de software (3717) @ 3250 NOK

## Correctness Verdict

**Perfect.** correctness = 1, score_raw = 8/8, all 5/5 checks passed. The final Tripletex state was exactly correct: order created with both lines at the right prices, invoice generated, payment settled to outstanding = 0.

## Efficiency Verdict

**Tied leaderboard best but did not reach max.**

- normalized_score: **3** out of max **4**
- Leaderboard best before: 3 (14 attempts) → after: 3 (15 attempts, ours was the 15th)
- Our run: **5 API calls, 0 errors, 0 retries**
- Duration: ~63s

The 1-point gap from 3 to 4 is an efficiency penalty. Since no one across 15 attempts has achieved 4, the gap is likely structural: the scoring formula penalizes 5 calls enough that even a clean 0-error run cannot reach 4. A score of 4 would require a 4-call (or fewer) path.

**Is a 4-call path possible?** Only by skipping one of the 5 calls:
1. `GET /customer` — cannot skip; need customer ID from org number
2. `GET /product` — cannot skip; need product IDs from product numbers
3. `GET /invoice/paymentType` — the only skippable call, but only if a valid paymentTypeId is already known (cached from a prior run in the same session)
4. `POST /order` — cannot skip; creates the order
5. `PUT /order/:invoice` — cannot skip; creates invoice + settles payment

Since production runs use fresh accounts with unique paymentTypeIds, there is no safe way to skip step 3. The 5-call path is the structural minimum for this task shape. **A score of 3 is the practical ceiling** for task 10 under current conditions.

## Likely Root Cause

No mistakes or inefficiencies. The score gap is structural — the scoring formula's efficiency curve does not award full marks at 5 calls for this T2 task. The only theoretical improvement (4 calls via cached paymentTypeId) is not achievable on fresh-account production runs without prior same-session context.

## What Went Right

1. **Exact trusted-standard match** identified immediately — no time wasted reading openapi.json or multiple playbooks
2. **Read the standard before writing** — avoided all documented pitfalls (string type for `product.number`, `paidAmount=0` rejection, empty `orderLines` echo)
3. **Used `String(p.number)` comparison** — correctly handled the string-type pitfall that cost 2 wasted calls in the earlier Horizonte Lda run
4. **Used `count=1000&fields=*`** product lookup — the proven reliable approach (the standard has since been updated to use comma-separated `number=X,Y` which is more targeted)
5. **Used `paidAmount=0.01` seed** — Tripletex calculated the remaining full payment automatically
6. **No 4xx errors** — every call succeeded on first attempt
7. **63s completion** — well within the 300s budget
8. **Reused write response** — no unnecessary follow-up GETs to verify outstanding amount

## What To Change Next Time

1. **Nothing actionable for correctness** — already perfect
2. **For efficiency**: the only path to 4/4 would be skipping the `GET /invoice/paymentType` call. This requires either:
   - A same-session cache of paymentTypeId from a prior task on the same account (not applicable to fresh accounts)
   - Hardcoding a paymentTypeId (unsafe — IDs are account-specific and differ between environments)
   - Neither is safe or reliable. Accept 3/4 as the ceiling for this task shape.
3. **Already updated**: the trusted standard now uses `GET /product?number=<ref1>,<ref2>&fields=*` (comma-separated) instead of `count=1000`, which is more targeted and avoids scanning the full product list. Same call count but cleaner.
4. **No playbook changes needed** — the flow is proven optimal for this exact task shape across multiple production confirmations.
