# Task 22 — Register receipt expense voucher

**Status: `review-ready`**

## Snapshot
- Tripletex1 current best score: 7/10 raw (2.1/6 competition-weighted), 4/5 checks pass
- Priority: 3 (focus band, zero-score-upside lane)
- Target Tripletex1 surface:
  - `tasks/tripletex/codex-environment/AGENTS.md` (lines 519-527)
  - `tasks/tripletex/codex-environment/trusted-standards/register-receipt-expense-voucher.md`
  - `tasks/tripletex/codex-environment/task-playbooks/register-receipt-expense-voucher.md`
- Source Tripletex2 materials reviewed:
  - `tasks/tripletex2/src/tasks/task-22/RESEARCH.md`
  - `tasks/tripletex2/src/tasks/task-22/strategies/receipt-expense-booking.ts` (v1, pinned)
  - `tasks/tripletex2/src/tasks/task-22/strategies/receipt-expense-booking-v2.ts` (v2, NET-to-GROSS variant)
  - `tasks/tripletex2/src/tasks/task-22/task.ts`
  - `tasks/tripletex2/research/packets/task-22/*.json`
  - `tasks/tripletex2/research/proofs/task-22/task-22-proof-input.json`

## Current Tripletex1 coverage

The Tripletex1 trusted standard and playbook are **comprehensive** for this task. They cover:
- 4-branch decision tree (A: representation/7360, B: purchase/6540, C: transport/7140, D: meeting/6860)
- 9 documented fatal mistakes with production run evidence
- Explicit GROSS interpretation: "Receipt line amounts ARE GROSS (VAT-inclusive). Use them DIRECTLY as amountGross."
- Detailed payload shapes for all 4 branches
- Sandbox verification for all 4 branches (2026-03-22)
- Call flow: department → account GET → voucher POST → verify → attachment POST → verify
- Recovery branches for department 409, substring search traps, immutable importDocument

**Persistent Check 3 failure**: The one failing check across all production runs is Check 3 (amount/VAT treatment). Best runs score 4/5 checks (7/10 raw). No production run has achieved 10/10 yet.

### Important gaps or stale guidance

1. **"Kundemøte lunsj" routing may be wrong** — Tripletex1 lists "Kundemøte lunsj" under Branch A (representation, 7360). The only production run with this prompt (01420e60) scored 0/10, but the root cause was missing `sendToLedger`, so the account choice was never tested. This mapping is unverified.

2. **No explicit guidance on "bedriftskort" in receipt text** — Receipts say "Betalt med: Bedriftskort" (paid with company card). The word "bedriftskort" could confuse an LLM into treating it as a business/representation keyword. The trusted standard doesn't warn about this.

3. **NET vs GROSS interpretation is asserted but not production-proven for branches B/C/D** — The sandbox verification supports GROSS, but the only production-verified 10/10 is pending (run 70014f3c, Branch A — where GROSS=NET since VAT=0%).

## Candidate imports from Tripletex2

### Import 1 — NET vs GROSS interpretation conflict
- **Insight**: Tripletex2 research concluded receipt line prices are NET (before VAT), not GROSS. Their strategy v1 and v2 both apply NET-to-GROSS conversion: `actualGross = receiptLinePrice * (1 + vatRate/100)`. For Togbillett: `amountGross = 8750 * 1.12 = 9800`, not `8750`.
- **Why it seems new**: Tripletex1 asserts the opposite — amounts are GROSS, used directly. This is the most fundamental disagreement between the two systems.
- **Evidence**:
  - Tripletex2 RESEARCH.md mathematical analysis: receipt total 9300 * 0.25 = 2325 = stated MVA. This only holds if prices are NET at a flat 25% rate (`tasks/tripletex2/src/tasks/task-22/RESEARCH.md`, "CORRECTION" section).
  - Tripletex2 sandbox: amountGross=9800 with vatType=12 → Tripletex auto-computed amount=8750, VAT=1050 on account 2712 (verified).
  - Tripletex1 sandbox: amountGross=8750 with vatType=12 → Tripletex auto-computed amount=7812.50, VAT=937.50 on account 2712 (also verified).
  - Both sandbox results are internally valid — the question is what the competition scorer expects.
  - Production evidence is inconclusive: run 3373fbc9 used amountGross=10937.50 (8750*1.25, wrong VAT too) → failed. Neither 8750 nor 9800 has been tried in production for Branch C.
  - Counter-argument: "herav MVA" in Norwegian literally means "of which VAT" → amounts include VAT (GROSS). The math coincidence (total*0.25=MVA) is because this is a synthetic receipt with simplified tax math.
