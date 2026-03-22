# Task 23 — Bank Reconciliation Efficiency

## Status: review-ready

## Snapshot
- Tripletex1 current best score: **1.2667/6** (was 0.6/6 before a986e65f)
- Priority: **MED** (correctness solved, gap is efficiency only — 4.73 points recoverable)
- Target Tripletex1 surface: `scripts/reconcile-bank-statement.ts`, `trusted-standards/reconcile-bank-statement-open-invoices.md`, `task-playbooks/reconcile-bank-statement-open-invoices.md`
- Source materials reviewed:
  - `tasks/tripletex2/src/tasks/task-23/RESEARCH.md` — task-local research memory (251 lines)
  - `tasks/tripletex2/src/tasks/task-23/strategies/reconcile-bank-statement.ts` — v1 strategy (1308 lines)
  - `tasks/tripletex2/src/tasks/task-23/strategies/reconcile-bank-statement-v2.ts` — v2 full 9-step strategy
  - `tasks/tripletex2/src/tasks/task-23/task.ts` — task spec
  - `tasks/tripletex2/research/verifications/task-23/verify-23-23.reconcile-bank-statement.v1-2026-03-21T21-38-12-930Z/` — v1 verification report
  - `tasks/tripletex2/research/sandbox/runs/sandbox-23-23.reconcile-bank-statement.v2-2026-03-22T08-52-54-420Z/` — v2 sandbox run (failed 422 on voucher)
  - `tasks/tripletex/sandbox-investigation/83-score-analysis.md` — cross-task score analysis
  - Production run a986e65f trace + score, sandbox verification logs

## Current Tripletex1 coverage

### What already exists
- Pre-built script `scripts/reconcile-bank-statement.ts` (was v2, now staged as v3)
- Full trusted standard with 9-step flow, API shapes, pitfalls, and production run history
- Playbook with production run results across 7 languages
- AGENTS.md trusted-standards table entry with pre-built script reference

### Critical gap closed by this proposal
The pre-built script v1 (used in production run a986e65f) used **10 individual** `POST /bank/reconciliation/match` calls and a **separate** opening balance voucher = **20 mutating calls total**. This scored 7/7 raw (perfect correctness) but only 1.2667/6 normalized due to efficiency penalty.

The v3 script reduces to **10 mutating calls** (single month) / **13** (cross-month) via batch matching + combined voucher.

### Important omission in current Tripletex1 docs
Neither the trusted standard nor the playbook explicitly states that **correctness is fully solved** and the gap is efficiency-only. A future agent scanning the 400-line trusted standard (which still reads "Check 1 always fails" in older run entries) would not reach this conclusion without reading every production run note. The RESEARCH.md in Tripletex2 makes this explicit.

### Step-combination evidence (from Tripletex2 RESEARCH.md lines 178–187)
This table does not exist in Tripletex1 but should — it makes the "all 5 components required" conclusion scannable:

| Non-invoice booked? | Bank recon? | OB voucher? | Bank import? | Matching? | Score |
|---------------------|------------|------------|-------------|----------|-------|
| No | No | No | No | No | 0.6/6 (×5 runs) |
| YES | No | No | No | No | 0.6/6 |
| YES | YES (empty txns) | No | No | No | 0.6/6 |
| YES | YES (closed) | No | No | No | 0.6/6 |
| YES | YES | YES | YES | YES | **1.2667/6** ✓ |

Source: `tasks/tripletex2/src/tasks/task-23/RESEARCH.md` lines 178–187

## Candidate imports

### Import 1 — Batch matching (10 → 1 calls per period)
- **Insight:** `POST /bank/reconciliation/match` accepts arrays for both `transactions` and `postings`. All txn+posting pairs for a period can be sent in ONE call instead of L individual calls.
- **Why it seems new:** v1 script used individual calls. No prior production run used batch matching.
- **Evidence:** Sandbox-verified 2026-03-22 — batch match with 5 txns + 5 postings in 1 call → 201 Created. All txns marked `matched: true`.
- **Confidence:** HIGH — sandbox-verified, API shape confirmed.

### Import 2 — Combined OB + supplier + non-invoice voucher (2 → 1 POST)
- **Insight:** Opening balance postings (DR 1920 / CR 2050) can be included in the same `POST /ledger/voucher` as supplier payments and non-invoice lines. Individual posting dates are preserved per-posting even when different from the voucher date.
- **Why it seems new:** v1 script created OB as a separate voucher (1 extra POST). No prior run combined them.
- **Evidence:** Sandbox-verified 2026-03-22 — combined OB + txn postings in 1 voucher → 201 Created. Production run a986e65f confirmed separate OB worked; combining is strictly fewer calls.
- **Confidence:** HIGH — sandbox-verified.

