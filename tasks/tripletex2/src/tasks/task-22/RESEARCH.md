# Task 22 — Register receipt expense voucher Research Memory

This file is the task-local research memory for improving agents.
Read it together with `task.ts`, the generated packet, and `research/AGENTS.md`.
Update it after any meaningful frontier import, sandbox verification, promotion decision, or blocker discovery.

## Current Runtime Surface

- Canonical task id: `22`
- Active strategy pin: `22.receipt-expense-booking.v1`
- Task implementation: `task.ts`
- Stable task summary: _No task-local README.md yet_

## Current Research Queue Snapshot

- Priority: `3`
- Band: `focus`
- Queue eligibility: `ready`
- Research lane: `zero-score-upside`
- Best known score: `2.1` / `6` (correctness 0.7, raw 7/10, 4/5 checks)

## Current State

### Queue Notes

- Was zero-score for 9 attempts, broke through on attempt 10 (run 3373fbc9).
- Check 3 (amount/VAT treatment) consistently fails. Other 4 checks pass.
- Root cause analysis completed 2026-03-22 (see below).

## Deep Analysis — 2026-03-22

### Production Run Evidence

**Best run: `prod-2026-03-21-204331765Z-3373fbc9` (score 7/10, correctness 0.7)**
- Prompt: "Vi trenger Togbillett fra denne kvitteringen bokfort pa avdeling Administrasjon. Bruk riktig utgiftskonto basert pa kjopet, og sorg for korrekt MVA-behandling."
- Receipt (kvittering_nb_01.pdf): NSB, 27.02.2026
  - Togbillett: 8750.00 kr
  - Headset: 310.00 kr
  - Kundemøte lunsj: 240.00 kr
  - Totalt: 9300.00 kr
  - herav MVA 25%: 2325.00 kr
  - Betalt med: Bedriftskort
- API calls: 4 (POST /department, GET /ledger/account, POST /ledger/voucher?sendToLedger=true, POST attachment)
- Values used: `amountGross=10937.50` (= 8750 * 1.25), `vatType={id:1}` (25% incoming)
- Tripletex computed: NET=8750, VAT=2187.50
- Result: Check 1 pass, Check 2 pass, **Check 3 FAIL**, Check 4 pass, Check 5 pass

**Zero-scoring runs (all 5/5 checks failed):**
- `1519c2a7`: Togbillett 11350, no `sendToLedger=true`, used 12% VAT — all 5 fail (unbooked voucher)
- `67d4ddca`: Overnatting 4850, no `sendToLedger=true`, used 12% VAT — all 5 fail
- `01420e60`: Kundemøte lunsj 14050, no `sendToLedger=true` — all 5 fail
- `4c7f5f3e`: Kaffemøte 6600, wrong account (7360 instead of 6860) — all 5 fail
- Zero-scoring runs all had `sendToLedger` missing (draft voucher = invisible to scorer) AND/OR wrong account

### Check 3 Root Cause Analysis

Check 3 checks amount / VAT treatment. The best run passed 4/5 but failed Check 3 only.

**Two independent issues may contribute:**

#### Issue 1: NET vs GROSS interpretation of receipt prices

The trusted standard's "NET detection rule" says: if `total * 0.25 == stated MVA`, prices are NET.
- Receipt: 9300 * 0.25 = 2325 = stated MVA. Rule says NET.
- Production run treated 8750 as NET, computed GROSS = 8750 * 1.25 = 10937.50.

**Problem**: "herav MVA" in Norwegian literally means "of which VAT" — i.e., the stated total INCLUDES VAT. Standard Norwegian retail receipts show GROSS (VAT-inclusive) prices. The "25%" label on the receipt is the tax rate, not a multiplier on a NET total.

**However**: the math `9300 * 0.25 = 2325` only works if all items are treated at a flat 25% rate on NET prices. If prices were GROSS at 25%, then VAT = 9300 / 1.25 * 0.25 = 1860 (not 2325). So the receipt is internally consistent ONLY under the NET interpretation with flat 25%.

**BUT**: this is a synthetic test receipt. Real Norwegian train tickets are subject to 12% VAT (transport rate), not 25%. The synthetic receipt uses a simplified "herav MVA 25%" that doesn't account for per-item VAT rate differences. The scorer may expect the line amount to be treated as GROSS (the way Norwegian receipts normally work) rather than following the synthetic receipt's math.

**Recommendation**: The most likely correct interpretation is `amountGross = 8750` (treat receipt line price as GROSS). This is what a Norwegian accountant would do — book the receipt amount as-is, since Norwegian retail receipts show VAT-inclusive prices.

