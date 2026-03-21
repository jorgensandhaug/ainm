# Score Reflection — prod-2026-03-21-165124352Z-67afa046

## 1. Task Attribution

- **tx_task_id:** 06
- **Tier:** T1 (tasks 1–8, max score 2.0)
- **Prompt:** Opprett og send ein faktura til kunden Fjelltopp AS (org.nr 927173875) på 42600 kr eksklusiv MVA. Fakturaen gjeld Nettverksteneste.
- **Task shape:** Create-and-send customer invoice, Norwegian `nn`, one direct service line priced excluding MVA (25% VAT)

## 2. Correctness Verdict

**Perfect.** correctness = 1.0, score_raw = 7/7, all 5/5 checks passed.

Final Tripletex state was exactly correct:
- Customer "Fjelltopp AS" (org.nr 927173875) created
- Invoice with 25% VAT: amountExcludingVatCurrency = 42600, amountCurrency = 53250
- Invoice sent via default `sendToCustomer=true`
- Description "Nettverksteneste" on the order line

## 3. Efficiency Verdict

**Suboptimal.** normalized_score = 1.2 out of max 2.0 (60% efficiency). Tied the previous best for task 06.

The run used **6 API calls** with **1 4xx error** (422):

| # | Call | Status | Purpose |
|---|------|--------|---------|
| 1 | `POST /customer` | 201 | Create Fjelltopp AS |
| 2 | `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*` | 200 | Resolve 25% VAT |
| 3 | `POST /invoice` | **422** | Failed — missing company bank account |
| 4 | `GET /ledger/account?isBankAccount=true&fields=*` | 200 | Find invoice account 1920 |
| 5 | `PUT /ledger/account/371676328` | 200 | Register bank account number |
| 6 | `POST /invoice` | 201 | Retry — success |

The ideal happy-path for this task shape is 3 calls. The bank-account repair branch added 3 extra calls (failed POST + GET account + PUT account) and 1 avoidable 422.

**Leaderboard context:** Best score for task 06 was already 1.2 before this run (14 prior attempts). Our run matched it but did not improve. After 15 total attempts, no run has exceeded 1.2/2.0 on this task. This suggests the bank-account repair is consistently needed on task 06's fresh accounts, making 6 calls the practical floor under the current reactive approach.

## 4. Likely Root Cause

The efficiency gap (1.2 vs 2.0) is caused by:

1. **The 422 error on the first `POST /invoice`** — the fresh account had no registered company bank account. This is an account-level prerequisite that the trusted standard handles reactively (try invoice, fail, repair, retry).

2. **3 extra calls** — the reactive repair branch requires: 1 failed POST (the 422), 1 GET to find the invoice account, 1 PUT to register the bank number. Then the invoice retry succeeds.

3. **No preemptive detection** — the current standard does not check the bank-account state before attempting the invoice write. A preemptive parallel approach could avoid both the 422 and reduce total calls:
   - Parallel: `[POST /customer, GET /ledger/vatType, GET /ledger/account]` (3 calls in parallel)
   - If bank account is empty: `PUT /ledger/account/{id}` (1 call)
   - `POST /invoice` (1 call)
   - Total: 5 calls, 0 4xx (repair case) or 4 calls, 0 4xx (no repair case)

The preemptive approach costs 1 extra call in the no-repair case (4 vs 3) but saves 1 call and avoids 1 4xx in the repair case (5 vs 6 + 1 4xx). Given that task 06 consistently needs bank-account repair, the preemptive approach would likely score higher here.

## 5. What Went Right

1. **Perfect correctness** — all 5 checks passed, final state exactly matches expectations
2. **Correct VAT branch selection** — Norwegian `nn` "eksklusiv MVA" correctly mapped to the 25% taxed ex-VAT branch, selected VAT code 3 (25%) from the filtered result
3. **State retention across repair** — unlike the Étoile SARL precedent (7 calls), this run kept `customerId` and `vatType.id` in memory and did not re-read them after the bank-account repair, saving 2 calls
4. **Clean bank-account repair** — used the documented minimal payload `{ "bankAccountNumber": "12345678903" }` on account 1920 without any checksum miscalculation
5. **Fast execution** — 68s total duration, well within the 300s budget
6. **No speculative reads** — no unnecessary GET /customer before POST, no verification GET after invoice creation

## 6. What To Change Next Time

### Primary: Preemptive bank-account check via parallelization

Replace the current sequential flow:
```
POST /customer → GET /vatType → POST /invoice (422) → GET /account → PUT /account → POST /invoice
```

With a preemptive parallel flow:
```
[POST /customer, GET /vatType, GET /ledger/account] (parallel)
→ if bankAccountNumber is empty: PUT /ledger/account/{id}
→ POST /invoice
```

This gives 5 calls + 0 4xx when repair is needed (vs 6 + 1 4xx), and 4 calls + 0 4xx when not (vs 3 + 0 4xx). The tradeoff: +1 call when no repair needed, but -1 call and -1 4xx when repair is needed. Since task 06 consistently needs repair, the preemptive approach should score higher.

**Implementation:** Use `Promise.all` to run the three initial calls in parallel. Check the returned `bankAccountNumber` field on the `isInvoiceAccount=true` account. If empty/null, do `PUT /ledger/account/{id}` with `{ "bankAccountNumber": "12345678903" }` before attempting `POST /invoice`.

Sandbox verification on 2026-03-21 confirmed:
- 3-way parallel `[POST /customer, GET /vatType, GET /ledger/account]` completes successfully (141ms)
- `bankAccountNumber` field is visible in the GET response and can be checked preemptively
- When bank account exists: 4 calls, 0 4xx
- When bank account is missing: 5 calls, 0 4xx

### Secondary: Update trusted standard

The trusted standard `create-and-send-customer-invoice.md` should document the preemptive parallel approach as the preferred flow for this task shape, with the reactive branch kept as a fallback. The standard should also note that parallelizing `POST /customer` and `GET /ledger/vatType` is always safe and saves wall-clock time regardless of whether bank-account repair is needed.
