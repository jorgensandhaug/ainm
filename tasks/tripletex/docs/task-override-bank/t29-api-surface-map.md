# Task 29 — API Surface Map

> Generated 2026-03-22. Research-only document mapping every project-lifecycle field
> the scorer could verify, with focus on what the current strategy ignores.

## 1. Complete Field Maps

### 1.1 Project (`POST /project`)

| Field | Type | Set by strategy? | Current value | Notes |
|-------|------|:-:|---|---|
| `name` | string | YES | prompt value | |
| `number` | string | NO | auto-generated | Could set explicit number |
| `description` | string | NO | — | Free text; scorer could check |
| `projectManager` | Employee ref | YES | account owner (not prompt PM) | **Structural blocker**: only pre-existing PM-eligible employees accepted |
| `department` | Department ref | NO | — | Could link to dept |
| `mainProject` | Project ref | NO | — | Sub-project hierarchy |
| `startDate` | string | YES | TODAY | |
| `endDate` | string | NO | — | **Could matter for lifecycle completeness** |
| `customer` | Customer ref | YES | created customer | |
| `isClosed` | boolean | NO | false (default) | |
| `isReadyForInvoicing` | boolean | NO | false (default) | **Could matter**: scorer might check this is true before invoice |
| `isInternal` | boolean | NO | false (default) | Correct default for customer project |
| `isOffer` | boolean | NO | false (default) | Correct default |
| `isFixedPrice` | boolean | NO | false (default=hourly) | **Intentionally not set** — hourly rate project is correct for budget/hours task |
| `projectCategory` | ProjectCategory ref | NO | — | **Hypothesis A**: could map to billing type |
| `deliveryAddress` | Address ref | NO | — | |
| `reference` | string | NO | — | |
| `externalAccountsNumber` | string | NO | — | |
| `vatType` | VatType ref | NO | — | **Could matter for invoice VAT** |
| `fixedprice` | number | NO | — | Only for isFixedPrice=true |
| `currency` | Currency ref | NO | — | Defaults to NOK |
| `markUpOrderLines` | number | NO | — | Mark-up % for order lines |
| `markUpFeesEarned` | number | NO | — | Mark-up % for fees |
| `isPriceCeiling` | boolean | NO | — | Cap on hourly-rate projects |
| `priceCeilingAmount` | number | NO | — | |
| `projectHourlyRates` | array | NO (set via separate POST) | — | Could inline on project creation |
| `forParticipantsOnly` | boolean | NO | false (default) | |
| `participants` | array | NO (set via separate POST) | — | Could inline on project creation |
| `contact` | Contact ref | NO | — | |
| `attention` | Contact ref | NO | — | |
| `invoiceComment` | string | NO | — | **Default comment for project invoices** |
| `generalProjectActivitiesPerProjectOnly` | boolean | NO | — | Controls time tracking scope |
| `projectActivities` | array | NO (set via separate POST) | — | Could inline on project creation |
| `invoiceDueDate` | integer | NO | — | Payment terms (days/months) |
| `invoiceDueDateType` | enum | NO | — | DAYS, MONTHS, RECURRING_DAY_OF_MONTH |
| `invoiceReceiverEmail` | string | NO | — | |
| `overdueNoticeEmail` | string | NO | — | |
| `accessType` | enum | NO | — | NONE/READ/WRITE |
| `useProductNetPrice` | boolean | NO | — | |
| `ignoreCompanyProductDiscountAgreement` | boolean | NO | — | |
| `invoiceOnAccountVatHigh` | boolean | NO | — | VAT on a-konto amounts |
| `accountingDimensionValues` | array | NO | — | [BETA] free dimensions |

### 1.2 ProjectActivity (`POST /project/projectActivity`)

