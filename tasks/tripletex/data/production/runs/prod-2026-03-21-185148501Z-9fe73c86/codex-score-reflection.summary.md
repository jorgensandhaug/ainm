# Score Reflection — prod-2026-03-21-185148501Z-9fe73c86

## Task Attribution

- **tx_task_id**: 06 (T1, max score 2)
- **Prompt**: Create and send invoice to Étoile SARL (org 976414284) for 20000 NOK hors TVA, "Heures de conseil"
- **Attempt**: 16th attempt on task 06 (attempt_delta: 1)

## Correctness Verdict

**Perfect.** correctness = 1, score_raw = 7/7, 5/5 checks passed. All fields were correctly set in the final Tripletex state: customer name, org number, invoice amount (20000 ex VAT, 25000 inc VAT with 25%), description, and send status.

## Efficiency Verdict

**Suboptimal.** normalized_score = 1.1333 vs best_score = 1.2 (unchanged after this run). This run did NOT beat the previous best.

- The run used **7 API calls with 2 errors** (two 422s).
- The optimal path for this bank-repair shape is **6 calls with 1 error** (the expected bank-account 422).
- The previous best of 1.2 was likely a 6-call run hitting the same bank-repair branch without the `unitCostPrice` mistake.
- The efficiency gap (1.2 − 1.1333 = 0.0667) comes entirely from the 1 wasted call + 1 avoidable 422 error from using wrong field name `unitCostPrice`.

| Call # | Endpoint | Status | Verdict |
|--------|----------|--------|---------|
| 1 | POST /customer | 201 | Necessary |
| 2 | GET /ledger/vatType | 200 | Necessary |
| 3 | POST /invoice (unitCostPrice) | 422 | **WASTED** — wrong field name |
| 4 | POST /invoice | 422 | Expected — bank account repair |
| 5 | GET /ledger/account | 200 | Necessary (repair branch) |
| 6 | PUT /ledger/account/{id} | 200 | Necessary (repair branch) |
| 7 | POST /invoice | 201 | Necessary (retry after repair) |

## Likely Root Cause

The single root cause was using `unitCostPrice` instead of `unitPriceExcludingVatCurrency` on the invoice order line. This field does not exist in the Tripletex order-line schema and returns `422 Feltet eksisterer ikke i objektet.` The agent wrote from memory instead of copying the exact field name from the trusted standard's example payload (which correctly shows `unitPriceExcludingVatCurrency` at line 240 of the playbook).

This mistake cost exactly 1 extra API call and 1 avoidable 422 error, which was the entire efficiency gap between this run (1.1333) and the previous best (1.2).

## What Went Right

1. **Correct task identification** — immediately matched to `create-and-send-customer-invoice` trusted standard
2. **French `hors TVA` correctly classified** as taxed ex-VAT 25% branch, not 0%
3. **Direct POST /customer** without unnecessary pre-read GET
4. **Dynamic VAT lookup** found `vatType.id=3` at 25% correctly
5. **Bank-account repair branch** executed correctly with retained `customer.id` and `vatType.id` (lesson from prior Étoile/Fjelltopp runs applied)
6. **Perfect correctness** — all 5/5 checks passed, 7/7 raw score
7. **Fast execution** — 112s total duration, well within 300s budget

## What To Change Next Time

1. **Copy field names from the trusted standard example, never write from memory.** The only accepted price field on invoice order lines is `unitPriceExcludingVatCurrency`. The non-existent `unitCostPrice` wastes exactly 1 call and 1 error every time it's used. This pitfall has now been added to both the trusted standard and playbook.

2. **The optimal 6-call bank-repair path is already documented.** The next agent hitting the same bank-repair shape should achieve 6 calls / 1 error:
   - POST /customer → GET /ledger/vatType → POST /invoice (422 bank) → GET /ledger/account → PUT /ledger/account/{id} → POST /invoice (201)

3. **The happy-path optimal is still 3 calls / 0 errors** when no bank repair is needed (~70% of production runs):
   - POST /customer → GET /ledger/vatType → POST /invoice (201)

4. **To reach the max score of 2.0 on this T1 task**, the agent would need the happy path (3 calls, 0 errors). The bank-account repair branch inherently costs +3 calls and +1 error, which caps the efficiency bonus. The only controllable factor within the repair branch is avoiding avoidable errors like the `unitCostPrice` mistake.