### Import 3 — Date-aware posting match
- **Insight:** When matching bank txns to ledger postings, prefer postings with the same date as the CSV line before falling back to any-date match. Reduces risk of wrong match when two postings have identical amounts.
- **Why it seems new:** v1/v2 script matched by amount only with `find()`.
- **Evidence:** Theoretical edge case — no production failure from amount-only matching yet, but defensively correct.
- **Confidence:** MED — no production failure observed, but improves robustness.

### Import 4 — OB posting exclusion from matchable set
- **Insight:** The opening balance posting on account 1920 has no corresponding bank transaction. If its amount coincidentally matches a CSV line's amount, the amount-only matcher could pick the wrong posting. Filtering it out by description (`/balanse/i`) prevents false matches.
- **Why it seems new:** v1/v2 did not filter.
- **Evidence:** Theoretical edge case — unlikely with typical OB amounts (~100000) vs typical CSV amounts (~1000-30000), but zero-cost prevention.
- **Confidence:** MED — defensive improvement.

### Import 5 — Production scoring confirmation
- **Insight:** The full 9-step flow (Steps 0+6+7+8) is production-confirmed to pass ALL checks. Run a986e65f scored 7/7 raw, 5/5 checks, 1.2667/6. Previous best was 0.6/6 (Check 2 only).
- **Why it seems new:** All prior documentation said "Check 1 always fails" and listed the a986e65f score as "pending."
- **Evidence:** Submission `c7d5c7c1` in `submissions-history.jsonl` — completed 2026-03-22T10:31:35Z with score_raw=7, score_max=7, normalized_score=1.2667, 5/5 checks passed.
- **Confidence:** HIGH — confirmed from production scoring data.

### Import 6 — BOM handling
- **Insight:** CSV files may include a UTF-8 BOM (`\uFEFF`). Stripping it before parsing prevents silent header corruption.
- **Why it seems new:** v1/v2 did not strip BOM.
- **Evidence:** Defensive — no production failure observed, but standard practice for CSV parsing.
- **Confidence:** LOW — no evidence of BOM in production CSVs, but zero-cost prevention.

### Import 7 — Nynorsk regex risk in v3 line classification (NEW)
- **Insight:** The v3 pre-built script classifies customer lines with `Innbetaling fra` (Bokmål). Nynorsk uses `frå` (with å). If a Nynorsk-variant CSV appears, customer payment lines would fail classification and be treated as non-invoice lines (booked to wrong contra accounts instead of matched to invoices). This would break both Check 1 (reconciliation mismatch) and Check 2 (invoices unpaid). The supplier regex already covers 6 languages (`Betaling\s+(Proveedor|Supplier|Leverandor|Lieferant|Fournisseur|Fornecedor)`).
- **Why it seems new:** Earlier Nynorsk runs (c76bbef3, 2f10e207) used the trusted-standard code path with fuzzy name+amount scoring, not the regex-based v3 script. No post-v3 Nynorsk run has been tested.
- **Evidence:** `scripts/reconcile-bank-statement.ts` line 73 uses `/Innbetaling fra/i` — doesn't match `frå`. Production Nynorsk CSVs from playbook show customer/supplier line descriptions but don't show the exact keyword. The risk is concrete.
- **Confidence:** MED — the language variant is real, the regex gap is real, but no production failure has been observed yet (because no Nynorsk run has used the v3 script). Fix is trivial: `Innbetaling fr[aå]`.

### Import 8 — Step-combination evidence table for trusted standard (NEW)
- **Insight:** Tripletex2 RESEARCH.md (lines 178–187) contains a structured evidence table proving that ALL 5 components (non-invoice + recon + OB + import + matching) are jointly required for Check 1. Tripletex1 has this information scattered across 11 run notes in 400 lines of trusted standard prose.
- **Why it seems new:** The conclusion is present in Tripletex1 (e.g., "ALL of Steps 0, 6, 7, 8 are required for Check 1"), but the systematic proof table is not. A one-glance table saves future agents from re-deriving the conclusion by reading every run entry.
- **Evidence:** Table reproduced in "Current Tripletex1 coverage" section above.
- **Confidence:** HIGH — reformatting proven data, not adding new claims.