| Field | Set? | Current value | Notes |
|-------|:-:|---|---|
| `activity.name` | YES | "Prosjektarbeid" | |
| `activity.activityType` | YES | PROJECT_SPECIFIC_ACTIVITY | |
| `activity.isChargeable` | YES | true | |
| `activity.number` | NO | — | Could set explicit number |
| `activity.description` | NO | — | |
| `activity.rate` | NO | — | **Default hourly rate on activity itself** |
| `activity.costPercentage` | NO | — | |
| `project` | YES | created project | |
| `startDate` | YES | project start date | |
| `endDate` | NO | — | |
| `isClosed` | NO | false (default) | |
| `budgetHours` | YES | TOTAL_HOURS | |
| `budgetHourlyRateCurrency` | NO | — | **MISSED: budget hourly rate on activity** |
| `budgetFeeCurrency` | YES | BUDGET | |

### 1.3 ProjectParticipant (`POST /project/participant/list`)

| Field | Set? | Notes |
|-------|:-:|---|
| `project` | YES | |
| `employee` | YES | Both employees |
| `adminAccess` | YES | true for PM, false for consultant |

Schema is minimal — only 3 writable fields.

### 1.4 ProjectHourlyRate (`PUT /project/hourlyRates/{id}`)

| Field | Set? | Current value | Notes |
|-------|:-:|---|---|
| `project` | YES (implicit) | | |
| `startDate` | NO | — | **Could matter: effective date for rates** |
| `showInProjectOrder` | NO | — | Show on contract/offers |
| `hourlyRateModel` | YES | TYPE_PROJECT_SPECIFIC_HOURLY_RATES | |
| `projectSpecificRates` | YES (via separate POST) | per-employee+activity rates | |
| `fixedRate` | NO | — | Only for TYPE_FIXED_HOURLY_RATE |

### 1.5 ProjectSpecificRate (`POST /project/hourlyRates/projectSpecificRates`)

| Field | Set? | Current value | Notes |
|-------|:-:|---|---|
| `projectHourlyRate` | YES | holder ref | |
| `employee` | YES | each employee | |
| `activity` | YES | project activity | |
| `hourlyRate` | YES | Math.round(BUDGET/TOTAL_HOURS) | |
| `hourlyCostPercentage` | NO | — | **Cost percentage for profitability** |

### 1.6 ProjectOrderLine (`POST /project/orderline`)

| Field | Set? | Current value | Notes |
|-------|:-:|---|---|
| `project` | YES | | |
| `description` | YES | | |
| `date` | YES | | |
| `count` | YES | 1 | |
| `unitCostCurrency` | YES | SUPP_COST | Purchase cost |
| `unitPriceExcludingVatCurrency` | NO | — | **Selling price — could matter** |
| `isChargeable` | YES | false | |
| `product` | NO | — | |
| `currency` | NO | — | |
| `markup` | NO | — | |
| `discount` | NO | — | |
| `vatType` | NO | — | |
| `vendor` | NO | API doesn't persist | **Known limitation** |
| `invoice` | NO | — | Links orderline to invoice |
| `voucher` | NO | — | Links orderline to voucher |

### 1.7 TimesheetEntry (`POST /timesheet/entry/list`)

| Field | Set? | Current value | Notes |
|-------|:-:|---|---|
| `project` | YES | created project | |
| `activity` | YES | project activity | |
| `date` | YES | consecutive dates (7.5h chunks) | |
| `hours` | YES | up to 7.5/day | |
| `employee` | YES | both employees | |
| `comment` | NO | — | |
| `projectChargeableHours` | NO | — | **Writable field for chargeable hours on activity** |

Read-only fields the scorer could verify via GET:
- `chargeableHours` — should equal `hours` when activity is chargeable
- `hourlyRate` — inherited from project rate config
- `hourlyCost` — derived from cost percentage
- `hourlyCostPercentage` — from project specific rate
- `chargeable` — boolean, from activity
- `invoice` — set after hours are invoiced

### 1.8 Order (`POST /order`)

