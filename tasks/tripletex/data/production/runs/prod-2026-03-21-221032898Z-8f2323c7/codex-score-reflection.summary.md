# Score Reflection — prod-2026-03-21-221032898Z-8f2323c7

## 1. Task Attribution

**Task ID**: T16 (T2 tier, max 4 points)
**Attribution confidence**: definitive — `completed_at: "2026-03-21T22:13:16.879814+00:00"` matches T16 `last_attempt_at` exactly down to microseconds; T16 `total_attempts` incremented 17→18.
**Best score on T16**: 3/4 (unchanged — this run did not improve it).
**This run score**: 0/4.

## 2. Correctness Verdict

**Correctness: 0** — total failure. All 4 checks failed. `score_raw: 0, score_max: 8, feedback_comment: "4/4 checks failed."`

This was not an efficiency problem — the final Tripletex state was fundamentally wrong.

## 3. Efficiency Verdict

N/A — correctness was 0, so efficiency is irrelevant. The run used 11 API calls with 0 errors, which would have been efficient if correctly targeted, but every call was wasted because it operated on the wrong entities.

## 4. Likely Root Cause

**The agent created new entities instead of looking up existing ones.**

The task prompt was:
> Erfassen Sie 20 Stunden für Laura Müller (laura.muller@example.org) auf der Aktivität "Rådgivning" im Projekt "Datenmigration" für Nordlicht GmbH (Org.-Nr. 936514200). Stundensatz: 1550 NOK/h. Erstellen Sie eine Projektrechnung an den Kunden basierend auf den erfassten Stunden.

This uses language like "für Laura Müller ... auf der Aktivität ... im Projekt ... für Nordlicht GmbH" — phrasing that implies these entities **already exist** in the account. The task asks to **register hours** and **create an invoice**, not to create the customer/employee/project/activity from scratch.

The agent misread this as a "create everything from scratch" lifecycle task and:
1. `POST /customer` — created a **duplicate** Nordlicht GmbH (the original already existed)
2. `POST /employee` — created a **duplicate** Laura Müller (the original already existed)
3. `POST /project` — created a **duplicate** Datenmigration project (the original already existed)
4. `POST /project/projectActivity` — created a **duplicate** Rådgivning activity (the original already existed)
5. Registered 20 hours on the **new** (wrong) project/employee/activity
6. Created invoice on the **new** (wrong) customer/project

The scorer checked the **pre-existing** entities, which had no hours and no invoice → 0/4 checks passed.

**Secondary issue**: The agent created the activity with `isChargeable: false`. Even if it had used the correct entities, it would still have missed the hourly rate requirement (1550 NOK/h). The correct approach requires checking `activity.isChargeable` via `GET /activity/>forTimeSheet` and, if chargeable, setting up project-specific hourly rates before registering hours.

**Third issue**: The agent used `POST /invoice?sendToCustomer=false` (direct invoice) instead of the proven `POST /order` + `PUT /order/:invoice` path from the existing trusted standard.

## 5. What Went Right

- The API calls themselves executed without errors (0 4xx)
- The script structure with parallel batches was efficient
- The invoice amount (31,000 NOK = 20h × 1550) was correctly calculated
- The timesheet entry for 20 hours (≤24, no splitting needed) was correct in shape

## 6. What To Change Next Time

**Critical**: The agent must distinguish between two fundamentally different task shapes:

| Signal | Task shape | Trusted standard |
|--------|-----------|-----------------|
| Prompt references entities by name/email/org-nr as if they exist | **Existing-entity**: look up, then act | `register-project-hours-and-create-project-invoice` |
| Prompt says "create", "set up", "onboard", or describes a full lifecycle setup | **Create-from-scratch**: create, then act | `register-project-lifecycle-budget-hours-cost-and-invoice` |

For this exact task shape (T16), the correct approach is the **existing `register-project-hours-and-create-project-invoice` trusted standard**:

1. `GET /employee?email=laura.muller@example.org&count=10&fields=*` — find existing Laura
2. `GET /project?name=Datenmigration&count=50&fields=*,customer(*)` — find existing project + customer
3. `GET /activity/>forTimeSheet?projectId=...&employeeId=...&date=...&query=Rådgivning&filterExistingHours=false&count=50&fields=*` — find existing activity, check `isChargeable`
4. If chargeable: `GET /project/hourlyRates` → conditional rate setup → timesheet with `hourlyRate=1550`
5. If non-chargeable: `POST /timesheet/entry` directly (hourlyRate will be 0)
6. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*`
7. `POST /order` with order line: count=20, unitPriceExcludingVatCurrency=1550
8. `PUT /order/{id}/:invoice?invoiceDate=...&sendToCustomer=false`

Expected call count: 7-8 calls (non-chargeable) or 8-10 calls (chargeable with rate setup).

**Key heuristic for future agents**: If the prompt gives an employee email, a project name, an activity name, and a customer org number — and does NOT say "create" or "set up" — assume these entities already exist. Use GETs to find them. Do NOT create duplicates. The `register-project-hours-and-create-project-invoice` trusted standard's exact-match section says "project, customer, employee, and activity already exist" — and its "Do Not Use" section says "the task also requires creating the employee, customer, or project first." This task was a textbook exact match for the existing-entity standard, and the agent used the wrong one.
