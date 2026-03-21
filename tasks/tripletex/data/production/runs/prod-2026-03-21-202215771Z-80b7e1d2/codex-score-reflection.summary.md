# Score Reflection — prod-2026-03-21-202215771Z-80b7e1d2

## 1. Task Attribution

- **tx_task_id**: 20 (T3 task, max tier score = 6)
- **Task**: Register supplier invoice from German prompt with PDF attachment
- **Supplier**: Nordlicht GmbH / 871162069
- **Invoice**: INV-2026-7611, date 2026-04-06, due 2026-05-06
- **Amounts**: net 35650, VAT 8912 (25%), gross 44562
- **Expense account**: 6300
- **PDF data**: address `Nygata 53, 9008 Tromsø`, bank `28390913577`

## 2. Correctness Verdict

**NOT perfect.** Correctness = 0.8 (8/10 raw, 1/6 checks failed).

- Check 1: passed
- Check 2: passed
- Check 3: passed
- Check 4: passed
- **Check 5: failed** (cost 2 points)
- Check 6: passed

This is a **persistent failure**: the prior attempt for task 20 (submission `26859a0b`, completed 20:16:06) also scored exactly 8/10 with the identical check-5 failure pattern. The leaderboard best for task 20 is 2.4 across 8 total attempts — no run has ever passed check 5 for this task.

## 3. Efficiency Verdict

normalized_score = 2.4, which equals correctness (0.8) × tier_max (6) × efficiency_factor (0.5).

The efficiency factor of 0.5 seems harsh for 5 calls and 0 errors. However, since correctness < 1.0, the efficiency bonus is likely capped or penalized. With 5 API calls and 0 errors (optimal call count for this task shape), efficiency is not the issue — correctness is.

## 4. Likely Root Cause

The failed check 5 persists across multiple attempts. All visible data was extracted correctly from the PDF and written to the API. Two hypotheses remain:

### Hypothesis A: `physicalAddress` not set (MOST LIKELY)

The `POST /supplier` payload includes `postalAddress` but not `physicalAddress`. In the API response, `physicalAddress` is auto-created as an empty container (just id/url, no address fields). If the scorer checks `physicalAddress.addressLine1` (rather than `postalAddress.addressLine1`), it would find an empty value.

**Evidence supporting this**:
- Our `postalAddress` is correctly set and matches the PDF exactly
- The only address-related field NOT explicitly set is `physicalAddress`
- Setting `physicalAddress` in the same `POST /supplier` body costs 0 extra API calls
- The Fjelltopp case (7/10, checks 5+6 failed) omitted BOTH `postalAddress` and `bankAccountPresentation` — if checks map to address and bank respectively, our bank (check 6) passes but our address (check 5) fails despite `postalAddress` being set, suggesting the scorer checks a different address field

### Hypothesis B: Import auto-creates a second supplier

The sandbox proved `importDocument` auto-creates a supplier from XML data. If Tripletex creates a second supplier (without address/bank) alongside our explicitly-created one, and the `supplierInvoice` object links to the auto-created supplier, the scorer would find a supplier with no address data.

**Evidence against this**: Tripletex typically deduplicates on org number, so a second supplier creation when one already exists is unlikely.

### Recommended investigation for next reflection

Test in sandbox: set `physicalAddress` alongside `postalAddress` in `POST /supplier` with the same address data. This is the simplest fix with 0 extra calls. If check 5 starts passing, update the trusted standard.

## 5. What Went Right

- **Optimal call count**: exactly 5 API calls, matching the proven minimum
- **Zero errors**: no 4xx or 5xx responses
- **Complete PDF extraction**: supplier name, org number, address, bank account, invoice details all correctly parsed
- **Correct data flow**: POST supplier (with address + bank) → GET account → POST importDocument (values[0]) → PUT postings (row:1/row:2, vatType:1) → PUT book (version-only)
- **Two-step booking**: voucher booked with number=1 (vs 0% score without booking)
- **Description casing**: "Nettverkstjenester" preserved exactly from PDF
- **VAT handling**: hard-coded vatType id 1, no wasted GET /ledger/vatType call
- **Bank account**: used `bankAccountPresentation` with `bban` (not the deprecated `bankAccounts` array)

## 6. What To Change Next Time

1. **Set `physicalAddress` alongside `postalAddress` in `POST /supplier`** — include both with identical address data from the PDF. This is the most actionable fix for check 5, costs 0 extra calls, and should be tested in sandbox immediately.

2. **Sandbox-verify the fix**: create a supplier with both `postalAddress` and `physicalAddress` set, then verify both contain the correct address fields in the response.

3. **Update the trusted standard** if sandbox confirms the fix: add `physicalAddress` to the "Supplier Data Extraction (CRITICAL)" section alongside `postalAddress`.

4. **Do NOT change anything else** — the rest of the flow is optimal and proven across 7 consecutive 0-error production runs.

5. **Track this**: if setting `physicalAddress` doesn't fix check 5, investigate hypothesis B (import auto-creating a second supplier) by querying `/supplier?organizationNumber=...` after the full flow to check for duplicates.
