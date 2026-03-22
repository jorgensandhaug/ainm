# Task 13 — Register Travel Expense

**Status: `review-ready`**

## Snapshot
- Tripletex1 current best score: 4.5/8 (checks 1+4+5 pass, checks 2+3+6 consistently fail — 22+ production runs)
- Priority: high — score gap = 3.5 points, consistent failure pattern across all runs
- Target Tripletex1 surface: `trusted-standards/register-travel-expense.md`, `task-playbooks/register-travel-expense.md`, `AGENTS.md` (lines 475-489)
- Source Tripletex2 materials reviewed:
  - `tasks/tripletex2/src/tasks/task-13/RESEARCH.md`
  - `tasks/tripletex2/src/tasks/task-13/README.md`
  - `tasks/tripletex2/src/tasks/task-13/task.ts`
  - `tasks/tripletex2/src/tasks/task-13/strategies/create-and-deliver-travel-expense-v3.ts`

## Task Identity Mapping

Tripletex2 task-13 maps to tx_task_id 13 (confirmed via `task.ts`: `REGISTER_TRAVEL_EXPENSE_TX_TASK_ID = "13"`). No mapping ambiguity.

## Current Tripletex1 Coverage

### Trusted standard (`register-travel-expense.md`) says:
- **Do NOT create perDiemCompensations** — ROOT CAUSE FIX (added 2026-03-22)
- Set `isCompensationFromRates: false` and omit `perDiemCompensations` entirely
- Evidence: 24 production runs ALL scored 4.5/8 with perDiems present
- vatType on costs = category default (`costCategory.vatType.id`, typically 12 for Fly/Taxi), fallback to `{ id: 0 }` on VAT_NOT_REGISTERED
- Full 9-round flow: parallel GETs → conditional company GET → POST → readback → deliver → approve → createVouchers → final readback → voucher postings
- Sandbox verification on 2026-03-22: E2E without perDiems = 0 errors, isCompleted=true

### Playbook (`register-travel-expense.md`) says:
- Mirrors the trusted standard closely (same flow, same rules)

### AGENTS.md (lines 475-489) says — **CONTRADICTS the trusted standard on perDiems:**
- "Do NOT set `rate` on perDiemCompensations" (implies perDiems SHOULD be created)
- "`count` = OVERNIGHTS (days - 1), NOT days" (specific per-diem rule)
- "Use hardcoded rateType IDs" with specific IDs (25886, 25887, 25888)
- "Required at POST: `isCompensationFromRates: true`"
- Travel-expense flow includes perDiemCompensations in the POST body

### **CRITICAL: AGENTS.md and Trusted Standard contradict each other**

| Aspect | Trusted Standard (2026-03-22) | AGENTS.md |
|--------|-------------------------------|-----------|
| perDiemCompensations | Omit entirely | Include with specific rules |
| isCompensationFromRates | `false` | `true` |
| GET /travelExpense/rate | Not needed | "DO NOT call" (but implies rate lookup is relevant) |
| Evidence | 24 runs with perDiems = 4.5/8 | No counter-evidence for no-perDiem approach |

The trusted standard was updated more recently (2026-03-22) with the "root cause fix" to remove perDiems. AGENTS.md still carries the older guidance. **An agent reading both could get confused about whether to include perDiems.**

## Candidate Imports from Tripletex2

### Import 1: AGENTS.md perDiem contradiction must be resolved
- **Insight:** AGENTS.md lines 475-489 still instruct agents to include perDiemCompensations with specific rules (count=overnights, hardcoded rateType IDs, no rate field). This directly contradicts the trusted standard's ROOT CAUSE FIX that says to omit perDiems entirely. An agent following AGENTS.md will continue scoring 4.5/8.
- **Why it seems new:** This is not a T2 import per se, but T2's RESEARCH.md (which also documents the 4.5/8 plateau and the "createVouchers hypothesis") makes the contradiction obvious. The trusted standard was clearly updated to fix this, but AGENTS.md was not updated in parallel.
- **Evidence:**
  - `AGENTS.md` lines 476-477: "Do NOT set `rate`... `count` = OVERNIGHTS (days - 1), NOT days" — implies perDiems are expected
  - `AGENTS.md` line 483: "`isCompensationFromRates: true`" — contradicts trusted standard's `isCompensationFromRates: false`
  - `trusted-standards/register-travel-expense.md`: "Do NOT create perDiemCompensations... Set `isCompensationFromRates: false`"
- **Confidence:** High that this contradiction exists and should be resolved in favor of the trusted standard's newer guidance.

