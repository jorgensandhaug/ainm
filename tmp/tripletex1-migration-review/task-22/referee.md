# Task 22 referee review

## Final verdict
- salvage
- final production leverage: 20
- confidence: 90
- rank note: This should sit in the low-priority salvage tier, not near the top of the queue. The only credible import is a tiny branch-selection warning; the score-critical amount/VAT dispute is still too unstable to port.

## Final claim rulings
- claim: Import 1 says the NET-to-GROSS theory is the main new insight and should remain a live migration item.
- ruling: reject
- final reasoning: As a migration claim, this is not ready. Live Tripletex1 guidance is explicit that receipt-line amounts are already GROSS and should be used directly, with concrete production evidence from a failed multiplied Branch B run. Tripletex2's competing theory is internally inconsistent across its own surfaces: the packet only exposes `22.receipt-expense-booking.v1`, the proof block is empty, the proof input still passes `grossAmountNok: 8750`, and the checked-in task surface tells the extractor to pass the printed line amount as-is while the runtime silently converts later. That is an unresolved contradiction, not a production-backed Tripletex1 import.
- evidence: `tasks/tripletex/codex-environment/trusted-standards/register-receipt-expense-voucher.md:25-27,45-57`; `tasks/tripletex/codex-environment/task-playbooks/register-receipt-expense-voucher.md:17-18,47-59`; `tasks/tripletex2/research/packets/task-22/task-22-packet-2026-03-22T02-11-58-196Z.json:24-61,91-98,192`; `tasks/tripletex2/research/proofs/task-22/task-22-proof-input.json:2-6`; `tasks/tripletex2/src/tasks/task-22/task.ts:51-69`; `tasks/tripletex2/src/tasks/task-22/strategies/receipt-expense-booking.ts:204-216`

- claim: Import 2 says `Kundemøte lunsj` should be flagged as tentative because Tripletex2 routes it to meeting expense `6860` instead of representation `7360`.
- ruling: reject
- final reasoning: This would weaken a decisive live branch table without a winning counterexample. Tripletex1 currently gives a crisp Branch A rule for `Kundemøte lunsj`, and the cited production miss never tested that account choice because the voucher was not sent to ledger. Tripletex2 support is only deterministic routing logic plus local tests, not production scoring evidence. Putting uncertainty into the trusted runtime surface is more likely to reduce execution quality than improve score.
- evidence: `tasks/tripletex/codex-environment/trusted-standards/register-receipt-expense-voucher.md:61-75`; `tasks/tripletex/codex-environment/task-playbooks/register-receipt-expense-voucher.md:28-41`; `tasks/tripletex/docs/tripletex1-migration-queue/task-22.md:35,55-63`; `tasks/tripletex2/src/tasks/task-22/RESEARCH.md:51-53,233-247`; `tasks/tripletex2/src/tasks/task-22/strategies/receipt-expense-booking.ts:798-817`

- claim: Import 3 says Tripletex1 should explicitly warn that `Bedriftskort` is a payment method, not a representation signal.
- ruling: keep
- final reasoning: This is the cleanest salvageable import. It is additive, does not disturb the live amount/VAT guidance, and directly guards against a plausible branch-selection failure mode that Tripletex2 explicitly identified and fixed. The evidence is still weaker than production proof, so the leverage is modest, but unlike the NET theory it does not require overturning any live production-backed rule.
- evidence: `tasks/tripletex/codex-environment/trusted-standards/register-receipt-expense-voucher.md:6-10,61-70`; `tasks/tripletex2/src/tasks/task-22/RESEARCH.md:229-243`; `tasks/tripletex2/src/tasks/task-22/strategies/receipt-expense-booking.ts:804-817`

- claim: Import 4 says the `ø/æ` normalization insight should be ported into Tripletex1 guidance.
- ruling: reject
- final reasoning: This is implementation-detail lore from regex routing, not high-value markdown guidance for the live LLM surface. The current Tripletex1 standard already names the relevant Norwegian examples explicitly, and there is no cited Tripletex1 production miss caused by Unicode handling. It adds complexity without demonstrated score upside.
- evidence: `tasks/tripletex/codex-environment/trusted-standards/register-receipt-expense-voucher.md:67-70`; `tasks/tripletex2/src/tasks/task-22/RESEARCH.md:237-238`; `tasks/tripletex2/src/tasks/task-22/strategies/receipt-expense-booking.ts:819-826`

- claim: Import 5 says Tripletex1 should warn that bare `lunsj` is too ambiguous to drive representation routing.
- ruling: weaken
- final reasoning: Directionally useful, but only as a minor defensive clarification. Live Tripletex1 already keys representation on `Forretningslunsj` and `Kundemøte lunsj`, not on bare `lunsj`, so this does not justify a broad change. If preserved at all, it should be narrow wording that branch selection follows the main purchase keyword and that only clearly representational lunch phrasing should drive Branch A.
- evidence: `tasks/tripletex/codex-environment/trusted-standards/register-receipt-expense-voucher.md:65-70`; `tasks/tripletex/codex-environment/task-playbooks/register-receipt-expense-voucher.md:32-41`; `tasks/tripletex2/src/tasks/task-22/RESEARCH.md:233-253`; `tasks/tripletex2/src/tasks/task-22/strategies/receipt-expense-booking.ts:804-817`

## Queue-worthy delta
- Preserve one short warning only: `Betalt med: Bedriftskort` describes payment method, not expense type, and must not influence branch selection.

## Missed live contradictions / stale assumptions
- The proposal mixes packet-pinned evidence with later unpinned edits. The packet only exposes `22.receipt-expense-booking.v1` as active and available, while the proposal also leans on later `RESEARCH.md` conclusions and a separate `v2` file.
- The proposal does not call out that checked-in `v1` already contains the later NET-conversion and routing changes, while `v2` is actually stale on the routing side (`lunsj|bedriftskort` still in representation, no `kundemote`, no `ø/æ` replacement). The evidence problem is not “v1 vs v2”; it is lack of production verification.
- The queue writeup treats a pending run as if it helps validate current guidance. Pending is not evidence.

## Bottom line
This task deserves low priority in the final ranking. The only worthwhile import is a tiny `Bedriftskort` warning with possibly a very soft lunch-disambiguation note; everything else either contradicts live Tripletex1, weakens a trusted branch table without proof, or imports code-level details with negligible production leverage.
