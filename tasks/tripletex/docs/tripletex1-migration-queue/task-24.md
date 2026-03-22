# Task 24 — Correct Ledger Errors

**Status: `superseded`** — T1 independently solved all T2-identified blockers. No import needed.

## Snapshot
- Tripletex1 current best score: **6/6** (4+ consecutive perfect runs: 463433ee, d9638f91, 1d00ce6b, ce448e6b)
- Priority: **NONE** — T1 is at maximum score; no improvement possible
- Target Tripletex1 surface: `trusted-standards/correct-ledger-errors.md`, `AGENTS.md` lines 516-518
- Source Tripletex2 materials reviewed:
  - `tasks/tripletex2/src/tasks/task-24/RESEARCH.md` (254 lines)
  - `tasks/tripletex2/docs/pitfalls-tasks-20-24.md` (cross-task analysis)
  - `tasks/tripletex2/src/tasks/task-24/strategies/correct-ledger-errors.ts` (broken, hardcoded)
  - `tasks/tripletex2/src/tasks/task-24/strategies/correct-ledger-errors-v3.ts` (draft, never executed)

## Task Identity Mapping
Tripletex2 task-24 maps to tx_task_id 24. No ambiguity.

## What T2 Found (the "major unmined insight")

T2's deep analysis identified two critical blockers for task 24:

### Blocker 1: Hardcoded values don't match prompt parameters
T2's strategy used hardcoded constants:
```
WRONG_ACCOUNT_SOURCE = 7300, TARGET = 7000, AMOUNT = 7800
DUPLICATE_ACCOUNT = 6860, AMOUNT = 3500
MISSING_VAT_ACCOUNT = 6500, NET = 18350
WRONG_AMOUNT_ACCOUNT = 7300, RECORDED = 15000, CORRECT = 10050
```
These never matched production prompts, where all 10 parameters are randomized per run.

### Blocker 2: Wrong VAT correction approach
T2's strategy posted `expense account + vatType:{id:1}` for missing VAT corrections. Tripletex interprets this as GROSS (VAT-inclusive), auto-generating only 1/5 of the expected 2710 amount. Example: posting `amountGross=4587.50` on expense account with vatType=1 → Tripletex auto-generates 2710=917.50, but scorer expects 2710=4587.50.

### T2's proposed fixes (v3 challenger, never executed)
1. Extract 10 error parameters from prompt via regex at strategy runtime
2. Direct 2710 posting (no expense account, no vatType auto-generation)
3. Filter for vouchers WITHOUT 2710 posting to find the error voucher
4. Copy vatType from original posting, don't hardcode

## Current Tripletex1 coverage — ALL BLOCKERS ALREADY SOLVED

T1's `correct-ledger-errors.md` (465 lines, updated 2026-03-22) already has every fix T2 proposed:

| T2 finding | T1 status | T1 location |
|---|---|---|
| **Hardcoded values** | FIXED — template extracts 10 params from prompt | `correct-ledger-errors.md` lines 13-31 |
| **Wrong VAT approach** | FIXED — direct 2710 posting, explicit "NEVER use expense + vatType=1" | `correct-ledger-errors.md` lines 264-276, pitfall #5 |
| **VAT voucher detection** | FIXED — 4-layer algorithm (vatType=0 → no-2710 → description → amount) | `correct-ledger-errors.md` lines 190-259 |
| **vatType propagation** | FIXED — copies from original posting | `correct-ledger-errors.md` lines 146-149, 289 |
| **Supplier on 2400** | FIXED — propagates supplier.id from original | `correct-ledger-errors.md` lines 273-274 |

AGENTS.md line 518 mandates: "DO NOT write your own detection — copy the mandatory code block from the trusted standard verbatim."

### Production evidence (T1)
| Run | Score | Notes |
|---|---|---|
| 463433ee | 6/6 | Layer 3 edge case: all MV candidates had vatType=1 + has2710; "uten MVA" description matched |
| d9638f91 | 6/6 | Layer 3 matched again; supplier.id correctly propagated on 2400 contra |
| 1d00ce6b | 6/6 | German (de) prompt; voucher descriptions always Norwegian regardless of prompt language |
| ce448e6b | 6/6 | German (de) prompt; DUP_ACCT=WA_ACCT=6860, distinguished by amount |

### T2 production evidence (all runs used T1's codex agent)
T2's RESEARCH.md (line 106-113) notes: "Runs executed via legacy codex agent (tripletex1), not tripletex2 deterministic strategy." This means T1's production 6/6 runs ARE the data — T2 never ran its own strategy for task 24.

