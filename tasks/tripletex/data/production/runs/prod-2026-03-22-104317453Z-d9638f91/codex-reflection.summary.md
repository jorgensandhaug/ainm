# Post-Run Reflection: prod-2026-03-22-104317453Z-d9638f91

## 1. Task

Correct 4 ledger errors in Jan–Feb 2026:
- Wrong account: 6300→7100, 7750 NOK
- Duplicate voucher: 7100, 1700 NOK
- Missing VAT: 6500, 7450 NOK excl. VAT (missing 2710)
- Incorrect amount: 6590, 24950→12600 NOK

**Result: 6/6 (perfect), 1 POST, 0 errors.**

## 2. Reflection

**What went well:**
- Exact trusted-standard match recognized immediately — read the standard first, filled in constants, ran it
- 4-layer missing-VAT detection correctly handled the Layer 3 edge case (vatType=1 with description "uten MVA")
- All 4 corrections combined into a single POST — maximum efficiency
- Pre-POST validation caught potential issues before the only scored call
- No wasted time reading AGENTS.md, openapi.json, or playbook — went straight to trusted standard

**What went poorly:**
- Nothing. This was a clean run.

**Mistakes:**
- None. The template worked as designed.

## 3. Call Efficiency

**The run was minimal-call.** Exact breakdown:

| Call | Type | Purpose | Scored? |
|------|------|---------|---------|
| GET /ledger/account | Free | Resolve account IDs + vatTypes | No |
| GET /ledger/voucher | Free | Discover vouchers with nested posting expansion | No |
| POST /ledger/voucher | Scored | Combined correction voucher (all 4 fixes) | Yes |
| GET /ledger/voucher | Free | Post-correction verification | No |

**Wasted calls: 0.** This is the theoretical minimum: 1 POST for all corrections.

**Lower-call path for next agent:** Same as what was done — 1 POST. Cannot go lower. The 3 GETs are free and essential for detection + verification.

## 4. Root Causes

No failures to analyze. The run confirmed:

1. **Layer 3 detection is critical.** In both runs 463433ee and d9638f91, the error voucher "Varekjøp uten MVA" had vatType=1 (not 0) and has2710=true. Layers 1+2 returned 0 candidates. Layer 3 (description keywords) correctly matched.

2. **Account 2400 supplier propagation works.** The missing-VAT contra was 2400 with supplier.id — template correctly copied supplier to avoid 422.

3. **vatType copying from originals prevents 422.** Accounts 6300 and 7100 both had vatType=0, so the correction used vatType=0. Account 6590 had vatType=1, so the correction mirrored it (auto-generating correct 2710 offset).

## 5. Sandbox Verification

- Sandbox test confirmed POST /ledger/voucher?sendToLedger=true works with balanced two-line voucher
- Account lookup confirmed 6300 (id=424191117, vatType=0) and 7100 (id=424191163, vatType=0) exist
- Created test voucher id=609402914 (number=900) successfully
- No additional optimization opportunities found — the template is already at 1 POST minimum

## 6. Playbook Changes

Updated existing files (no new files created):

| File | Change |
|------|--------|
| `./trusted-standards/correct-ledger-errors.md` | Added run d9638f91 to production history (Layer 3 matched again, 6/6) |
| `./task-playbooks/correct-ledger-errors.md` | Added run d9638f91, updated history to show 2 consecutive 6/6 runs |
| `./AGENTS.md` | Updated Check 3 section: replaced "failed in ALL 13+ runs" with current status showing 4-layer detection now passes consistently |

## 7. Commit

- **Hash:** `53653760`
- **Message:** `tripletex playbook: correct-ledger-errors — add run d9638f91 (6/6) + update Check 3 docs`

## 8. Reusable Heuristics

1. **4-layer missing-VAT detection is proven stable.** Two consecutive 6/6 runs (463433ee, d9638f91) both required Layer 3 (description). Layers 1+2 alone are insufficient for the common edge case where vatType=1 is applied to the MV_ACCT posting.

2. **Combined correction voucher = 1 POST.** All 4 corrections fit in a single POST with multiple posting rows. Never split into multiple vouchers.

3. **Copy vatType from original postings.** Never hardcode vatType=1. Accounts like 7100 are locked to vatType=0 → 422 if you send vatType=1.

4. **Copy supplier.id from 2400 postings.** Account 2400 requires supplier reference → 422 without it.

5. **Description keywords are reliable for Layer 3.** Both observed error vouchers used "Varekjøp uten MVA" — the regex pattern `/uten MVA|utan MVA|without VAT|ohne MwSt|sin IVA|sem IVA|sans TVA/i` covers all known prompt languages.

6. **Pre-POST validation is cheap insurance.** Checking gross sum == 0 and all account.id present catches errors before the only scored call.

7. **For exact trusted-standard matches: read standard → fill constants → run.** Don't read AGENTS.md, openapi.json, or playbook. Two production runs timed out at 0 API calls from reading too many files.
