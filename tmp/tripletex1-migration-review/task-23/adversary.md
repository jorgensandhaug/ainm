# Task 23 adversary review

## Verdict
- salvage
- production leverage: 22
- confidence: 93
- total score: 43

## Claim-by-claim judgments

### Import 1 — Batch matching
- claim: `POST /bank/reconciliation/match` accepts arrays, so matching can collapse from L calls to P calls.
- judgment: weaken
- why: The claim is real, but it is not a net-new migration import in this checkout. The live Tripletex1 script already does one batch match per month, so the queue proposal overstates remaining leverage.
- evidence: `tasks/tripletex/codex-environment/scripts/reconcile-bank-statement.ts` already batches matches by month and posts arrays at lines 395-429. The trusted standard already documents the same optimization at lines 412-415.

### Import 2 — Combined OB + supplier + non-invoice voucher
- claim: Opening balance can be combined with supplier and non-invoice postings in one voucher to save a write.
- judgment: weaken
- why: Also real, but already live. As a migration-queue item, this is mostly documenting an import that has already landed rather than proposing a new Tripletex1 markdown delta.
- evidence: The live script builds one `voucherPostings` array containing OB, supplier, and non-invoice lines, then posts a single `POST /ledger/voucher` at lines 139-210. The trusted standard already records the same insight at line 413.

### Import 3 — Date-aware posting match
- claim: Matching should prefer same-date ledger postings before any-date fallback.
- judgment: reject
- why: This is a defensive idea, not production-backed score leverage. The live script still matches postings by amount only, and the proposal presents no concrete failure proving this matters for Task 23 scoring.
- evidence: The live script still uses `allPostings1920.find(...)` with amount-only matching at lines 399-417. The proposal itself labels the evidence as theoretical at lines 62-66 of `task-23.md`.

### Import 4 — OB posting exclusion from matchable set
- claim: Exclude the opening-balance posting from candidate matches to avoid accidental collisions.
- judgment: reject
- why: Same problem as Import 3. This is speculative hardening, not demonstrated production leverage, and it is not present in the live script despite the proposal claiming it is already staged.
- evidence: No `matchablePostings` filter exists in the live script around lines 372-417. The queue file calls this a theoretical edge case at lines 68-72 and later falsely says the filter is already staged at lines 100-107.

### Import 5 — Production scoring confirmation
- claim: The full 9-step flow is production-confirmed to pass all checks; `a986e65f` scored `1.2667/6`.
- judgment: reject
- why: This is the proposal's biggest failure. Its cited submission id is not the Task 23 result for `a986e65f`, and the Task 23 leaderboard snapshot after `a986e65f` still shows best score `0.6`. The proposal is mixing evidence from another task/run.
- evidence: `tasks/tripletex/data/prompt-task-labels.jsonl` maps `prod-2026-03-22-102339133Z-a986e65f` to `tx_task_id: "23"`, but `tasks/tripletex/data/leaderboard-history.jsonl` shows Task 23 stayed at `0.6` before and after that run. In `tasks/tripletex/data/submissions-history.jsonl`, the Task 23 completion after `a986e65f` is submission `bbd5b0ac-632b-4216-8609-0f214cd424df` with `normalized_score: 0.6`, `Check 1: failed`, `Check 2: passed`; the proposal's cited submission `c7d5c7c1-814a-46e0-8b45-82f996c5fee5` completes under run `prod-2026-03-22-102756898Z-564307fb`, which `prompt-task-labels.jsonl` maps to Task 06, not Task 23.

### Import 6 — BOM handling
- claim: Strip UTF-8 BOM before parsing the CSV.
- judgment: reject
- why: This is low-value hygiene with no task-specific evidence and no demonstrated production effect. It does not belong in a high-signal migration proposal unless accompanied by a real failure.
- evidence: The live script still reads the CSV directly at lines 54-64 without BOM stripping, and the proposal explicitly says there is no observed production failure at lines 80-84 of `task-23.md`.

### Import 7 — Nynorsk regex risk
- claim: The v3 script still uses `Innbetaling fra` and misses Nynorsk `frå`.
- judgment: reject
- why: Flatly stale. The live script already uses `fr[aå]` in both classification and customer-name extraction.
- evidence: `tasks/tripletex/codex-environment/scripts/reconcile-bank-statement.ts` uses `Innbetaling\\s+fr[aå]` at lines 72-73 and 234-235. The proposal's cited script reading at lines 86-90 of `task-23.md` is simply outdated.

### Import 8 — Step-combination evidence table
- claim: Add a scannable table showing all components required for Check 1.
- judgment: weaken
- why: The presentation idea is good, but the citation chain is sloppy and currently wrong. The source table in Tripletex2 RESEARCH still ends with `Full flow ... UNTESTED`, not `1.2667/6`, so this cannot be copied forward as written.
- evidence: `tasks/tripletex2/src/tasks/task-23/RESEARCH.md` lines 178-187 end with `Full flow ... UNTESTED`. The queue file rewrites that final row to `1.2667/6` at lines 35-46 without a matching source.

## Missed problems in the proposal
- It confuses landed changes, imagined staged changes, and queue-only deltas. The live script already has the major efficiency imports, but it does not have the claimed BOM strip, matchable-postings filter, date-aware matching, or safe version fallback.
- Its core scoring evidence is wrong. `c7d5c7c1` is a completed submission under run `564307fb`, which maps to Task 06, while Task 23 run `a986e65f` still resolves to a `0.6` result in the submissions and leaderboard history.
- It ignores newer live evidence that weakens the "correctness solved" framing. The playbook already contains production run `0c420db1` scoring `0/10` because invoice matching was wrong, so the state of Task 23 is not a clean linear story from `0.6` to "solved."
- It frames speculative explanations too strongly. The sandbox `422` on `POST /ledger/voucher` is evidenced only as `error 18000: Validering feilet.`; "due to pre-existing sandbox state" is an inference, not demonstrated by the artifact.
- It proposes updating score analysis to "efficiency-only" even though the live repo evidence for Task 23 still includes `a986e65f` at `0.6` and `0c420db1` at `0/10`. That is not strong enough to reclassify the task as solved.

## Minimal salvage set
- Keep one narrow docs-sync item: correct the stale `a986e65f` "pending" wording in the trusted standard and playbook, but update it to the actual Task 23 result from the repo evidence, not to `1.2667/6`.
- Keep one narrow documentation note that the live pre-built script already includes batch matching, combined voucher posting, and invoice-reference-first matching. That is useful orientation for future agents.
- Keep the idea of a compact proof table only if it is rebuilt from correctly attributed evidence and does not import the false `1.2667/6` final row from the queue file.

## Bottom line
This proposal should survive only as a cleanup candidate, not as an adopt-now import set. The underlying efficiency ideas are real, but they are mostly already live, and the proposal's strongest claim about Task 23 production success is mis-cited enough that it would actively mislead queue triage if copied forward unchanged.
