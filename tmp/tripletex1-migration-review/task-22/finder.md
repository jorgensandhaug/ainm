# Finder Review — Task 22

## Concise proposal summary

The proposal reviews the current Tripletex1 receipt-voucher guidance and suggests importing five ideas from Tripletex2: keep the NET-vs-GROSS dispute on hold, flag `Kundemøte lunsj` as ambiguous, add a `Bedriftskort` payment-method warning, note `ø/æ` normalization, and clarify that bare `lunsj` should not drive representation routing. Its practical recommendation is partial adopt now: add the low-risk wording warnings, but do not port the core amount/VAT theory yet.

## Candidate findings

### Weaknesses

1. **High (+10): the proposal’s most important import still lacks production-grade proof, so it does not clear the bar for changing score-critical Tripletex1 guidance.**
   - The live Tripletex1 standard and playbook are unambiguous that receipt line amounts are GROSS and must be used directly as `amountGross` ([trusted standard](tasks/tripletex/codex-environment/trusted-standards/register-receipt-expense-voucher.md:45), [playbook](tasks/tripletex/codex-environment/task-playbooks/register-receipt-expense-voucher.md:47), [AGENTS](tasks/tripletex/codex-environment/AGENTS.md:520)).
   - Tripletex2 argues the opposite in its later correction, but its own research explicitly says automated verification is blocked because the packet has `proof: {}` and no verification plan ([RESEARCH](tasks/tripletex2/src/tasks/task-22/RESEARCH.md:257), [packet](tasks/tripletex2/research/packets/task-22/task-22-packet-2026-03-22T02-11-58-196Z.json:192)).
   - That means the proposal is correct to hold Import 1, but it also means the evidence base is too weak for any migration document whose stated purpose is production score leverage.

2. **High (+10): adding a “`Kundemøte lunsj` is tentative” note into the trusted surface risks making branch selection less decisive without any winning counterexample.**
   - Current Tripletex1 docs give a crisp rule: `Kundemøte lunsj` belongs to Branch A / 7360 ([trusted standard](tasks/tripletex/codex-environment/trusted-standards/register-receipt-expense-voucher.md:67), [playbook](tasks/tripletex/codex-environment/task-playbooks/register-receipt-expense-voucher.md:34)).
   - The only cited production run for that phrase failed because `sendToLedger` was missing, so the account hypothesis was never tested ([proposal](tasks/tripletex/docs/tripletex1-migration-queue/task-22.md:35), [RESEARCH](tasks/tripletex2/src/tasks/task-22/RESEARCH.md:51)).
   - For a task where the agent already has a dominant ambiguity around Check 3, adding a second unresolved ambiguity to the top-level instructions is more likely to dilute execution than improve score.

3. **Medium (+5): the proposal overstates how transferable the `Bedriftskort`/`lunsj` evidence is from Tripletex2 into Tripletex1.**
   - In Tripletex2 this is a deterministic regex-routing problem with inline tests ([RESEARCH](tasks/tripletex2/src/tasks/task-22/RESEARCH.md:239), [v1 strategy](tasks/tripletex2/src/tasks/task-22/strategies/receipt-expense-booking.ts:804)).
   - In Tripletex1 this is free-form LLM guidance, not a regex engine. The warning is plausible and low-risk, but the proposal does not show an actual Tripletex1 production miss caused by `Bedriftskort` or bare `lunsj`.
   - That lowers expected score leverage compared with how strongly the proposal frames these as adopt-now imports.

