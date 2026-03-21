# Score-Aware Reflection: prod-2026-03-21-184424564Z-d022ee19

## Task Attribution

- **Task ID**: 25 (T3, max score 6)
- **Task shape**: overdue invoice → manual reminder fee voucher (1500/3400) → fee invoice → partial payment 5000
- **Prompt language**: English
- **Fee amount**: 70 NOK
- **Attribution method**: leaderboard diff — task 25 `last_attempt_after` matches `completed_at` exactly (`2026-03-21T18:47:40.106745+00:00`)

## Correctness Verdict

**Perfect correctness.** `correctness: 1`, `score_raw: 10/10`, `feedback_comment: "6/6 checks passed"`, `all_checks_passed: true`.

All six scored fields were correct:
1. Overdue invoice located (#1, id=2147625691)
2. Voucher posted on accounts 1500/3400 with fee=70
3. Customer linked on 1500 posting
4. Fee invoice created (amount=70)
5. Fee invoice sent
6. Partial payment of 5000 registered, outstanding reduced from 19687.5 to 14687.5

## Efficiency Verdict

**Suboptimal.** `normalized_score: 4.8` out of 6 maximum. Best score for task 25 was already 6 from a prior run.

- **Score lost to inefficiency**: 1.2 points (20% of max)
- **Actual API calls**: 7 (3 GETs + 1 failed POST + 3 successful writes)
- **Optimal API calls**: 6 (3 GETs + 3 writes)
- **Wasted calls**: 1 (failed `POST /ledger/voucher` returning 422)
- **Avoidable 4xx errors**: 1 (the same voucher 422)

The 1 extra call + 1 error cost exactly 1.2 normalized points. A clean 6-call run would have scored 6/6.

## Likely Root Cause

The voucher POST failed because postings lacked explicit `row` values. Without `row`, Tripletex defaults all postings to row 0, which is reserved for system-generated postings. This triggers `422 Posteringene på rad 0 (guiRow 0) er systemgenererte`.

**Why the agent didn't include `row`**: The trusted standard at run time did not document the `row: 1`/`row: 2` requirement. The playbook's "Winning Payload Shapes" section already had explicit `row` values in its JSON examples, but per AGENTS.md the agent correctly read only the trusted standard (higher priority) and skipped the playbook. The trusted standard's Payload Rules section listed all other voucher fields but omitted the `row` requirement.

**Why prior runs succeeded**: Earlier production runs that achieved 6/6 likely used scripts derived from the playbook's payload examples (which included `row`), or were written by agents that happened to include `row` from general knowledge. The trusted standard's omission was a latent documentation gap that this run exposed.

**Sandbox verification**: Post-run sandbox testing confirmed the `row` requirement is consistent and not account-specific. Voucher POST without `row` always fails; with `row: 1`/`row: 2` always succeeds.

## What Went Right

1. **Correct trusted-standard match**: Immediately identified the exact-match standard
2. **Correct response parsing**: Handled `values` vs `value` shapes correctly from the start (avoiding the parser bug that hit earlier runs)
3. **Efficient recovery**: After the 422, reused all data from the first 3 GETs instead of re-reading, saving 3 calls on the retry
4. **Correct payload structure**: All other payload details were correct — account IDs, customer linkage, fee amounts, vatType omission, payment amount
5. **Perfect correctness**: 6/6 checks passed despite the efficiency hit
6. **Fast completion**: 205s total, well within the 300s budget

## What To Change Next Time

1. **Already fixed**: The trusted standard now includes `row: 1`/`row: 2` as an explicit requirement in the Payload Rules section (line 49). The next agent reading this standard will include row values automatically.
2. **Already fixed**: The playbook now has the `row` pitfall documented in its Pitfalls section (line 166).
3. **Already documented**: Common-endpoints.md line 754 already had the CRITICAL note about `row` values on `POST /ledger/voucher`. A future agent that also reads common-endpoints would have caught this.
4. **No remaining gap**: With the trusted standard updated, the next run on this exact task shape should achieve 6 calls / 0 errors / normalized_score 6.
5. **The 6-call path remains the minimum**: No lower-call shortcut exists for this task shape (account.id requires GET, paymentTypeId requires GET, invoice locate requires GET).
