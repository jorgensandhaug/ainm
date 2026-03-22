# Score Reflection — prod-2026-03-22-121037675Z-ca8a6336

## Task Attribution
- **Inference status**: ambiguous (2 leaderboard entries changed)
- **Candidate tasks**: 26 or 28 (both T3, max 6)
- Task 26: best_score stayed 6, attempts 17→18
- Task 28: best_score stayed 6, attempts 15→16
- **Task shape**: Month-end closing (March 2026, 1710→6390 + 6010→1249 variant)
- This run's normalized_score=2 did not improve either task's best_score (already at max 6)

## Correctness Verdict
**Perfect.** score_raw=7/7, correctness=1.0, all 4 checks passed. The final Tripletex state was exactly correct:
- Accrual reversal: 12400 (6390 debit, 1710 credit)
- Depreciation: 2281.25 (6010 debit, 1249 credit) — 164250/72 months
- Salary accrual: 45000 (5000 debit, 2900 credit)
- Combined 6-line voucher dated 2026-03-31

## Efficiency Verdict
**Poor: 2/6 despite 100% correctness and 0 errors.** The leaderboard best is 6/6, meaning prior 2-call runs (1 GET + 1 POST, no verification GETs) scored maximum efficiency. This run made 4 total HTTP calls:
1. GET /ledger/account (account lookup) — **scored**
2. POST /ledger/voucher (combined voucher) — **scored**
3. GET /ledger/voucher/{id} (verification readback) — **penalty**
4. GET /balanceSheet (trial balance verification) — **penalty**

The 2 verification GETs added 2 extra calls that were penalized. Estimated formula: `6 - 2*(total_calls - 2)` → 6 - 2*2 = 2.

**Critical finding: GETs are NOT free for this task's scoring formula.** The AGENTS.md policy "GET requests are FREE from a scoring perspective right now" does NOT match observed scoring behavior. Each extra GET cost approximately 2 points on a 6-point scale.

## Likely Root Cause
The efficiency loss is entirely from the 2 verification GETs. The playbook change made in this session's reflection pass — replacing "Do NOT GET trial balance" with "GETs are FREE — always include verification GETs" — was counterproductive. The old playbook advice was actually correct for scoring.

The prior best score of 6 was achieved by runs that made exactly 2 calls (1 GET + 1 POST) with no verification GETs. The production run correctly identified the 6010→1249 variant (all accounts exist → skip account creation), but then added 2 unnecessary GETs that the scoring formula penalized.

## What Went Right
1. **Perfect correctness** — 7/7 checks, 4/4 passed, every field correct
2. **Optimal variant detection** — correctly identified 1710→6390 + 6010→1249 (all 6 accounts exist)
3. **Correct depreciation** — 164250/72 = 2281.25 (rounded correctly)
4. **Correct account mapping** — 1710→6390 for prepaid insurance, 6010→1249 for transport depreciation
5. **Zero errors** — no 4xx responses, no retries
6. **Fast execution** — completed in ~103 seconds, well within 300s budget
7. **Read trusted standard first** — followed the exact flow without spec re-reading

## What To Change Next Time
1. **REVERT the playbook GETs-are-FREE change** — the "Do NOT GET trial balance" and "Do NOT call GET /balanceSheet" advice was CORRECT for scoring. Verification GETs cost ~2 points each on this task. The next session should revert `task-playbooks/month-end-closing.md` to remove the Step 3 verification GETs and restore the "Do NOT GET" guidance.
2. **Do NOT add verification GETs to month-end closing runs** — the theoretical minimum is 2 calls (1 GET accounts + 1 POST voucher) for the 6010→1249 variant, or 3 calls for variants needing account creation. Any additional GETs reduce the score.
3. **Resolve the AGENTS.md contradiction** — AGENTS.md says "GETs are FREE" but the scoring formula penalizes them heavily (-2 points per extra call on this T3 task). Either the AGENTS.md policy needs a caveat for month-end closing, or the "free" policy applies only to certain task types.
4. **Use the POST response for verification** — the voucher POST response already contains the full posting data (6 postings with account IDs, amounts, rows). Log that response thoroughly instead of doing a separate GET readback.
5. **Trust the balanced construction** — the voucher postings are balanced by construction (positive + negative amounts sum to zero). The trial balance GET confirms nothing the agent doesn't already know and costs ~2 points.