| Field | Set? | Current value | Notes |
|-------|:-:|---|---|
| `customer` | YES | | |
| `project` | YES | **on order root** | |
| `orderDate` | YES | | |
| `deliveryDate` | YES | | |
| `orderLines` | YES | 1 line: description, count=1, unitPrice=BUDGET, vatType | |
| `contact` | NO | — | |
| `attn` | NO | — | |
| `receiverEmail` | NO | — | |
| `ourContact` | NO | — | |
| `ourContactEmployee` | NO | — | |
| `department` | NO | — | |
| `invoiceComment` | NO | — | **Propagates to Invoice.invoiceComment** |
| `currency` | NO | — | |
| `invoicesDueIn` | NO | — | Payment terms |
| `invoicesDueInType` | NO | — | |
| `status` | NO | — | Auto-set to INVOICED after :invoice |
| `isShowOpenPostsOnInvoices` | boolean | NO | |
| `deliveryAddress` | NO | — | |
| `deliveryComment` | NO | — | |
| `isPrioritizeAmountsIncludingVat` | NO | — | |
| `orderLineSorting` | NO | — | |
| `markUpOrderLines` | NO | — | |
| `discountPercentage` | NO | — | |
| `invoiceOnAccountVatHigh` | NO | — | |

### 1.9 Invoice (created via `PUT /order/:invoice` or `POST /invoice`)

Mostly read-only after creation. Key scorer-visible fields:

| Field | ReadOnly | Notes |
|-------|:--------:|-------|
| `invoiceNumber` | auto | |
| `invoiceDate` | writable | Set via :invoice param |
| `customer` | | From order |
| `invoiceDueDate` | | Auto from order/project settings |
| `orders` | | Array of order refs |
| `orderLines` | YES | From order's orderLines |
| `projectInvoiceDetails` | YES | **Only populated via POST /invoice with embedded orders** |
| `amount` / `amountCurrency` | YES | Total amount |
| `amountExcludingVat` / `amountExcludingVatCurrency` | YES | Ex-VAT amount |
| `isApproved` | YES | true via :invoice, false via POST |
| `comment` | writable | |
| `invoiceComment` | YES | From Order.invoiceComment |
| `invoiceRemarks` | DEPRECATED | Use invoiceRemark instead |
| `invoiceRemark` | writable | InvoiceRemark ref |
| `ehfSendStatus` | DEPRECATED | |
| `voucher` | | Auto-generated posting |
| `currency` | | |
| `paymentTypeId` | [BETA] | Prepaid invoices |
| `paidAmount` | [BETA] | |

### 1.10 Voucher / Supplier Invoice

**Voucher (`POST /ledger/voucher`):**

| Field | Set? | Notes |
|-------|:-:|---|
| `date` | YES | |
| `description` | YES | |
| `voucherType` | YES | Leverandørfaktura |
| `postings` | YES | DR 6590 (expense+project), CR 2400 (supplier liability+supplier) |
| `vendorInvoiceNumber` | NO | — |
| `externalVoucherNumber` | NO | — |

**SupplierInvoice** (created via importDocument, not by voucher POST):

| Field | Notes |
|-------|-------|
| `invoiceNumber` | From EHF XML |
| `invoiceDate` | From EHF XML |
| `supplier` | From EHF XML |
| `invoiceDueDate` | From EHF XML |
| `kidOrReceiverReference` | From EHF XML |
| `voucher` | Auto-linked |
| `amountCurrency` | From EHF XML |
| `currency` | From EHF XML |

**SupplierInvoice has NO direct `project` field.** Project linkage is ONLY through:
1. `voucher.postings[].project` — posting-level dimension
2. `approvalListElements[].project` — approval chain
3. `/supplierInvoice/:changeDimension` — can set PROJECT on debit postings

### 1.11 Employee (`POST /employee/list`)

| Field | Set? | Notes |
|-------|:-:|---|
| `firstName` | YES | |
| `lastName` | YES | |
| `email` | YES | |
| `dateOfBirth` | YES | placeholder 1988-01-01 |
| `userType` | YES | NO_ACCESS |
| `department` | YES | first department |
| `employments` | NO | Intentionally omitted (422 traps) |
| `allowInformationRegistration` | read-only | Controls project participation eligibility |

**Employee HourlyCostAndRate** (`/employee/hourlyCostAndRate`):
- `rate` — hourly billing rate
- `budgetRate` — budget rate
- `hourCostRate` — hourly cost rate
- NOT set by strategy; rates are set at project level instead

