# Strategy Comparison

Generated: 2026-03-20T21:44:07.679Z

Runs dir: `runs`
Canonical artifacts: 51
Native artifacts: 19
Live-imported artifacts: 32
Observed task buckets: 13
Registered tasks: 17

Ranking policy:
- Prefer taskSolved=true over unsolved or unknown outcomes.
- When correctnessScore exists, higher correctnessScore ranks first.
- When scoreTotal exists, higher scoreTotal ranks first.
- Lower apiCallCount ranks ahead of higher apiCallCount when score metrics tie.
- Direct scored evidence ranks above estimated evidence, which ranks above unscored runs when metrics tie or are absent.
- Completed runs rank above failed, timeout, aborted, or not-run outcomes.
- Lower durationMs breaks remaining ties.
- Newer createdAt and then lexical runId make ties deterministic.

## Current Best Strategy Per Task

| Task | Status | Sources | Current best | Verified best |
| --- | --- | --- | --- | --- |
| create-customer-invoice | not-run | no evidence | none | none |
| create-order-invoice-and-register-payment | not-run | no evidence | none | none |
| register-customer-invoice-payment | not-run | no evidence | none | none |
| register-supplier-invoice | not-run | no evidence | none | none |
| register-travel-expense | not-run | no evidence | none | none |
| create-customer | attempted-unscored | live-imported only | `legacy-tripletex1-multi-script-run` score=none, calls=0, evidence=unscored | none |
| legacy-tripletex1-unattributed | attempted-unscored | live-imported only | `legacy-tripletex1-multi-script-run` score=none, calls=0, evidence=unscored | none |
| issue-full-credit-note | attempted-unscored | live-imported only | `legacy-tripletex1-multi-script-run` score=none, calls=0, evidence=unscored | none |
| create-accounting-dimension-and-post-voucher | attempted-unscored | live-imported only | `legacy-tripletex1-script-create-dimension-and-voucher` score=none, calls=0, evidence=unscored | none |
| create-employee | attempted-unscored | live-imported only | `legacy-tripletex1-script-create-employee` score=none, calls=0, evidence=unscored | none |
| run-payroll-with-bonus | attempted-unscored | live-imported only | `legacy-tripletex1-script-run-payroll-joao-santos` score=none, calls=0, evidence=unscored | none |
| register-project-hours-and-create-project-invoice | attempted-unscored | live-imported only | `legacy-tripletex1-multi-script-run` score=none, calls=0, evidence=unscored | none |
| set-project-fixed-price-and-invoice-milestone | attempted-estimated | live-imported only | `legacy-tripletex1-script-set-project-fixed-price-and-invoice-partial-payment` score=3.7142857142857144, calls=0, evidence=estimated | none |
| reverse-customer-invoice-payment | attempted-estimated | live-imported only | `legacy-tripletex1-multi-script-run` score=3, calls=0, evidence=estimated | none |
| create-project | attempted-estimated | live-imported only | `legacy-tripletex1-script-create-project` score=2, calls=0, evidence=estimated | none |
| create-product | attempted-estimated | live-imported only | `legacy-tripletex1-script-create-product-7986` score=2, calls=0, evidence=estimated | none |
| create-supplier | attempted-estimated | live-imported only | `legacy-tripletex1-multi-script-run` score=0.8571428571428571, calls=0, evidence=estimated | none |
| create-and-send-invoice | solved-estimated | combined live+native | `create-and-send-invoice.order-then-send` score=2, calls=1, evidence=estimated | none |

## Ranked Strategies

### create-customer
Status: attempted-unscored
Open reason: Runs exist, but no comparable score evidence has been recorded yet.
1. `legacy-tripletex1-multi-script-run` score=none, calls=0, evidence=unscored

### legacy-tripletex1-unattributed
Status: attempted-unscored
Open reason: Runs exist, but no comparable score evidence has been recorded yet.
1. `legacy-tripletex1-multi-script-run` score=none, calls=0, evidence=unscored

### issue-full-credit-note
Status: attempted-unscored
Open reason: Runs exist, but no comparable score evidence has been recorded yet.
1. `legacy-tripletex1-multi-script-run` score=none, calls=0, evidence=unscored
2. `legacy-tripletex1-script-create-credit-note` score=none, calls=0, evidence=unscored

### create-accounting-dimension-and-post-voucher
Status: attempted-unscored
Open reason: Runs exist, but no comparable score evidence has been recorded yet.
1. `legacy-tripletex1-script-create-dimension-and-voucher` score=none, calls=0, evidence=unscored
2. `legacy-tripletex1-script-run` score=none, calls=0, evidence=unscored
3. `legacy-tripletex1-multi-script-run` score=none, calls=0, evidence=unscored

### create-employee
Status: attempted-unscored
Open reason: Runs exist, but no comparable score evidence has been recorded yet.
1. `legacy-tripletex1-script-create-employee` score=none, calls=0, evidence=unscored

### run-payroll-with-bonus
Status: attempted-unscored
Open reason: Runs exist, but no comparable score evidence has been recorded yet.
1. `legacy-tripletex1-script-run-payroll-joao-santos` score=none, calls=0, evidence=unscored

### register-project-hours-and-create-project-invoice
Status: attempted-unscored
Open reason: Runs exist, but no comparable score evidence has been recorded yet.
1. `legacy-tripletex1-multi-script-run` score=none, calls=0, evidence=unscored

### set-project-fixed-price-and-invoice-milestone
Status: attempted-estimated
Open reason: Only estimated score evidence exists; native scoring is still needed.
1. `legacy-tripletex1-script-set-project-fixed-price-and-invoice-partial-payment` score=3.7142857142857144, calls=0, evidence=estimated

### reverse-customer-invoice-payment
Status: attempted-estimated
Open reason: Only estimated score evidence exists; native scoring is still needed.
1. `legacy-tripletex1-multi-script-run` score=3, calls=0, evidence=estimated
2. `legacy-tripletex1-script-reverse-payment` score=none, calls=0, evidence=unscored

### create-project
Status: attempted-estimated
Open reason: Only estimated score evidence exists; native scoring is still needed.
1. `legacy-tripletex1-script-create-project` score=2, calls=0, evidence=estimated

### create-product
Status: attempted-estimated
Open reason: Only estimated score evidence exists; native scoring is still needed.
1. `legacy-tripletex1-script-create-product-7986` score=2, calls=0, evidence=estimated
2. `legacy-tripletex1-multi-script-run` score=none, calls=0, evidence=unscored

### create-supplier
Status: attempted-estimated
Open reason: Only estimated score evidence exists; native scoring is still needed.
1. `legacy-tripletex1-multi-script-run` score=0.8571428571428571, calls=0, evidence=estimated

### create-and-send-invoice
Status: solved-estimated
Open reason: Only estimated solve evidence exists; native scored confirmation is still needed.
1. `create-and-send-invoice.order-then-send` score=2, calls=1, evidence=estimated
2. `legacy-tripletex1-multi-script-run` score=1.5333333333333332, calls=0, evidence=estimated
3. `create-and-send-invoice.order-then-invoice-send.v1` score=none, calls=3, evidence=unscored

