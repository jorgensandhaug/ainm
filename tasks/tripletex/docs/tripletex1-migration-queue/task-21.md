# Task 21 — Onboard employee from offer letter (tilbudsbrev)

**Status: review-ready**

## Snapshot
- Tripletex1 current best score: 12/14 (2.5714/6) — Check 5 always fails, 15 total attempts by all participants, 0 passes
- Priority: Low (T1 is ahead of T2; T2's main hypothesis already disproven by T1 production data)
- Target Tripletex1 surface: `trusted-standards/onboard-employee.md`, `task-playbooks/onboard-employee.md`
- Source Tripletex2 materials reviewed:
  - `tasks/tripletex2/src/tasks/task-21/task.ts`
  - `tasks/tripletex2/src/tasks/task-21/RESEARCH.md`
  - `tasks/tripletex2/src/tasks/task-21/strategies/onboard-employee-offer-letter.ts`
  - `tasks/tripletex2/src/tasks/task-21/strategies/not-implemented.ts`

## Task Identity Mapping

**Clean mapping NOW, but historically contaminated in T2.**

| System | tx_task_id | Label | PDF type |
|--------|-----------|-------|----------|
| Tripletex1 | 21 | Onboard employee (offer letter) | Tilbudsbrev |
| Tripletex2 | 21 | Onboard employee from offer letter | Tilbudsbrev |

### CRITICAL: Historical task-identity contamination in T2

T2's task-21 slot was **miscoded as "Correct ledger errors"** until 2026-03-22. The entire T2 task.ts, strategy (`correct-ledger-errors.ts`), and active strategy pin (`21.correct-ledger-errors.v1`) were for the wrong task. "Correct ledger errors" is actually task 24.

Fixed 2026-03-22: T2 task.ts rewritten, strategy replaced with `onboard-employee-offer-letter.ts`, pin corrected.

**T1 was NOT affected by this contamination.** T1's trusted standard and playbook correctly identify task 21 as employee onboarding from tilbudsbrev. This contamination was T2-internal.

### Related contamination hazard (task 24)

T2 RESEARCH.md documents additional poisoned evidence:
- `prompt-corpus.jsonl` line 4 contains an invoice-creation prompt mislabeled as task 21 (actually task 08 material)
- Historical run reflections wrongly blame occupation codes for Check 5 failure
- Packet `historicalRuns` shows `apiCallCount: 0` because runs went through T1 (codex-environment), not T2

This audit is T2-internal and does not affect T1's surfaces, but it explains why T2's early task-21 research should be treated with caution.

## Current Tripletex1 Coverage

Tripletex1's `onboard-employee.md` trusted standard and playbook handle both task 19 and task 21 via a unified flow with task-specific callouts:

- **Rule 1 (remunerationType)**: MONTHLY_WAGE for both. T1 explicitly states NOT_CHOSEN was disproven (prod-fd3075b7 scored 12/14, identical to MONTHLY_WAGE runs). Correct based on production evidence.
- **Rule 2 (standard worktime)**: Always POST /employee/standardTime. Check 10 passes when called.
- **Rule 3 (occupation code)**: Full hardcoded mapping table includes all 6 tilbudsbrev job titles (Seniorutvikler, Regnskapssjef, HR-radgiver, Salgssjef, Kontormedarbeider, IT-konsulent) plus STYRK codes. Comprehensive.
- **Rule 4 (payrollTaxMunicipalityId)**: DISPROVEN for task 21 Check 5 (prod-cce321cd set municipality.id=262, still failed). Included anyway as best practice.
- **Rule 5 (employeeNumber/employmentId)**: Latest hypothesis for task 21 Check 5. Set "1" for fresh accounts. Sandbox-verified 2026-03-22. Awaiting production confirmation.
- **Rule 7 (email)**: Extract from PDF. Task 21 tilbudsbrev doesn't contain email — T1 implicitly handles this.
- **Rule 8 (department reuse)**: GET-first, reuse if exists. CONFIRMED for task 21 Check 10 (prod-cce321cd, first pass ever).
- **Check 5 analysis**: T1 documents 15 total attempts, 0 passes. Exhaustive elimination of hypotheses (payrollTaxMunicipalityId, employmentType, workingHoursScheme, remunerationType, occupation code, hidden API fields, separate POST details, taxDeductionCode, employeeCategory, address). Current hypothesis: employeeNumber/employmentId.
- **Check mapping**: 10 checks fully mapped with weights.
- **Production run history**: 7+ runs documented with cross-run analysis.

**Gaps**: None significant. T1 has exhaustively analyzed Check 5 and is currently testing the employeeNumber/employmentId hypothesis.

**Contradictions**: None internal to T1.

## Candidate Imports from Tripletex2

### Import 1 — T2's "remunerationType = NOT_CHOSEN" as Check 5 fix
- Insight: T2 RESEARCH.md asserts that remunerationType must be NOT_CHOSEN for tilbudsbrev because the PDF has no "Lonnstype" field. Claims this fixes Check 5.
- Why it seems new: T2 considers this confirmed with "strong evidence."
- Evidence: T2 RESEARCH.md lines 42-54. Tilbudsbrev PDF decoded. Three runs with different occupation codes all fail Check 5, suggesting it's not about occupation code. (`tasks/tripletex2/src/tasks/task-21/RESEARCH.md`)
- Confidence: **Already disproven by T1 production data**
- Why: T1 explicitly tested NOT_CHOSEN in production (prod-fd3075b7) and scored identically at 12/14 with Check 5 still failing. T1's Rule 1 says: "5 production runs tested both values and both scored identically (12/14). Check 5 is NOT about remunerationType." T2's hypothesis was formed before this production test and lacks the falsification data. Not importable.

### Import 2 — T2's decoded tilbudsbrev PDF field structure
- Insight: T2 enumerates the exact fields present in the tilbudsbrev PDF: Kjaere [Name], Stilling (job title), Avdeling (department), Fodselsdato (DOB, DD.MM.YYYY), Tiltredelse (start date), Ansettelsesform (employment form), Stillingsprosent (percentage), Arslonn (salary), Arbeidstid (hours/day). Explicitly NOT present: Lonnstype, email, personnummer, bankkontonummer, STYRK code.
- Why it seems new: T1's trusted standard covers the implications (no email/NIN/bank, remunerationType handling) but doesn't enumerate the raw Norwegian field names from the PDF.
- Evidence: T2 RESEARCH.md lines 27-40. (`tasks/tripletex2/src/tasks/task-21/RESEARCH.md`)
- Confidence: **Low — marginally useful but operationally redundant**
- Why: T1's trusted standard already captures the key implication: tilbudsbrev lacks Lonnstype, email, NIN, and bank account. The T1 agent's task is to extract data from the PDF; enumerating the Norwegian field names in the trusted standard would add reference value but wouldn't change extraction behavior since the LLM agent can already read the PDF natively. The fields are also documented in T2's `task.ts` field descriptions (line 56-67) and extraction notes (line 69-75). If T1 ever adds a "PDF field reference" subsection, these names would be appropriate content.

### Import 3 — T2's occupation code mappings for tilbudsbrev
- Insight: T2 documents 6 job-title-to-occupation-code mappings specific to tilbudsbrev: Seniorutvikler->5935, Regnskapssjef->4679, HR-radgiver->4169, Salgssjef->4930, Kontormedarbeider->2951, IT-konsulent->2610.
- Why it seems new: These are tilbudsbrev-specific (by job title rather than STYRK code).
- Evidence: T2 task.ts line 56, RESEARCH.md lines 88-97.
- Confidence: **Already present in T1**
- Why: T1's trusted standard and playbook both contain the identical 6-entry mapping table under "Occupation Code Hardcoded Mappings" (job-title rows). Not new.

### Import 4 — T2's task-identity contamination audit
- Insight: T2 documents that task 21 was miscoded as "correct ledger errors" (actually task 24), and that multiple evidence sources were poisoned (prompt-corpus line 4, historical reflections, strategy pins).
- Why it seems new: T1 has no record of this contamination history.
- Evidence: T2 RESEARCH.md lines 56-86. (`tasks/tripletex2/src/tasks/task-21/RESEARCH.md`)
- Confidence: **Informational / already reflected in this queue file**
- Why: This contamination was T2-internal and never propagated to T1. Documenting it here (Task Identity Mapping section above) is sufficient. No T1 surface change needed.

### Import 5 — T2's "no post-fix production run yet" status
- Insight: T2 RESEARCH.md acknowledges that the NOT_CHOSEN fix has no production confirmation yet.
- Why it seems new: Shows T2 is aware the hypothesis is unverified.
- Evidence: T2 RESEARCH.md line 139-140.
- Confidence: **Moot — T1 already has the production data that disproves it**
- Why: T1 ran the production test (prod-fd3075b7) before T2's strategy was even implemented. The information asymmetry runs in the opposite direction here — T2 needs T1's production evidence, not the other way around.

## Proposed Markdown Deltas

### AGENTS.md
- No changes proposed. The onboard-employee gotchas at line 308 already cover task 21 correctly with the latest Rule 5 hypothesis.

### Trusted standard (`onboard-employee.md`)
- No changes proposed. T1's coverage is comprehensive and ahead of T2. All T2 insights are either already present or disproven by T1.

### Playbook (`onboard-employee.md`)
- No changes proposed.

### Optional future addition (low priority)
- If T1 ever adds a "Tilbudsbrev PDF Reference" subsection to the trusted standard, the Norwegian field names from T2's RESEARCH.md (Import 2) could provide useful reference material: Stilling, Avdeling, Fodselsdato (DD.MM.YYYY), Tiltredelse, Ansettelsesform, Stillingsprosent, Arslonn, Arbeidstid.

## Risks / Caveats

- **Mapping ambiguity**: None for task 21 currently. Both systems agree. Historical contamination in T2 (task 21 was miscoded as task 24 / "correct ledger errors") is resolved.
- **Cross-task contamination**: The broader 19/21/24 contamination zone in T2 means any T2 research labeled "task 21" from before 2026-03-22 should be treated with extreme caution — it likely refers to task 24 (correct ledger errors), not task 21 (tilbudsbrev onboarding). T1 was not affected.
- **Conflicting evidence on remunerationType**: T2 says NOT_CHOSEN fixes Check 5. T1 production data says it doesn't. T1's evidence is stronger (actual production run vs hypothesis). Do not import T2's NOT_CHOSEN recommendation.
- **T2 is behind T1**: T2's active strategy (v1) uses remunerationType=NOT_CHOSEN (disproven), direct POST department (suboptimal — misses department reuse), and lacks payrollTaxMunicipalityId, employeeNumber/employmentId, and email extraction. T2 would benefit from T1's findings.
- **Check 5 may be unfixable**: T1 notes that if the employeeNumber/employmentId hypothesis fails in production, Check 5 may be impossible to pass via the current API. The ceiling would be 12/14 (2.5714/6). T2 hasn't reached this analytical depth.

## Recommendation

**Hold — no imports needed.**

T1's coverage for task 21 is more advanced than T2's across every dimension:
- T1 has tested and disproven T2's main hypothesis (NOT_CHOSEN)
- T1 has a more sophisticated Check 5 hypothesis (employeeNumber/employmentId) based on exhaustive elimination
- T1 has confirmed production fixes that T2 hasn't incorporated (department reuse for Check 10, payrollTaxMunicipalityId for task 19 cross-applicability)
- T1's occupation code mappings are already complete
- T1's production run analysis is deeper (15 attempts across all participants, cross-run correlation)

The only potentially useful content from T2 is the decoded tilbudsbrev field names, which is cosmetic — it would not change T1 agent behavior or scores.
