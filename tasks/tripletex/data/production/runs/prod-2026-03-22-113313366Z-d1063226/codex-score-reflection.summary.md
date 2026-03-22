# Score Reflection — prod-2026-03-22-113313366Z-d1063226

## 1. Task Attribution

- **Attributed task**: T16 (register project hours and create project invoice)
- **Attribution confidence**: High — prompt is Portuguese "Registe 11 horas para Inês Rodrigues … na atividade 'Design' do projeto 'Redesign do site' para Estrela Lda … Gere uma fatura de projeto ao cliente com base nas horas registadas" which exactly matches T16's pattern; confirmed by `prompt-task-labels.jsonl` showing identical prompt shapes attributed to T16 in prior runs
- **Attribution status**: `ambiguous` — 3 leaderboard entries changed (T03 +1 attempt, T16 +1 attempt, T28 +1 attempt) within the capture window; T16 is the match by prompt content

## 2. Correctness Verdict

- **Submission score**: Not yet available — our submission was still `queued` at the after-capture time (3 new queued entries: `40c8b8f7` at 11:33:45, `f3f231f9` at 11:34:47, `cfa6115b` at 11:34:50; our task completed at 11:34:38)
- **Best available T16 data**: A concurrent T16 submission (`24dbd0cc`, completed at 11:34:44) scored `score_raw=8, score_max=8, normalized_score=2.6667` with feedback "4/4 checks passed"
- **Likely correctness**: Perfect (1.0) — our run produced the identical API side effects as prior runs that achieved 4/4 checks:
  - Timesheet: 11h, activity Design, project Redesign do site, employee Inês Rodrigues
  - Invoice: amountExcludingVatCurrency=11000 (11×1000), amountCurrencyOutstanding=13750 (25% VAT), projectInvoiceDetails.length=1, customer=Estrela Lda
- **T16 best score**: 2.6667/4 — unchanged across all 23 attempts; this appears to be the structural ceiling for this task

## 3. Efficiency Verdict

- **Likely normalized score**: 2.6667/4 (matching the T16 ceiling)
- **Total API calls**: 8 (5 GETs + 3 writes), 0 errors, 3 sequential steps
- **Writes**: PUT /ledger/account (bank fix), POST /timesheet/entry, POST /invoice
- **Run was at the optimal call count** for the unconfigured-bank variant (7 configured / 8 unconfigured is the proven floor from the trusted standard)
- **Efficiency ratio**: 2.6667/4 = 0.6667 — a 33% efficiency penalty that is consistent across ALL 23 T16 attempts, including runs with 0 errors and optimal call paths
- **Verdict**: The efficiency penalty appears structural to T16 scoring, not caused by any suboptimality in this run

## 4. Likely Root Cause

The 2.6667/4 ceiling is **not a correctness issue** (4/4 checks pass) and **not caused by avoidable errors** (0 errors in this run). Possible explanations for the structural cap:

1. **Efficiency formula granularity**: The scorer may apply a step-function efficiency penalty based on total call count thresholds (e.g., 8 calls exceeds an efficiency bonus cutoff)
2. **Write count penalty**: 3 writes (bank fix + timesheet + invoice) may exceed the scorer's "ideal" write count; on configured accounts this would be 2 writes, but no T16 run has ever scored above 2.6667 even with configured banks
3. **Scoring model artifact**: The normalized_score=2.6667 = 8/3 could reflect a scoring denominator different from the apparent 4-check × 2-points structure

The bank fix PUT is the only potentially avoidable call — it's only needed when the account's invoice bank number is unconfigured. However, since the T16 best is 2.6667 across ALL attempts (including runs that may have had configured banks), the bank fix is unlikely to be the sole cause. The ceiling appears inherent to the task shape.

## 5. What Went Right

- **Exact trusted-standard match**: Correctly identified as existing-entity non-chargeable ≤24h variant; read the trusted standard first, no wasted exploration
- **Optimal 3-step layout**: 4 parallel GETs → activity GET + bank fix → parallel timesheet + invoice
- **Proactive bank check**: Avoided the reactive 4xx-then-retry pattern that cost prior runs 10+ calls
- **POST /invoice instead of POST /order + PUT /order/:invoice**: Saved 1 call vs older approach
- **Zero errors**: No 4xx, no retries, no wasted calls
- **Correct amounts**: 11000 ex VAT, 13750 with 25% VAT, projectInvoiceDetails present
- **Parallel writes**: Timesheet and invoice ran in parallel (sandbox-verified independence)
- **Fast execution**: Task completed well within the 300s budget

## 6. What To Change Next Time

**Nothing to change for correctness or efficiency** — this run was optimal. Specific confirmations:

- The 8-call path (unconfigured bank) is the proven minimum for this exact task shape
- The 3-step layout with parallel timesheet + invoice is the fastest execution pattern
- All 5 GETs are mandatory (employee, project, vatType, bankAccount, activity — none can be skipped or combined)
- The `POST /invoice?sendToCustomer=false` with embedded `orders[]` is strictly better than `POST /order` + `PUT /order/:invoice`
- The proactive `GET /ledger/account` eliminates the reactive error pattern

**For future investigation** (not run-level changes):
- Monitor whether any T16 run ever exceeds 2.6667 — if not, the ceiling is structural and no agent-level optimization can improve it
- If a configured-bank T16 run (7 calls) also scores 2.6667, that confirms the efficiency penalty is not call-count-based but something else in the scoring model
- The `hourlyRate=0` and `chargeable=false` on the timesheet entry (inherent to non-chargeable activities) could theoretically affect scoring, but there's no public-API path to change these when `isChargeable=false` on the activity
