# Codex Reflection Summary

## 1. Task

Set fixed price 326550 NOK on project "Projet d'automatisation" for Cascade SARL (org 813648164). PM: Hugo Bernard (hugo.bernard@example.org). Invoice 75% milestone (244912.5 NOK).

## 2. Reflection

The run matched the trusted standard "Set project fixed price and invoice partial payment" exactly. The agent read the trusted standard, wrote a single script covering all branches, and executed it. The initial project read found the existing project with correct customer and PM already linked but `fixedprice` needing update. The proactive hedge correctly discovered the missing bank account number and fixed it before the invoice write. All 7 calls succeeded with 0 errors.

## 3. Call Efficiency

**7 calls, 0 errors** — update-needed + missing-bank proactive hedge branch.

| # | Call | Necessary? |
|---|------|-----------|
| 1 | GET /project?name=...&fields=*,customer(*),projectManager(*) | Yes — discover project state |
| 2 | PUT /project/{id} | Yes — fixedprice needed setting |
| 3 | GET /ledger/vatType | Yes — resolve VAT for invoice |
| 4 | POST /order | Yes — create milestone order |
| 5 | GET /ledger/account?isBankAccount=true | Yes — proactive hedge (bank was indeed missing) |
| 6 | PUT /ledger/account/{id} | Yes — fix missing bankAccountNumber |
| 7 | PUT /order/:invoice | Yes — create invoice |

**Verdict: minimal for this exact branch.** No wasted calls. The 7-call path is the floor for update-needed + missing-bank.

## 4. Root Causes

No mistakes. The run executed the canonical path with zero errors. The bank account being missing is an environmental state outside agent control — the proactive hedge correctly anticipated and handled it.

## 5. Sandbox Verification

Sandbox re-proof confirmed both branches with arithmetic `326550 * 0.75 = 244912.5`:
- Update-needed proactive hedge: **6 calls** (bank configured in sandbox), 0 errors, amount=244912.5 ✓
- Skip-PUT branch: **4 calls**, 0 errors, amount=244912.5 ✓

The conditional 4/6/7-call standard remains the proven minimum.

## 6. Playbook Changes

Updated existing files (no new files created):
- `trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md` — added 7th update-needed production confirmation (Cascade SARL, 75% milestone, 7 calls 0 errors), updated bank-account statistics to 5/7 missing (71%)
- `task-playbooks/set-project-fixed-price-and-invoice-partial-payment.md` — added production confirmation, updated statistics from 4/6 (67%) to 5/7 (71%)

## 7. Commit

```
3f706eb5 tripletex playbook: set-project-fixed-price — add 7th update-needed production confirmation (edea42c4, French prompt, Cascade SARL / 813648164 / Projet d'automatisation / hugo.bernard@example.org / 326550 / 75%, 7 calls 0 errors with proactive hedge), first production confirmation of 75% milestone percentage (244912.5 accepted directly); update bank-account statistics to 5/7 missing (71%); proactive hedge now averages 6.71 calls + 0 errors vs optimistic 7.14 + 0.71 errors; sandbox re-proof confirms conditional 4/6/7-call standard remains minimum
```

## 8. Reusable Heuristics

- **75% milestone decimals accepted**: `326550 * 0.75 = 244912.5` — Tripletex accepted the decimal amount directly on `unitPriceExcludingVatCurrency`, consistent with all prior milestone percentages (25%, 33%, 50%)
- **Proactive hedge remains dominant at 71%**: 5/7 update-needed runs had missing bank accounts; proactive hedge averages 6.71 calls + 0 errors vs optimistic 7.14 calls + 0.71 errors
- **Bank-account state varies per fresh account**: even identical task prompts can hit different bank states on different production accounts
- **French prompt handled correctly**: the trusted standard works across all prompt languages (nb, en, es, pt, nn, de, fr) — extract org number, email, amounts, and percentage mechanically regardless of language
