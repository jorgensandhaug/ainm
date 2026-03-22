# Task 19 — Onboard employee from contract (arbeidskontrakt)

**Status: review-ready**

## Snapshot
- Tripletex1 current best score: 20/22 (2.7273/6) — Check 10 always fails, cause UNKNOWN
- Priority: Low (T1 is ahead of T2 on all fronts)
- Target Tripletex1 surface: `trusted-standards/onboard-employee.md`, `task-playbooks/onboard-employee.md`
- Source Tripletex2 materials reviewed:
  - `tasks/tripletex2/src/tasks/task-19/task.ts`
  - `tasks/tripletex2/src/tasks/task-19/RESEARCH.md`
  - `tasks/tripletex2/src/tasks/task-19/strategies/onboard-employee-from-contract-v3.ts`

## Task Identity Mapping

**Clean mapping. Both systems agree.**

| System | tx_task_id | Label | PDF type |
|--------|-----------|-------|----------|
| Tripletex1 | 19 | Onboard employee from contract | Arbeidskontrakt |
| Tripletex2 | 19 | Onboard employee from contract | Arbeidskontrakt |

No identity contamination for task 19 itself. However, see task-21.md for the broader 19/21/24 contamination history that affected T2's task-21 slot.

## Current Tripletex1 Coverage

Tripletex1's `onboard-employee.md` trusted standard and playbook cover task 19 comprehensively:

- **Rule 1 (remunerationType)**: MONTHLY_WAGE for arbeidskontrakt. Correct.
- **Rule 2 (standard worktime)**: Always POST /employee/standardTime, default 7.5h. Correct.
- **Rule 3 (occupation code)**: Full hardcoded STYRK-to-id mapping table (12 entries), wrong-mapping warnings, dynamic lookup pitfalls. Comprehensive.
- **Rule 4 (payrollTaxMunicipalityId)**: CONFIRMED for task 19 Check 5 (prod-21c3fea8). T2 v3 does NOT include this.
- **Rule 5 (employeeNumber/employmentId)**: Latest hypothesis for task 21 Check 5. Also applied to task 19.
- **Rule 6 (employmentType/workingHoursScheme)**: ORDINARY/NOT_SHIFT. Correct.
- **Rule 7 (email)**: Extract from PDF. CONFIRMED for Check 6.
- **Rule 8 (department reuse)**: GET-first, reuse if exists. CONFIRMED for task 21. Unresolved for task 19 but used as best practice.
- **Full flow**: Parallel GETs + conditional POST dept + POST employee + POST standardTime + verification readback. Complete.
- **Check mapping**: 15 checks fully mapped. Check 10 documented as UNKNOWN.
- **Production run history**: 8+ runs documented with detailed analysis.

**Gaps identified**: None. The T1 surface for task 19 is mature and well-evolved.

**Contradictions**: None internal to T1. T1 explicitly documents the remaining unknowns (Check 10 cause).

## Candidate Imports from Tripletex2

### Import 1 — T2 v3 "direct POST department" for fresh accounts
- Insight: T2 v3 skips the department GET and always POSTs directly, reasoning that production accounts are always fresh (no pre-existing departments).
- Why it seems new: T1 always does GET-first (Rule 8).
- Evidence: T2 sandbox-verified 4-call path with direct POST. (`tasks/tripletex2/src/tasks/task-19/RESEARCH.md`, line 56)
- Confidence: **Low / Do not import**
- Why: GETs are free in T1's scoring model — the GET costs nothing. T1's GET-first approach was CONFIRMED to fix Check 10 for task 21 (prod-cce321cd). For task 19, GET-first didn't help Check 10 either, but it does no harm. T2's approach is a call-count optimization that doesn't improve T1's scores and would regress task 21 if applied to the shared onboard-employee standard.

