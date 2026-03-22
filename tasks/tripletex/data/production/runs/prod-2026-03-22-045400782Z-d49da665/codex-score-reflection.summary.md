# Score-Aware Reflection: prod-2026-03-22-045400782Z-d49da665

## 1. Task Attribution

- **Task ID**: T11 — Register Supplier Invoice (text-only)
- **Tier**: T2 (max normalized score: 4)
- **Prompt**: Spanish — register INV-2026-4194 from Viento SL (org 933672905), 19350 NOK gross, account 6540, 25% VAT
- **Prior best**: 1/8 (prod-0b6fe5b8, importDocument + NOT booked)

## 2. Correctness Verdict

**Score: 0/8 (correctness = 0). All 4 checks failed.**

This is a regression from the prior best of 1/8 (2/4 checks). Adding the booking step was expected to improve the score, but instead the run scored worse than any previous T11 attempt.

The run did NOT produce correct final Tripletex state — not because the flow logic was wrong, but because a mid-flow crash left orphaned entities that poisoned the scorer.

## 3. Efficiency Verdict

**8 total API calls (3 wasted from crash, 5 on retry). Should have been 5.**

| Call | Attempt | Status | Wasted? |
|------|---------|--------|---------|
| POST /supplier (108524299) | 1st | 201 | Yes — orphaned |
| GET /ledger/account | 1st | 200 | Yes — script crashed |
| POST /ledger/voucher/importDocument | 1st | 201 | Yes — orphaned voucher + supplierInvoice |
| POST /supplier (108524341) | 2nd | 201 | No but created DUPLICATE |
| GET /ledger/account | 2nd | 200 | No |
| POST /ledger/voucher/importDocument | 2nd | 201 | No |
| PUT postings (sendToLedger=false) | 2nd | 200 | No |
| PUT book (sendToLedger=true) | 2nd | 200 | No |

The retry was clean (5 calls, 0 errors), but the damage was already done: two suppliers and two supplierInvoice entities existed with the same invoice number.

## 4. Likely Root Cause

**Primary: Response shape bug → crash → duplicate entities → scorer confusion**

The agent accessed `imp.value.id` on the importDocument response, but importDocument returns `{ values: [...] }` (plural), not `{ value: {...} }`. This caused a TypeError crash after the third API call.

The crash left behind:
1. **Orphaned supplier** (id 108524299) with org 933672905
2. **Orphaned voucher/supplierInvoice** from the first importDocument call — unbooked, no postings, but linked to invoice number INV-2026-4194

On retry, the agent created:
3. **Duplicate supplier** (id 108524341) with the same org 933672905
4. **Second voucher/supplierInvoice** for the same invoice number, properly booked

The scorer likely encountered one of these failure modes:
- **Two supplierInvoice entities** with the same invoice number — scorer picked the orphaned one (no postings, not booked) and all 4 checks failed
- **Duplicate suppliers** caused the scorer to fail supplier-identity checks
- **Score validation** rejected the ambiguous state entirely

**Proof this is the root cause**: The prior best (0b6fe5b8) used the exact same importDocument flow without booking and scored 1/8. This run used the same flow WITH booking (which should only improve the score) but scored 0/8. The only difference is the orphaned entities from the crash.

**Secondary: Missing crash-recovery logic**

The retry created fresh entities without checking for pre-existing ones. A crash-safe retry should:
1. Check for existing supplier by `organizationNumber` before creating a new one
2. Check for existing voucher by invoice number before importing again
3. Clean up or reuse orphaned entities

## 5. What Went Right

1. **Flow logic was correct**: POST supplier → GET account → importDocument → PUT postings → PUT book is the proven 5-call path
2. **Booking step was added**: The second attempt successfully booked the voucher (number=1), which was the main fix over the 0b6fe5b8 run
3. **supplier.ledgerAccount.id**: The agent correctly extracted account 2400's id from the POST /supplier response, avoiding an extra GET
4. **VAT calculation correct**: 15480 net + 3870 VAT = 19350 gross at 25%
5. **XML was valid**: importDocument returned 201 on both attempts
6. **Agent self-corrected**: After the crash, the agent identified the response shape bug, fixed it, and successfully completed the flow
7. **Documentation updated**: Prior reflection correctly identified and documented the response shape issue in trusted standard and playbook

## 6. What To Change Next Time

### Critical fixes (prevent 0-score regression):

1. **Always use `.values[0]` for importDocument responses** — this is now documented in the trusted standard but caused total failure when missed. The agent MUST read the trusted standard before writing any script, and the standard now has this in the first pitfall line.

2. **Add crash-recovery logic to the script template**: Before creating entities, check if they already exist. This prevents duplicate entities from poisoning the scorer on retry:
   ```
   // Before POST /supplier:
   const existing = await api("GET", `/supplier?organizationNumber=${ORG}&fields=*`);
   if (existing.values.length > 0) { use existing } else { POST /supplier }

   // Before POST importDocument:
   // No cleanup possible — just don't crash
   ```

3. **Never retry the full flow after a crash** — if the script crashes mid-flow, the retry must account for already-created entities. The safest approach is to prevent the crash in the first place by knowing the response shapes.

### Efficiency improvements:

4. **5 calls is the proven minimum** for fresh supplier + 25% VAT. The second attempt achieved this. No further reduction is possible.

5. **Response shape reference card** (for all T11 endpoints):
   - `POST /supplier` → `.value` (singular)
   - `GET /ledger/account` → `.values` (plural)
   - `POST /ledger/voucher/importDocument` → `.values` (plural) ← THE TRAP
   - `PUT /ledger/voucher` → `.value` (singular)

### Open question:

6. **Does booking actually help?** The 0b6fe5b8 run (NOT booked) scored 1/8 = 2/4 checks. This run would have scored at least 1/8 if not for the duplicate entities. The booking step should theoretically unlock 1 more check (3/4), but we have no clean production evidence yet. The next clean run (no crashes, no duplicates) with booking will answer this.
