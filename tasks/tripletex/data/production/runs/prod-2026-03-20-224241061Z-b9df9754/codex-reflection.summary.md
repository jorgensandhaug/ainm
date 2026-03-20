# Task

Reflect the production run for registering `14` hours for `anna.wagner@example.org` on `Analyse` in project `Sicherheitsaudit` for `Waldstein GmbH` (`948366207`), audit call efficiency, prove the best path in persistent sandbox, update the learning artifacts, and commit the doc changes.

# Reflection

The production run went well. It matched the existing exact trusted-standard branch for hours-plus-project-invoice tasks where the resolved activity is non-chargeable. The agent resolved employee, project, and activity cleanly, saw `activity.isChargeable=false`, skipped `/project/hourlyRates`, registered the hours, resolved VAT, created one real project-linked order line, and invoiced it unsent.

Nothing went poorly in the scored production run itself. The result was correct: timesheet `175905705`, invoice `2147552693`, `amountExcludingVatCurrency=16100`, `amountCurrencyOutstanding=20125`. The only follow-up hiccup happened during sandbox re-proof, not production: the first sandbox replay reused an already-occupied employee+project+activity+date tuple and hit `409`. The fix was to move the proof to a fresh date.

The correct approach for this shape remains: trust the activity lookup, branch on `isChargeable`, and on the non-chargeable branch keep the proven manual order-line fallback instead of trying to force public API hour consumption or hourly-rate writes.

# Call Efficiency

The production run was minimal-call for this exact task shape.

Production call path:
1. `GET /employee?email=anna.wagner@example.org&count=10&fields=*`
2. `GET /project?name=Sicherheitsaudit&count=50&fields=*,customer(*)`
3. `GET /activity/>forTimeSheet?...query=Analyse...&fields=*`
4. `POST /timesheet/entry`
5. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`
6. `POST /order`
7. `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false`

Wasted calls: none.

Exact lower-call path for the next agent: the same 7-call path above when `/activity/>forTimeSheet` returns `isChargeable=false` and hours `<= 24`. There is no proven lower-call public replacement that stays VAT-safe for production. Do not add `/project/hourlyRates`, `/timesheet/week/:approve`, `/customer`, `/invoice/details`, or speculative project-invoice-hour toggles.

# Root Causes

The decisive branch condition is activity chargeability. `Analyse` on this project resolved as non-chargeable, so any hourly-rate holder read or project-specific-rate write would have been wasted and, on the direct rate-create path, potentially `422`.

The invoice side effect still cannot be achieved through public API “include hours” style writes. The reliable production-safe fallback is separate hour registration plus one real project-linked manual order line for `hours * rate`.

Persistent sandbox state is reused. Date reuse can trigger `409 Det er allerede registrert timer ...` even when the logic is otherwise correct, so proof scripts need a fresh date when reusing the same employee/project/activity tuple.

# Sandbox Verification

Used only sandbox credentials at `https://kkpqfuj-amager.tripletex.dev/v2`.

Proof run used the established non-chargeable analog:
- employee: `codex.verify.1773957815637@example.org`
- project: `Sandbox Hour Invoice Project 1774020541520`
- customer org: `907791616`
- activity: `Prosjektadministrasjon`
- date: `2026-06-21`
- hours/rate: `14` and `1150`

Verified result:
- `calls=7`
- `activityIsChargeable=false`
- `timesheetEntryId=175905712`
- `timesheetChargeable=false`
- `timesheetHourlyRate=0`
- `invoiceId=2147552742`
- `amountExcludingVatCurrency=16100`
- `amountCurrencyOutstanding=16100`

This re-proved that the non-chargeable branch still bottoms out at 7 calls. The first sandbox attempt on `2026-06-18` failed `409` only because that tuple/date was already occupied; the corrected fresh-date run succeeded unchanged.

# Playbook Changes

Updated existing artifacts, no new files created:
- `AGENTS.md`
- `trusted-standards/register-project-hours-and-create-project-invoice.md`
- `task-playbooks/register-project-hours-and-create-project-invoice.md`

Changes made:
- added the exact production confirmation for `Waldstein GmbH` / `anna.wagner@example.org` / `Analyse` / `14h @ 1150`
- added the matching persistent-sandbox re-proof for `14h @ 1150`
- reinforced that the 7-call non-chargeable branch is still the minimal production-safe path

# Commit

Commit: `913a0f0`

Message: `tripletex playbook: capture 14h non-chargeable project invoice proof`

# Reusable Heuristics

- For exact project-hour invoice tasks, start with employee, project, then `/activity/>forTimeSheet`; let `activity.isChargeable` decide the branch.
- If `isChargeable=false` and the prompt scores only hour registration plus customer-facing invoice side effect, skip `/project/hourlyRates` entirely.
- Keep `GET /ledger/vatType` in the default path even if sandbox sometimes accepts omitted `vatType`; that shortcut is not production-safe on taxable accounts.
- Use one real project-linked order line for `count=<hours>` and `unitPriceExcludingVatCurrency=<rate>`; public API hour-inclusion toggles are still not a reliable lower-call path.
- In persistent sandbox re-proofs, always choose a fresh date for the same employee/project/activity tuple to avoid avoidable `409` duplicates.