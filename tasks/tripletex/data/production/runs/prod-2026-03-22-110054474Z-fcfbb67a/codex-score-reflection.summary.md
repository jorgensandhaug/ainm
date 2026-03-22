# Score Reflection — prod-2026-03-22-110054474Z-fcfbb67a

## 1. Task Attribution

- **Prompt**: French — register supplier invoice INV-2026-5683 from Lumière SARL (org 904564184), 75500 NOK gross, account 7140, 25% VAT
- **Inference status**: `ambiguous` (candidate_count=2)
- **Attributed tasks**: T11 (+1 attempt, 25→26) and T15 (+1 attempt, 23→24)
- **Correct task**: T11 (register supplier invoice, text-only) — this is an exact match
- **T15 attribution is spurious** — likely a concurrent run from another task landed in the same scoring window

## 2. Correctness Verdict

- **T11 tier**: T2, max score = 4
- **T11 best_score before**: 1
- **T11 best_score after**: 1 (unchanged)
- **Correctness**: < 1 (partial — at most 25% of max)

**Caveat**: Submissions were still in `scoring`/`processing`/`queued` states when leaderboard.after was captured at 11:02:50Z (task completed at 11:02:19Z). The score may not have been reflected yet. However, all 3 prior T11 runs using importDocument also scored ≤1, so a breakthrough is unlikely.

**Normalized score math**: Previous best 0b6fe5b8 had score_raw=4, score_max=8 (2/4 checks passed), normalized to best_score=1. This run likely also passed 2/4 checks, yielding the same normalized score of 1.

## 3. Efficiency Verdict

- **API calls**: 8 total (4 writes + 1 required lookup GET + 3 free verification GETs)
- **Errors**: 0 (zero 4xx/5xx responses)
- **Wall time**: ~84 seconds prompt-to-completion
- **Tool calls**: 5 (3 parallel Reads, 1 Write, 1 Bash)
- **Verdict**: Maximally efficient execution — 0 wasted calls, 0 errors. This is the theoretical minimum for the importDocument flow.

The AGENTS.md read failed (token limit exceeded) but this was inconsequential since the trusted standard contained all needed information. The agent correctly continued without it.

## 4. Likely Root Cause

The run achieved **perfect efficiency** but **partial correctness**. The issue is NOT execution quality — it's the approach itself.

**Checks that likely PASS (2/4)**:
1. SupplierInvoice entity exists with correct amounts (amount=-75500, amountExcludingVat=-60400)
2. SupplierInvoice has correct invoiceNumber (INV-2026-5683) and kidOrReceiverReference (INV-2026-5683)

**Checks that likely FAIL (2/4)**:
1. **Voucher description mismatch**: importDocument creates an immutable description "Faktura nummer INV-2026-5683 fra Lumière SARL" — the scorer likely expects "services de bureau" or the prompt text, which cannot be set on Leverandørfaktura-type vouchers
2. **Unknown check**: Could be voucher postings structure, supplier data completeness, or something about the booking state. The verification GET showed postings as `{}` (empty objects) because `fields=*` doesn't expand nested posting objects — this means the actual postings content was never logged, preventing diagnosis.

**Key insight**: The score has been stuck at 1/4 across ALL importDocument-based T11 runs (0b6fe5b8 unbooked, d49da665 crashed, 6b159167 with errors, and now this clean run). Adding booking did NOT improve the score. The immutable voucher description is the most likely persistent blocker. The only way to fix it would be a fundamentally different approach (e.g., direct voucher POST + separate SI entity creation — if such an API exists).

## 5. What Went Right

1. **Zero errors**: First T11 run with 0 avoidable 4xx errors (prior runs had 0-3 errors)
2. **Minimal call count**: 4 writes + 1 lookup + 3 free verifications = 8 total, which is the proven minimum
3. **Fast execution**: Completed in ~84 seconds with only 5 tool calls
4. **Correct response shapes**: No `.value` vs `.values` crash (fixed from d49da665)
5. **All known pitfalls avoided**: buyer org mod11 (987654325), supplierInvoice date params, two-step PUT, PaymentMeans in XML
6. **SI entity fully correct**: amount, amountExcludingVat, invoiceNumber, kidOrReceiverReference, invoiceDueDate all verified
7. **Trusted standard followed exactly**: No deviation from documented flow

## 6. What To Change Next Time

1. **Investigate voucher description check**: The immutable description "Faktura nummer X fra Y" from importDocument may be the persistent blocker for checks 3-4. Investigate whether a different voucherType or a `PUT /supplierInvoice` call can change it.

2. **Improve posting verification logging**: The voucher GET returned postings as `{}` empty objects. Use `fields=id,number,description,voucherType(*),postings(*)` instead of `fields=*` to force nested expansion, OR do separate `GET /ledger/posting?voucherId={id}&fields=*` to actually see what Tripletex stored. Without this data, diagnosing posting-related check failures is impossible.

3. **Test `PUT /supplierInvoice`**: After importDocument creates the SI entity, try `PUT /supplierInvoice/{id}` to update description or other fields. If the scorer checks SI-level description rather than voucher description, this could unlock the remaining checks.

4. **Don't read both trusted-standard AND playbook**: The agent read both in parallel (no time cost here), but the playbook is redundant when the trusted standard exists. Reading only the trusted standard is sufficient and saves context.

5. **Log full verification data**: The supplier GET showed addresses as URL references without expanded fields. Use `fields=*,postalAddress(*),physicalAddress(*),bankAccountPresentation(*)` to get actual address content for diagnostics.

6. **T11 score ceiling hypothesis**: If the immutable voucher description is truly the blocker, T11 may have a ceiling of 1/4 with the importDocument approach. The next major investigation should test whether `POST /supplierInvoice` (non-beta) can create SI entities directly with a custom description, or whether `PUT /supplierInvoice/{id}` can modify the description after importDocument creates it.
