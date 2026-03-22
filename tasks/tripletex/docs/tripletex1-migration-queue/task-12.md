# Task 12 — Run Employee Payroll

**Status: `review-ready`**

## Snapshot
- Tripletex1 current best score: 2.333/4.0 (production run 2b1b0da1, 2026-03-21; 11 calls, 0 errors, 4/4 checks); 8-call optimized path production-confirmed on 2026-03-22 (08a38984, 0 errors, 4/4 checks)
- Priority: low for T2→T1 migration — T1 coverage is comprehensive and ahead of T2 in every material dimension
- Target Tripletex1 surface: `AGENTS.md` (lines 362, 366–367, 410–416)
- Source Tripletex2 materials reviewed:
  - `tasks/tripletex2/src/tasks/task-12/RESEARCH.md` — skeleton; bestKnownScore 0/4, priority 10, band "focus", lane "hard-research"
  - `tasks/tripletex2/src/tasks/task-12/task.ts` — well-typed task spec, maps txTaskId "12" to "Run payroll with bonus"
  - `tasks/tripletex2/src/tasks/task-12/strategies/repair-aware-payroll.ts` — single strategy, status "draft"
  - `tasks/tripletex2/src/tasks/task-12/README.md` — stub; references T1 trusted standard as the intended solve path
  - `tasks/tripletex2/research/task-queue.json` — taskId "12", priority 10, bestKnownScore 0, maxScore 4
  - `tasks/tripletex2/configs/active-strategies.json` — pin: `12.repair-aware-payroll.v1`
  - No verification artifacts, packets, or run records exist for task 12 in `tasks/tripletex2/research/`

## Task Identity Mapping

Tripletex2 task-12 maps to tx_task_id 12 (confirmed via `task.ts` line 8–9: `RUN_PAYROLL_WITH_BONUS_TASK_ID = "12"`, `RUN_PAYROLL_WITH_BONUS_TX_TASK_ID = "12"`). No mapping ambiguity.

## Current Tripletex1 Coverage

### Trusted standard (`run-employee-payroll.md`) says:
- GETs are free — only writes count toward efficiency score
- Payroll-ready branch: **2 writes** (POST /salary/transaction + POST /ledger/voucher)
- Underconfigured branch: **5 writes** (POST /division, PUT /employee, POST /employment with inline employmentDetails, POST /salary/transaction, POST /ledger/voucher)
- Step 1 parallelizes all 4 free reads: GET /employee + GET /salary/type + GET /ledger/account + GET /ledger/voucherType
- Always POST /division (skip GET /division); always use voucherType { id } (not { name }); always use amountGross/amountGrossCurrency (not amount); always include row field on voucher postings; always use generateTaxDeduction=true
- DEPRECATED: manual-voucher fallback creates no payslip → scores 0 on payslip checks
- Sandbox proof 2026-03-22: 5 writes, 0 errors, 14/14 checks; voucherType correctly persisted via { id }
- Production proofs: 08a38984 (8 calls, 0 errors, 4/4 checks), 2b1b0da1 (11 calls, 2.333/4.0, 4/4 checks including Check 5 ledger entries)

### Playbook (`run-employee-payroll.md`) says:
- Extensive production and sandbox proof trail from 2026-03-20 through 2026-03-22
- 13+ production run citations with specific employee emails, amounts, and run ids
- Documents the evolution from 0/8 → 2.333/4.0 and the discovery of division-create, inline employmentDetails, voucherType by id, row field, amountGross
- Includes recommended JSON payload shape

### AGENTS.md says:
- Lines 130, 185, 207: routing table entries mapping "Run employee payroll" to the trusted standard and playbook
- Lines 362–367: payroll-specific guidance (partially superseded — see Import 1 below)
- Lines 410–416: task-12 investigation findings from 2026-03-20 (dateOfBirth=null not a hard stop, WAGE already active, conditional GET /employee/employment, department trap)

### Important: T1 coverage is comprehensive
The trusted standard alone is 199 lines with 15+ sandbox/production proofs. The playbook adds 280+ lines of verified findings. Together they cover every branch (payroll-ready, underconfigured, department retry), every API constraint (salaryType by id only, account by id only, voucherType by id for persistence, row field, amountGross, remunerationType for monthlySalary, inline employmentDetails), and every known pitfall.

## Candidate Imports from Tripletex2

### Import 1: AGENTS.md internal contradiction on GET /division vs POST /division
- **Insight:** AGENTS.md line 362 says: "the decisive next call is always `GET /division?count=1&fields=*` before `GET /salary/type`." But AGENTS.md line 366 says: "SUPERSEDED: ... always use this division-create path for underconfigured employees, skip `GET /division` entirely." An agent reading line 362 first may follow the old path (GET /division first), wasting a round and risking the manual-voucher fallback when GET /division returns empty.
- **Why it seems new:** The trusted standard is internally consistent (always POST /division, never GET), but AGENTS.md still carries the older guidance on line 362 alongside the supersession notice on line 366. This is the same pattern as the task-13 perDiem contradiction — an older AGENTS.md entry not updated when the trusted standard was rewritten.
- **Evidence:**
  - `AGENTS.md` line 362: "the decisive next call is always `GET /division?count=1&fields=*`"
  - `AGENTS.md` line 366: "SUPERSEDED: ... skip `GET /division` entirely"
  - `trusted-standards/run-employee-payroll.md` line 34: "skip `GET /division` and always create a new division"
  - `trusted-standards/run-employee-payroll.md` line 61: "skip GET — always POST directly (harmless duplicate)"
