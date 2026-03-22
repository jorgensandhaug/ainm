# Task 16 — Register Supplier Invoice (Text-Only)

**Status: `review-ready`**

## Snapshot
- Tripletex1 current best score: 1/4 (leaderboard best_score=1, max_score=4, tx_task_id=11)
- Priority: 8 (focus band, execution-lane, queue eligibility: ready)
- Target Tripletex1 surface: `trusted-standards/register-supplier-invoice.md`, `task-playbooks/register-supplier-invoice.md`, `AGENTS.md` (lines 135-148, 492-506)
- Source Tripletex2 materials reviewed:
  - `tasks/tripletex2/src/tasks/task-16/RESEARCH.md`
  - `tasks/tripletex2/src/tasks/task-16/FINDINGS.md`
  - `tasks/tripletex2/src/tasks/task-16/task.ts`
  - `tasks/tripletex2/src/tasks/task-16/strategies/import-and-book-voucher-v2.ts`
  - `tasks/tripletex2/src/tasks/task-16/strategies/import-then-book-voucher.ts`
  - `tasks/tripletex2/research/task-queue.json` (task 16 entry)
  - `tasks/tripletex2/research/candidate-strategies.json` (16.import-and-book-voucher.v2 entry)

## Task Identity Mapping

Tripletex2 task-16 maps to tx_task_id 11 on the leaderboard (confirmed via `task.ts`: `REGISTER_SUPPLIER_INVOICE_TX_TASK_ID = "11"`). This was corrected from the original wrong mapping (16→16) after a 5-task circular shift was discovered in production evidence. No remaining mapping ambiguity.

## Current Tripletex1 Coverage

### Trusted standard (`register-supplier-invoice.md`) says — **INTERNALLY CONTRADICTORY on booking:**

**Newer guidance (lines 25-35, added after FINDINGS.md analysis):**
- "CRITICAL: DO NOT BOOK THE VOUCHER." with evidence table
- "0b6fe5b8 (UNBOOKED): 2/4 checks passed" ← **factual error, see Import 2**
- "Registrer (register) ≠ Bokfør (book)"
- Step 6 ends with "STOP HERE — DO NOT BOOK."
- Line 75: "Send postings with sendToLedger=false and STOP."

**Residual older guidance (NOT updated to match):**
- Lines 152-158: "## Booking Step (final PUT)" with detailed instructions to book with `sendToLedger=true`
- Line 221: "do NOT omit the booking step — unbooked runs scored 1/8; booked runs have better correctness" — **directly contradicts lines 25-35**
- Line 267-268: "FIX APPLIED: added booking step (PUT sendToLedger=true) — should unlock 1 more check" — **stale, since the booking step was the CAUSE of 0/4 scores**

### Playbook (`register-supplier-invoice.md`) says — **CONTRADICTS trusted standard:**
- Step 7: "PUT /ledger/voucher/{id}?sendToLedger=true — book the voucher" — the playbook was NOT updated with the DO NOT BOOK directive
- Line 42: "adding the booking step should unlock 1 more check → potential 3/4" — **stale claim, booking causes 0/4**
- Line 33: "4 write calls + 7 verification GETs = 11 total" — includes booking as a write call

### AGENTS.md says — **CONTRADICTS trusted standard's DO NOT BOOK:**
- Line 492: "After import, use two PUTs: first set postings (sendToLedger=false), then book (sendToLedger=true)."
- Line 506: "the postings PUT MUST use sendToLedger=false, then a separate booking PUT MUST use sendToLedger=true"
- Both lines instruct agents to book, contradicting the trusted standard's new "DO NOT BOOK" opening.

### Summary of contradictions

An agent reading the T1 surfaces encounters **three different instructions**:

| Source | Says |
|--------|------|
| Trusted standard lines 25-35 | DO NOT BOOK — evidence proves booking breaks scoring |
| Trusted standard lines 152-158, 221 | DO book — booking step is required |
| Playbook line 27 | DO book — booking step is step 7 |
| AGENTS.md lines 492, 506 | DO book — two PUTs required |

The trusted standard's opening block is correct (DO NOT BOOK), but it is outvoted 3:1 by the residual text within the same document, the playbook, and AGENTS.md. An agent is very likely to follow the majority view and book the voucher, producing a 0/4 score.

## Candidate Imports from Tripletex2

### Import 1: Resolve the booking contradiction across ALL T1 surfaces (CRITICAL)