#### Issue 2: VAT rate for transport (Togbillett)

Norwegian statutory VAT rates:
- 25% (høy sats / high rate): general goods and services
- 15% (middels sats / medium rate): food and drink
- 12% (lav sats / low rate): transport, cinema, hotels, broadcasting
- 0%: exports, certain services

**Togbillett (train ticket) = transport = 12% VAT in Norway.**

The trusted standard overrides to 25% because the receipt says "MVA 25%", but:
- The receipt's "MVA 25%" is a blended summary across all items
- Per Norwegian tax law, togbillett should be 12%
- Account 7140 (Reisekostnad) defaults to vatType.id=12 (12% incoming) — this IS the correct default for transport
- The prompt explicitly says "sorg for korrekt MVA-behandling" (ensure correct VAT treatment)

**Recommendation**: Use `vatType={id:12}` (12% incoming) for Togbillett, not `vatType={id:1}` (25%). The account's default is correct.

### Sandbox Verification — 2026-03-22

Sandbox tests on the persistent Tripletex sandbox (using account 2990 as balancing due to bank reconciliation lock on 1920):

| Test | amountGross | vatType | Tripletex NET (amount) | Tripletex VAT | Notes |
|------|-------------|---------|----------------------|---------------|-------|
| A | 8750 | id=1 (25%) | 7000 | 1750 | Treat as GROSS, 25% VAT |
| B | 8750 | id=12 (12%) | 7812.50 | 937.50 | Treat as GROSS, 12% VAT (transport) |
| C | 10937.50 | id=1 (25%) | 8750 | 2187.50 | Production run value — FAILED Check 3 |

Account 7140 details:
- Name: "Reisekostnad, ikke oppgavepliktig"
- Default vatType: id=12 (12% incoming, "Fradrag inngaende avgift, lav sats")
- vatLocked: false
- Legal vatTypes: 0, 1, 12, 230, 13, 14, 550, 553, 559, 560

VAT types available (INCOMING):
- id=0: 0% "Ingen avgiftsbehandling"
- id=1: 25% "Fradrag inngaende avgift, hoy sats"
- id=12: 12% "Fradrag inngaende avgift, lav sats"

### Hypotheses ranked by likelihood

### CORRECTION (2026-03-22 deep agent analysis): Receipts ARE NET

The earlier analysis incorrectly recommended treating receipt prices as GROSS. Detailed investigation
of the trusted standard confirms: receipt line prices are **NET** (before VAT).

**Detection rule**: if `total * 0.25 == stated MVA` → prices are NET.
- Receipt: 9300 * 0.25 = 2325 = stated MVA → **NET confirmed**.

GROSS conversion depends on the **item's statutory VAT rate**, NOT the receipt's blended "25%":
- Branch A (representation, 7360): vatType=0 (non-deductible), GROSS = NET (all 4 fields = NET amount)
- Branch B (purchase, 6540): GROSS = NET * 1.25, vatType=1
- Branch C (transport, 7140): GROSS = NET * **1.12**, vatType=12
- Branch D (meeting, 6860): GROSS = NET * 1.25, vatType=1

**For Togbillett (Branch C)**:
- NET = 8750 (receipt line price)
- GROSS = 8750 * 1.12 = **9800**
- vatType = 12 (12% incoming, lav sats)
- Sandbox verified: voucher with amountGross=9800, vatType=12 → auto-computed amount=8750, auto-VAT=1050 on account 2712

**ELIMINATED hypotheses**:
- amountGross=8750 treated as GROSS → WRONG (NET * 1.12 = 9800)
- amountGross=10937.50 with vatType=1 → WRONG (production run, Check 3 failed)
- amountGross=8750 with vatType=1 → WRONG (25% is wrong rate for transport)

### Additional Strategy Gaps Found

1. **Missing accounts 6540 and 6860** in `DEFAULT_EXPENSE_ACCOUNT_CANDIDATES` (lines 70-83).
   The strategy cannot select the correct account for Branch B (Kontorstoler → 6540) or
   Branch D (Kaffemøte → 6860) unless expenseAccountNumber is explicitly passed in input.

2. **Missing `?sendToLedger=true`** on voucher creation (line 202 in strategy).
   Multiple production runs failed all 5 checks because vouchers stayed in draft.

3. **Branch A (representation)**: Account 7360 has vatType locked to 0 (non-deductible).
   All 4 amount fields should be set to the same value (the NET/GROSS distinction is moot when VAT=0%).