- **Confidence:** High. The contradiction exists. The trusted standard's POST-always approach is sandbox-verified (2026-03-22, 5 writes, 14/14 checks) and production-proven (08a38984, 8 calls, 0 errors). The old GET-first approach wastes 1 round and can dead-end when no pre-existing division exists.

### Import 2: No net-new T2 strategy insights for T1
- **Insight:** T2's only strategy (`12.repair-aware-payroll.v1`, status "draft", 0/4 score) is materially behind T1's trusted standard in every critical dimension. No T2→T1 import is warranted from the strategy code.
- **Why this is worth documenting:** Prevents future migration agents from re-investigating T2 task-12 looking for imports that don't exist.
- **Evidence — T2 strategy gaps vs T1 trusted standard:**

| Dimension | T1 trusted standard | T2 strategy (`repair-aware-payroll.ts`) |
|-----------|--------------------|-----------------------------------------|
| Lønnsbilag voucher | Always created in parallel with salary tx (line 42–44) | **Missing entirely** — `runPayroll()` (lines 510–631) does POST /salary/transaction only; no POST /ledger/voucher; Check 5 (ledger entries) would fail |
| Division creation | Always POST /division, skip GET (line 34, 61) | **Still uses GET /division** (lines 161–170); falls back to manual voucher when empty (lines 172–253) |
| Manual voucher fallback | **DEPRECATED** — creates no payslip, scores 0 (line 70, 190) | **Still implemented** as primary fallback (lines 172–253, 360–441); voucherType: null |
| generateTaxDeduction | Always `?generateTaxDeduction=true` (line 43, 89) | **Missing** — POST /salary/transaction has no query param (line 687–689) |
| Inline employmentDetails | Always included in POST /employment (line 40, 63, 72) | **Missing** — POST /employee/employment has no employmentDetails[] (lines 270–285) |
| Parallel reads in step 1 | 4 free reads in Promise.all: employee + salary/type + account + voucherType (line 29, 55) | **Sequential** — GET /employee first (lines 143–152), GET /salary/type later (lines 523–531) |
| voucherType resolution | By id from free GET (line 44, 92–93) | **Not applicable** — no voucher created in payroll path |
| amountGross on postings | Required on all voucher postings (line 46–47, 96) | Only used in manual-voucher fallback (lines 209–210) |
| Row field on postings | Required starting from 1 (line 46, 95) | Present in manual-voucher fallback only (lines 203, 213) |

- **Confidence:** High. All gaps are directly observable in the strategy source code. The T2 RESEARCH.md confirms bestKnownScore=0/4 and the README.md says "The intended deterministic solve path should follow `codex-environment/trusted-standards/run-employee-payroll.md` when this task gets a real strategy implementation."

## Proposed Markdown Deltas

### AGENTS.md
- **Proposed change:** Remove or update line 362 to align with the superseded guidance on line 366 and the trusted standard. Specifically, replace "the decisive next call is always `GET /division?count=1&fields=*` before `GET /salary/type`" with guidance that directs to the trusted standard's POST-always approach.
- **Reason:** Line 362 contradicts both line 366 (which explicitly supersedes it) and the trusted standard. An agent reading AGENTS.md top-down will encounter line 362 before the supersession notice on line 366, potentially following the stale path. Removing this stale guidance eliminates a confusion vector similar to the task-13 perDiem contradiction.

### Trusted standard
- **Target file:** `trusted-standards/run-employee-payroll.md`
- **Proposed change:** None. The trusted standard is comprehensive, internally consistent, and production-verified.
- **Reason:** No net-new insights from T2 to import.

### Playbook
- **Target file:** `task-playbooks/run-employee-payroll.md`
- **Proposed change:** None.
- **Reason:** No net-new insights from T2 to import.

## Risks / Caveats
- **Mapping ambiguity:** None. T2 task 12 = tx_task_id 12 = "Run payroll with bonus", which is exactly T1's "Run employee payroll" task shape.
- **Conflicting evidence:** None between T1 and T2. T2 is simply behind T1 on this task.
- **Not safe to port yet:** The T2 strategy itself should not be used as a reference for T1 improvements — it would regress T1's current score. T2 needs to import FROM T1's trusted standard before its strategy can be competitive.
- **Weak evidence disclaimer:** T2's RESEARCH.md for task 12 is a skeleton with no frontier analysis, no production runs consulted, and no anti-patterns recorded. The task-queue.json notes only "Huge upside but likely heavier work." There is no T2 sandbox or production evidence for this task beyond the strategy source code.

## Recommendation
- **AGENTS.md line 362 fix: Adopt now.** Internal contradiction is clear, trusted standard is authoritative, and the stale line 362 guidance can mislead agents into the deprecated GET-first path. This is the same class of bug as task-13's perDiem contradiction.
- **All other surfaces: No action.** T1 is ahead of T2 on task 12. No T2→T1 imports are warranted until T2 produces production-scored evidence at or above T1's current 2.333/4.0 frontier.