- **Insight:** The booking step (`PUT sendToLedger=true`) actively BREAKS T11 scoring. The only run to ever score >0 was unbooked (0b6fe5b8). All 9 subsequent runs with booking scored 0/4. The booking step was incorrectly added based on cross-task generalization from task 20 (PDF variant), where `sendToLedger=true` helped.
- **Why it seems new:** The trusted standard has the DO NOT BOOK directive at the top but still contains residual booking instructions below. The playbook and AGENTS.md were never updated. The T2 FINDINGS.md analysis makes the full production evidence clear and identifies the four specific residual contradictions.
- **Evidence:**
  - T2 `FINDINGS.md` production scorecard: 13 runs total — 0b6fe5b8 (no booking)=1/4; ALL 9 booked runs=0/4
  - T1 trusted standard line 67: evidence table confirms the pattern
  - T1 trusted standard lines 152-158, 221, 267-268: residual booking guidance
  - T1 playbook line 27: booking step still included
  - T1 AGENTS.md lines 492, 506: booking instructions still present
- **Confidence:** HIGH. The production evidence is unambiguous (1 unbooked run=1/4 vs 9 booked runs=0/4). The contradiction is verifiable by reading the files.

### Import 2: Fix the score claim for 0b6fe5b8 (1 check passed, not 2)

- **Insight:** The trusted standard claims 0b6fe5b8 passed 2/4 checks (4/8 raw, normalized=1). But the leaderboard shows `best_score=1, max_score=4`. With 4 checks worth 2 points each (max_raw=8): 2 checks → raw=4 → score=(4/8)*4=2, not 1. The leaderboard score of 1 means raw=2 → exactly 1 check passed.
- **Why it seems new:** The trusted standard's table (line 67) and line 26 both claim "2/4 checks passed." T2's FINDINGS.md identified this as one of four faulty claims in the trusted standard. The incorrect 2-check assumption led to overconfident check mapping in the trusted standard's analysis (lines 77-82).
- **Evidence:**
  - Leaderboard: `best_score=1, max_score=4` for tx_task_id=11
  - T2 `FINDINGS.md` lines 263-265: "leaderboard shows best_score=1, max_score=4. That's 1 check passed (2/8 raw), not 2 checks (4/8 raw)"
  - T2 `RESEARCH.md` line 25: "Best known score: 1 / 4 (on real leaderboard slot tx_task_id=11)"
- **Confidence:** HIGH. Leaderboard data is authoritative.

### Import 3: Norwegian accounting lifecycle explains WHY booking hurts

- **Insight:** In Norwegian accounting, "registrere leverandørfakturaen" (register the supplier invoice) means entering it into the system — creating the SI entity and its unbooked voucher (number=0). It does NOT mean posting to the general ledger. The lifecycle is: (1) Registrert → (2) Godkjent → (3) Bokført → (4) Betalt. The prompt says "Registrer" asking for state 1. The v2 strategy performs state 3. When the voucher is booked, the posting ID changes (observed: 3845825437→3845825456 in run aa847819), the SI entity's state mutates, and the scorer — which likely checks for "registered but unbooked" state (voucher number=0) — fails.
- **Why it seems new:** The trusted standard mentions "Registrer ≠ Bokfør" in one line (line 28/73) but does not explain the full lifecycle or the concrete mechanism by which booking breaks scoring (posting ID mutation, SI state change, voucher number changing from 0 to >0). T2 FINDINGS.md provides the full analysis.
- **Evidence:**
  - T2 `FINDINGS.md` lines 156-169 (Interpretation Axis 1): "Registrert (registered) — SI entity exists, voucher has number=0 (unbooked)"
  - T2 `FINDINGS.md` line 50: "posting ID changed from 3845825437 → 3845825456 in run aa847819"
  - Norwegian accounting terminology is unambiguous on this distinction
- **Confidence:** HIGH for the semantic analysis. MODERATE for the specific mechanism (posting ID mutation) — correlation established but not definitively proven as THE cause.

### Import 4: POST /supplierInvoice as next-generation approach

