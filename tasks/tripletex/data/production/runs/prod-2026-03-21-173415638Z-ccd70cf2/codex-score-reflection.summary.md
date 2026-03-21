# Score Reflection: prod-2026-03-21-173415638Z-ccd70cf2

## Task Attribution

- **Attributed task**: Task 18 (T2, max score 4.0)
- **Attribution method**: Leaderboard diff from sibling run `prod-2026-03-21-173428800Z-0d7df913` captured before/after snapshots spanning our run; task 18 `last_attempt_after` (17:35:20Z) matches our submission `453c7f6c` queued at 17:34:15Z (= run launch time 173415638Z)
- **Task-attribution.json status**: Skipped (`missing_leaderboard_before_snapshot`); attribution inferred from sibling run's diff
- **Submission ID**: `453c7f6c-e0e8-452c-a4f2-ea64660dd0b8`
- **Task description**: Reverse customer invoice payment for Polaris AS (org.nr 896496468), invoice "Skylagring" (17200 kr excl. MVA)

## Correctness Verdict

**Perfect correctness.** 3/3 checks passed, score_raw=8/8.

The run correctly:
1. Located the invoice via `GET /invoice?customerOrgNumber=896496468...` (returned 2 invoices, local filter isolated the target by `amountExcludingVatCurrency === 17200`)
2. Extracted payment voucher ID 608886670 from the unique negative `Betaling:` posting with `type=null`
3. Reversed via `PUT /ledger/voucher/608886670/:reverse?date=2026-03-21`, producing reverse voucher 609061798

## Efficiency Verdict

**Maximum efficiency achieved.** normalized_score=4.0 = T2 maximum.

- 2 API calls total (the theoretical minimum for this task shape)
- 0 avoidable 4xx errors
- 0 wasted reads or retries
- No verification read after the reverse write
- Matches the existing leaderboard best of 4.0 for task 18

This is the canonical optimal path documented in the trusted standard: one decisive locate read, one reverse write, stop.

## Likely Root Cause

No issues. The run executed the trusted standard perfectly.

## What Went Right

1. **Immediate trusted-standard recognition**: The agent identified this as an exact match for `reverse-customer-invoice-payment` and used the standard directly without reading `openapi.json` or other playbooks
2. **Correct field names**: Used `amountExcludingVatCurrency` (not the wrong `amountExVat`) for local filtering, which was critical since the GET returned 2 invoices for this customer
3. **Robust fallback matcher**: Accepted the payment posting with `type=null` and `description` starting with `Betaling:`, without requiring `account.number=1500`
4. **No unnecessary verification read**: Stopped after the successful reverse write per the trusted standard's score-optimal path
5. **Shared-voucher guard**: The script checked that the payment voucher ID was different from the invoice posting voucher ID before reversing

## What To Change Next Time

Nothing. This run achieved the theoretical maximum score. The same 2-call pattern should be repeated exactly for future instances of this task shape:

1. `GET /invoice?customerOrgNumber=<org>&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`
2. Local filter → extract payment voucher from unique negative `Betaling:` posting
3. `PUT /ledger/voucher/{paymentVoucherId}/:reverse?date=<task-date>`
4. Stop

The trusted standard and playbook are already fully up to date with this exact production confirmation, including the multi-invoice filtering scenario first exercised in this run.