### Strategy Code Analysis

The current `receipt-expense-booking.ts` strategy:

1. **Amount handling** (line 129, 219): Passes `input.grossAmountNok` directly as `amountGross`. The LLM extractor is responsible for deciding whether to pass 8750 (GROSS interpretation) or 10937.50 (NET * 1.25). The strategy itself does NO NET-to-GROSS conversion.

2. **VAT rate inference** (lines 494-510): `inferVatRatePercent()` first looks for explicit percentage mentions in evidence text (regex `/\b(0|12|15|25)(?:[.,]0+)?\s*%/g`). Receipt text contains "MVA 25%" so it returns 25. Falls back to `looksLikeTravel()` → 12 only if no percentage is found in text.

3. **VAT type selection** (lines 458-492): `chooseIncomingVatType()` searches for `preferredRatePercent` first, then tries the opposite (12 if preferred was 25, or vice versa). Since the receipt mentions "25%", the strategy picks vatType.id=1 (25%).

**Root cause in strategy code**: The `inferVatRatePercent` function incorrectly uses the receipt's blended "MVA 25%" label as the per-item VAT rate. For Togbillett, it should use 12% (transport rate) regardless of what the receipt summary says. The receipt text regex match on "25%" overrides the `looksLikeTravel()` fallback that would correctly return 12%.

### Required Fixes (strategy code changes)

**Fix 1: VAT rate inference priority inversion**
- `inferVatRatePercent()` should check `looksLikeTravel()` BEFORE scanning for explicit percentages in receipt text
- Or: when `looksLikeTravel()` is true, ALWAYS return 12 regardless of receipt text
- The receipt's "MVA 25%" is a blended summary, not the per-item rate

**Fix 2: grossAmountNok extraction guidance**
- The `extractionNotes` in `task.ts` should clarify that receipt line prices are the booking amount (GROSS)
- The LLM should pass `grossAmountNok = 8750` (the receipt line price), not `8750 * 1.25`
- The field is named "grossAmountNok" precisely because it should be the gross amount

**Fix 3: Remove or deprioritize receipt-text VAT percentage scanning for known expense categories**
- Transport items (tog, fly, buss, taxi) → always 12% regardless of receipt text
- Food/drink items → always 15% (or 25% for restaurant/representation depending on deductibility)
- General goods → 25%

### Specific code changes needed

In `inferVatRatePercent()`:
```
// BEFORE (wrong - receipt blended rate overrides category rate):
if (percentageMatches.length > 0) return percentageMatches[0]!;
if (looksLikeTravel(normalizedEvidence)) return 12;
return 25;

// AFTER (correct - category-specific rate takes priority):
if (looksLikeTravel(normalizedEvidence)) return 12;
if (percentageMatches.length > 0) return percentageMatches[0]!;
return 25;
```

In `task.ts` extractionNotes, add:
```
"Receipt line prices on Norwegian receipts are GROSS (VAT-inclusive). Pass the receipt line amount directly as grossAmountNok without any multiplication."
```

## Frontier Memory

- **Strongest known branch**: receipt-expense-booking.v1 with account 7140 for Togbillett
- **Score ceiling**: 2.1/6 (7/10 raw, 4/5 checks, Check 3 fails on amount/VAT)
- **Call-budget frontier**: 4 calls proven minimum (POST dept, GET accounts, POST voucher?sendToLedger=true, POST attachment)
- **Key insight**: Check 3 failure is caused by BOTH wrong gross amount (10937.50 instead of 8750) AND wrong VAT rate (25% instead of 12% for transport)
- **Anti-patterns**:
  - Missing `?sendToLedger=true` → all 5 checks fail (voucher stays in draft)
  - Using 7360 for Kaffemote → wrong account, 0/10
  - Treating receipt line price as NET and multiplying by 1.25 → wrong amountGross
  - Using receipt's blended "MVA 25%" as per-item VAT rate for transport → wrong VAT

## Next Improving-Agent Update Checklist

- [ ] Fix `inferVatRatePercent()` to prioritize category-specific rates over receipt text
- [ ] Update extraction notes to clarify GROSS pricing on Norwegian receipts
- [ ] Sandbox-verify with `amountGross=8750, vatType=12` on account 7140
- [ ] Consider whether the same GROSS interpretation applies to ALL task-22 branches (B, C, D)
- [ ] Test with other receipt variants (Overnatting, Kontorstoler, Forretningslunsj, Kaffemote)
- [ ] If Hypothesis 1 is confirmed, update ALL branches to treat receipt prices as GROSS