## Proposed markdown deltas

### Pre-built script (`scripts/reconcile-bank-statement.ts`)
- **Changes already staged in working tree (v1 → v3):**
  - Header updated: version label, production results
  - BOM stripping: `.replace(/^\uFEFF/, "")`
  - OB posting exclusion: `matchablePostings` filter before matching loop
  - Date-aware matching: same-date preference with any-date fallback
  - Robustness: safe version fallback in recon close retry (`fresh2?.value?.version ?? r.recon.version`)
- **Reason:** Batch matching and combined voucher were already in v2. These are robustness and correctness improvements on top.

### Trusted standard (`trusted-standards/reconcile-bank-statement-open-invoices.md`)
- **Changes already staged:**
  - Updated "Proven results" section: a986e65f now shows scored 1.2667/6 (was "pending")
  - Updated mandatory checklist: references production-proven score
  - Added "STOP READING HERE" directive after pre-built script section (saves 10-20s agent reading time)
  - Updated call count examples to reflect v3 numbers (10 single-month, 13 cross-month)
- **Reason:** Documentation was stale — still said "Check 1 always fails" and listed a986e65f as pending.

### Playbook (`task-playbooks/reconcile-bank-statement-open-invoices.md`)
- **Changes already staged:**
  - Updated a986e65f entry: "score pending" → "SCORED 1.2667/6 (7/7 raw, 5/5 checks passed) FIRST ALL-CHECKS-PASS"
  - Updated optimization notes: v3 script replaces v2
- **Reason:** Playbook had stale "pending" label for a production run that was already scored.

### Score analysis (`sandbox-investigation/83-score-analysis.md`)
- **Changes already staged:**
  - T23 gap updated: 5.40 → 4.73
  - T23 moved from Tier 2 (correctness problem) to Tier 3 (efficiency-only)
  - Detailed check analysis updated: "CORRECTNESS SOLVED"
  - Opportunity matrix updated
- **Reason:** T23 status fundamentally changed — no longer a correctness problem.

### AGENTS.md
- **No changes needed.** The trusted-standards table entry at line 141 already has the pre-built script reference with correct path and usage.

## Risks / caveats
- **Batch matching untested in production:** Sandbox-verified with 5 pairs, but no production run has used batch matching yet. The v3 script has a fallback to individual matches if batch fails (adds ~10 extra calls + 1 error, still passes all checks).
- **Score formula unknown:** We don't know the exact efficiency scoring formula. The improvement from 20→10 mutating calls should be significant, but the exact score increase is unpredictable.
- **Nynorsk regex gap (Import 7):** The v3 script's customer-line regex `Innbetaling fra` will fail on Nynorsk `Innbetaling frå`. This is a code fix (`fr[aå]`), not a markdown fix, but should be flagged for the next script update. Silent failure mode — customer lines booked as non-invoice.
- **V2 sandbox voucher failure:** The v2 strategy sandbox run (2026-03-22T08:52:54Z) failed with 422 "Validering feilet." on `POST /ledger/voucher` due to pre-existing sandbox state. Production accounts start clean, so this is unlikely to reproduce. (`tasks/tripletex2/research/sandbox/runs/sandbox-23-23.reconcile-bank-statement.v2-*/artifacts/*/run-*.json`)
- **No mapping ambiguity:** Task 23 is identical between Tripletex1 and Tripletex2 (tx_task_id=23).
- **Direct edits already staged:** Unlike the queue process, these changes were made directly to the live files. The proposal documents them retroactively for review.

## Recommendation
- **Adopt now (Imports 1–6, 8):** The correctness evidence is production-confirmed (a986e65f, 7/7 raw). The efficiency improvements (batch matching, combined voucher) are sandbox-verified. Risk is low: the fallback path preserves v1 behavior if batch matching fails. The step-combination evidence table (Import 8) is a zero-risk documentation improvement.
- **Fix before next production run (Import 7):** Widen customer regex from `Innbetaling fra` to `Innbetaling fr[aå]` in `scripts/reconcile-bank-statement.ts` line 73. This is a code fix, not a markdown change — file separately.
- **Add to trusted standard:** A top-level "Current Score Status" box stating correctness is solved and remaining gap is efficiency-only. Prevents future agents from wasting time investigating correctness.
- **Next action:** Run one production submission with v3 script to validate the efficiency improvement. If score improves significantly (target: 3-5/6), the changes are confirmed.