---

## 2. Fields the Current Strategy IGNORES That Could Matter

### HIGH priority (likely scorer-relevant)

| # | Entity | Field | Why it could matter |
|---|--------|-------|---------------------|
| 1 | ProjectActivity | `budgetHourlyRateCurrency` | Budget rate on the activity itself — scorer may verify this alongside budgetHours and budgetFeeCurrency. Currently 0/null. |
| 2 | Project | `isReadyForInvoicing` | Lifecycle signal. May need to be `true` before invoice check passes. |
| 3 | Project | `endDate` | Lifecycle completeness — a project with only startDate may look "incomplete" to scorer. |
| 4 | ProjectSpecificRate | `hourlyCostPercentage` | Cost tracking. If scorer checks profitability/cost, this matters. |
| 5 | ProjectHourlyRate | `startDate` | Effective date for rates. If null, rates might not apply to timesheet entries. |
| 6 | Activity | `rate` | The activity's own hourly rate (separate from ProjectSpecificRate). Could be the fallback checked. |
| 7 | Order | `invoiceComment` | Propagates to Invoice.invoiceComment — scorer might verify this. |
| 8 | Project | `projectCategory` | Classification. Scorer might require a category for "complete" project. |

### MEDIUM priority (plausible scorer checks)

| # | Entity | Field | Why |
|---|--------|-------|-----|
| 9 | Project | `invoiceComment` | Default comment for project invoices — different from Order.invoiceComment |
| 10 | Project | `invoiceDueDate` + `invoiceDueDateType` | Payment terms on project level |
| 11 | Project | `vatType` | Could affect invoice VAT handling |
| 12 | Project | `forParticipantsOnly` | If true, only participants can register — might be expected for proper project |
| 13 | ProjectOrderLine | `unitPriceExcludingVatCurrency` | Selling price for cost line — currently only cost is set |
| 14 | TimesheetEntry | `comment` | Some setups require comments on hours |
| 15 | Voucher | `vendorInvoiceNumber` | Could be checked for supplier invoice completeness |

### LOW priority (unlikely but possible)

| # | Entity | Field | Why |
|---|--------|-------|-----|
| 16 | Project | `description` | Metadata completeness |
| 17 | Project | `currency` | Explicit NOK vs default |
| 18 | Project | `department` | Dimensional data |
| 19 | Project | `contact` / `attention` | Customer contact refs |
| 20 | Employee | `employments` | Could affect hourly cost calculations |
| 21 | ProjectActivity | `endDate` | Activity period |

---

## 3. Ranked Hypotheses for Checks 3, 4, 5, 7

### Check 3 (FAIL) — Project Configuration

**H3.1 (HIGH)**: Scorer verifies `projectManager` is the prompt-named PM employee.
- Evidence: Only account owner can be PM; prompt PM is participant only.
- Status: **Structural blocker** — no known workaround.

**H3.2 (MEDIUM)**: Scorer verifies `budgetHourlyRateCurrency` on the activity.
- Evidence: Strategy sets `budgetHours` and `budgetFeeCurrency` but NOT `budgetHourlyRateCurrency`.
- Fix: Set `budgetHourlyRateCurrency: Math.round(BUDGET / TOTAL_HOURS)` on activity POST.

**H3.3 (MEDIUM)**: Scorer checks `projectCategory` exists on project.
- Evidence: ProjectCategory is a separate entity with name/number. "Complete" projects often have a category.
- Fix: `POST /project/category` then set `projectCategory: { id }` on project.

**H3.4 (LOW)**: Scorer checks `endDate` and `isReadyForInvoicing`.
- Fix: Set `endDate` to a future date and `isReadyForInvoicing: true` after timesheet entries.

### Check 4 (FAIL) — Timesheet / Hourly Rates

