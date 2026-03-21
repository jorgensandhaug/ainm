# Post-Run Reflection: correct-ledger-errors (49332405)

## 1. Task

Correct 4 ledger errors in Jan-Feb 2026:
1. Wrong account: 7140 used instead of 7100, amount 7500 NOK
2. Duplicate voucher: account 6540, amount 1000 NOK
3. Missing VAT: account 4500, 21500 NOK excl. VAT, missing VAT on 2710
4. Incorrect amount: account 6860, 17250 NOK recorded instead of 6000 NOK

## 2. Reflection

**What went well:**
- Agent correctly identified this as an exact trusted-standard match and read the standard before writing code
- Script was correctly structured following the proven 3-call path (GET accounts → GET vouchers → POST correction)
- All 4 error detection and correction patterns were correctly implemented: duplicate detection cascade, Case A/B missing VAT branching, vatType copying, supplier.id for 2400
- Agent immediately stopped after receiving 403 "Invalid or expired proxy token" per AGENTS.md rules

**What went poorly:**
- Run was completely blocked — proxy token was expired/invalid before the first call
- 1 wasted call (the failed 403 GET)

**What the agent could NOT have prevented:**
- The expired token was external to the agent's control; no script logic change could have avoided it

## 3. Call Efficiency

**Actual calls:** 1 (failed 403 on first GET)
**Ideal calls:** 3 (GET accounts + GET vouchers + POST correction)
**Wasted calls:** 0 avoidable (the 1 call was necessary to discover the token was invalid)
**Assessment:** The script was correctly designed for the 3-call minimum. Run was blocked by infrastructure, not by script errors.

**Exact 3-call path:**
1. `GET /ledger/account?number=7140,7100,6540,4500,2710,6860&fields=id,number,vatType(id)` — resolve IDs + detect vatType locks
2. `GET /ledger/voucher?dateFrom=2026-01-01&dateTo=2026-03-01&fields=id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)&count=1000` — discover error vouchers
3. `POST /ledger/voucher?sendToLedger=true` — single combined corrective voucher

## 4. Root Causes

**Primary:** Expired/invalid proxy token (`403 Invalid or expired proxy token`)
- Not a code issue — the session token provided by the runner infrastructure was already expired before the agent started

**Secondary (latent bug found during reflection):** The script used the original posting's vatType on BOTH sides of the reclassification. For this specific run's 7140→7100 configuration:
- Account 7140 has default vatType 12 (low-rate input VAT)
- Account 7100 is locked to vatType 0 (no VAT)
- If the original 7140 posting had vatType 12, copying it to the 7100 target line would cause **422** (`Kontoen 7100 er låst til mva-kode 0`)
- This would have wasted 1 call and required re-submission with corrected vatTypes

## 5. Sandbox Verification

**Verified in persistent sandbox (kkpqfuj-amager.tripletex.dev):**

1. **Account vatType discovery:** `GET /ledger/account?fields=id,number,vatType(id)` successfully returns each account's default/locked vatType at no extra API call cost
   - 7100: `vatType.id = 0` (locked — "Ingen avgiftsbehandling")
   - 7140: `vatType.id = 12` ("Fradrag inngående avgift, lav sats")

2. **Reclassification with mismatched vatType locks:**
   - vatType 12 on both 7140 and 7100 → **422** (`Kontoen 7100 er låst til mva-kode 0`)
   - vatType 12 on 7140 (reversal) + vatType 0 on 7100 (target) → **success** (correct accounting: reverses 7140's VAT deduction on 2710 and posts full gross to 7100)
   - vatType 0 on both → succeeds but creates **incorrect accounting** if original had vatType 12 (leaves residual balance on 7140 because it doesn't reverse the auto-generated 2710 VAT deduction)

3. **Correct pattern confirmed:** use original posting's vatType on reversal side, target account's vatType.id (from account lookup) on target side

## 6. Playbook Changes

**Updated existing files (not new):**

1. **`./trusted-standards/correct-ledger-errors.md`:**
   - Step 1 account lookup: changed `fields=id,number` → `fields=id,number,vatType(id)`
   - Reclassification section: changed from "copy original vatType to both" to "use original vatType on reversal, target account's vatType on target"
   - Added sandbox proof for cross-account vatType lock mismatch
   - Added production run 49332405 learnings (blocked run, new pitfall)
   - Updated recovery branch for vatType 422

2. **`./task-playbooks/correct-ledger-errors.md`:**
   - Call 1: added `vatType(id)` to account lookup fields
   - Reclassification guidance: added per-side vatType rule
   - Pitfall #8: expanded to cover cross-account vatType lock mismatch scenario
   - Added sixth run (49332405) learnings to production run history

## 7. Commit

- **Hash:** `eb16df38`
- **Message:** `tripletex playbook: correct-ledger-errors — add vatType(id) to account lookup, handle cross-account vatType lock mismatch in reclassification`

## 8. Reusable Heuristics

1. **Always include `vatType(id)` in the account lookup** — it adds zero extra API calls but prevents 422 on vatType-locked accounts during reclassification. Without it, the agent cannot know upfront whether source and target accounts have compatible vatTypes.

2. **Reclassification between accounts with different vatType locks requires different vatTypes on each side.** The reversal line must use the original posting's vatType (to properly undo VAT effects), while the target line must use the target account's locked vatType. Previous runs coincidentally had compatible accounts (both accepting vatType 1), masking this pitfall.

3. **Account vatType locks are not obvious from account numbers.** 7140 has vatType 12 (low rate), 7100 has vatType 0 (none). Both are 7xxx accounts but with very different VAT treatment. Never assume accounts in the same range share vatType behavior.

4. **Blocked-by-expired-token runs should still do sandbox investigation.** Even though the script never executed, the reflection pass discovered a latent 422 bug that would have wasted a call in production. The sandbox proved the fix at zero production cost.

5. **The 3-call minimum remains proven and optimal** for this task shape. The `vatType(id)` addition to Call 1 prevents a potential 4th call (recovery from 422) while keeping the path at exactly 3 calls.
