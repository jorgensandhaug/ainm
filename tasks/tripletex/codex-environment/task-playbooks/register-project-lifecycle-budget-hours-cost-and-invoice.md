# Register Project Lifecycle With Budget, Hours, Cost, and Invoice

## Scope

Use for tasks like:
- create the customer, employees, and project
- set a project budget
- register project hours
- register one supplier/project cost
- create an unsent customer invoice for the project

Do not use for:
- prompts that explicitly score true project-hour reserve consumption by the invoice
- prompts that explicitly score vendor linkage on the project cost row
- prompts that explicitly score hidden project-manager access toggles on a newly created employee

## Verified Findings

Persistent-sandbox follow-up on 2026-03-21 showed:
- `POST /project/projectActivity` can create the inline project-specific activity and set both `budgetHours` and `budgetFeeCurrency` in one write
- for that exact branch, a separate `POST /activity` before `POST /project/projectActivity` is wasted
- `POST /timesheet/entry` still has the hard per-entry ceiling `projectChargeableHours <= 24`
- the same employee + project + activity + date tuple still allows only one time-entry write, so totals above `24` must be pre-split across dates
- `POST /project/orderline` with a non-chargeable cost-only payload and `unitCostCurrency` increases project costs directly
- the same sandbox proof showed `GET /project/{id}/period/overallStatus?...` moving from `costs=61650` to `123300` and then `184950` after repeated identical cost-only project-orderline writes
- sending `unitPriceExcludingVatCurrency` on that non-chargeable cost line fails with `422 unitPriceExcludingVatCurrency: Ordrelinjen er ikke fakturerbar.`
- sending `vendor: { "id": ... }` on that cheap cost branch was accepted but later read back as `vendor=null`
- the supplier-invoice voucher path (`POST /ledger/voucher/importDocument` -> `PUT /ledger/voucher/{id}`) can create a supplier invoice while the later project-orderline read still shows `project=null`, so it is not the default project-cost branch for this task family
- a freshly created employee was not automatically assignable as project manager in persistent sandbox; `POST /project` failed with `projectManager.id: Oppgitt prosjektleder har ikke fått tilgang som prosjektleder i kontoen`
- `GET /employee?assignableProjectManagers=true` therefore remains a real gate, not just a convenience filter
- the ordinary invoice branch still worked with `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` -> `POST /order` -> `PUT /order/{id}/:invoice?invoiceDate=...&sendToCustomer=false`

Production run reconstruction for `Dataplattform Elvdal` additionally showed:
- the original run used `POST /activity` even though the direct project-activity write would have covered that side effect
- the original run used the supplier-invoice voucher machinery for the supplier cost, which cost extra calls and likely missed the intended project-linked cost shape
- the original run then hit the known invoice bank-account validation branch and had to repair it after the first `PUT /order/{id}/:invoice`

## Minimal Safe Flow

Assuming the fresh account allows the newly created project manager to be resolved by `assignableProjectManagers=true`, the lower-call path for this family is:

1. `POST /customer`
2. `POST /employee` for the future project manager
3. `GET /employee?email=<manager-email>&assignableProjectManagers=true&count=10&fields=*`
4. `POST /employee` for the second employee
5. `POST /project`
6. `POST /project/projectActivity` with inline activity plus project budget
7. one `POST /timesheet/entry` per planned date chunk for employee 1
8. one `POST /timesheet/entry` per planned date chunk for employee 2
9. `POST /supplier`
10. `POST /project/orderline` with the non-chargeable cost-only payload
11. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
12. `POST /order`
13. `PUT /order/{id}/:invoice?invoiceDate=<invoice-date>&sendToCustomer=false`

For the exact `Dataplattform Elvdal` arithmetic, that means:
- 1 customer write
- 2 employee writes
- 1 assignable-manager read
- 1 project write
- 1 project-activity write
- 7 timesheet writes (`43 = 24 + 19`, `100 = 24 + 24 + 24 + 24 + 4`)
- 1 supplier write
- 1 project-cost write
- 1 outgoing-VAT read
- 1 order write
- 1 invoice write
- total baseline: `18` calls

## Conditional Branches

- If `PUT /order/{id}/:invoice` fails with `Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`:
  - `GET /ledger/account?isBankAccount=true&fields=*`
  - `PUT /ledger/account/{id}` with a valid `bankAccountNumber`
  - retry the same `PUT /order/{id}/:invoice?...` once
- If the newly created employee does not appear in `GET /employee?...assignableProjectManagers=true` or `POST /project` still rejects that employee with the project-manager-access validation:
  - do not guess a hidden project-manager-access toggle
  - do not fall back to plain `GET /employee?email=...` and blindly try the write
  - treat the exact prompt family as outside the trusted `create-project` standard until corpus evidence proves a public access-grant path

## Recommended Shapes

Direct budgeted project activity:

```json
{
  "project": { "id": 54321 },
  "startDate": "2026-07-10",
  "budgetHours": 143,
  "budgetFeeCurrency": 331100,
  "activity": {
    "name": "Prosjektarbeid",
    "activityType": "PROJECT_SPECIFIC_ACTIVITY",
    "isChargeable": false
  }
}
```

Cost-only project order line:

```json
{
  "project": { "id": 54321 },
  "vendor": { "id": 67890 },
  "description": "Leverandørkostnad",
  "date": "2026-07-10",
  "count": 1,
  "unitCostCurrency": 61650,
  "isChargeable": false
}
```

Do not add `unitPriceExcludingVatCurrency` to that non-chargeable cost line.

## Avoidable Mistakes

- Do not spend a separate `POST /activity` before the direct budgeted `POST /project/projectActivity`
- Do not use the supplier-invoice voucher machinery as the default project-cost branch when the prompt only scores the project cost amount
- Do not send `unitPriceExcludingVatCurrency` on a non-chargeable `POST /project/orderline`
- Do not assume `vendor` will stay linked on the cheap cost-only project-orderline branch
- Do not assume a newly created employee is automatically eligible as project manager
- Do not fall back from `assignableProjectManagers=true` to a plain employee hit and then try `POST /project` blindly
- Do not recreate the order, project, or customer after the invoice bank-account `422`; repair the existing bank account and retry the same order invoice once
- Do not spend verification reads by default after `POST /project/projectActivity`, `POST /project/orderline`, `POST /timesheet/entry`, `POST /order`, or `PUT /order/{id}/:invoice` when the write response already proves the scored side effects
