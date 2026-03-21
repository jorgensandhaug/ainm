# Codex Reflection Summary

## Task

Register 38 hours for Camille Petit (camille.petit@example.org) on activity "Design" of project "Audit de sécurité" for Cascade SARL (org 824869383), hourly rate 1400 NOK/h, then generate a project invoice to the client based on the registered hours. French prompt.

## Reflection

**What went well:**
- Correctly identified the task as an exact match for trusted standard `register-project-hours-and-create-project-invoice`
- Read the trusted standard before writing any code
- Correctly pre-planned the 38-hour split into 24 + 14 across two dates before the first write (avoiding the `422 projectChargeableHours > 24` and `409` same-day duplicate traps)
- Activity was non-chargeable (`isChargeable=false`), correctly skipped the entire hourly-rate read/write path
- Used the optimistic branch for bank account — it was configured, so no recovery was needed
- Invoice created with correct amount: 38 × 1400 = 53,200 excl. VAT
- Production account had 25% VAT (id=3, "Utgående avgift, høy sats"), producing amountCurrencyOutstanding=66,500

**What went poorly:**
- Nothing. The run was clean and optimal.

**Mistakes:**
- None. The agent followed the trusted standard precisely and hit no errors.

## Call Efficiency

**The run was minimal-call.** 8 API calls, 0 errors.

| # | Call | Purpose | Necessary? |
|---|------|---------|------------|
| 1 | `GET /employee?email=...` | Resolve employee ID | Yes |
| 2 | `GET /project?name=...&fields=*,customer(*)` | Resolve project + customer | Yes |
| 3 | `GET /activity/>forTimeSheet?...` | Resolve activity, check isChargeable | Yes |
| 4 | `POST /timesheet/entry` (24h, 2026-03-21) | Register first chunk | Yes |
| 5 | `POST /timesheet/entry` (14h, 2026-03-22) | Register second chunk | Yes |
| 6 | `GET /ledger/vatType?typeOfVat=OUTGOING` | Resolve correct VAT for order line | Yes |
| 7 | `POST /order` (with order line) | Create project-linked order | Yes |
| 8 | `PUT /order/{id}/:invoice` | Create invoice | Yes |

**Wasted calls:** 0
**Lower-call path:** None exists for the >24-hour non-chargeable branch with configured bank account. 8 is the floor.

**Call count by branch:**
- Non-chargeable, ≤24 hours, bank configured: 7 calls
- Non-chargeable, >24 hours (2 chunks), bank configured: 8 calls ← this run
- Non-chargeable, ≤24 hours, bank missing: 10 calls (optimistic) / 9 calls (proactive)
- Non-chargeable, >24 hours, bank missing: 11 calls (optimistic) / 10 calls (proactive)

## Root Causes

No issues to diagnose. The run executed the trusted standard correctly on the first attempt.

## Sandbox Verification

Re-verified the exact 8-call >24-hour non-chargeable branch in the persistent sandbox:
- Employee: `codex.verify.1773957815637@example.org` (id=18478235)
- Project: `Sandbox Hour Invoice Project 1774020541520` (id=401959961)
- Activity: `Prosjektadministrasjon` (id=5588719, isChargeable=false)
- 38 hours split as 24 (2026-09-01) + 14 (2026-09-02)
- Rate: 1400 NOK/h
- Result: 8 calls, 0 errors, amountExcludingVatCurrency=53200
- Confirmed: no lower-call path exists for the >24-hour shape

Key production insight confirmed in sandbox: production VAT id=3 (25%) vs sandbox VAT id=6 (0%), proving `GET /ledger/vatType` is mandatory to avoid silently wrong VAT on taxable accounts.

## Playbook Changes

Updated existing trusted standard and playbook (no new files created):
- `./trusted-standards/register-project-hours-and-create-project-invoice.md` — added 8th production confirmation (Cascade SARL, adba202b) and sandbox re-proof for 38-hour >24-hour branch
- `./task-playbooks/register-project-hours-and-create-project-invoice.md` — added same production confirmation and sandbox re-proof

No changes to `AGENTS.md` (no new files, no renames).

## Commit

- Hash: `f6c3548f`
- Message: `tripletex playbook: register-project-hours-and-create-project-invoice — add 8th production confirmation (adba202b, French prompt, Cascade SARL / 824869383 / Audit de sécurité / Design, 38 hours >24 split as 24+14, 1400 NOK/h, 8 calls 0 errors), confirm 25% VAT id=3 on production accounts proves GET /ledger/vatType is mandatory, sandbox re-verify 8-call >24-hour non-chargeable branch`

## Reusable Heuristics

1. **>24-hour split must be pre-planned.** Always compute `ceil(hours / 24)` before the first `POST /timesheet/entry`. Each chunk gets a distinct date. Never attempt >24 `projectChargeableHours` in one entry (→ `422`), never stack two same-day entries for the same employee+project+activity (→ `409`).

2. **Non-chargeable means skip hourly rates entirely.** When `isChargeable=false`, do not waste calls on `GET /project/hourlyRates` or rate creation. The prompt hourly rate applies only to the manual order line, not the timesheet.

3. **`GET /ledger/vatType` is mandatory.** Production accounts use 25% VAT (id=3), not 0%. Omitting `vatType` from the order line defaults to `id=0` (0%), silently creating wrong invoice totals. This was confirmed again on this production run.

4. **Optimistic bank-account approach is still canonical.** On configured accounts it saves 1 call (8 vs 9 for >24h). When bank is missing, the recovery costs 3 extra calls and 1 error (11 total). The tradeoff favors optimistic as the default.

5. **Production confirmation count for this task shape is now 8 runs** across French, German, and Norwegian prompts, covering ≤24-hour and >24-hour branches, chargeable and non-chargeable activities, and both configured and missing bank accounts.
