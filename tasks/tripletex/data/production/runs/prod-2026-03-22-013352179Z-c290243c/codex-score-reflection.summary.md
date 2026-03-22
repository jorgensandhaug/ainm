# Score Reflection — prod-2026-03-22-013352179Z-c290243c

## 1. Task Attribution

- **Task ID**: 11 (register supplier invoice)
- **Tier**: T2 (max score: 4)
- **Prompt language**: French
- **Prompt**: Register supplier invoice INV-2026-5683 from Lumière SARL (org 904564184), 75500 NOK gross, account 7140 (office services), 25% VAT

## 2. Correctness Verdict

**Correctness: 0 — total failure. 0/8 raw score, 4/4 checks failed.**

- score_raw: 0 / score_max: 8
- normalized_score: 0
- correctness: 0
- Leaderboard best for T11 before: 1, after: 1 (unchanged)
- Total attempts for T11: 21 → 22

This run did **not improve** the T11 best score. The direct POST /ledger/voucher path scored 0/4 checks — identical failure pattern to the importDocument runs that all scored 0/8.

## 3. Efficiency Verdict

Efficiency is **irrelevant** because correctness = 0. The run used 4 API calls with 0 errors, which would have been optimal for perfect correctness. But since all 4 checks failed, the efficiency bonus does not apply.

- API calls: 4 (POST supplier, GET account, GET voucherType, POST voucher)
- 4xx errors: 0
- Call path was correct per the trusted standard but the final state was wrong

## 4. Likely Root Cause

All 4 checks failed, meaning the final Tripletex state is fundamentally wrong — not just a minor field mismatch. Possible root causes:

### Hypothesis A: Description mismatch (most likely)
The run used `"services de bureau"` as the voucher and posting description. This was derived from the French prompt phrase "Le montant concerne des services de bureau." The scorer may expect:
- The invoice number as the description (e.g., "INV-2026-5683")
- A combined description (e.g., "INV-2026-5683 Lumière SARL")
- A Norwegian description (e.g., "kontortjenester")
- The full prompt text or a specific substring the scorer extracts

Earlier direct-voucher runs from 2026-03-20 scored best=1 (1/4 checks). Those runs used different prompts (English/Norwegian/German) and likely different description strings. This suggests the description format is critical and we're not reliably extracting the right one.

### Hypothesis B: Entity-type mismatch
The scorer may look for a proper "supplier invoice" entity (accessible via some internal Tripletex state or a non-beta endpoint), not just a ledger voucher with voucherType=Leverandørfaktura. The direct voucher path creates a booked voucher but may not register it in the supplier invoice ledger visible to the scorer.

### Hypothesis C: Supplier data incompleteness
The prompt provides only name and org number. No address, bank account, email, or phone. Earlier prompts may have included more data (e.g., from attached PDFs). If the scorer checks supplier fields beyond name/org, all checks could fail because the supplier entity is incomplete.

### Hypothesis D: VoucherType not recognized
The voucherType id varies by instance. This run resolved it via GET and used the correct id. But the readback in sandbox shows voucherType as null in the voucher entity, which could mean Tripletex doesn't store the voucherType on the voucher after creation. If the scorer checks voucherType, it would see null.

### Assessment
The fact that T11's **all-time best is only 1/4** (across 22 attempts using both importDocument and direct-voucher paths) strongly suggests there's a fundamental misunderstanding of what the scorer expects. Neither approach has produced a good score. The 1-check pass on earlier runs may have been a coincidence (e.g., supplier name happened to match).

## 5. What Went Right

1. **Clean execution**: 4 API calls, 0 errors, 0 retries — technically flawless
2. **Trusted standard compliance**: Followed the documented 4-call path exactly
3. **Auto-booking**: Voucher was auto-booked (number=1 > 0)
4. **Correct postings structure**: 3 postings (debit on 7140 with vatType=1, credit on supplier 2400, auto-VAT on row 0)
5. **Correct amounts**: net=60400, gross=75500, VAT=15100 (all mathematically correct at 25%)
6. **Fast execution**: Completed in ~86 seconds
7. **Post-run investigation**: Discovered the voucherType-by-name optimization (3-call path), saving 1 API call for future runs

## 6. What To Change Next Time

### Critical investigation needed
T11 has scored 0 or near-0 on **all 22 attempts**. The current approach (direct POST /ledger/voucher) is not fundamentally correct for what the scorer expects. Before the next T11 run, a deep investigation is needed:

1. **Description extraction**: Test different description strategies in sandbox and verify what the scorer checks. Try: invoice number only, supplier name + invoice number, Norwegian translation of the service, or the raw prompt text.

2. **Alternative entity paths**: Investigate whether there's a non-beta way to create a proper "supplier invoice" entity (not just a ledger voucher) that the scorer recognizes. Check if `/supplier/invoice` or similar endpoints exist in the OpenAPI spec.

3. **Scorer check decomposition**: With best_score=1, exactly 1 of 4 checks passed on the best run. Identify which check passed and use that as a clue about what's correct.

4. **Supplier completeness**: Even when the prompt doesn't provide address/bank, test whether filling in placeholder values or leaving them empty affects scoring.

### If the current approach is retained
- Use the 3-call path (skip GET /ledger/voucherType, use voucherType by name)
- Try different description formats to see if any pass more checks
- Include `invoiceNumber` on both postings (not just the credit posting) to increase scorer match surface

### Efficiency optimization (for when correctness is fixed)
- The 3-call path (POST supplier → GET account → POST voucher with voucherType by name) saves 1 call
- Sandbox-verified on 2026-03-22: voucher 609264396 auto-booked as number 721
- This would be the optimal path once correctness is solved
