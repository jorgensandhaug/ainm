# Score-Aware Reflection

## 1. Task Attribution

- **Run ID:** prod-2026-03-22-111855757Z-a9736cc6
- **Attributed task:** T07 (T1 tier, max 2 points)
- **Attribution method:** Leaderboard diff shows T07 `last_attempt_after` timestamp (`2026-03-22T11:19:56.392877+00:00`) exactly matches submission `edaad147` `completed_at`
- **Task shape:** Register full payment on existing customer invoice (Elvdal AS / 963143230 / 19600kr excl. MVA / "Datarådgjeving" / Nynorsk)

## 2. Correctness Verdict

**PERFECT — 2/2 (max score for T1)**

- Raw score: 7/7
- Normalized score: 2/2
- Feedback: "2/2 checks passed."
  - Check 1: passed
  - Check 2: passed
- All checks passed on first attempt. No correctness issues.

## 3. Efficiency Verdict

**OPTIMAL — no efficiency penalty detected**

- The run scored 7/7 raw (full marks including any efficiency component).
- 3 scored API calls — the proven minimum for standalone customer invoice payment tasks.
- 0 avoidable 4xx errors.
- 0 wasted calls.
- 1 free verification GET (does not count against score).
- Best score for T07 was already 2/2 before this run; this run maintained it.

## 4. Likely Root Cause

No issues. The run executed the trusted standard perfectly:
1. `GET /invoice` — located invoice 2147699357 by org number + ex-VAT amount + description
2. `GET /invoice/paymentType` — resolved payment type 39859464 ("Betalt til bank", debit 1920)
3. `PUT /invoice/{id}/:payment` — paid full outstanding amount (24500), reduced to 0

Payment amount was correctly derived from live `amountCurrencyOutstanding` (24500), not prompt ex-VAT (19600).

## 5. What Went Right

1. **Immediate trusted-standard recognition** — the Nynorsk prompt was correctly identified as an exact match for `register-customer-invoice-payment`.
2. **Read standard before writing** — avoided all documented pitfalls (missing date params, JSON body on PUT, insufficient field expansions).
3. **Correct payment amount** — used live outstanding (24500 incl. MVA), not prompt ex-VAT (19600).
4. **Minimal calls** — exactly 3 scored calls, matching the proven floor.
5. **Zero errors** — no 4xx, no retries, no wasted calls.
6. **First Nynorsk confirmation** — proved the standard works identically across all 7 supported prompt languages (nb, nn, en, de, fr, es, pt).

## 6. What To Change Next Time

**Nothing.** This is the 18th consecutive optimal production run for this task shape. The 3-call path is fully stabilized:

1. `GET /invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))`
2. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
3. `PUT /invoice/{id}/:payment?paymentDate=<TODAY>&paymentTypeId=<id>&paidAmount=<live_outstanding>`

No changes to the trusted standard, playbook, or AGENTS.md are warranted. The only action was adding this run as the 18th production confirmation (already committed in prior reflection phase).