- **Confidence**: LOW — genuinely unresolved. The mathematical argument for NET is compelling, but "herav MVA" semantics favor GROSS. Neither interpretation has a production 10/10 for branches B/C/D.

### Import 2 — "Kundemøte lunsj" routing ambiguity
- **Insight**: Tripletex2 routes "Kundemøte lunsj" to Branch D (meeting expense, 6860) via `kundemote` in the meeting-expense regex. Tripletex1 routes it to Branch A (representation, 7360).
- **Why it seems new**: The two systems disagree on account mapping for this specific receipt line text.
- **Evidence**:
  - Tripletex2 strategy v1 (`receipt-expense-booking.ts:799`): `looksLikeMeetingExpense` includes `kundemote` and fires before `looksLikeRepresentation`.
  - Tripletex2 RESEARCH.md routing verification: "Kundemøte lunsj" → 6860-meeting (tested both with ø and ASCII o).
  - Tripletex1 trusted standard (line 67): "Kundemøte lunsj" explicitly listed under Branch A (7360).
  - No production run has verified which is correct — the only "Kundemøte lunsj" run (01420e60) failed due to missing sendToLedger.
  - Linguistic argument: "Kundemøte" = customer meeting. In Norwegian accounting, customer entertainment is typically representasjon. But "kundemøte" could also mean an internal meeting about a customer.
- **Confidence**: LOW — ambiguous. Tripletex2's routing is untested in production. Tripletex1's mapping is explicit but also untested.

### Import 3 — "Bedriftskort" misrouting risk
- **Insight**: Receipt text "Betalt med: Bedriftskort" (paid with company card) can cause an LLM to misroute travel/meeting receipts to representation (7360), because "bedriftskort" looks like a business/corporate keyword. The Tripletex2 v2 strategy still has `bedriftskort` in its representation regex; v1 removed it.
- **Why it seems new**: Tripletex1 has no guidance warning about "bedriftskort" as a payment method, not an expense category.
- **Evidence**:
  - Tripletex2 RESEARCH.md (commit 4d35cdd9): "Removed `bedriftskort` and bare `lunsj` from representation regex: `bedriftskort` is a payment method, not expense category."
  - Tripletex2 routing test: "Togbillett + Bedriftskort" → correctly routes to 7140-travel after fix, but would have hit 7360-representation before.
  - Production run 67d4ddca: "Overnatting" receipt (likely with Bedriftskort text) scored 0/10, though root cause was sendToLedger.
- **Confidence**: MEDIUM — the routing logic insight is sound and verified in Tripletex2's inline test suite (11 scenarios). However, for Tripletex1 this is LLM-agent guidance, not code. The LLM may or may not make this mistake.

### Import 4 — ø/æ normalization in receipt text matching
- **Insight**: Norwegian letters ø (U+00F8) and æ (U+00E6) survive NFKD Unicode normalization because they are single codepoints, not decomposable. Receipt PDF text extraction may produce real ø/æ characters that don't match ASCII patterns (e.g., "kaffemote" regex won't match "kaffemøte").
- **Why it seems new**: Tripletex1 doesn't mention text normalization. This is a code-level fix, but the underlying insight (ø≠o, æ≠ae in receipt OCR) could help the LLM agent normalize correctly.
- **Evidence**:
  - Tripletex2 strategy v1 (`receipt-expense-booking.ts:819-827`): `normalizeText` explicitly replaces `ø→o`, `æ→ae` after NFKD.
  - Tripletex2 routing test: both "Kaffemøte" (ø) and "Kaffemote" (o) correctly route to 6860.
- **Confidence**: MEDIUM — the fix is verified. Relevance to Tripletex1 depends on whether the LLM agent does text matching. Since Tripletex1 uses an LLM (not deterministic code), the LLM likely handles Unicode natively, making this less critical.

### Import 5 — Bare "lunsj" is too ambiguous for representation routing
- **Insight**: The word "lunsj" alone should not trigger representation (7360). Only "forretningslunsj" is clearly representation. "Lunsj" could appear in meeting contexts ("kaffemøte med lunsj") where the correct account is 6860.
- **Why it seems new**: Tripletex1's decision tree uses "business lunch" as a Branch A keyword. If the LLM sees "lunsj" in any context, it might default to representation.
- **Evidence**:
  - Tripletex2 RESEARCH.md (commit 4d35cdd9): "Bare `lunsj` is ambiguous — only `forretningslunsj` is representation-specific."
  - Tripletex2 routing test: "Fly + lunsj" → routes to 7140-travel (not representation).
- **Confidence**: MEDIUM — the disambiguation logic is sound. Could prevent LLM misrouting.