### Import 2: Date computation from tripDurationDays
- **Insight:** T2's v3 strategy computes travel dates from `tripDurationDays` when explicit dates are absent: `returnDate = ctx.clock.today()`, `departureDate = today - (N-1)`. This uses a deterministic clock (`ctx.clock.today()`) to avoid timezone fragility — v2 used `new Date()` and was superseded for this reason.
- **Why it seems new:** T1's trusted standard says only "If the prompt gives only 'N days' without specific dates, pick a deterministic date range (e.g., recent past dates spanning N days)." The specific formula (return=today, departure=today-N+1) is not specified. T1's AGENTS.md line 489 says "pick a deterministic date range, do not waste extra reads searching for 'correct' dates" but again, no specific formula.
- **Evidence:** `tasks/tripletex2/src/tasks/task-13/strategies/create-and-deliver-travel-expense-v3.ts` lines 89-104 (`resolveOrComputeDates`). T2 RESEARCH.md confirms v3 sandbox runs used this formula: "Run D (no explicit dates, tripDurationDays=4): dates computed 2026-03-19→2026-03-22 via ctx.clock.today()".
- **Confidence:** Medium. AGENTS.md line 331 warns: "neither the old run-date-ending fallback nor company-city fallback is a proven scorer-correct inference for that prompt family." The v3 date formula has been sandbox-verified but NOT production-scored. The `returnDate=today` convention is reasonable for past-tense prompts ("reisa varte N dagar") but not guaranteed correct for scoring.

### Import 3: Destination inference heuristic
- **Insight:** T2's v3 strategy has a token-based `inferDestination` function that scans the title, purpose, and journey description for capitalized place-like tokens, excluding known non-destination words (months, weekdays, "kunde", "konferanse", "trip", etc.) and handling multi-word places with prefix tokens ("San", "New", "Fort", etc.).
- **Why it seems new:** T1's trusted standard does not address how to determine `destination` when the prompt doesn't explicitly name it. The standard simply uses `destination` as a required field without explaining inference.
- **Evidence:** `tasks/tripletex2/src/tasks/task-13/strategies/create-and-deliver-travel-expense-v3.ts` lines 115-145 (`inferDestination`, `NON_DESTINATION_TOKENS`). Notably, `konferanse` is in the exclusion list — meaning "Konferanse Bergen" would correctly extract "Bergen" not "Konferanse".
- **Confidence:** Low-medium. This is a T2 code heuristic, not a proven scoring insight. The T1 runtime (markdown-guided agent) would need to apply similar logic manually. The `konferanse` exclusion is notable as a potentially trip-relevant finding.

### Import 4: vatType { id: 0 } vs category default — unresolved question
- **Insight:** T2's v3 strategy hardcodes `vatType: { id: 0 }` on all costs, while T1's trusted standard says to use category defaults (`costCategory.vatType.id`, typically 12 for Fly/Taxi). Both work for POST+deliver without errors, but they produce different voucher postings (with or without VAT entries). Neither approach has been production-scored with the no-perDiem fix applied.
- **Why it seems new:** The disagreement itself is new information. T1's trusted standard says category default is correct; T2 says 0. Both claim sandbox verification.
- **Evidence:**
  - T1 trusted standard: "vatType on costs = category default (not hardcoded 0)... Category defaults: Fly.vatType.id=12, Taxi.vatType.id=12 (12% lav sats)"
  - T2 v3 strategy line 262: `vatType: { id: 0 }`
  - T2 RESEARCH.md line 43: `vatType: { id: 0 } per trusted standard` (references T2's own standard, not T1's)
  - T1 sandbox verification with vatType 12: postings include account 2712 (VAT)
  - T2 sandbox verification with vatType 0: likely no VAT posting
- **Confidence:** Low. This requires production scoring to resolve. The T1 approach (category default) is arguably more correct from an accounting perspective (travel expenses may have input VAT deduction), but the scorer's expectations are unknown.

### Import 5: createVouchers is the strongest untested hypothesis
- **Insight:** T2's RESEARCH.md clearly identifies createVouchers as the single strongest hypothesis for improving the score. Key evidence:
  - ALL 22 production runs omitted `PUT /travelExpense/:createVouchers`
  - Run b57900d3 proved approve alone does NOT help (still 4.5/8)
  - Without createVouchers: `voucher=null`, no ledger postings
  - After createVouchers: `voucher != null`, `isCompleted=true`, 7 accounting postings
  - **createVouchers has NEVER been production-scored**
- **Why it seems new:** T1's trusted standard already includes createVouchers in the flow (Round 7). However, the explicit finding that NO prior production run ever called createVouchers — and that this is the MOST LIKELY root cause of the remaining score gap — is not stated anywhere in T1's surfaces. T1's trusted standard presents createVouchers as just another step in the flow, not as the critical untested fix.
- **Evidence:** `tasks/tripletex2/src/tasks/task-13/RESEARCH.md` lines 18-31 (table showing 22 runs without createVouchers all at 4.5/8).
- **Confidence:** High that createVouchers is the strongest hypothesis. The T1 trusted standard already includes it in the flow, so the fix is already prescribed — but AGENTS.md's conflicting guidance may prevent agents from following the trusted standard correctly.

