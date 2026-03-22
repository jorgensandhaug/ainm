# Score-Aware Reflection: prod-2026-03-22-104047538Z-c93ecb23

## 1. Task Attribution

- **Attributed task**: T10 (order-invoice-payment)
- **Inference status**: ambiguous (diff showed both T10 and T20 with +1 attempt, but the prompt — "Create an order for the customer Oakwood Ltd... with products... Convert the order to an invoice and register full payment" — is unambiguously T10)
- **Task tier**: T2 (max score = 4)
- **Leaderboard diff**: T10 best_score stayed at 4/4 (already at max); T20 best_score stayed at 2.4 (concurrent run)

## 2. Correctness Verdict

- **Verdict**: Almost certainly perfect correctness
- **Evidence**: The run's final Tripletex state was verified via readback GET:
  - Customer: Oakwood Ltd (org 932937204) — correctly linked
  - Order line 1: Data Advisory, product 3346, unitPrice=16000, count=1
  - Order line 2: Network Service, product 7273, unitPrice=22050, count=1
  - Invoice amount: 47562.50 (38050 ex-VAT + 25% VAT)
  - amountOutstanding: 0 (fully paid)
  - isCharged: true
- **Score status**: Both submissions were still "queued" at capture time (no raw score available yet), but T10 best_score was already 4/4 and remained at 4/4 — consistent with this run scoring 4/4

## 3. Efficiency Verdict

- **Verdict**: Optimal — minimal possible writes, zero errors
- **API call breakdown**:
  1. `GET /customer?organizationNumber=932937204&fields=*` — free
  2. `GET /product?number=3346,7273&fields=*,vatType(*)` — free
  3. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` — free
  4. `GET /ledger/account?isBankAccount=true&fields=*` — free (proactive hedge)
  5. `POST /invoice?sendToCustomer=false&paymentTypeId=39711630&paidAmount=47562.5` — **1 write**
  6. `GET /invoice/2147695562?fields=*,...` — free (readback)
- **Total**: 6 calls (5 free GETs + 1 write), 0 errors
- **Writes**: 1 (the theoretical minimum for this task)
- **Wasted calls**: 0
- The proactive bank-account hedge (step 4) was a free GET that found the bank account already configured — no PUT repair needed. This is the recommended default because it prevents the catastrophic 422 + script-restart scenario at zero write cost.

## 4. Likely Root Cause

- **No issues identified**. The run executed the trusted standard's optimal path perfectly.
- The `POST /invoice` with embedded orders, paymentTypeId, and exact paidAmount created the order, invoice, and payment registration in a single atomic write.
- The exact paidAmount was computed from product VAT percentages (both 25%): `16000×1.25 + 22050×1.25 = 47562.5`

## 5. What Went Right

- **Trusted standard match**: Correctly identified this as an exact match for `create-order-invoice-and-register-payment.md` and followed it without deviation
- **Parallel GETs**: All 4 data-gathering GETs ran in parallel, minimizing wall-clock time
- **Comma-separated product lookup**: `number=3346,7273` found both products in 1 call (OR semantics)
- **String-safe comparison**: Used `String(p.number) === "3346"` — avoided the critical type pitfall
- **Proactive bank hedge**: Free safety net that prevented potential 422+retry
- **Exact paidAmount**: Computed from `vatType(*)` expansion, not hardcoded or approximate
- **Readback verification**: Free GET confirmed all fields correct before script exited
- **No script restart**: Script included inline recovery for bank-account 422 (though it wasn't needed) — defense in depth

## 6. What To Change Next Time

- **Nothing to change** — this run represents the optimal execution of the T10 task shape
- The 1-write, 0-error path is the proven floor for this task: `POST /invoice` with embedded orders + payment parameters creates order, invoice, and payment atomically
- All 5 free GETs are necessary: customer ID, product IDs + VAT%, payment type ID, bank-account status, and readback verification
- This is the 3rd consecutive successful production run using the `POST /invoice` path (after Floresta Lda and Snøhetta AS), confirming the standard is stable and reliable across languages (Portuguese, Norwegian, English)
- Continue using this exact approach for all future T10 runs
