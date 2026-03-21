# Register Project Lifecycle With Budget, Hours, Cost, and Invoice

## Trust Level
- Trusted standard — use directly for exact matches, skip `./openapi.json`

## Exact Match
- create one customer, two employees, one project with monetary budget
- register project hours for both employees
- register one supplier/project cost
- create one unsent customer invoice
- add both employees as project participants

## Do Not Use This Standard If
- the prompt explicitly scores internal billability fields or true reserve consumption
- the prompt is really a fixed-price update/billing task rather than a fresh project-lifecycle create task
- CRITICAL: if the prompt gives project name + customer org + PM email + fixed price + milestone % WITHOUT mentioning employees to create, hours to register, or supplier costs, use `set-project-fixed-price-and-invoice-partial-payment` instead

## CRITICAL CHECKLIST — 4 Fields That MUST Be Set

1. **`isFixedPrice: true` + `fixedprice: <budget>`** on POST /project
2. **`budgetHours: <sum of all employees' hours>`** on POST /project/projectActivity
3. **`POST /project/orderline`** with `unitCostCurrency: <supplier-cost>` — voucher alone does NOT populate project costs
4. **`adminAccess: true`** on POST /project/participant for the prompt-named project manager

## Standard Flow (16 calls, 5 sequential steps, 0 errors)

1. `GET /department?isInactive=false&count=1&fields=*` + `POST /customer` + `GET /employee?assignableProjectManagers=true&count=1&fields=*` + `GET /ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber` + `GET /ledger/voucherType?name=Leverandørfaktura&count=1&fields=id,name` + `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<date>&fields=*` (6 parallel — frontload ALL reads)
2. `POST /employee/list` (both employees in one batch) + `POST /project` with `isFixedPrice: true` + `fixedprice` + (if 1920 lacks `bankAccountNumber`: `PUT /ledger/account/{id}` with `"12345678903"`) (2-3 parallel)
3. `POST /project/projectActivity` with `budgetHours` + `POST /project/participant` (PM, `adminAccess: true`) + `POST /project/participant` (other, `adminAccess: false`) (3 parallel)
4. `POST /timesheet/entry/list` + `POST /supplier` + `POST /project/orderline` (3 parallel)
5. `POST /ledger/voucher` + `POST /invoice?sendToCustomer=false` (2 parallel — voucher and invoice are independent)

## Payload Shapes

### Employees (POST /employee/list) — batch both in ONE call, NO `employments[]`
```json
[
  { "firstName": "X", "lastName": "Y", "email": "x@example.org", "dateOfBirth": "1990-01-01", "userType": "NO_ACCESS", "department": { "id": "<deptId>" } },
  { "firstName": "A", "lastName": "B", "email": "a@example.org", "dateOfBirth": "1992-06-15", "userType": "NO_ACCESS", "department": { "id": "<deptId>" } }
]
```
- returns `{ values: [emp1, emp2] }` — use `values[0].id` and `values[1].id`
- saves 1 call vs two separate POST /employee

### Project (POST /project)
```json
{ "name": "<project name>", "startDate": "<today>", "customer": { "id": "<custId>" }, "projectManager": { "id": "<assignablePmId>" }, "isFixedPrice": true, "fixedprice": "<budget>" }
```

### Project Activity (POST /project/projectActivity)
```json
{ "project": { "id": "<projId>" }, "startDate": "<today>", "budgetHours": "<sum of all hours>", "budgetFeeCurrency": "<budget>", "activity": { "name": "Prosjektaktivitet", "activityType": "PROJECT_SPECIFIC_ACTIVITY", "isChargeable": false } }
```
- `isChargeable` MUST be inside `activity`, NOT on root (root → 422)
- both `name` and `activityType` are mandatory (omitting either → 422)

### Timesheet (POST /timesheet/entry/list)
- split totals > 24h into consecutive dates (max 7.5h/entry recommended, 24h hard max)
- all dates >= project `startDate`
- CRITICAL: use `new Date(Date.UTC(y, m-1, d))` for date arithmetic — `new Date(str + "T00:00:00")` shifts dates in CET/CEST
```json
[{ "employee": { "id": "<empId>" }, "project": { "id": "<projId>" }, "activity": { "id": "<actId>" }, "date": "<date>", "hours": 7.5 }]
```

### Project Participant (POST /project/participant)
```json
{ "project": { "id": "<projId>" }, "employee": { "id": "<empId>" }, "adminAccess": true }
```
- PM employee: `adminAccess: true`; other: `adminAccess: false`

### Supplier Cost — Orderline (POST /project/orderline)
```json
{ "project": { "id": "<projId>" }, "description": "Leverandørkostnad", "date": "<today>", "count": 1, "unitCostCurrency": "<cost>", "isChargeable": false }
```

### Supplier Cost — Voucher (POST /ledger/voucher)
```json
{ "date": "<today>", "description": "Leverandørkostnad", "voucherType": { "id": "<lookedUpId>" },
  "postings": [
    { "row": 1, "date": "<today>", "description": "Leverandørkostnad", "account": { "id": "<6590id>" }, "amount": "<cost>", "amountCurrency": "<cost>", "amountGross": "<cost>", "amountGrossCurrency": "<cost>", "project": { "id": "<projId>" } },
    { "row": 2, "date": "<today>", "description": "Leverandørgjeld", "account": { "id": "<2400id>" }, "amount": "-<cost>", "amountCurrency": "-<cost>", "amountGross": "-<cost>", "amountGrossCurrency": "-<cost>", "supplier": { "id": "<suppId>" } }
  ] }
```
- MUST include `row: 1` / `row: 2` — omitting row → 422
- voucherType ID is environment-specific — NEVER hardcode, always use GET result
- BOTH orderline AND voucher are needed: orderline for project costs, voucher for accounting + supplier linkage

### Invoice (POST /invoice?sendToCustomer=false)
```json
{ "invoiceDate": "<today>", "invoiceDueDate": "<today+14d>", "customer": { "id": "<custId>" },
  "orders": [{ "customer": { "id": "<custId>" }, "project": { "id": "<projId>" }, "orderDate": "<today>", "deliveryDate": "<today>",
    "orderLines": [{ "description": "<project name>", "count": 1, "unitPriceExcludingVatCurrency": "<budget>", "vatType": { "id": "<vatTypeId>" } }]
  }] }
```
- `invoiceDueDate` is mandatory (omitting → 422)
- `project` goes on `orders[]`, NOT inside `orderLines[]`

## Recovery
- no department → `POST /department` with `{ "name": "Avdeling" }` (+1 call)
- account 1920 missing → `GET /ledger/account?isBankAccount=true&fields=*` (+1 call)
- bank account lacks number → `PUT /ledger/account/{id}` with `bankAccountNumber: "12345678903"` (MOD11-valid)
- PM constraint: only account owner can be `projectManager`; use generic assignable PM, add prompt-named PM as participant with `adminAccess: true`

## Do NOT
- include `employments[]` on employees (avoids division/startDate traps, saves GET /division)
- use two separate `POST /employee` calls — use `POST /employee/list` batch (saves 1 call)
- use `POST /supplierInvoice` (no POST method in spec)
- use individual `POST /timesheet/entry` (use batch /list)
- use `POST /order` + `PUT /order/:invoice` (use direct POST /invoice)
- use two separate GET /ledger/account reads (combine into `number=1920,6590,2400`)
- use `bankAccountNumber: "12345678901"` (not MOD11-valid; use `"12345678903"`)
