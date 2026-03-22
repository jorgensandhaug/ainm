# Task 22 adversary review

## Verdict
- salvage
- production leverage: 18
- confidence: 88
- total score: 34

## Claim-by-claim judgments

- claim: Import 1 says Tripletex2's NET-to-GROSS theory is the main new insight and should remain a live hold item in the migration queue.
- judgment: reject
- why: This is not a production-ready import. It directly contradicts the live Tripletex1 runtime surface, which already anchors on a production miss where multiplying a Branch B amount failed Check 3. The Tripletex2 evidence is internally unstable: `RESEARCH.md` first recommends treating the line amount as GROSS, then later flips to a `CORRECTION` that says the same printed amount is NET; the packet still ships with empty proof; and the proof input still feeds `grossAmountNok: 8750`, not `9800`. That is theory drift, not a migration candidate.
- evidence: `tasks/tripletex/codex-environment/AGENTS.md:520-523`; `tasks/tripletex/codex-environment/trusted-standards/register-receipt-expense-voucher.md:25,45-58`; `tasks/tripletex/codex-environment/task-playbooks/register-receipt-expense-voucher.md:17-18,45-60`; `tasks/tripletex2/src/tasks/task-22/RESEARCH.md:73-74`; `tasks/tripletex2/src/tasks/task-22/RESEARCH.md:116-139`; `tasks/tripletex2/research/packets/task-22/task-22-packet-2026-03-22T02-11-58-196Z.json:24-27,43-63,192`; `tasks/tripletex2/research/proofs/task-22/task-22-proof-input.json:2-6`; `tasks/tripletex2/src/tasks/task-22/task.ts:51-52,65-69`

- claim: Import 2 says `Kundemøte lunsj` should be flagged as tentative because Tripletex2 routes it to meeting expense `6860` instead of representation `7360`.
- judgment: reject
- why: This weakens a trusted branch table without a winning counterexample. The only cited production run for `Kundemøte lunsj` never tested the account choice because the voucher was left draft. Tripletex2's support is a regex-routing choice plus inline tests, not production scoring evidence. Injecting “maybe this branch is wrong” into the live Tripletex1 standard is more likely to reduce decisiveness than improve score.
- evidence: `tasks/tripletex/codex-environment/trusted-standards/register-receipt-expense-voucher.md:67-75`; `tasks/tripletex/codex-environment/task-playbooks/register-receipt-expense-voucher.md:34-41`; `tasks/tripletex/docs/tripletex1-migration-queue/task-22.md:35,55-63`; `tasks/tripletex2/src/tasks/task-22/RESEARCH.md:51-53,233-247`; `tasks/tripletex2/src/tasks/task-22/strategies/receipt-expense-booking.ts:798-817`

- claim: Import 3 says Tripletex1 should explicitly warn that `Bedriftskort` is a payment method, not a representation signal.
- judgment: keep
- why: This is the cleanest low-risk salvage. It is additive, does not disturb the dominant amount/VAT guidance, and directly guards against a plausible branch-selection failure mode. The evidence is still weaker than the proposal suggests because it comes from deterministic routing logic rather than a Tripletex1 production miss, but unlike the amount theory it does not require overturning any production-backed live rule.
- evidence: `tasks/tripletex/codex-environment/trusted-standards/register-receipt-expense-voucher.md:8-10,63-70`; `tasks/tripletex2/src/tasks/task-22/RESEARCH.md:229-243`; `tasks/tripletex2/src/tasks/task-22/strategies/receipt-expense-booking.ts:804-817`

- claim: Import 4 says the `ø/æ` normalization insight should be ported into Tripletex1 guidance.
- judgment: reject
- why: This is a regex-implementation detail, not strong markdown guidance. The live Tripletex1 surface already names the Norwegian examples explicitly, and there is no cited Tripletex1 production failure caused by Unicode handling. Porting this would add complexity with little evidence of score leverage.
- evidence: `tasks/tripletex/codex-environment/trusted-standards/register-receipt-expense-voucher.md:67-70`; `tasks/tripletex2/src/tasks/task-22/RESEARCH.md:237-238`; `tasks/tripletex2/src/tasks/task-22/strategies/receipt-expense-booking.ts:819-825`

- claim: Import 5 says Tripletex1 should warn that bare `lunsj` is too ambiguous to drive representation routing.
- judgment: weaken
- why: Directionally plausible, but the proposal oversells the leverage. The live Tripletex1 branch table already keys on `Forretningslunsj` and `Kundemøte lunsj`, not on bare `lunsj`, so this is only a minor defensive clarification. The support again comes from regex behavior and inline tests, not from a demonstrated Tripletex1 production error.
- evidence: `tasks/tripletex/codex-environment/trusted-standards/register-receipt-expense-voucher.md:65-70`; `tasks/tripletex/codex-environment/task-playbooks/register-receipt-expense-voucher.md:32-41`; `tasks/tripletex2/src/tasks/task-22/RESEARCH.md:233-253`; `tasks/tripletex2/src/tasks/task-22/strategies/receipt-expense-booking.ts:804-817`

## Missed problems in the proposal

- It understates how split the Tripletex2 source surface is. The packet exposes only draft `22.receipt-expense-booking.v1` as active/available, while the proposal also relies on later research edits and a separate `v2` file that is not the pinned packet surface.
- It does not call out that the checked-in `v2` still contains the older `lunsj|bedriftskort` representation regex and lacks the later `kundemote`/Unicode fixes, so the import story is not even internally stable across Tripletex2 strategy files.
- It leans on a pending run `70014f3c` as if that helps validate current guidance. Pending is not evidence.
- It treats inline routing tests as stronger proof than they are. Those tests only validate local text-classification behavior, not end-to-end Tripletex API correctness or competition scoring.
- It proposes putting uncertainty inside a trusted runtime standard. That is the wrong place to surface unresolved branch theory unless there is strong evidence that current decisiveness is actively harmful.

## Minimal salvage set

- Add one short warning that `Betalt med: Bedriftskort` describes payment method only and must not influence branch selection.

## Bottom line

This proposal should survive triage only as a tiny salvage item. Do not port the NET-to-GROSS theory, do not weaken the trusted branch table with `Kundemøte lunsj` uncertainty, and do not import code-level normalization lore. The only import with credible positive expected value is the narrow `Bedriftskort` payment-method warning.