**H4.1 (HIGH)**: `ProjectHourlyRate.startDate` is null, so rates don't apply to timesheet entries.
- Evidence: Strategy does PUT to switch model but doesn't set `startDate`.
- Fix: Set `startDate: projectStartDate` on the hourly rate holder.
- Verification: GET `/timesheet/entry` and check that `hourlyRate` is non-zero.

**H4.2 (MEDIUM)**: Scorer checks `hourlyCostPercentage` on ProjectSpecificRate.
- Evidence: Cost tracking is part of "budget, hours, cost" in the task name.
- Fix: Set `hourlyCostPercentage: 100` (or appropriate value) on each specific rate.

**H4.3 (MEDIUM)**: `Activity.rate` (the activity-level rate) must be set for rate inheritance.
- Evidence: Timesheet entries inherit rates; if the specific-rate path fails, the activity rate is fallback.
- Fix: Set `rate: hourlyRate` on the activity entity.

**H4.4 (LOW)**: Scorer checks that chargeable hours equals registered hours.
- The `projectChargeableHours` writable field on timesheet entries might need explicit setting.

### Check 5 (FAIL) — Supplier Invoice Entity

**H5.1 (HIGH)**: `POST /ledger/voucher` does NOT create a `supplierInvoice` entity.
- Evidence: Confirmed — `GET /supplierInvoice` returns 0 after voucher creation.
- Current mitigation: importDocument step (failure-tolerant). If it fails, no SI entity exists.
- Fix: Make importDocument NON-optional. Ensure EHF XML is valid. Verify `GET /supplierInvoice?count=1` returns 1.

**H5.2 (HIGH)**: Supplier invoice postings must have `project` dimension.
- Evidence: SI has no direct project field; linkage is via `voucher.postings[].project`.
- Fix: After importDocument, PUT postings with explicit `project: { id }` on debit row.

**H5.3 (MEDIUM)**: Scorer checks supplier invoice via `/supplierInvoice/:changeDimension`.
- The changeDimension action explicitly sets PROJECT on debit postings.
- Fix: Call `PUT /supplierInvoice/{id}/:changeDimension` with project dimension after import.

**H5.4 (LOW)**: Scorer verifies `vendorInvoiceNumber` on voucher matches something.
- Fix: Set `vendorInvoiceNumber` on the voucher to match EHF XML invoice ID.

### Check 7 (FAIL) — Unknown / Composite

**H7.1 (HIGH)**: Scorer checks `projectInvoiceDetails` on the invoice.
- Evidence: `projectInvoiceDetails` is only populated via `POST /invoice` with embedded orders, NOT via `PUT /order/:invoice`.
- The override already recommends `POST /invoice` with embedded orders.
- Fix: Ensure using `POST /invoice` path. Verify `GET /invoice/{id}?fields=*,projectInvoiceDetails(*)` is populated.

**H7.2 (MEDIUM)**: Scorer checks project period / budget status reports.
- Endpoints: `GET /project/{id}/period/budgetStatus`, `overallStatus`, `hourlistReport`.
- These are read-only reporting endpoints that aggregate all lifecycle data.
- If budget data is incomplete (missing budgetHourlyRateCurrency, missing hourly rates), these reports may show zeros.
- Fix: Ensure all budget fields are set. Verify via `GET /project/{id}/period/budgetStatus`.

**H7.3 (MEDIUM)**: Scorer checks that invoice `feeAmount` (in projectInvoiceDetails) matches budget.
- projectInvoiceDetails.feeAmount should reflect hours × rate.
- If hourly rates aren't correctly applied, feeAmount may be 0.

**H7.4 (LOW)**: Scorer checks `isReadyForInvoicing` was set before invoice creation.
- A complete lifecycle means: create → budget → hours → mark ready → invoice.

---

## 4. Concrete Suggestions (Ranked by Expected Impact)

### Tier 1 — Most likely to unlock points

1. **Set `budgetHourlyRateCurrency` on ProjectActivity POST**
   ```json
   { "budgetHourlyRateCurrency": Math.round(BUDGET / TOTAL_HOURS) }
   ```
   Cost: zero API calls (just add field to existing POST).