## Proposed Markdown Deltas

### AGENTS.md
- **Proposed change:** Replace lines 475-489 (travel-expense rules) to align with the trusted standard's 2026-03-22 update. Specifically:
  1. Replace rule 1 ("Do NOT set `rate` on perDiemCompensations") with: "**Do NOT create perDiemCompensations at all.** Set `isCompensationFromRates: false`. The prompt's 'diett' mention is context about the trip, not an expense to register."
  2. Remove rule 2 ("`count` = OVERNIGHTS") — no longer applicable if perDiems are omitted
  3. Keep rule 3 (createVouchers) and elevate it: "**createVouchers is the CRITICAL step** — no prior production run ever called it. ALL 22 runs without createVouchers scored 4.5/8."
  4. Keep rule 4 (vatType from category) — already aligned with trusted standard
  5. Keep rule 5 (full chain: deliver → approve → createVouchers)
  6. Remove line 482 ("Use hardcoded rateType IDs") — no longer applicable
  7. Update line 483 to: "`isCompensationFromRates: false`" (was `true`)
- **Reason:** AGENTS.md contradicts the trusted standard. Agents reading AGENTS.md first will include perDiems and score 4.5/8. The trusted standard's "root cause fix" must propagate to AGENTS.md.

### Trusted standard
- **Target file:** `trusted-standards/register-travel-expense.md`
- **Proposed addition 1:** In the "Duration-Only Prompts" section, specify the concrete date formula: "Use `returnDate = today` (run date), `departureDate = today - (tripDurationDays - 1)`. Example: 4-day trip on 2026-03-22 → departure 2026-03-19, return 2026-03-22."
- **Reason:** The current guidance ("pick a deterministic date range") is too vague. The v3 formula from T2 is the most concrete and sandbox-verified approach. Caveat: add a note that this is unscored.
- **Proposed addition 2:** Add a note emphasizing that createVouchers has never been production-scored: "**As of 2026-03-22, no production run has ever called createVouchers.** This step is the strongest hypothesis for improving beyond 4.5/8. It MUST be included in every run."
- **Reason:** The current flow includes createVouchers but does not emphasize its untested status or its likely impact. Making this explicit helps prioritize it during review.

### Playbook
- **Target file:** `task-playbooks/register-travel-expense.md`
- **Proposed changes:** Mirror whatever changes land in the trusted standard (consistency).

## Risks / Caveats

- **Mapping ambiguity:** None — tx_task_id 13 is explicit.
- **Conflicting evidence:** The AGENTS.md ↔ Trusted Standard contradiction on perDiems is the highest-priority issue. The trusted standard's argument (24 runs at 4.5/8 with perDiems) is strong evidence, but the hypothesis has not been production-validated without perDiems + with createVouchers together. It's possible that:
  - Removing perDiems fixes checks 2+3 (per-diem related checks) but check 6 requires createVouchers
  - Or removing perDiems has no effect and createVouchers alone is the fix
  - Or both changes are needed together
- **vatType unresolved:** T1 says category default (id=12), T2 says hardcoded 0. Both sandbox-verified independently. Production scoring needed to determine which is correct for the scorer.
- **Date formula unscored:** T2's `returnDate=today, departureDate=today-N+1` formula is sandbox-verified but not production-scored. AGENTS.md line 331 explicitly warns this inference is "not a proven scorer-correct inference."
- **Not safe to port yet:** The destination inference heuristic (Import 3) is T2-specific code logic, not easily expressed as markdown guidance. It may not be worth porting.

## Recommendation

- **Adopt now — CRITICAL:** Import 1 (resolve AGENTS.md ↔ Trusted Standard contradiction). This is the highest-priority change because the contradiction actively prevents agents from following the correct flow. AGENTS.md must be updated to match the trusted standard's 2026-03-22 perDiem removal.
- **Adopt now:** Import 5 (elevate createVouchers emphasis). The trusted standard already includes it, but adding the "never production-scored" context makes it clear this is the primary hypothesis.
- **Adopt with caveat:** Import 2 (date formula). Useful to specify a concrete formula, but mark it as unscored.
- **Hold:** Import 4 (vatType 0 vs 12). Needs production evidence to resolve. Keep T1's current category-default approach until scored.
- **Hold:** Import 3 (destination inference). Too implementation-specific for markdown guidance.

**Overall: The most impactful action is resolving the AGENTS.md contradiction.** The trusted standard already prescribes the correct flow (no perDiems, createVouchers included), but agents cannot follow it reliably while AGENTS.md says the opposite about perDiems. Fixing this is a prerequisite for any production-scoring of the new approach.
