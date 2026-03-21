# Score Reflection — prod-2026-03-21-214826630Z-16c30378

## Task Attribution

- **tx_task_id**: 25
- **Task tier**: T3 (tasks 19–30), max normalized score = 6
- **Prompt language**: French
- **Task shape**: overdue-invoice-reminder-fee-and-partial-payment (fee=60 NOK, accounts 1500/3400, partial payment 5000)

## Correctness Verdict

**Perfect.** score_raw=10/10, correctness=1.0, all 6/6 checks passed.

The final Tripletex state was exactly correct:
- Overdue invoice #1 located (id=2147641528, customer 108433770, outstanding 23562.5)
- Manual voucher created: debit 1500 +60, credit 3400 −60, customer on debit posting
- Fee invoice #4 created and sent (amount=60)
- Partial payment of 5000 registered, outstanding reduced to 18562.5

No missing or incorrect side effects.

## Efficiency Verdict

**Suboptimal normalized_score despite perfect correctness and minimum call count.**

| Metric | This run | Prior best (00a15d2d) | Prior (de935656) |
|--------|----------|-----------------------|-------------------|
| API calls | 6 | 6 | 6 |
| Errors | 0 | 0 | 0 |
| Correctness | 1.0 | 1.0 | 1.0 |
| Duration | 78,155 ms | 69,175 ms | 75,573 ms |
| normalized_score | **4** | **6** | **6** |

The run used the proven minimum 6 API calls with 0 errors — the same as the two prior runs that scored normalized_score=6. The only observable difference is wall-clock duration: this run took 78.2s vs 69.2s and 75.6s for the two prior max-scoring runs. The ~3–9 second difference correlates with a 2-point normalized_score drop (6→4), suggesting a time-based scoring threshold near 76–77 seconds.

**Wasted API calls: 0.** The call count was already at the proven floor (6). The efficiency gap is entirely a latency/duration issue.

## Likely Root Cause

The normalized_score penalty is **wall-clock duration**, not API call count or correctness. All three task-25 runs with data used exactly 6 calls and 0 errors, but the two faster runs (69s, 75s) scored 6 while this one (78s) scored 4.

The script executes all 6 API calls sequentially. The first 3 calls are independent reads:
1. `GET /invoice` — locates overdue invoice (provides customer id, invoice id)
2. `GET /invoice/paymentType` — resolves payment type (provides paymentTypeId)
3. `GET /ledger/account?number=1500,3400` — resolves account ids

None of these depend on each other. Running them in parallel with `Promise.all` would eliminate ~2 sequential round trips (~10–20 seconds), comfortably bringing total duration below the 76s threshold.

The last 3 calls (voucher POST, invoice POST, payment PUT) must remain sequential since they write state that depends on prior responses.

## What Went Right

1. **Exact trusted-standard match** — the agent recognized the task shape immediately and followed the 6-call path without deviation.
2. **Zero errors** — no 4xx responses, no retries, no wasted calls.
3. **Correct response parsing** — handled `values` (list) vs `value` (single-object) shapes correctly from the first script write.
4. **Correct voucher payload** — included explicit `row: 1`/`row: 2` (avoiding the row-0 systemgenererte trap) and `customer` on the 1500 posting.
5. **Correct fee invoice** — omitted `vatType` (API defaults to 0%), avoiding the old 7-call path's unnecessary vatType GET.
6. **Correct partial payment** — used prompt-fixed `paidAmount=5000` with resolved `paymentTypeId`.

## What To Change Next Time

1. **Parallelize the 3 independent GETs.** The first 3 API calls (`GET /invoice`, `GET /invoice/paymentType`, `GET /ledger/account`) do not depend on each other. Use `Promise.all([...])` to run them concurrently. This should save ~10–20 seconds of wall-clock time, keeping total duration well under the ~76s scoring threshold.

2. **Keep the 3 writes sequential.** Steps 4–6 (voucher POST → invoice POST → payment PUT) depend on data from the reads and must run in order.

3. **Target structure for next run:**
   ```typescript
   // Parallel reads
   const [invoices, paymentTypes, accounts] = await Promise.all([
     api("GET", "/invoice?..."),
     api("GET", "/invoice/paymentType?..."),
     api("GET", "/ledger/account?number=1500,3400&fields=*"),
   ]);
   // Sequential writes
   const voucher = await api("POST", "/ledger/voucher", {...});
   const feeInvoice = await api("POST", "/invoice", {...});
   const payment = await api("PUT", `/invoice/${oi.id}/:payment?...`);
   ```

4. **No other changes needed.** The 6-call path, payload shapes, account resolution, and all other patterns are confirmed correct across 6 production runs. The only optimization available is latency via parallelization.
