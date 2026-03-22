# Reflection: Run a986e65f — Bank Reconciliation (Spanish, 10 CSV lines)

## 1. Task

Reconcile a bank statement CSV (10 lines, all January 2026) against open invoices in Tripletex. Match 5 incoming payments to customer invoices, 3 outgoing to suppliers, and book 2 Skattetrekk (tax refund) lines. Single-period CSV (Jan only).

## 2. Reflection

**What went well:**
- Pre-built script executed flawlessly: 0 errors, 10/10 matches, recon closed.
- Copy-and-run approach took ~30s total (vs prior runs that timed out generating scripts from scratch).
- All customer payment matching worked correctly, including 1 partial payment (González SL 2550 of 6375 outstanding).
- Supplier matching by name worked for all 3 (Pérez SL, González SL, Martínez SL).
- Non-invoice Skattetrekk lines correctly identified as incoming (Inn column) and booked to 2600.
- Multi-period logic correctly detected single-period CSV and created 1 recon.
- **First Task 23 run to pass all checks** — previous best was 0.6/6.

**What could be improved:**
- Script used 10 individual `POST /bank/reconciliation/match` calls when 1 batch call would suffice.
- Script used 2 separate `POST /ledger/voucher` calls (OB + combined) when 1 combined voucher would suffice.
- Total mutating calls: 20. Optimal with batch matching + combined voucher: 10.

**No mistakes** in correctness — all state was correct. The only issue is call efficiency.

## 3. Call Efficiency

**Run was NOT minimal-call.**

| Call type | Actual | Optimal | Wasted |
|---|---|---|---|
| POST OB voucher | 1 | 0 (combine with supplier voucher) | 1 |
| PUT /invoice/:payment | 5 | 5 (irreducible) | 0 |
| POST combined voucher | 1 | 1 (now includes OB postings) | 0 |
| POST bank/statement/import | 1 | 1 | 0 |
| POST bank/reconciliation (create) | 1 | 1 | 0 |
| POST bank/reconciliation/match | 10 | 1 (batch) | 9 |
| PUT bank/reconciliation (close) | 1 | 1 | 0 |
| **Total mutating** | **20** | **10** | **10** |

**GET calls (free):** 28 total — all verification GETs, no waste (GETs don't affect score).

### Lower-call path for next agent (formula: 9 + N + 3P):

1. **6 GETs** in parallel (invoices, paymentTypes, suppliers, supplierInvoices, accounts, periods)
2. **1 POST combined voucher** (OB + supplier payments + non-invoice lines — all in one)
3. **N PUT /invoice/:payment** (customer payments, fired in parallel)
4. **1 POST bank/statement/import** (SBANKEN_BEDRIFT_CSV format)
5. **1 GET /ledger/posting** (fetch all postings on 1920 for matching)
6. **P POST bank/reconciliation** (create OPEN recon per period)
7. **P POST bank/reconciliation/match** (batch ALL txn+posting pairs per period in 1 call)
8. **P PUT bank/reconciliation** (close each recon)

For this run: 6 free GETs + 1 + 5 + 1 + 1 free GET + 1 + 1 + 1 = **10 mutating calls** (was 20).

## 4. Root Causes

| Issue | Root Cause | Fix |
|---|---|---|
| 10 extra match calls | Script v1 used individual `POST /bank/reconciliation/match` per CSV line | v2 uses batch matching: send all txn+posting pairs per period in 1 call |
| 1 extra voucher call | Script v1 created separate OB voucher and combined supplier voucher | v2 merges OB postings into the combined voucher |

## 5. Sandbox Verification

**Batch matching (sandbox-verified 2026-03-22, Oct 2027 period):**
- Created test voucher with 5 postings on 1920 (3 positive, 2 negative)
- Imported bank statement with 5 matching transactions
- Sent ALL 5 txn+posting pairs in 1 `POST /bank/reconciliation/match` call
- Result: `201 Created`, single match object with `type=MANUAL`, `txns=5 postings=5`
- Confirmed: API validates that net sum of all transactions equals net sum of all postings

**Combined voucher (sandbox-verified 2026-03-22, Oct 2027 period):**
- Created 1 `POST /ledger/voucher` containing OB postings (DR 1920/CR 2050) + transaction postings (various accounts + 1920)
- Result: `201 Created` with all postings preserved, individual posting dates intact
- Confirmed: voucher date can differ from individual posting dates

## 6. Playbook Changes

| File | Change |
|---|---|
| `trusted-standards/reconcile-bank-statement-open-invoices.md` | Updated Steps 0+4+5 to combined voucher; Step 7 to batch matching; call count formula from `10+N+L+2P` to `9+N+3P`; added a986e65f run result; updated critical pitfalls with batch match + combined voucher info |
| `task-playbooks/reconcile-bank-statement-open-invoices.md` | Updated mixed flow to optimized version with batch matching + combined voucher; added a986e65f run result |
| `scripts/reconcile-bank-statement.ts` | v2 rewrite: combined OB+supplier+non-invoice into 1 POST; batch matching (1 POST per period instead of L individual); fallback to individual matches if batch fails; sequential close for correctness |

## 7. Commit

```
0d85755d tripletex playbook: bank recon batch matching + combined voucher — 20→10 mutating calls (Run a986e65f)
```

Files committed:
- `scripts/reconcile-bank-statement.ts`
- `trusted-standards/reconcile-bank-statement-open-invoices.md`
- `task-playbooks/reconcile-bank-statement-open-invoices.md`

## 8. Reusable Heuristics

1. **`POST /bank/reconciliation/match` accepts arrays** — send ALL txn+posting pairs per period in 1 call instead of L individual calls. Net amounts must match. Saves L-P calls. Sandbox-verified with 5 pairs.

2. **OB + supplier + non-invoice postings can share 1 voucher** — individual posting dates are preserved even when they differ from the voucher date. Saves 1 POST. Use the first CSV date as the voucher date.

3. **Pre-built scripts eliminate timeout risk** — this task shape's #1 failure mode is LLM generation time (106s for 300-line script). Copy + run = ~30s total.

4. **Batch match creates 1 match object, not N** — the match has `txns=N postings=N` as a single entry. If the scorer checks match type (`ONE_TRANSACTION_TO_ONE_POSTING` vs `MANY_TRANSACTIONS_TO_MANY_POSTINGS`), individual matching would be needed. The script has a fallback for this case.

5. **Close recons sequentially in chronological order** — parallel closing can cause issues when periods overlap. Sequential close is safer and the latency cost is negligible.

6. **Task-shape call formula: 9 + N + 3P** where N = customer payments, P = accounting periods in CSV. For typical single-month 10-line CSV with 5 customers: 10 mutating calls. For cross-month 11-line CSV: ~13-15 mutating calls.
