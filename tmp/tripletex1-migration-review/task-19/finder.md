# Task 19 Review

## Concise proposal summary

The proposal argues that Tripletex1 should import nothing from Tripletex2 for task 19 because the live Tripletex1 onboarding surfaces already contain the important fixes: standard worktime, occupation-code mappings, payrollTaxMunicipalityId, email extraction, employeeNumber/employmentId, and department reuse. It concludes that T2 is behind T1, that the remaining task-19 gap is still Check 10 with unknown cause, and that the right action is effectively "hold/no-op".

## Candidate findings

### 1. Weakness — High impact — This is not actually a migration proposal; it is a no-op status report.

- Evidence:
  - The proposal ends with no changes to the targeted surfaces: `tasks/tripletex/docs/tripletex1-migration-queue/task-19.md:75-99`.
  - The live Tripletex1 surfaces already contain the cited rules for standard worktime, payrollTaxMunicipalityId, employeeNumber/employmentId, email, department reuse, deep verification, and the occupation-code table: `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:18-138`, `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:13-97`.
- Why it matters for production score:
  - Under the stated judging axis, queue space should go to score-moving imports. This task proposes no markdown delta and identifies no new scorer-relevant evidence. That makes it poor migration-queue material even if its diagnosis is mostly right.

### 2. Weakness — Medium impact — "Gaps identified: None" overstates current certainty and undersells remaining frontier risk.

- Evidence:
  - The proposal claims no gaps and says task 19 is comprehensively covered: `tasks/tripletex/docs/tripletex1-migration-queue/task-19.md:27-43`.
  - The live docs still explicitly say task 19 Check 10 remains unknown: `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:62-63`, `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:89-97`, `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:127-130`.
  - The live playbook also shows a later task-19 run with `employeeNumber="1"` and `employmentId="1"` but no scored result yet (`?/22`), so even some recent additions are not fully closed out for task 19: `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:164-166`.
- Why it matters for production score:
  - The proposal's conclusion "nothing to import" may still be correct, but "no gaps" is too strong. The remaining unknown is exactly where the missing 2 raw points live.

### 3. Weakness — Low impact — The dismissal of T2 normalization as completely non-importable is too absolute.

- Evidence:
  - The proposal rejects all normalization logic as code-only and not worth porting to markdown: `tasks/tripletex/docs/tripletex1-migration-queue/task-19.md:61-66`.
  - T2 v3 does contain a few compact, markdown-portable guards with some prompt-level value: date normalization, `mailto:`/`<...>` email cleanup, enum coercions like `FASTLONN -> MONTHLY_WAGE`, `FAST_STILLING -> PERMANENT`, `DAGTID -> NOT_SHIFT`, and `0.8 -> 80`: `tasks/tripletex2/src/tasks/task-19/strategies/onboard-employee-from-contract-v3.ts:198-237`, `tasks/tripletex2/src/tasks/task-19/strategies/onboard-employee-from-contract-v3.ts:263-285`.
  - Tripletex1 already covers part of this, especially percentage handling and email extraction: `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:51-55`, `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:177-181`.
- Why it matters for production score:
  - I do not think this is a must-port item, but "none of this is importable" is overstated. The only plausible net-new delta here is a tiny handful of concrete normalization examples, not a full port.

### 4. Strength — Medium impact — The proposal is correct to reject T2's direct-POST-department branch for shared Tripletex1 docs.

- Evidence:
  - T2 v3 assumes fresh accounts and skips the department search: `tasks/tripletex2/src/tasks/task-19/RESEARCH.md:52-62`, `tasks/tripletex2/src/tasks/task-19/strategies/onboard-employee-from-contract-v3.ts:75-87`, `tasks/tripletex2/src/tasks/task-19/strategies/onboard-employee-from-contract-v3.ts:112-118`.
  - Tripletex1's live standard explicitly says GETs are free and search-first is required because duplicate departments can cost points; task 21 already proved this in production: `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:57-67`, `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:17-21`, `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:89-95`.
- Why it matters for production score:
  - This is the proposal's strongest substantive call. A task-19-local sandbox optimization is not safe to port into the shared onboarding standard, and the score model does not reward the skipped GET anyway.

### 5. Strength — Medium impact — The proposal is correct that T2's "Check 10 = standard worktime" theory is stale.

- Evidence:
  - T2 research formed the hypothesis from only two early runs where standard worktime was omitted: `tasks/tripletex2/src/tasks/task-19/RESEARCH.md:24-43`.
  - Tripletex1 later recorded task-19 production evidence with standard worktime included and Check 10 still failing: `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:62-63`, `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:90-97`, `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:164-165`.
- Why it matters for production score:
  - This correctly prevents a false positive import. The hypothesis may have been useful earlier, but it is not frontier evidence anymore.

### 6. Strength — Low impact — The proposal correctly identifies that the 3313/3323 occupation-code corrections are already absorbed.

- Evidence:
  - The proposal flags these as already present: `tasks/tripletex/docs/tripletex1-migration-queue/task-19.md:68-73`.
  - The live trusted standard and playbook already contain both corrected mappings and the failed wrong mappings: `tasks/tripletex/codex-environment/trusted-standards/onboard-employee.md:195-209`, `tasks/tripletex/codex-environment/task-playbooks/onboard-employee.md:37-49`.
- Why it matters for production score:
  - Correct call, but low leverage because it confirms the absence of delta rather than creating one.

## Explicit calls

- Net-new? No. The proposal does not surface a scorer-relevant Tripletex2 import that is both absent from Tripletex1 and supported strongly enough to port.
- Evidence strong enough for production-porting now? No. The evidence is strong enough to reject the proposed imports, not to justify a new markdown change.
- Production score leverage score: 10/100.
- Confidence: 90/100.
- Provisional one-line recommendation: reject.

## Recommendation detail

If this queue is meant to prioritize production-score-moving ports, task 19 should not advance as written. The document is directionally correct that T2 is behind T1 here, but that means the right home for the conclusion is existing research memory, not a migration proposal slot. The only remotely importable residue is a very small normalization note, and even that looks low-value relative to the unresolved Check 10 frontier.

## Best insight in this task

No high-value net-new import exists here. If forced to extract one marginal idea, it is to add one or two concrete normalization examples to the live onboarding docs, such as `0.8 -> 80` and `Fastlønn -> MONTHLY_WAGE`, as cheap protection for multilingual extraction drift.

## Score

- Finding 1: +10
- Finding 2: +5
- Finding 3: +1
- Finding 4: +5
- Finding 5: +5
- Finding 6: +1
- Total: 27