4. **Medium (+5): the proposal leans on a Tripletex2 source surface that is internally stale and split, which weakens the migration case.**
   - The packet still exposes only `22.receipt-expense-booking.v1` as active and available ([packet](tasks/tripletex2/research/packets/task-22/task-22-packet-2026-03-22T02-11-58-196Z.json:24), [packet](tasks/tripletex2/research/packets/task-22/task-22-packet-2026-03-22T02-11-58-196Z.json:43)).
   - Meanwhile the research text and current checked-in v1 already contain later edits such as NET-to-GROSS conversion, travel-priority VAT inference, `kundemote`, and `ø/æ` normalization ([RESEARCH](tasks/tripletex2/src/tasks/task-22/RESEARCH.md:216), [v1 strategy](tasks/tripletex2/src/tasks/task-22/strategies/receipt-expense-booking.ts:204), [v1 strategy](tasks/tripletex2/src/tasks/task-22/strategies/receipt-expense-booking.ts:518), [v1 strategy](tasks/tripletex2/src/tasks/task-22/strategies/receipt-expense-booking.ts:798)).
   - The proposal does not fully separate “current pinned source of truth” from “later critique-pass edits”, so its import set is less clean than it looks.

5. **Medium (+5): the proposal is only partially net-new relative to live Tripletex1, but it presents the import set as broader than that.**
   - The genuinely net-new parts are the defensive wording around `Bedriftskort` and bare `lunsj`; current Tripletex1 docs do not say those things ([trusted standard](tasks/tripletex/codex-environment/trusted-standards/register-receipt-expense-voucher.md:61), [playbook](tasks/tripletex/codex-environment/task-playbooks/register-receipt-expense-voucher.md:28)).
   - Import 1 is not a ready migration candidate; it is an unresolved contradiction between systems.
   - Import 2 is not a new verified rule either; it is a proposal to mark an existing Tripletex1 rule as uncertain.
   - That matters because the document is supposed to justify changes by production-score leverage, not by collecting interesting disagreements.

### Strengths

6. **Low (+1): the proposal’s adopt/hold split is directionally correct.**
   - It correctly refuses to port the NET-to-GROSS theory into Tripletex1 now and treats the ambiguous account-mapping question as unverified ([proposal](tasks/tripletex/docs/tripletex1-migration-queue/task-22.md:137)).
   - That is the right instinct for a score-sensitive migration review.

## Strengths and useful observations

- It correctly identifies that current Tripletex1 guidance never explains that `Betalt med: Bedriftskort` is a payment method rather than an expense-category signal, even though the live standard explicitly says these tasks involve company-card receipts ([trusted standard](tasks/tripletex/codex-environment/trusted-standards/register-receipt-expense-voucher.md:9)).
- It correctly notices that `Kundemøte lunsj` remains unproven in production either way; the cited Tripletex1 run does not validate the branch choice because booking failed first.
- It keeps focus on production score, not generic markdown cleanup.

## Net-new call

**Partially net-new.**

- **Yes, net-new:** `Bedriftskort` as payment-method-only guidance, and the “bare `lunsj` is ambiguous” warning.
- **Only weakly net-new:** `Kundemøte lunsj` as an uncertainty flag.
- **No, not a safe net-new import:** the NET-vs-GROSS theory. It is an unresolved evidence conflict, not a ready production port.

## Is the evidence strong enough for production-porting now?

**No for core production guidance.**

The evidence is not strong enough to rewrite Tripletex1’s amount/VAT treatment or branch table now. At most, it is strong enough for optional low-risk wording warnings about `Bedriftskort` and bare `lunsj`.

## Production score leverage score

**28/100**

Reasoning: the only likely safe imports are minor defensive warnings, while the dominant known blocker remains Check 3 amount/VAT treatment. Until that is production-resolved, these markdown tweaks have limited ceiling-moving power.

## Confidence

**84/100**

## Provisional recommendation

**needs verification**

## Suggested disposition

- Keep Import 1 on hold.
- Do not add the `Kundemøte lunsj` uncertainty note to the core branch table yet.
- If you want a very small, low-risk experiment, only port the `Bedriftskort` and bare `lunsj` warnings.
- Otherwise wait for a real production result that separates `8750` vs `9800`, and ideally one that directly tests `Kundemøte lunsj`.

## Score total

**36 points**

## Best insight in this task

**`Bedriftskort` is payment-method text, not an expense-category signal.** That is the cleanest low-risk import because it can only help branch selection and does not force a rewrite of the unresolved amount/VAT theory.
