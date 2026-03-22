# Task 23 Review

## Concise proposal summary

The proposal argues Task 23 is no longer a correctness problem. It says Tripletex1 should port the efficiency learnings from Tripletex2 and from production run `a986e65f`: batch `POST /bank/reconciliation/match`, combine opening-balance and transaction voucher postings, refresh stale Tripletex1 docs to reflect that `a986e65f` scored `1.2667/6`, and add a more scannable proof table showing all required reconciliation components.

## Candidate findings

### 1. High-impact weakness: Import 7 is already fixed in the live Tripletex1 script, so the proposal is demonstrably stale on one of its headline “NEW” findings.

`task-23.md` says the live script still uses `/Innbetaling fra/i` and recommends a follow-up fix to widen it to `fr[aå]` (`task-23.md` lines 86-90, 137, 144). But the live Tripletex1 script already uses `/(?:Innbetaling\s+fr[aå]|...)/` for customer-line classification and name extraction (`scripts/reconcile-bank-statement.ts` lines 72-75 and 234-235). That means the proposal did not verify the current target file closely enough, and its “fix before next production run” recommendation is already obsolete.

### 2. High-impact weakness: the proposal conflates landed changes, unlanded changes, and nonexistent staged changes, which makes the net-new scope unreliable.

The proposal repeatedly says changes are “already staged” in the script, trusted standard, playbook, and score-analysis files (`task-23.md` lines 100-140). In this repo snapshot:

- The trusted standard still says “ALL prior completed runs scored 0.6/6” and still marks `a986e65f` as “scored pending” (`trusted-standards/reconcile-bank-statement-open-invoices.md` lines 391-393).
- The playbook still marks `a986e65f` as “score pending” (`task-playbooks/reconcile-bank-statement-open-invoices.md` lines 32-34).
- The score-analysis file still says T23 is `0.60/6` and “Check 1 always fails” (`sandbox-investigation/83-score-analysis.md` lines 13, 34-45).
- The script does not contain the claimed BOM strip, same-date posting preference, opening-balance exclusion filter, or `fresh2?.value?.version ?? r.recon.version` fallback (`scripts/reconcile-bank-statement.ts` lines 55-64, 404-406, 503-505).

The only clean way to read the proposal is that it was written against a different or later checkout. As a migration review artifact, that is a material reliability problem.

### 3. Medium-impact weakness: the step-combination evidence table is misattributed to a source that still says the full flow was untested.

`task-23.md` cites `RESEARCH.md` lines 178-187 as the source for a table whose last row is `YES | YES | YES | YES | YES | 1.2667/6` (`task-23.md` lines 35-46). But the cited source lines actually end with `Full flow | YES | YES | YES | YES | YES | **UNTESTED**` (`tasks/tripletex2/src/tasks/task-23/RESEARCH.md` lines 178-187). The “full flow scored 1.2667/6” conclusion is true, but it comes from later production evidence, not from the cited table. That weakens the evidence chain and should be corrected before porting the table into Tripletex1 docs.

### 4. Medium-impact weakness: the proposal overstates remaining production-score leverage because the core score-changing script imports are already live.

The largest score lever here is the runtime script, not the documentation. But the live script already contains the core high-value imports the proposal is built around: combined OB+supplier+non-invoice voucher, batch matching, and invoice-reference matching (`scripts/reconcile-bank-statement.ts` lines 3-7, 139-210, 231-269, 368-449). What is still visibly stale is mostly the Tripletex1 documentation. Updating docs is worthwhile, but it does not itself raise production score unless a new production run is made using the updated guidance. So the proposal’s framing of “4.73 points recoverable” describes the task area, not the remaining net-new leverage of this proposal as written.

### 5. Medium-impact weakness: the explanation for the v2 sandbox 422 is speculative, not evidenced.

The proposal says the `2026-03-22T08:52:54Z` v2 sandbox failure was “due to pre-existing sandbox state” and is unlikely in production (`task-23.md` lines 138-139). The run artifact only shows that the strategy failed on its first `POST /ledger/voucher` with `422` / error code `18000` after 6 GETs (`run-sandbox-23-23.reconcile-bank-statement.v2-2026-03-22T08-52-54-420Z.json` lines 44-55, 141-155). There is no artifact-level proof that pre-existing state, rather than payload shape, caused that voucher failure. This should be presented as an inference, not as established fact.

### 6. Low-impact weakness: the target outcome “3-5/6” is not well-supported.

The proposal’s next-step target says a validating rerun should ideally improve to `3-5/6` (`task-23.md` line 146). The repo does prove that `a986e65f` reached `1.2667/6` with 20 mutating calls and that the optimized path should cut that to 10 mutating calls (`codex-reflection.summary.md` lines 18-21, 29-38, 42-53), but it does not prove how the Task 23 efficiency curve maps call reductions to normalized score. The proposal itself admits the score formula is unknown (`task-23.md` line 136), so the numerical target should be framed as a guess.

## Candidate strengths

- The proposal is directionally right that the Tripletex1 docs are stale on current score state. The live trusted standard, playbook, and score-analysis files all still present pre-`a986e65f` status (`trusted-standards/reconcile-bank-statement-open-invoices.md` lines 391-393, `task-playbooks/reconcile-bank-statement-open-invoices.md` lines 32-34, `sandbox-investigation/83-score-analysis.md` lines 13, 34-45).
- The batch-matching and combined-voucher imports are well-backed by the production reflection and are the best actual efficiency insight in the package (`codex-reflection.summary.md` lines 18-21, 57-74, 97-99).
- The proposal is correct that production correctness is solved. The submissions history now contains completed submission `c7d5c7c1-814a-46e0-8b45-82f996c5fee5` with `score_raw=7`, `score_max=7`, `normalized_score=1.2667`, and `5/5 checks passed` (`tasks/tripletex/data/submissions-history.jsonl`, line 995).
- The suggestion to add a scannable proof table to the trusted standard is a good documentation import, even though the current citation is sloppy.

## Net-new call

Partially net-new.

The documentation refresh is net-new in this checkout, and that is useful. But the proposal overstates novelty because the main score-changing script imports are already live, while one highlighted bugfix is already fixed and several claimed “already staged” robustness deltas are not present at all.

## Is the evidence strong enough for production-porting now?

For the underlying strategy direction, yes.

For this proposal as a migration artifact, not quite. It needs verification and cleanup first because it contains stale claims about the live script, misstates what is already staged, and cites at least one source table inaccurately.

## Production score leverage score

40/100

Reason: the underlying efficiency insight is real, but most of the score-moving script work is already in Tripletex1. The remaining concrete delta in this checkout is mostly documentation synchronization plus a few unverified robustness claims.

## Confidence

87/100

## Provisional one-line recommendation

needs verification

## Best insight in this task

Batch `POST /bank/reconciliation/match` per accounting period is the single highest-value import: it preserves the proven all-checks-pass flow while collapsing the dominant write-cost from `L` match calls to `P`.

## Finder score

36 points

Breakdown: 2 high-impact findings, 3 medium-impact findings, 1 low-impact finding.
