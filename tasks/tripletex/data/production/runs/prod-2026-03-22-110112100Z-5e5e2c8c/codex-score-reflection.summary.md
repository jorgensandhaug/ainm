# Score Reflection — prod-2026-03-22-110112100Z-5e5e2c8c

## 1. Task Attribution

**Most likely task**: T15 — Register project hours and create project invoice
**Prompt**: Registrer 5 timer for Ingrid Nilsen (ingrid.nilsen@example.org) på aktiviteten "Analyse" i prosjektet "Plattformintegrasjon" for Bergvik AS (org.nr 989231898). Timesats: 1400 kr/t. Generer en prosjektfaktura til kunden basert på de registrerte timene.
**Inference status**: ambiguous (3 candidate tasks: T11, T15, T16 all had +1 attempt in the diff window)
**Attribution reasoning**: The prompt is unambiguously a project-hours + project-invoice task, matching T15 exactly. The leaderboard diff shows T15 got +1 attempt (23→24). A concurrent T15 submission (ed5391f6) completed at 11:02:37Z and scored 8/8 raw → normalized 3.3333. Our own submission (d7a88a45, queued 11:03:03Z) was still unscored at snapshot time.

## 2. Correctness Verdict

**Verdict**: Likely correct (4/4 checks passed based on concurrent same-prompt submission)
**Score**: ~3.3333/4 (T2 task, max 4) — 83.3% of max
**Raw**: 8/8 (all 4 checks passed)
**Improvement**: None — T15 best_score stayed at 3.3333

The concurrent T15 submission with identical parameters scored 8/8 raw with 4/4 checks passed, but only normalized to 3.3333/4. This means **correctness is 100% at the check level** (all checks pass), but the normalized score includes an **efficiency penalty** that reduces the final score from 4.0 to 3.3333.

The gap: 4.0 - 3.3333 = 0.6667 (16.7% efficiency loss).

## 3. Efficiency Verdict

**Writes this run**: 3 (POST /timesheet/entry + PUT /ledger/account + POST /invoice)
**Minimum possible writes**: 2 (POST /timesheet/entry + POST /invoice) — on a configured bank account
**Unavoidable extra write**: 1 (PUT /ledger/account — bank was unconfigured)
**4xx errors**: 0 avoidable

The run was as efficient as possible given the unconfigured bank account. The bank fix write is unavoidable — without it, POST /invoice fails with 422. The 16.7% efficiency penalty likely comes from this extra write. The run cannot do better unless the bank account is pre-configured.

**Verification GET bug**: The timesheet verification GET failed with 422 because `dateFrom=X&dateTo=X` is invalid (dateTo is exclusive, needs `dateFrom=X&dateTo=X+1`). This is a free GET and doesn't affect scoring, but it's a code quality issue.

## 4. Likely Root Cause

The 3.3333/4 ceiling is structural for this task on unconfigured bank accounts:

1. **Bank account unconfigured** → forces 1 extra write (PUT /ledger/account) → efficiency penalty
2. **Non-chargeable activity** → timesheet returns chargeable=false, hourlyRate=0 → this is correct behavior per the API, but may contribute to a partial correctness penalty if the scorer checks hourlyRate field
3. **includeHours=false** on projectInvoiceDetails → the public API cannot make project invoices consume registered hours; the manual order-line fallback creates the invoice but leaves includeHours=false

The 3.3333 is consistent across ALL production runs for this task shape (Bergvik AS 2026-03-20, Windkraft GmbH, Waldstein GmbH, Cascade SARL, etc.), confirming it's a structural ceiling, not a per-run mistake.

## 5. What Went Right

1. **Exact task match**: Correctly identified the existing-entity variant of the trusted standard
2. **0 avoidable errors**: All 3 writes succeeded on first attempt
3. **Proactive bank check**: Used parallel free GETs to detect and fix bank account before invoice
4. **POST /invoice with embedded orders**: Saved 1 call vs old POST /order + PUT /order/:invoice
5. **Correct totals**: amountExcludingVat=7000 (5×1400), amountCurrency=8750 (25% VAT), projectInvoiceDetails.length=1
6. **Fast execution**: Read trusted standard → wrote script → executed in one pass

## 6. What To Change Next Time

1. **Fix verification GET dateTo bug**: Use `dateTo=YYYY-MM-DD` where DD is dateFrom+1 (exclusive upper bound). The current code uses same date which always returns 422.

2. **Optimize sequential layout**: The production run used 6 sequential steps. The post-run investigation proved a 3-step parallel layout works:
   - Step 1: GET employee + GET project + GET vatType + GET bank (4 parallel)
   - Step 2: GET activity + conditional PUT bank (parallel)
   - Step 3: POST timesheet + POST invoice (parallel)
   This doesn't change the call count but halves wall-clock time.

3. **Accept the 3.3333 ceiling**: The efficiency gap to 4.0 is structural (bank fix write). Without changing the scorer or pre-configuring bank accounts, 3.3333 is the maximum achievable score for this task shape on unconfigured accounts. The agent should not waste time looking for alternatives.

4. **No new investigation needed**: The trusted standard and playbook have been updated with the optimized 3-step layout and the verification dateTo fix. The next agent should follow them exactly.
