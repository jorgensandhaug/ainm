# Task 23 referee review

## Final verdict
- salvage
- final production leverage: 14
- confidence: 95
- rank note: This should sit in the low-priority tail of the queue. The proposal contains one small docs-sync cleanup worth preserving, but its headline "correctness solved / efficiency-only" framing is false for Task 23 in the live repo and would mis-rank the task if adopted as written.

## Final claim rulings

- claim: Batch `POST /bank/reconciliation/match` is the key efficiency import.
- ruling: weaken
- final reasoning: The optimization is real, but it is not a net-new migration import in this checkout. The live pre-built Tripletex1 script already batches matches per month, and the trusted standard already documents the same idea. Remaining value is only minor orientation/docs cleanup, not fresh production-score leverage.
- evidence: `tasks/tripletex/codex-environment/scripts/reconcile-bank-statement.ts` lines 395-429; `tasks/tripletex/codex-environment/trusted-standards/reconcile-bank-statement-open-invoices.md` lines 412-415.

- claim: Opening balance can be combined with supplier and non-invoice postings into one voucher.
- ruling: weaken
- final reasoning: Also real, but already live in both the script and trusted standard. The proposal overstates novelty and therefore overstates remaining leverage.
- evidence: `tasks/tripletex/codex-environment/scripts/reconcile-bank-statement.ts` lines 139-210; `tasks/tripletex/codex-environment/trusted-standards/reconcile-bank-statement-open-invoices.md` lines 35-37 and 413.

- claim: Prefer same-date posting matches before any-date fallback.
- ruling: reject
- final reasoning: This is speculative hardening, not production-backed score leverage. The live script does not do it, and the queue file presents no concrete Task 23 failure proving it matters.
- evidence: `tasks/tripletex/codex-environment/scripts/reconcile-bank-statement.ts` lines 399-406; `tasks/tripletex/docs/tripletex1-migration-queue/task-23.md` lines 62-66.

- claim: Exclude the opening-balance posting from the matchable set.
- ruling: reject
- final reasoning: Same problem as the date-aware matcher. It is a theoretical safeguard, not demonstrated production leverage, and the proposal incorrectly says the filter is already staged when it is not present in the live script.
- evidence: `tasks/tripletex/codex-environment/scripts/reconcile-bank-statement.ts` lines 399-406; `tasks/tripletex/docs/tripletex1-migration-queue/task-23.md` lines 68-72 and 103-106.

- claim: Task 23 is production-confirmed at `1.2667/6`, so correctness is solved and the remaining gap is efficiency-only.
- ruling: reject
- final reasoning: This is the decisive failure. The cited `1.2667/6` submission belongs to Task 06, not Task 23. The actual Task 23 run `a986e65f` maps to run `prod-2026-03-22-102339133Z-a986e65f`, whose submission `bbd5b0ac-632b-4216-8609-0f214cd424df` scored `0.6`. The live leaderboard stayed at `0.6` for Task 23 after that run, and the playbook also contains a later Task 23 production run `0c420db1` scoring `0/10`. So the proposal's "correctness solved / efficiency-only" reclassification is wrong.
- evidence: `tasks/tripletex/data/prompt-task-labels.jsonl` lines 298-299; `tasks/tripletex/data/submissions-history.jsonl` line 875; `tasks/tripletex/data/leaderboard-history.jsonl` lines 987-990; `tasks/tripletex/codex-environment/task-playbooks/reconcile-bank-statement-open-invoices.md` lines 25-35; `tasks/tripletex/sandbox-investigation/83-score-analysis.md` lines 13 and 34-45.

- claim: Strip a UTF-8 BOM before parsing the CSV.
- ruling: reject
- final reasoning: This is generic hygiene with no task-specific evidence and no demonstrated scoring effect. It does not belong in a high-signal migration import set for this task.
- evidence: `tasks/tripletex/docs/tripletex1-migration-queue/task-23.md` lines 80-84; the live script has no BOM handling and no cited failure depends on it.

- claim: The live script still misses Nynorsk `frå` and needs `fr[aå]`.
- ruling: reject
- final reasoning: Flatly stale. The live script already uses `fr[aå]` for both classification and customer-name extraction.
- evidence: `tasks/tripletex/codex-environment/scripts/reconcile-bank-statement.ts` lines 72-75 and 234-235.

- claim: Add a compact step-combination evidence table proving all components are jointly required.
- ruling: weaken
- final reasoning: This is the only documentation idea with some residual value, but only if rebuilt from correct evidence. The queue file rewrites the Tripletex2 RESEARCH table's final row from `UNTESTED` to `1.2667/6`, which is both misattributed and wrong for Task 23.
- evidence: `tasks/tripletex2/src/tasks/task-23/RESEARCH.md` lines 178-187; `tasks/tripletex/docs/tripletex1-migration-queue/task-23.md` lines 35-46.

## Queue-worthy delta
- Preserve only a narrow docs-sync cleanup: replace stale `a986e65f` "score pending" wording in the trusted standard and playbook with the actual Task 23 result (`0.6/6`, Check 1 failed, Check 2 passed), and optionally add a compact proof table only if it is rebuilt from correctly attributed evidence.

## Missed live contradictions / stale assumptions
- The proposal treats Task 06 submission `c7d5c7c1` / run `564307fb` as Task 23 evidence. Live mapping files show `564307fb` is Task 06, while Task 23 run `a986e65f` resolved to submission `bbd5b0ac` at `0.6/6`.
- The proposal says the live script still lacks Nynorsk `frå` support, but `fr[aå]` is already present.
- The proposal says several robustness changes are already staged in the live script (`BOM` strip, `matchablePostings`, same-date fallback, safe recon-version fallback), but they are not present.
- The proposal says Task 23 is now efficiency-only, but the live playbook already records `0c420db1` scoring `0/10` from wrong invoice matching.

## Bottom line
This task deserves negligible-to-low priority in the final ranking. The proposal's main thesis is wrong for Task 23, most of the real efficiency imports are already live, and the only worthwhile residue is a small documentation correction plus, at most, a carefully rebuilt proof table.