### Import 2 — T2 RESEARCH's "Check 10 = standard worktime" hypothesis
- Insight: T2 believes task 19 Check 10 tests whether POST /employee/standardTime was called.
- Why it seems new: T1 marks Check 10 as UNKNOWN.
- Evidence: T2 RESEARCH.md says both runs that failed Check 10 omitted standard worktime. Score reflection suggests "always set a default standard worktime." (`tasks/tripletex2/src/tasks/task-19/RESEARCH.md`, lines 36-43)
- Confidence: **Very low / Already contradicted**
- Why: T1 production run prod-42b9ad7f applied ALL fixes including standard worktime and STILL failed Check 10 (scored 20/22). T1 explicitly documents: "Check 10 remains UNKNOWN across ALL task 19 attempts. Accept 20/22 as current best." T2's hypothesis was formed before this evidence existed. Not importable.

### Import 3 — T2 v3 robust input normalization
- Insight: T2's strategy code includes extensive date parsing (ISO, European, natural-language, multi-locale months), email normalization (mailto: stripping, bracket extraction), enum coercion (Norwegian→English like "Fastlonn"→MONTHLY_WAGE, "Fast stilling"→PERMANENT, "Dagtid"→NOT_SHIFT), and percentage auto-correction (0.8→80).
- Why it seems new: T1's trusted standard doesn't explicitly document these coercion rules.
- Evidence: `tasks/tripletex2/src/tasks/task-19/strategies/onboard-employee-from-contract-v3.ts`, lines 198-328.
- Confidence: **Low / Not applicable to T1's surface**
- Why: This is code-level robustness for T2's typed strategy system. T1 operates via markdown prompts that instruct an LLM agent — the agent handles parsing natively. T1 already says "normalize mixed-language prompt dates" and "preserve prompt-provided Unicode names." Listing every date format in the trusted standard would not improve T1 scores. Not importable to markdown.

### Import 4 — T2's STYRK 3313 and 3323 mapping corrections
- Insight: STYRK 3313 should map to REGNSKAPSMEDARBEIDER (4677), not REGNSKAPSFORER (4672). STYRK 3323 should map to INNKJOPSASSISTENT (2507), not INNKJOPER (2503).
- Why it seems new: Corrects specific wrong mappings.
- Evidence: T2 RESEARCH.md lines 47-50; T2 task.ts extraction notes.
- Confidence: **Already present in T1**
- Why: T1's trusted standard already has both correct mappings AND explicitly documents the wrong ones with production failure evidence. See T1 trusted standard table and "Known WRONG mappings" section. Not new.

## Proposed Markdown Deltas

### AGENTS.md
- No changes proposed. The current onboard-employee gotchas (lines 308-310) are accurate and more complete than T2's guidance.

### Trusted standard (`onboard-employee.md`)
- No changes proposed. T1's coverage is comprehensive and ahead of T2 on payrollTaxMunicipalityId, employeeNumber/employmentId, email, and department reuse.

### Playbook (`onboard-employee.md`)
- No changes proposed. T1's playbook is aligned with the trusted standard.

## Risks / Caveats

- **Mapping ambiguity**: None for task 19. Clean mapping.
- **Conflicting evidence**: T2 believes Check 10 = standard worktime. T1 production data contradicts this. T1's conclusion (Check 10 cause UNKNOWN, ceiling 20/22) is better supported.
- **Not safe to port**: T2 v3's direct POST department approach would regress task 21 if applied to the shared standard. The T2 v3 strategy also lacks payrollTaxMunicipalityId, employeeNumber, employmentId, and email — all of which T1 has added based on production evidence that T2 hasn't incorporated yet.
- **T2 is behind T1**: T2's active strategy (v3, promoted 2026-03-22) was designed before T1 discovered payrollTaxMunicipalityId (Rule 4), employeeNumber/employmentId (Rule 5), email (Rule 7), and department reuse (Rule 8). T2's strategies don't include any of these. If anything, T2 would benefit from importing T1's findings, not the other way around.

## Recommendation

**Hold — no imports needed.**

T1's coverage for task 19 is more advanced than T2's. T2's strategies are based on earlier evidence and don't incorporate T1's confirmed production findings (payrollTaxMunicipalityId, email, department reuse). The only unresolved issue (Check 10 cause) is equally unsolved in both systems, and T2's hypothesis about it has been contradicted by T1 production evidence.

The task 19 scoring ceiling of 20/22 (2.7273/6) appears to be the current limit for both systems until Check 10's root cause is identified.