- **Insight:** `POST /supplierInvoice` creates both a supplierInvoice entity AND a voucher in a single call with full field control. Unlike importDocument, it allows: (a) custom `voucher.description` from the prompt (currently immutable as "Faktura nummer INV-XXXX fra Supplier"), (b) explicit `invoiceDueDate` control, (c) no XML generation, (d) no duplicate supplier risk from import auto-creation. This could address the remaining 3 failing checks.
- **Why it seems new:** T1 does not mention `POST /supplierInvoice` anywhere. All T1 guidance uses importDocument exclusively. T2's FINDINGS.md identifies this as the most promising next step after reverting the booking.
- **Evidence:**
  - T2 `FINDINGS.md` lines 80-93: sandbox scripts 138-161 verified POST /supplierInvoice works
  - T2 `FINDINGS.md` lines 110-116: voucher description mismatch is the most likely failing check 2
  - T2 `FINDINGS.md` lines 129-136: improvement plan step 2 uses POST /supplierInvoice
  - Sandbox verification: scripts 145, 151, 160, 161 confirmed working
  - **NEVER production-tested**
- **Confidence:** LOW-MEDIUM. Sandbox-verified but zero production evidence. Could introduce new failures (e.g., SI amounts being 0 for read-only fields). The voucher description hypothesis is plausible but unproven.

### Import 5: Speculative check mapping for remaining 3 failures

- **Insight:** With exactly 1 check passing in the best run (0b6fe5b8), T2 hypothesizes the most likely check mapping:
  - Check 1 (PASS): SI entity exists with correct invoiceNumber + supplier linkage
  - Check 2 (FAIL): Voucher description — scorer expects prompt description (e.g., "kontortjenester"), gets immutable "Faktura nummer INV-XXXX fra Supplier" from importDocument
  - Check 3 (FAIL): invoiceDueDate — scorer expects 30-day terms or null, gets same-day (dueDate=invoiceDate)
  - Check 4 (FAIL): Unknown — possibly posting format, amounts, or a state check
- **Why it seems new:** T1's trusted standard (lines 77-82) hypothesizes fixes (PaymentMeans, DueDate +30, physicalAddress) but doesn't map them to specific checks. The T2 analysis is more systematic and identifies the voucher description mismatch as the most impactful failure — something importDocument fundamentally cannot fix.
- **Evidence:**
  - T2 `FINDINGS.md` lines 239-265: full speculative check mapping with reasoning
  - T2 `FINDINGS.md` lines 111-116: voucher description analysis
  - T2 `FINDINGS.md` lines 206-215: dueDate analysis
  - The trusted standard's own line 253 acknowledges the description is immutable: "voucher description: 'Faktura nummer {ID} fra Lumière SARL' (immutable — expected)" — treating it as "expected" rather than as a likely failure point
- **Confidence:** LOW. This is speculation supported by reasoning, not production data. The individual hypotheses are plausible but unverified.

## Proposed Markdown Deltas

### AGENTS.md
- **Proposed change 1:** Replace line 492's "then book (sendToLedger=true)" with guidance that differentiates T11 from T20:
  - T11 (text-only): "After import, use ONE PUT: set postings (sendToLedger=false). DO NOT BOOK — production evidence proves booking breaks T11 scoring (all 9 booked runs scored 0/4 vs 1/4 unbooked)."
  - T20 (PDF): keep existing "then book (sendToLedger=true)" — booking appears to help T20.
- **Proposed change 2:** Update line 506 similarly — the "separate booking PUT MUST use sendToLedger=true" instruction should be scoped to T20 only, with an explicit "NOT for T11" qualifier.
- **Reason:** AGENTS.md currently tells agents to book for all supplier invoice tasks. This is wrong for T11 and directly causes 0/4 scores.

### Trusted standard
- **Target file:** `trusted-standards/register-supplier-invoice.md`
- **Proposed change 1 (CRITICAL):** Remove or strike through the "## Booking Step" section (lines 152-158). It contradicts the DO NOT BOOK directive at lines 25-35.
- **Proposed change 2:** Fix line 221: change "do NOT omit the booking step — unbooked runs scored 1/8; booked runs have better correctness" to "do NOT BOOK the voucher — all booked T11 runs scored 0/4; the only run above 0 was unbooked."
- **Proposed change 3:** Fix lines 267-268: remove "FIX APPLIED: added booking step (PUT sendToLedger=true) — should unlock 1 more check" and replace with "NOTE: the booking step was later proved harmful — see CRITICAL block at top."
- **Proposed change 4:** Fix line 26 and line 67: change "2/4 checks passed" to "1/4 checks passed" (leaderboard best_score=1 means 1 check, not 2).
- **Proposed change 5 (optional):** Add the Norwegian accounting lifecycle explanation after the DO NOT BOOK block: "The Norwegian accounting lifecycle for supplier invoices is: Registrert (voucher number=0, unbooked) → Godkjent → Bokført (voucher number>0, booked) → Betalt. The prompt says 'Registrer,' asking for state 1. Booking moves the voucher to state 3, which the scorer does not expect."
- **Proposed change 6 (optional):** Add a note that POST /supplierInvoice exists as a research-ready alternative that could fix the voucher description limitation. Mark it as unverified in production.
- **Reason:** Internal contradictions cause agents to follow residual booking guidance. Score claim is factually wrong and leads to incorrect check mapping assumptions.