## Proposed markdown deltas

### AGENTS.md
- **Proposed addition** (after line 523): Add a warning about "bedriftskort" and "lunsj" ambiguity:
  ```
  - "Bedriftskort" in receipt text means "company card" (payment method) — it does NOT indicate representation. Do not use it to select Branch A.
  - Bare "lunsj" is ambiguous. Only "forretningslunsj" is clearly representation (Branch A). "Lunsj" appearing with travel or meeting contexts should follow the primary keyword (Togbillett → Branch C, Kaffemøte → Branch D).
  ```
- **Reason**: Prevents LLM from misrouting on payment method keywords. Low risk, additive-only.

### Trusted standard
- **Target file**: `register-receipt-expense-voucher.md`
- **Proposed addition 1** (Branch selection section, ~line 63): Add a disambiguation note:
  ```
  **"Bedriftskort" trap**: Receipts showing "Betalt med: Bedriftskort" (company card) are indicating the PAYMENT METHOD, not the expense type. "Bedriftskort" does NOT mean representation. Route based on the purchased item (Togbillett, Kaffemøte, etc.), not the payment method.
  ```
- **Proposed addition 2** (Branch A keywords, ~line 67): Qualify "Kundemøte lunsj":
  ```
  ⚠️ "Kundemøte lunsj" is listed here as representation, but this has NOT been production-verified. Tripletex2 research routes it to meeting expense (6860) instead. Treat this mapping as tentative until production-verified.
  ```
- **Reason**: Adds defensive notes for known ambiguities without changing the existing flow.

### Playbook
- **Target file**: `register-receipt-expense-voucher.md`
- **Proposed addition** (Step 1 section, after Branch C note on line 39): Add "Bedriftskort" note:
  ```
  **Payment method ≠ expense type**: "Bedriftskort" (company card) in receipt text describes how the purchase was paid, not what was purchased. Do not use payment method text for branch selection.
  ```
- **Reason**: Same as trusted standard — defensive guidance for the LLM agent.

## Risks / caveats

### Mapping ambiguity
- **NET vs GROSS is the core unresolved question.** Tripletex1 says GROSS (use directly), Tripletex2 says NET (multiply by statutory rate). Both have sandbox evidence; neither has production 10/10 for branches B/C/D. Importing the NET interpretation without production proof would contradict the entire Tripletex1 trusted standard and could make scores worse if GROSS is actually correct.
- **"Kundemøte lunsj" account mapping is ambiguous.** 7360 (representation) vs 6860 (meeting) — Norwegian accounting norms are genuinely unclear for this term. No production evidence either way.

### Conflicting evidence
- The Tripletex2 RESEARCH.md itself went back and forth: first recommended GROSS, then issued a "CORRECTION" to NET. This oscillation suggests the evidence is not strong enough to be conclusive.
- Tripletex2's v1 strategy code now has NET-to-GROSS conversion baked in (lines 204-216), but this code has never run in production.

### Not safe to port yet
- **Import 1 (NET vs GROSS)**: MUST NOT be ported until one interpretation achieves production 10/10 for a Branch B, C, or D prompt. This is the single highest-impact question but also the highest-risk change.
- **Import 2 (Kundemøte lunsj)**: Should not change the trusted standard until production-verified. Flagging it as tentative is safe.

## Recommendation

**Partial adopt now / partial hold:**

| Import | Recommendation | Rationale |
|--------|---------------|-----------|
| 1 — NET vs GROSS | **Hold** | Highest impact but unresolved. Need production verification before changing Tripletex1's GROSS assertion. |
| 2 — Kundemøte lunsj | **Hold** | Add a tentative warning but do not change the branch table yet. |
| 3 — Bedriftskort warning | **Adopt now** | Low-risk additive guidance. Cannot hurt scores. Prevents a plausible LLM misrouting. |
| 4 — ø/æ normalization | **Hold** | Code-level fix, not directly applicable to LLM-agent markdown guidance. |
| 5 — Bare "lunsj" disambiguation | **Adopt now** | Low-risk additive guidance. Clarifies an existing ambiguity in the branch table. |

**Next steps to resolve the hold items:**
1. Run a production attempt for Branch C (Togbillett) with amountGross=8750 (GROSS interpretation, current Tripletex1 guidance).
2. If Check 3 fails, run with amountGross=9800 (NET * 1.12, Tripletex2 interpretation).
3. Run a production attempt with "Kundemøte lunsj" using account 6860 to test the meeting-expense hypothesis.
4. Whichever interpretation achieves 10/10, update all Tripletex1 surfaces accordingly.
