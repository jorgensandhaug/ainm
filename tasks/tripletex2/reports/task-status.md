# Combined Task Status

Generated: 2026-03-20T21:44:07.679Z

Runs dir: `runs`
Canonical artifacts: 51
Native artifacts: 19
Live-imported artifacts: 32

Status summary:
- Solved (direct): 0
- Solved (estimated only): 1
- Attempted with direct score: 0
- Attempted with estimated-only score: 5
- Attempted without comparable score: 7
- No runs yet: 5
- Tasks with native runs: 1
- Tasks with live-imported runs: 13
- Tasks with combined live+native evidence: 1

Ranking policy:
- Prefer taskSolved=true over unsolved or unknown outcomes.
- When correctnessScore exists, higher correctnessScore ranks first.
- When scoreTotal exists, higher scoreTotal ranks first.
- Lower apiCallCount ranks ahead of higher apiCallCount when score metrics tie.
- Direct scored evidence ranks above estimated evidence, which ranks above unscored runs when metrics tie or are absent.
- Completed runs rank above failed, timeout, aborted, or not-run outcomes.
- Lower durationMs breaks remaining ties.
- Newer createdAt and then lexical runId make ties deterministic.

## Per-Task Status

| Task | Status | Sources | Best known evidence | Best direct evidence | Next target |
| --- | --- | --- | --- | --- | --- |
| create-customer-invoice | not-run | no evidence | none | none | Add first canonical run coverage |
| create-order-invoice-and-register-payment | not-run | no evidence | none | none | Add first canonical run coverage |
| register-customer-invoice-payment | not-run | no evidence | none | none | Add first canonical run coverage |
| register-supplier-invoice | not-run | no evidence | none | none | Add first canonical run coverage |
| register-travel-expense | not-run | no evidence | none | none | Add first canonical run coverage |
| create-customer | attempted-unscored | live-imported only | live-imported unscored solve=unknown score=none correctness=none calls=0 | none | Create a native baseline and score it |
| legacy-tripletex1-unattributed | attempted-unscored | live-imported only | live-imported unscored solve=unknown score=none correctness=none calls=0 | none | Create a native baseline and score it |
| issue-full-credit-note | attempted-unscored | live-imported only | live-imported unscored solve=unknown score=none correctness=none calls=0 | none | Create a native baseline and score it |
| create-accounting-dimension-and-post-voucher | attempted-unscored | live-imported only | live-imported unscored solve=unknown score=none correctness=none calls=0 | none | Create a native baseline and score it |
| create-employee | attempted-unscored | live-imported only | live-imported unscored solve=unknown score=none correctness=none calls=0 | none | Create a native baseline and score it |
| run-payroll-with-bonus | attempted-unscored | live-imported only | live-imported unscored solve=unknown score=none correctness=none calls=0 | none | Create a native baseline and score it |
| register-project-hours-and-create-project-invoice | attempted-unscored | live-imported only | live-imported unscored solve=unknown score=none correctness=none calls=0 | none | Create a native baseline and score it |
| set-project-fixed-price-and-invoice-milestone | attempted-estimated | live-imported only | live-imported estimated unsolved score=3.7142857142857144 correctness=none calls=0 | none | Reproduce the estimated leader natively and score it |
| reverse-customer-invoice-payment | attempted-estimated | live-imported only | live-imported estimated unsolved score=3 correctness=none calls=0 | none | Reproduce the estimated leader natively and score it |
| create-project | attempted-estimated | live-imported only | live-imported estimated unsolved score=2 correctness=none calls=0 | none | Reproduce the estimated leader natively and score it |
| create-product | attempted-estimated | live-imported only | live-imported estimated unsolved score=2 correctness=none calls=0 | none | Reproduce the estimated leader natively and score it |
| create-supplier | attempted-estimated | live-imported only | live-imported estimated unsolved score=0.8571428571428571 correctness=none calls=0 | none | Reproduce the estimated leader natively and score it |
| create-and-send-invoice | solved-estimated | combined live+native | native estimated solved score=2 correctness=1 calls=1 | none | Capture direct scored confirmation for the estimated solve |