2. **Set `startDate` on ProjectHourlyRate**
   ```json
   PUT /project/hourlyRates/{id}: { "startDate": projectStartDate, "hourlyRateModel": "TYPE_PROJECT_SPECIFIC_HOURLY_RATES" }
   ```
   Cost: zero API calls (add field to existing PUT).

3. **Use `POST /invoice` with embedded orders (not PUT /order/:invoice)**
   Already in override — ensures `projectInvoiceDetails` is populated.
   ```json
   POST /invoice: { "invoiceDate": TODAY, "orders": [{ "id": orderId }] }
   ```

4. **Make importDocument non-optional; verify SI entity exists**
   After import, call `GET /supplierInvoice?supplierId={suppId}&count=1` to confirm.
   If SI exists, call `PUT /supplierInvoice/{siId}/:changeDimension` to ensure project linkage.

### Tier 2 — Plausible impact

5. **Set `hourlyCostPercentage` on ProjectSpecificRate**
   ```json
   { "hourlyCostPercentage": 100, "hourlyRate": rate, ... }
   ```

6. **Set `endDate` and `isReadyForInvoicing` on Project**
   ```json
   PUT /project/{id}: { "endDate": "2026-12-31", "isReadyForInvoicing": true }
   ```
   (Do this AFTER timesheet entries, BEFORE invoice creation.)

7. **Create a ProjectCategory and set it on the project**
   ```json
   POST /project/category: { "name": "Consulting", "number": "1" }
   PUT /project/{id}: { "projectCategory": { "id": catId } }
   ```

8. **Set `invoiceComment` on Order (propagates to Invoice)**
   ```json
   POST /order: { ..., "invoiceComment": "Project invoice - [project name]" }
   ```

### Tier 3 — Low probability but easy to add

9. Set `Activity.rate` to `hourlyRate` value on the activity entity
10. Set `project.description` to something meaningful
11. Set `project.invoiceDueDate: 30` + `project.invoiceDueDateType: "DAYS"`
12. Set `vendorInvoiceNumber` on voucher to match EHF XML
13. Set `project.forParticipantsOnly: true`

---

## Appendix: ProjectInvoiceDetails Deep Dive

This is the key read-only sub-schema on `Invoice.projectInvoiceDetails[]`:

```
project              → Project ref
feeAmount            → Fee in company currency (hours × rate)
feeAmountCurrency    → Fee in invoice currency
markupPercent        → Mark-up % on fee
markupAmount         → Mark-up amount
amountOrderLinesAndReinvoicing         → Chargeable order lines + vendor invoices
amountOrderLinesAndReinvoicingCurrency → Same in invoice currency
amountTravelReportsAndExpenses         → Travel costs
feeInvoiceText       → Fee comment
invoiceText          → Invoice comment
includeOrderLinesAndReinvoicing → boolean
includeHours         → boolean (are hours included?)
includeOnAccountBalance → boolean
onAccountBalanceAmount → A-konto amount
vatType              → VatType ref
invoice              → Back-reference
```

This is ONLY populated via `POST /invoice` with embedded orders. It is NOT populated via `PUT /order/:invoice`.

If the scorer checks `feeAmount > 0` or `includeHours == true`, the current strategy (which uses :invoice) would fail check 7 regardless of other changes.

## Appendix: ProjectSettings (Global)

`GET /project/settings` returns company-wide project configuration. Key fields that could affect scoring:

- `projectTypeOfContract`: PROJECT_FIXED_PRICE or PROJECT_HOUR_RATES — controls default
- `projectHourlyRateModel`: TYPE_PREDEFINED/SPECIFIC/FIXED — default rate model
- `mustApproveRegisteredHours`: if true, unapproved hours won't count
- `approveHourLists` / `approveInvoices`: approval workflow settings
- `markReadyForInvoicing`: whether ready-for-invoicing step is required
- `fixedPriceProjectsFeeCalcMethod`: invoice vs percent-completed
- `standardReinvoicing`: affects supplier cost reinvoicing

These are GET-only for the strategy (can't be changed per-project), but worth reading to understand the environment's defaults.
