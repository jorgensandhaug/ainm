# Codex Reflection Summary

## Task
Set fixed price 457650 NOK on project "Implementación ERP" for Solmar SL (org 866378843), PM María Sánchez (maria.sanchez@example.org). Invoice 25% of fixed price (114412.5 NOK) as partial payment.

## Reflection
The run executed flawlessly. The agent:
1. Read the exact-match trusted standard before writing any script
2. Correctly identified the update-needed branch (project existed but `fixedprice` needed update)
3. Used the proactive hedge strategy for bank account check
4. Discovered the bank account was missing and fixed it before the invoice write
5. Computed milestone amount correctly: `457650 * 0.25 = 114412.5`
6. Stopped after the successful invoice write with no unnecessary verification reads

No mistakes. The proactive hedge prevented what would have been a `422` error on the optimistic path.

## Call Efficiency
**The run was minimal-call for its branch.** 7 calls, 0 errors.

Production path: `GET /project` → `PUT /project` → `GET /ledger/vatType` → `POST /order` → `GET /ledger/account` (bank missing) → `PUT /ledger/account` → `PUT /order/:invoice`

This is the update-needed + missing-bank branch, which has a floor of 7 calls. No calls were wasted.

- **Skip-PUT branch floor**: 4 calls (when project already has correct fixed price + manager)
- **Update-needed + configured bank**: 6 calls
- **Update-needed + missing bank**: 7 calls (this run)

The only way this run could have been fewer calls is if the project had already been in the target state (skip-PUT → 4 calls) or if the bank account had already been configured (6 calls). Neither was within the agent's control.

## Root Causes
No errors or wasted calls. The run followed the trusted standard exactly.

The bank account was missing on this fresh production account — consistent with the now 78% missing rate across 9 update-needed production runs (7/9 missing). The proactive hedge strategy correctly anticipated this.

## Sandbox Verification
Persistent sandbox verification with `457650 * 0.25 = 114412.5` confirmed both branches:
- **Update-needed proactive hedge**: 6 measured calls (bank already configured from prior sandbox proof): `GET /project` → `PUT /project` → `GET /ledger/vatType` → `POST /order` → `GET /ledger/account` (configured) → `PUT /order/:invoice`
- **Skip-PUT branch**: 4 measured calls: `GET /project` → `GET /ledger/vatType` → `POST /order` → `PUT /order/:invoice`
- Both returned `amountExcludingVatCurrency=114412.5`
- Sandbox exposed only outgoing VAT `0%` (id=6); production exposed `25%` (id=3)

The conditional `4/6/7`-call standard remains the minimum proven path for this task family.

## Playbook Changes
Updated existing files (no new files created):
- `./trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md` — added 9th production confirmation (Solmar SL / 9b177d7c) and sandbox re-proof; updated bank-account missing rate stats to 7/9 (78%)
- `./task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md` — added 9th production confirmation; updated bank-account missing rate from 6/8 (75%) to 7/9 (78%) across strategy summary, exact-match fast path, and avoidable mistakes sections; added `Havbris AS` and `Solmar SL` to the list of runs with missing bank accounts

## Commit
- Hash: `45b8bda4`
- Message: `tripletex playbook: set-project-fixed-price-and-invoice-partial-payment — add 9th production run (9b177d7c, Solmar SL / 866378843 / Implementación ERP / 457650 / 25%, 7 calls 0 errors); update bank-account missing rate to 7/9 (78%) across trusted standard and playbook`

## Reusable Heuristics
1. **Proactive hedge is now even more clearly dominant**: 7/9 update-needed runs (78%) had missing bank accounts. Expected cost: hedge 6.78 calls + 0 errors vs optimistic 7.33 calls + 0.78 errors. Never use the optimistic path on the update-needed branch.
2. **25% milestone arithmetic**: `457650 * 0.25 = 114412.5` — decimal amounts are accepted directly, never round to whole NOK.
3. **Spanish prompts cause no endpoint deviation**: this is the 3rd Spanish-language prompt confirmed to follow the exact same API path as Norwegian/English/Portuguese/French/German prompts.
4. **VAT check on `amountExcludingVatCurrency`**: production returned `amountExcludingVatCurrency=114412.5` and `amountCurrencyOutstanding=143015.63` (includes 25% VAT). Always verify milestone correctness against the excluding-VAT field.
5. **Stop after invoice write**: no `GET /invoice/{id}` needed for the scored path. The write response proves the invoice totals.