## Candidate imports from Tripletex2

### Import 1: None — prompt extraction already in T1
T2's v3 strategy proposed regex extraction from `ctx.request.prompt`. T1's trusted standard (lines 13-31) already tells the agent to extract 10 named parameters. The approaches differ in mechanism (code regex vs markdown instruction to an LLM agent) but achieve the same result. T1's approach is production-proven at 6/6.

### Import 2: None — direct 2710 posting already in T1
T1 pitfall #5 (line 409) explicitly says "Missing-VAT: expense + vatType:{id:1} → Auto-generates wrong 2710 amount (too low) → Post directly on account 2710." Lines 264-276 implement this.

### Import 3: None — 4-layer detection already in T1
T1 lines 190-259 implement the exact same algorithm T2 proposed, with all 4 layers plus the pickFromPool helper. T2's v3 had `!hasAccount(voucher, 2710)` as the primary filter; T1 uses it as Layer 2 with posting-level vatType=0 as Layer 1 (strictly more robust, handles the Layer 3 edge case where error vouchers have vatType=1).

## Why T2's framing as "major unmined insight" is outdated

T2's RESEARCH.md was written during the period when task 24 was stuck at 2.25/6 (Check 3 always failing). The two blockers it identified were real. But T1 independently solved both blockers through its own production iteration cycle:

1. The hardcoded-values problem was solved by rewriting the trusted standard as a fill-in-the-blanks template (lines 13-31, 48-61)
2. The wrong-VAT-approach was solved by switching to direct 2710 posting (lines 264-276)
3. The detection problem was solved by the 4-layer algorithm (lines 190-259)

T2's v3 challenger strategy was drafted but **never executed end-to-end** (RESEARCH.md line 224: "verification blocked"). Meanwhile, T1's template achieved 4 consecutive 6/6 runs in production.

## Risks / caveats
- **No mapping ambiguity.** Task 24 is unambiguous.
- **No conflicting evidence.** T1 and T2 agree on root causes; T1 simply fixed them first.
- **T2 classifier confusion between tasks 21/24** (both named "Correct ledger errors" in old corpus) is T2-specific and doesn't affect T1's routing.

## Recommendation
- **No import needed.** T1 is at 6/6 with 4+ consecutive perfect runs. All T2-identified blockers are already fixed in the T1 trusted standard.
- **Prune from queue.** This entry exists to document the analysis and prevent re-investigation.

---

## Appendix: T2 Findings for Tasks 20-22 (Also No Import Needed)

For completeness, the T2 research also covered tasks 20-22. None require imports:

### Task 20 — Register Supplier Invoice with PDF
T2 found: missing booking step (`sendToLedger=true`), PDF attachment never uploaded, 6-call path.
T1 status: `register-supplier-invoice-from-pdf.md` already has the full 5-step flow (POST supplier → GET account → POST importDocument → PUT postings → PUT book). Booking step is step 5. importDocument auto-generates PDF attachment (T1 explicitly says "Do NOT upload the original PDF"). **No import needed.**

### Task 21 — Onboard Employee from Offer Letter
T2 found: `remunerationType: "NOT_CHOSEN"` for tilbudsbrev (offer letters without Lønnstype field).
T1 status: **DISPROVED.** `onboard-employee.md` Rule 1: "The remunerationType NOT_CHOSEN hypothesis was disproven — 5 production runs tested both values and both scored identically (12/14). Check 5 is NOT about remunerationType." T1 uses MONTHLY_WAGE. T1's current hypothesis for Check 5 is `employeeNumber`/`employmentId` (Rule 5). **No import needed; T2 finding is wrong per T1 production evidence.**

### Task 22 — Register Receipt Expense Voucher
T2 found: receipt prices are NET; GROSS = NET × statutory VAT rate (12% transport, 25% general).
T1 status: **DISPROVED.** `register-receipt-expense-voucher.md` lines 43-58: "Receipt line amounts are GROSS (VAT-inclusive). Use the line amount directly as amountGross. Do NOT multiply." Production evidence: run e89025d1 multiplied Tastatur 6900 × 1.25 = 8625 → Check 3 FAILED. Correct amountGross = 6900. T1's sandbox verification (lines 309-318) confirmed GROSS interpretation across all 4 branches. **No import needed; T2 finding contradicted by T1 production evidence.**
