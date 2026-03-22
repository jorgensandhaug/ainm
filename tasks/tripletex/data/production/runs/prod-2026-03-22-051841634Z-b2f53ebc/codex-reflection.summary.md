# Post-Run Reflection: prod-2026-03-22-051841634Z-b2f53ebc

## 1. Task

Register a travel expense for Bruno Silva (bruno.silva@example.org) for "Conferência Bodø". 3-day trip with per diem (daily rate 800 NOK). Costs: airplane ticket 4900 NOK, taxi 450 NOK. Portuguese prompt.

## 2. Reflection

**What went well:**
- Immediately recognized this as an exact trusted-standard match for `register-travel-expense.md`
- Read the trusted standard BEFORE writing any script (as required by AGENTS.md)
- Did not waste time reading AGENTS.md, playbook, or openapi.json (the standard says not to for exact matches)
- Correctly extracted all parameters from the Portuguese prompt: employee email, title, destination (Bodø), 3 days, rate 800, Fly 4900, Taxi 450
- Executed the full chain: create → deliver → approve → createVouchers
- Zero errors, zero retries
- Correctly handled the employee with no address by falling back to company address lookup
- Used hardcoded rateType IDs (25888/740) — no extra lookup needed

**What went poorly:**
- Nothing. The run was clean.

**Mistakes:**
- None. Script log said "6-7 calls" but actually made 8 — cosmetic only, no impact on scoring.

## 3. Call Efficiency

**Total calls: 8 (optimal for this case)**

| # | Call | Purpose | Necessary? |
|---|------|---------|------------|
| 1 | GET /employee?email=... | Find employee ID | YES — mandatory |
| 2 | GET /travelExpense/costCategory | Get Fly/Taxi IDs + vatType | YES — mandatory |
| 3 | GET /travelExpense/paymentType | Get payment type ID | YES — mandatory |
| 4 | GET /company/{id}?fields=*,address(*) | Get departure city | YES — employee had address=null |
| 5 | POST /travelExpense | Create the expense | YES — core action |
| 6 | PUT /travelExpense/:deliver | Deliver for approval | YES — prerequisite for approve |
| 7 | PUT /travelExpense/:approve | Approve the expense | YES — prerequisite for createVouchers |
| 8 | PUT /travelExpense/:createVouchers | Create accounting voucher | YES — CRITICAL for scoring |

**Wasted calls: 0**

**Minimum call path:**
- 7 calls if employee has address (skip company lookup)
- 8 calls if employee has no address (this run's case)
- The 7-8 call path is the proven floor. Sandbox-verified: costCategory/paymentType IDs differ between accounts so lookups cannot be hardcoded; description-based references resolve to null at deliver.

## 4. Root Causes

No failures in this run. The trusted standard was followed exactly and the full deliver→approve→createVouchers chain was executed.

Historical context: 22 prior production runs scored 4.5/8 because they stopped at deliver (no approve, no createVouchers). Run b57900d3 added approve but still scored 4.5/8 because createVouchers was missing. This run includes all three steps.

## 5. Sandbox Verification

Confirmed via sandbox investigation:
- Cost category IDs differ between accounts (sandbox Fly=32813722, prod Fly=38785113) → lookups mandatory
- Payment type IDs differ between accounts (sandbox=32813706, prod=38785097) → lookups mandatory
- All sandbox employees have address=null → company address lookup typically needed
- vatType=12 is consistent for Fly and Taxi categories across accounts but IDs differ so lookup still needed for costCategory.id

No lower-call path exists. The 7-8 call floor is confirmed.

## 6. Playbook Changes

**Files changed:**

1. `./AGENTS.md` — Fixed stale "5-6 call floor" to "7-8 call floor" (the old number predated the approve+createVouchers fix)

2. `./trusted-standards/register-travel-expense.md`:
   - Added Portuguese per-diem prompt example: "3 dias, taxa diária 800"
   - Added German per-diem prompt example: "3 Tage, Tagessatz 800"
   - Added French per-diem prompt example: "3 jours, indemnité journalière 800"
   - Added prod-b2f53ebc to production history

3. `./task-playbooks/register-travel-expense.md`:
   - Added prod-b2f53ebc to production history

No new files created. No structural changes needed — the trusted standard and playbook are mature and correct.

## 7. Commit

- **Hash:** `c56b4c08`
- **Message:** `tripletex playbook: register-travel-expense — add prod-b2f53ebc run entry (Portuguese prompt, Bruno Silva / Conferência Bodø / 3 days 800 / Fly 4900+Taxi 450, 8 calls 0 errors, full deliver→approve→createVouchers chain); fix stale "5-6 call floor" to "7-8 call floor" in AGENTS.md (was pre-approve/createVouchers count); add Portuguese/German/French per-diem prompt examples to trusted standard`

## 8. Reusable Heuristics

1. **Portuguese per-diem vocabulary:** "ajudas de custo" = per diem allowance, "taxa diária" = daily rate, "bilhete de avião" = airplane ticket, "despesa de viagem" = travel expense, "dias" = days. Map these to the standard flow parameters identically to Norwegian/English/Spanish equivalents.

2. **The 7-8 call floor is firm.** All 3 round-1 lookups (employee, costCategory, paymentType) are mandatory — IDs differ between accounts. The 4 action steps (POST, deliver, approve, createVouchers) are all mandatory for scoring. Company address lookup is conditional but typically needed (fresh accounts have employees with no address).

3. **Read the trusted standard, then execute immediately.** This run succeeded because it followed this pattern exactly. Do not also read AGENTS.md, the playbook, or openapi.json for exact matches — prior runs timed out doing so.

4. **Full chain is non-negotiable:** deliver → approve → createVouchers. Omitting createVouchers costs 3.5 points (checks 2, 3, 6 fail). This has been proven across 24+ production runs.

5. **Duration-only prompts:** When no dates are given (like this run), pick recent past dates spanning the stated number of days. The API accepts any valid range.