### Playbook
- **Target file:** `task-playbooks/register-supplier-invoice.md`
- **Proposed change 1 (CRITICAL):** Remove step 7 ("PUT sendToLedger=true — book the voucher"). The playbook was never updated with the DO NOT BOOK finding.
- **Proposed change 2:** Update line 33: change "4 write calls" to "3 write calls" (POST supplier, POST importDocument, PUT postings with sendToLedger=false).
- **Proposed change 3:** Fix line 42: remove "adding the booking step should unlock 1 more check → potential 3/4" — this is stale and contradicted by production evidence.
- **Proposed change 4:** Update line 40: change "scored 1/8 (2/4 passed)" to "scored 1/4 (1 check passed)" per leaderboard.
- **Reason:** The playbook directly contradicts the trusted standard's DO NOT BOOK directive and will cause agents to book (→ 0/4).

## Risks / Caveats

- **Mapping ambiguity:** None. tx_task_id 11 is confirmed via production evidence (4 independent runs) and the corrected 5-task circular shift.
- **Conflicting evidence on booking:**
  - T11 (text-only): booking HURTS — 9 runs at 0/4 vs 1 run at 1/4 without booking. Evidence is strong.
  - T20 (PDF): booking HELPS — dedc4bfe scored 8/10 with booking vs 7/10 without. Different scorer.
  - Any fix MUST preserve the T11/T20 distinction. Blanket removal of booking guidance would break T20.
- **Score claim correction:**
  - T2 FINDINGS says 1 check passed. Trusted standard says 2 checks. The leaderboard math supports 1. However, this depends on the normalization formula: `score = (raw/max_raw)*max_score`. If the formula is different (e.g., floor/ceil), 2 checks could theoretically normalize to 1. **Weak ambiguity** — the standard formula gives 2→score=2, not 1.
- **POST /supplierInvoice (Import 4):** Sandbox-only, never production-tested, could introduce new failures. NOT safe to port as trusted guidance. Safe to port as a research note / future hypothesis.
- **Check mapping (Import 5):** Pure speculation. Useful for directing research but should NOT be stated as fact in trusted guidance.
- **Active T2 strategy pin is WRONG:** T2's active strategy pin (`16.import-and-book-voucher.v2`, promoted 2026-03-22) uses sendToLedger=true, which the FINDINGS prove is harmful. This is a T2 operational issue, not a T1 migration concern, but worth noting: T2 has not yet acted on its own findings.

## Recommendation

- **Adopt now — CRITICAL:** Import 1 (resolve booking contradiction across ALL T1 surfaces). This is the single highest-impact change. The trusted standard, playbook, and AGENTS.md all need to be made consistent: DO NOT BOOK for T11. Without this fix, agents will follow the majority "DO book" guidance and score 0/4.
- **Adopt now:** Import 2 (fix score claim from "2/4" to "1/4"). Factual error with downstream consequences for check mapping assumptions.
- **Adopt now:** Import 3 (add Norwegian accounting lifecycle context). Provides the "why" behind DO NOT BOOK, making the directive more robust against future edits that might re-add booking.
- **Hold — needs production verification:** Import 4 (POST /supplierInvoice). Safe to add as a research note ("this endpoint exists and may fix the voucher description limitation") but NOT as trusted guidance until production-tested.
- **Hold — speculative:** Import 5 (check mapping). Useful context for researchers but should not appear in the trusted standard or playbook.

**Overall: The most impactful action is making all three T1 surfaces consistently say DO NOT BOOK for T11.** The trusted standard's opening block already says this, but the playbook, AGENTS.md, and residual sections within the trusted standard itself all say the opposite. This 3:1 contradiction ratio virtually guarantees agents will book and score 0/4. Fixing this should immediately recover the 1/4 baseline and position the task for further improvement via the POST /supplierInvoice hypothesis.
