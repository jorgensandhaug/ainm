# Score-Aware Reflection: prod-2026-03-21-224726040Z-124d9ed3

## 1. Task Attribution

- **Task**: Create and send an invoice to the customer Ironbridge Ltd (org no. 841254546) for 28500 NOK excluding VAT. The invoice is for System Development.
- **Inference status**: ambiguous (candidate_count=2)
- **Likely task ID**: 01 (T1, max 2 points) — based on timing: task 01 last_attempt_after=22:49:10 aligns with run completion at 22:48:38; task 01 attempt_delta=+2 during this window
- **Leaderboard**: task 01 best_score=2 (already at T1 max before and after)

## 2. Correctness Verdict

**Likely perfect correctness.** The run executed the canonical existing-customer + bank-repair create-and-send flow:

1. `GET /customer?organizationNumber=841254546&fields=*` → 200 (customerId=108330336)
2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*` → 200 (vatTypeId=3, 25%)
3. `POST /invoice?sendToCustomer=true` → 422 (missing company bank account — expected in fresh accounts)
4. `GET /ledger/account?isBankAccount=true&fields=*` → 200
5. `PUT /ledger/account/377193269` → 200 (registered bankAccountNumber "12345678903")
6. `POST /invoice?sendToCustomer=true` → 201 (invoiceNumber=1, amountExcludingVatCurrency=28500, amountCurrency=35625)

All fields correct: customer resolved, 25% VAT applied (28500 × 1.25 = 35625), description "System Development" preserved, invoice sent via default `sendToCustomer=true`.

The submission score is not directly available (submissions queued at 22:48:41 and 22:48:58 were still processing/queued at capture time). However, the nearby completed submission `3238ca43` (7/7 checks, normalized_score=1.4) with score_raw=8/score_max=8 could represent this run or a concurrent one.

## 3. Efficiency Verdict

**Optimal for the bank-repair shape.** 6 API calls with 0 avoidable errors.

- Steps 1-2 ran in parallel (customer + vatType lookup)
- The 422 on step 3 is unavoidable in fresh accounts without a registered bank account
- Steps 4-5 are the minimum bank-repair path (1 read + 1 write)
- Step 6 is the single retry
- Customer.id and vatType.id were correctly retained across the repair branch — no wasted re-reads

**Call breakdown**:
| Call | Purpose | Avoidable? |
|------|---------|-----------|
| GET /customer | Existing customer lookup (definite article "the customer") | No |
| GET /ledger/vatType | Dynamic VAT resolution | No |
| POST /invoice (422) | First attempt, triggers bank-repair | No |
| GET /ledger/account | Find invoice bank account | No |
| PUT /ledger/account | Register bank account number | No |
| POST /invoice (201) | Retry after repair | No |

**Minimum possible**: 3 calls if no bank repair needed (GET customer + GET vatType + POST invoice). With bank repair: 6 calls. This run achieved the 6-call minimum.

## 4. Likely Root Cause

No issues identified. The run followed the trusted standard exactly:
- Correctly identified "the customer Ironbridge Ltd" as existing-customer (English definite article heuristic)
- Correctly used description-only order lines (no product numbers in prompt)
- Correctly resolved 25% VAT dynamically
- Correctly handled bank-repair branch with state retention
- Used `unitPriceExcludingVatCurrency` (not `unitCostPrice`)
- Did not waste calls on product creation, explicit send, or customer pre-creation

## 5. What Went Right

1. **Trusted standard match**: Immediately identified `create-and-send-customer-invoice.md` as the exact match
2. **Existing-customer heuristic**: "the customer Ironbridge Ltd" → GET not POST — saved a potential 422/conflict
3. **Parallel execution**: Customer and VAT lookups ran concurrently
4. **State retention**: customer.id and vatType.id correctly held across the bank-repair branch — no wasted re-reads (learned from Fjelltopp AS pattern, avoiding the Étoile SARL 8-call mistake)
5. **Clean bank repair**: Used the known-good `bankAccountNumber: "12345678903"` without checksum guessing
6. **Correct price field**: Used `unitPriceExcludingVatCurrency`, avoiding the `unitCostPrice` 422 trap
7. **Fast execution**: Read trusted standard → wrote script → executed. No time wasted on openapi.json or multiple file reads

## 6. What To Change Next Time

**Nothing needs to change for this exact task shape.** The run executed the optimal flow. For future runs of the same shape:

- Continue using the existing-customer heuristic for definite-article prompts ("the customer X")
- Continue the 6-call bank-repair path (no preemptive bank-account read — it costs an extra call ~70% of the time when bank repair isn't needed)
- Continue retaining state across the repair branch
- The only improvement possible is if the fresh account happens to already have a bank account registered (reducing to 3 calls), but that's environmental, not agent-controllable
