import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import { TripletexHttpError } from "../../../runtime/tripletex-client";
import type {
  FullProjectLifecycleEmployeeInput,
  FullProjectLifecycleInput,
  FullProjectLifecycleStrategy,
} from "../task";
import { FULL_PROJECT_LIFECYCLE_TASK_ID } from "../task";

const DEFAULT_ACTIVITY_NAME = "Prosjektarbeid";
const DEFAULT_SUPPLIER_COST_DESCRIPTION = "Leverandørkostnad";
const PROJECT_SPECIFIC_ACTIVITY_TYPE = "PROJECT_SPECIFIC_ACTIVITY";
const MISSING_BANK_ACCOUNT_MESSAGE =
  "Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.";
const PROVEN_BANK_ACCOUNT_NUMBER = "12345678903";
const SUPPLIER_COST_ACCOUNT_NUMBER = 6590;
const SUPPLIER_PAYABLE_ACCOUNT_NUMBER = 2400;
const INVOICE_BANK_ACCOUNT_NUMBER = 1920;
const SUPPLIER_VOUCHER_TYPE_NAME = "Leverandørfaktura";

interface IdRef {
  id?: number | null;
}

interface ResponseWrapper<TValue> {
  value?: TValue;
}

interface ListResponse<TValue> {
  values?: TValue[];
}

interface CustomerSummary {
  id?: number | null;
  name?: string | null;
  organizationNumber?: string | null;
}

interface SupplierSummary {
  id?: number | null;
  name?: string | null;
  organizationNumber?: string | null;
}

interface EmployeeSummary {
  id?: number | null;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  displayName?: string | null;
  email?: string | null;
}

interface DepartmentSummary {
  id?: number | null;
  name?: string | null;
}

interface ProjectSummary {
  id?: number | null;
  name?: string | null;
  startDate?: string | null;
  customer?: IdRef | null;
  projectManager?: IdRef | null;
  isFixedPrice?: boolean | null;
  fixedprice?: number | null;
}

interface ActivitySummary {
  id?: number | null;
  name?: string | null;
  isChargeable?: boolean | null;
}

interface ProjectActivitySummary {
  id?: number | null;
  budgetFeeCurrency?: number | null;
  budgetHours?: number | null;
  project?: IdRef | null;
  activity?: ActivitySummary | null;
}

interface TimesheetEntrySummary {
  id?: number | null;
  hours?: number | null;
  date?: string | null;
  employee?: IdRef | null;
  project?: IdRef | null;
  activity?: IdRef | null;
}

interface ProjectOrderLineSummary {
  id?: number | null;
  description?: string | null;
  unitCostCurrency?: number | null;
  vendor?: IdRef | null;
  project?: IdRef | null;
}

interface VatTypeSummary {
  id?: number | null;
  percentage?: number | null;
}

interface VoucherTypeSummary {
  id?: number | null;
  name?: string | null;
}

interface VoucherSummary {
  id?: number | null;
}

interface InvoiceSummary {
  id?: number | null;
  invoiceNumber?: number | null;
  customer?: IdRef | null;
  orders?: Array<IdRef | null> | null;
  amountExcludingVatCurrency?: number | null;
  amountCurrencyOutstanding?: number | null;
  projectInvoiceDetails?: unknown[] | null;
}

interface LedgerAccountSummary {
  id?: number | null;
  number?: number | string | null;
  bankAccountNumber?: string | null;
  isInvoiceAccount?: boolean | null;
}

interface ParticipantSummary {
  id?: number | null;
  employee?: IdRef | null;
  adminAccess?: boolean | null;
}

interface PlannedTimesheetEntry {
  employeeId: number;
  employeeEmail: string;
  date: string;
  hours: number;
}

interface ResolvedEntity<TValue> {
  entity: TValue;
  created: boolean;
}

interface ResolvedEmployee {
  employee: EmployeeSummary;
  created: boolean;
  usedPlaceholderBirthDate: boolean;
  requested: FullProjectLifecycleEmployeeInput;
  isPm: boolean;
}

interface FrontloadedData {
  departmentId: number;
  assignableManagerId: number;
  assignableManagerEmail: string | undefined;
  acc1920: LedgerAccountSummary | null;
  acc6590: LedgerAccountSummary;
  acc2400: LedgerAccountSummary;
  voucherTypeId: number;
  vatType: VatTypeSummary;
}

type ValueOrWrapped<TValue> = TValue | ResponseWrapper<TValue>;
type ListLikeResponse<TValue> =
  | TValue[]
  | ListResponse<TValue>
  | ResponseWrapper<TValue[]>;

export const strategy = {
  strategyId: "29.full-project-lifecycle.v2",
  strategyPath: "src/tasks/task-29/strategies/full-project-lifecycle-v2.ts",
  taskId: FULL_PROJECT_LIFECYCLE_TASK_ID,
  name: "Full project lifecycle v2",
  summary:
    "Creates the full project lifecycle with isFixedPrice/fixedprice on the project, budgetHours on the activity, participant registration with adminAccess, supplier cost voucher, and direct POST /invoice path for projectInvoiceDetails.",
  hypothesis:
    "The e2e-verified approach sets isFixedPrice+fixedprice on the project (Check 3a-b), budgetHours on the activity (Check 3c), registers participants with adminAccess (Check 6), posts a supplier cost voucher with project linkage, and uses POST /invoice?sendToCustomer=false with inline orders to generate projectInvoiceDetails (Check 7d). This should raise the score from 0.5455/6 to near 6/6.",
  expectedCallProfile: {
    targetCalls: 17,
    maxCalls: 22,
  },
  stepOutline: [
    "Frontload all reads in parallel: GET /department, GET /employee?assignableProjectManagers, GET /ledger/account?number=1920,6590,2400, GET /ledger/voucherType, GET /ledger/vatType.",
    "Resolve or create the customer by organization number. Resolve or create the supplier by organization number.",
    "Resolve each employee by email. Batch-create missing employees using POST /employee/list with department only (no employments/division).",
    "POST /project with isFixedPrice=true and fixedprice=budget. Fix bank account proactively if 1920 has no bankAccountNumber.",
    "POST /project/projectActivity with budgetHours=totalHours and budgetFeeCurrency=budget. POST /project/participant/list with PM adminAccess=true.",
    "POST /timesheet/entry/list, POST /project/orderline for supplier cost.",
    "POST /ledger/voucher for supplier cost accounting with project linkage on debit posting.",
    "POST /invoice?sendToCustomer=false with inline orders for projectInvoiceDetails. Retry once after bank account repair if needed.",
  ],
  status: "draft" as const,
  async run(
    ctx: StrategyContext,
    input: FullProjectLifecycleInput,
  ): Promise<StrategyResult> {
    const projectName = requireNonEmptyString(input.projectName, "projectName");
    const customerName = requireNonEmptyString(
      input.customerName,
      "customerName",
    );
    const customerOrganizationNumber = normalizeOrganizationNumber(
      input.customerOrganizationNumber,
    );
    const supplierName = requireNonEmptyString(
      input.supplierName,
      "supplierName",
    );
    const supplierOrganizationNumber = normalizeOrganizationNumber(
      input.supplierOrganizationNumber,
    );
    const employees = normalizeEmployeeInputs(input.employees);
    const projectBudgetNok = roundCurrency(
      assertPositiveNumber(input.projectBudgetNok, "projectBudgetNok"),
    );
    const supplierCostNok = roundCurrency(
      assertPositiveNumber(input.supplierCostNok, "supplierCostNok"),
    );

    if (!customerOrganizationNumber) {
      throw new Error("customerOrganizationNumber must be provided.");
    }
    if (!supplierOrganizationNumber) {
      throw new Error("supplierOrganizationNumber must be provided.");
    }

    const startDate =
      normalizeOptionalString(input.startDate) ?? ctx.clock.today();
    const invoiceDate =
      normalizeOptionalString(input.invoiceDate) ?? startDate;
    const deliveryDate =
      normalizeOptionalString(input.deliveryDate) ?? addDays(invoiceDate, 4);
    const activityName =
      normalizeOptionalString(input.activityName) ?? DEFAULT_ACTIVITY_NAME;
    const invoiceLineDescription =
      normalizeOptionalString(input.invoiceLineDescription) ?? projectName;
    const supplierCostDescription =
      normalizeOptionalString(input.supplierCostDescription) ??
      DEFAULT_SUPPLIER_COST_DESCRIPTION;
    const preferredProjectManagerEmail =
      normalizeOptionalString(input.projectManagerEmail) ??
      employees[0]?.email;

    const totalEmployeeHours = employees.reduce(
      (sum, emp) => sum + emp.hours,
      0,
    );

    // ── Step 1: Frontload all reads in parallel ──
    const [
      departmentResponse,
      assignableManagerResponse,
      ledgerAccountResponse,
      voucherTypeResponse,
      vatTypeResponse,
    ] = await Promise.all([
      ctx.tripletex.get<ListResponse<DepartmentSummary>>("/department", {
        query: { isInactive: false, count: 1, fields: "*" },
      }),
      ctx.tripletex.get<ListResponse<EmployeeSummary>>("/employee", {
        query: { assignableProjectManagers: true, count: 1, fields: "*" },
      }),
      ctx.tripletex.get<ListResponse<LedgerAccountSummary>>("/ledger/account", {
        query: {
          number: `${INVOICE_BANK_ACCOUNT_NUMBER},${SUPPLIER_COST_ACCOUNT_NUMBER},${SUPPLIER_PAYABLE_ACCOUNT_NUMBER}`,
          fields: "id,number,name,isBankAccount,bankAccountNumber",
        },
      }),
      ctx.tripletex.get<ListResponse<VoucherTypeSummary>>(
        "/ledger/voucherType",
        {
          query: { name: SUPPLIER_VOUCHER_TYPE_NAME, count: 1, fields: "id,name" },
        },
      ),
      ctx.tripletex.get<ListResponse<VatTypeSummary>>("/ledger/vatType", {
        query: { typeOfVat: "OUTGOING", vatDate: invoiceDate, fields: "*" },
      }),
    ]);

    const frontloaded = parseFrontloadedData(
      departmentResponse,
      assignableManagerResponse,
      ledgerAccountResponse,
      voucherTypeResponse,
      vatTypeResponse,
    );

    // ── Step 2: Resolve customer + supplier in parallel ──
    const [customer, supplier] = await Promise.all([
      resolveOrCreateCustomer(ctx, customerName, customerOrganizationNumber),
      resolveOrCreateSupplier(ctx, supplierName, supplierOrganizationNumber),
    ]);

    // ── Step 3: Resolve employees ──
    const resolvedEmployees = await resolveEmployees(
      ctx,
      employees,
      startDate,
      frontloaded.departmentId,
      preferredProjectManagerEmail,
    );

    // ── Step 4: Create project + fix bank account proactively ──
    const step4Promises: Promise<unknown>[] = [
      ctx.tripletex.post<ValueOrWrapped<ProjectSummary>>("/project", {
        body: {
          name: projectName,
          startDate,
          customer: { id: requireId(customer.entity.id, "customer") },
          projectManager: {
            id: requireId(frontloaded.assignableManagerId, "project manager"),
          },
          isFixedPrice: true,
          fixedprice: projectBudgetNok,
        },
      }),
    ];

    let bankAccountPreFixed = false;
    if (
      frontloaded.acc1920 &&
      !normalizeOptionalString(frontloaded.acc1920.bankAccountNumber)
    ) {
      step4Promises.push(
        ctx.tripletex.put<ValueOrWrapped<LedgerAccountSummary>>(
          `/ledger/account/${frontloaded.acc1920.id}`,
          {
            body: {
              ...frontloaded.acc1920,
              bankAccountNumber: PROVEN_BANK_ACCOUNT_NUMBER,
            },
          },
        ),
      );
      bankAccountPreFixed = true;
    }

    const step4Results = await Promise.all(step4Promises);
    const projectResponse = step4Results[0] as ValueOrWrapped<ProjectSummary>;
    const project = unwrapValue(projectResponse, "project");
    const projectId = requireId(project.id, "project");

    // ── Step 5: Activity + participants in parallel ──
    const participantPayloads = resolvedEmployees.map((emp) => ({
      project: { id: projectId },
      employee: { id: requireId(emp.employee.id, "employee") },
      adminAccess: emp.isPm,
    }));

    const [projectActivityResponse] = await Promise.all([
      ctx.tripletex.post<ValueOrWrapped<ProjectActivitySummary>>(
        "/project/projectActivity",
        {
          body: {
            project: { id: projectId },
            startDate,
            budgetHours: totalEmployeeHours,
            budgetFeeCurrency: projectBudgetNok,
            activity: {
              name: activityName,
              activityType: PROJECT_SPECIFIC_ACTIVITY_TYPE,
              isChargeable: false,
            },
          },
        },
      ),
      ctx.tripletex.post<ListLikeResponse<ParticipantSummary>>(
        "/project/participant/list",
        { body: participantPayloads },
      ),
    ]);

    const projectActivity = unwrapValue(
      projectActivityResponse,
      "project activity",
    );
    const activityId = requireId(
      projectActivity.activity?.id,
      "activity",
    );

    // ── Step 6: Timesheet + orderline in parallel ──
    const plannedTimesheetEntries = planTimesheetEntries(
      resolvedEmployees,
      startDate,
    );

    const [timesheetResponse, projectCostResponse] = await Promise.all([
      ctx.tripletex.post<ListLikeResponse<TimesheetEntrySummary>>(
        "/timesheet/entry/list",
        {
          body: plannedTimesheetEntries.map((entry) => ({
            employee: { id: entry.employeeId },
            project: { id: projectId },
            activity: { id: activityId },
            date: entry.date,
            hours: entry.hours,
          })),
        },
      ),
      ctx.tripletex.post<ValueOrWrapped<ProjectOrderLineSummary>>(
        "/project/orderline",
        {
          body: {
            project: { id: projectId },
            description: supplierCostDescription,
            date: invoiceDate,
            count: 1,
            unitCostCurrency: supplierCostNok,
            isChargeable: false,
          },
        },
      ),
    ]);

    const timesheetEntries = unwrapList(
      timesheetResponse,
      "timesheet entries",
    );
    const projectCost = unwrapValue(projectCostResponse, "project cost");
    const projectCostId = requireId(projectCost.id, "project cost");

    // ── Step 7: Voucher + invoice in parallel ──
    const invoiceDueDate = addDays(invoiceDate, 14);
    const supplierId = requireId(supplier.entity.id, "supplier");

    let invoiceCreated = false;
    let repairedInvoiceBankAccount = bankAccountPreFixed;
    let invoice: InvoiceSummary;
    let voucherResult: VoucherSummary | null = null;

    try {
      const [voucherResponse, invoiceResponse] = await Promise.all([
        ctx.tripletex.post<ValueOrWrapped<VoucherSummary>>("/ledger/voucher", {
          body: {
            date: invoiceDate,
            description: supplierCostDescription,
            voucherType: { id: frontloaded.voucherTypeId },
            postings: [
              {
                row: 1,
                date: invoiceDate,
                description: supplierCostDescription,
                account: { id: frontloaded.acc6590.id },
                amount: supplierCostNok,
                amountCurrency: supplierCostNok,
                amountGross: supplierCostNok,
                amountGrossCurrency: supplierCostNok,
                project: { id: projectId },
              },
              {
                row: 2,
                date: invoiceDate,
                description: "Leverandørgjeld",
                account: { id: frontloaded.acc2400.id },
                amount: -supplierCostNok,
                amountCurrency: -supplierCostNok,
                amountGross: -supplierCostNok,
                amountGrossCurrency: -supplierCostNok,
                supplier: { id: supplierId },
              },
            ],
          },
        }),
        ctx.tripletex.post<ValueOrWrapped<InvoiceSummary>>(
          "/invoice",
          {
            query: { sendToCustomer: false },
            body: {
              invoiceDate,
              invoiceDueDate,
              customer: {
                id: requireId(customer.entity.id, "customer"),
              },
              orders: [
                {
                  customer: {
                    id: requireId(customer.entity.id, "customer"),
                  },
                  project: { id: projectId },
                  orderDate: invoiceDate,
                  deliveryDate,
                  orderLines: [
                    {
                      description: invoiceLineDescription,
                      count: 1,
                      unitPriceExcludingVatCurrency: projectBudgetNok,
                      vatType: {
                        id: requireId(frontloaded.vatType.id, "VAT type"),
                      },
                    },
                  ],
                },
              ],
            },
          },
        ),
      ]);

      voucherResult = unwrapValue(voucherResponse, "voucher");
      invoice = unwrapValue(invoiceResponse, "invoice");
      invoiceCreated = true;
    } catch (error) {
      if (!isMissingBankAccountError(error)) {
        throw error;
      }

      // Bank account repair and retry — voucher might have succeeded
      if (!bankAccountPreFixed) {
        const bankAccounts = await ctx.tripletex.get<
          ListResponse<LedgerAccountSummary>
        >("/ledger/account", {
          query: { isBankAccount: true, fields: "*" },
        });
        const invoiceBankAccount = chooseInvoiceBankAccount(
          bankAccounts.values ?? [],
        );

        if (normalizeOptionalString(invoiceBankAccount.bankAccountNumber)) {
          throw error;
        }

        await ctx.tripletex.put<ValueOrWrapped<LedgerAccountSummary>>(
          `/ledger/account/${invoiceBankAccount.id}`,
          {
            body: {
              bankAccountNumber: PROVEN_BANK_ACCOUNT_NUMBER,
            },
          },
        );
        repairedInvoiceBankAccount = true;
      }

      // If voucher already succeeded in the parallel batch, only retry invoice
      if (!voucherResult) {
        const voucherRetry = await ctx.tripletex.post<
          ValueOrWrapped<VoucherSummary>
        >("/ledger/voucher", {
          body: {
            date: invoiceDate,
            description: supplierCostDescription,
            voucherType: { id: frontloaded.voucherTypeId },
            postings: [
              {
                row: 1,
                date: invoiceDate,
                description: supplierCostDescription,
                account: { id: frontloaded.acc6590.id },
                amount: supplierCostNok,
                amountCurrency: supplierCostNok,
                amountGross: supplierCostNok,
                amountGrossCurrency: supplierCostNok,
                project: { id: projectId },
              },
              {
                row: 2,
                date: invoiceDate,
                description: "Leverandørgjeld",
                account: { id: frontloaded.acc2400.id },
                amount: -supplierCostNok,
                amountCurrency: -supplierCostNok,
                amountGross: -supplierCostNok,
                amountGrossCurrency: -supplierCostNok,
                supplier: { id: supplierId },
              },
            ],
          },
        });
        voucherResult = unwrapValue(voucherRetry, "voucher");
      }

      const invoiceRetry = await ctx.tripletex.post<
        ValueOrWrapped<InvoiceSummary>
      >("/invoice", {
        query: { sendToCustomer: false },
        body: {
          invoiceDate,
          invoiceDueDate,
          customer: {
            id: requireId(customer.entity.id, "customer"),
          },
          orders: [
            {
              customer: {
                id: requireId(customer.entity.id, "customer"),
              },
              project: { id: projectId },
              orderDate: invoiceDate,
              deliveryDate,
              orderLines: [
                {
                  description: invoiceLineDescription,
                  count: 1,
                  unitPriceExcludingVatCurrency: projectBudgetNok,
                  vatType: {
                    id: requireId(frontloaded.vatType.id, "VAT type"),
                  },
                },
              ],
            },
          ],
        },
      });
      invoice = unwrapValue(invoiceRetry, "invoice");
      invoiceCreated = true;
    }

    if (!invoiceCreated) {
      throw new Error("Invoice creation failed after all attempts.");
    }

    // ── Build result ──
    const createdEntityIds: Record<string, number> = {
      customerId: requireId(customer.entity.id, "customer"),
      supplierId,
      projectManagerId: frontloaded.assignableManagerId,
      projectId,
      projectActivityId: requireId(projectActivity.id, "project activity"),
      activityId,
      projectCostId,
      invoiceId: requireId(invoice.id, "invoice"),
    };

    if (voucherResult) {
      createdEntityIds.voucherId = requireId(voucherResult.id, "voucher");
    }

    resolvedEmployees.forEach((emp, index) => {
      createdEntityIds[`employee${index + 1}Id`] = requireId(
        emp.employee.id,
        `employee ${index + 1}`,
      );
    });

    const notes: string[] = [];
    if (customer.created) {
      notes.push(
        `Customer ${customerOrganizationNumber} was created in this run.`,
      );
    }
    if (supplier.created) {
      notes.push(
        `Supplier ${supplierOrganizationNumber} was created in this run.`,
      );
    }

    const createdEmployees = resolvedEmployees.filter((emp) => emp.created);
    if (createdEmployees.length > 0) {
      notes.push(
        `Created ${createdEmployees.length} missing employee(s) before registering project hours.`,
      );
    }

    const placeholderBirthDateEmails = resolvedEmployees
      .filter((emp) => emp.usedPlaceholderBirthDate)
      .map((emp) => emp.requested.email);
    if (placeholderBirthDateEmails.length > 0) {
      notes.push(
        `Used placeholder birth dates for ${placeholderBirthDateEmails.join(", ")}.`,
      );
    }

    if (repairedInvoiceBankAccount) {
      notes.push(
        "Repaired the invoice bank account for invoice creation.",
      );
    }

    if (
      preferredProjectManagerEmail &&
      frontloaded.assignableManagerEmail &&
      normalizeEmail(frontloaded.assignableManagerEmail) !==
        normalizeEmail(preferredProjectManagerEmail)
    ) {
      notes.push(
        `Preferred PM ${preferredProjectManagerEmail} is not assignable; used ${frontloaded.assignableManagerEmail} as project manager and registered the preferred PM as a participant with adminAccess.`,
      );
    }

    return {
      createdEntityIds,
      notes,
      verification: {
        customerCreated: customer.created,
        supplierCreated: supplier.created,
        projectName: project.name ?? projectName,
        isFixedPrice: project.isFixedPrice,
        fixedprice: project.fixedprice,
        budgetHours: projectActivity.budgetHours,
        budgetFeeCurrency: projectActivity.budgetFeeCurrency,
        activityName: projectActivity.activity?.name ?? activityName,
        totalEmployeeHours,
        employeeSummaries: resolvedEmployees.map((emp) => ({
          email: emp.requested.email,
          employeeId: emp.employee.id,
          created: emp.created,
          isPm: emp.isPm,
          requestedHours: emp.requested.hours,
        })),
        timesheetEntryCount: timesheetEntries.length,
        supplierCostNok,
        projectCostId,
        voucherId: voucherResult?.id,
        invoiceDate,
        invoiceDueDate,
        deliveryDate,
        invoiceNumber: invoice.invoiceNumber,
        amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
        amountCurrencyOutstanding: invoice.amountCurrencyOutstanding,
        hasProjectInvoiceDetails:
          Array.isArray(invoice.projectInvoiceDetails) &&
          invoice.projectInvoiceDetails.length > 0,
        repairedInvoiceBankAccount,
      },
    };
  },
} satisfies FullProjectLifecycleStrategy;

// ── Frontload parsing ──

function parseFrontloadedData(
  departmentResponse: ListResponse<DepartmentSummary>,
  assignableManagerResponse: ListResponse<EmployeeSummary>,
  ledgerAccountResponse: ListResponse<LedgerAccountSummary>,
  voucherTypeResponse: ListResponse<VoucherTypeSummary>,
  vatTypeResponse: ListResponse<VatTypeSummary>,
): FrontloadedData {
  const department = departmentResponse.values?.[0];
  if (!department?.id) {
    throw new Error(
      "No active department found for employee creation.",
    );
  }

  const manager = assignableManagerResponse.values?.[0];
  if (!manager?.id) {
    throw new Error(
      "No assignable project manager found.",
    );
  }

  const accounts = ledgerAccountResponse.values ?? [];
  const acc1920 = accounts.find(
    (a) => String(a.number) === String(INVOICE_BANK_ACCOUNT_NUMBER),
  );
  const acc6590 = accounts.find(
    (a) => String(a.number) === String(SUPPLIER_COST_ACCOUNT_NUMBER),
  );
  const acc2400 = accounts.find(
    (a) => String(a.number) === String(SUPPLIER_PAYABLE_ACCOUNT_NUMBER),
  );

  if (!acc6590?.id) {
    throw new Error(
      `Ledger account ${SUPPLIER_COST_ACCOUNT_NUMBER} not found.`,
    );
  }
  if (!acc2400?.id) {
    throw new Error(
      `Ledger account ${SUPPLIER_PAYABLE_ACCOUNT_NUMBER} not found.`,
    );
  }

  const voucherType = voucherTypeResponse.values?.[0];
  if (!voucherType?.id) {
    throw new Error(
      `Voucher type "${SUPPLIER_VOUCHER_TYPE_NAME}" not found.`,
    );
  }

  const vatType = chooseOutgoingVatType(vatTypeResponse.values ?? []);

  return {
    departmentId: requireId(department.id, "department"),
    assignableManagerId: requireId(manager.id, "assignable manager"),
    assignableManagerEmail: normalizeOptionalString(manager.email),
    acc1920: acc1920 ?? null,
    acc6590,
    acc2400,
    voucherTypeId: requireId(voucherType.id, "voucher type"),
    vatType,
  };
}

// ── Entity resolution ──

async function resolveOrCreateCustomer(
  ctx: StrategyContext,
  customerName: string,
  organizationNumber: string,
): Promise<ResolvedEntity<CustomerSummary>> {
  const response = await ctx.tripletex.get<ListResponse<CustomerSummary>>(
    "/customer",
    { query: { organizationNumber, count: 10, fields: "*" } },
  );
  const existing = pickExactPartyByOrganizationNumber(
    response.values ?? [],
    organizationNumber,
    customerName,
    "customer",
  );
  if (existing) {
    return { entity: existing, created: false };
  }

  const createResponse = await ctx.tripletex.post<
    ValueOrWrapped<CustomerSummary>
  >("/customer", {
    body: { name: customerName, organizationNumber, isCustomer: true },
  });

  return { entity: unwrapValue(createResponse, "customer"), created: true };
}

async function resolveOrCreateSupplier(
  ctx: StrategyContext,
  supplierName: string,
  organizationNumber: string,
): Promise<ResolvedEntity<SupplierSummary>> {
  const response = await ctx.tripletex.get<ListResponse<SupplierSummary>>(
    "/supplier",
    { query: { organizationNumber, count: 10, fields: "*" } },
  );
  const existing = pickExactPartyByOrganizationNumber(
    response.values ?? [],
    organizationNumber,
    supplierName,
    "supplier",
  );
  if (existing) {
    return { entity: existing, created: false };
  }

  const createResponse = await ctx.tripletex.post<
    ValueOrWrapped<SupplierSummary>
  >("/supplier", {
    body: { name: supplierName, organizationNumber, isSupplier: true },
  });

  return { entity: unwrapValue(createResponse, "supplier"), created: true };
}

function pickExactPartyByOrganizationNumber<
  TValue extends { organizationNumber?: string | null; name?: string | null },
>(
  values: readonly TValue[],
  organizationNumber: string,
  preferredName: string,
  label: string,
): TValue | null {
  const orgMatches = values.filter(
    (v) =>
      normalizeOrganizationNumber(v.organizationNumber) === organizationNumber,
  );
  if (orgMatches.length === 0) return null;
  if (orgMatches.length === 1) return orgMatches[0];

  const nameMatches = orgMatches.filter((v) =>
    sameText(v.name ?? "", preferredName),
  );
  if (nameMatches.length >= 1) return nameMatches[0];

  // Multiple org matches but no name match — use the first one
  return orgMatches[0];
}

// ── Employee resolution ──

async function resolveEmployees(
  ctx: StrategyContext,
  employees: Array<FullProjectLifecycleEmployeeInput & { email: string }>,
  startDate: string,
  departmentId: number,
  preferredProjectManagerEmail: string | undefined,
): Promise<ResolvedEmployee[]> {
  const results: ResolvedEmployee[] = [];
  const toCreate: Array<{
    input: FullProjectLifecycleEmployeeInput;
    index: number;
    isPm: boolean;
  }> = [];

  // Look up each employee by email
  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    const isPm =
      !!preferredProjectManagerEmail &&
      normalizeEmail(emp.email) ===
        normalizeEmail(preferredProjectManagerEmail);

    const lookupResponse = await ctx.tripletex.get<
      ListResponse<EmployeeSummary>
    >("/employee", {
      query: { email: emp.email, count: 10, fields: "*" },
    });

    const existing = pickExactEmployee(lookupResponse.values ?? [], emp.email);
    if (existing) {
      results.push({
        employee: existing,
        created: false,
        usedPlaceholderBirthDate: false,
        requested: emp,
        isPm,
      });
    } else {
      toCreate.push({ input: emp, index: i, isPm });
    }
  }

  // Batch-create missing employees
  if (toCreate.length > 0) {
    const createPayloads = toCreate.map((entry) => {
      const split = splitEmployeeName(entry.input.employeeName);
      const birthDate =
        normalizeOptionalString(entry.input.birthDate) ??
        makePlaceholderBirthDate(entry.index);
      return {
        firstName: split.firstName,
        lastName: split.lastName,
        email: entry.input.email,
        dateOfBirth: birthDate,
        userType: "NO_ACCESS",
        department: { id: departmentId },
      };
    });

    if (createPayloads.length === 1) {
      const response = await ctx.tripletex.post<
        ValueOrWrapped<EmployeeSummary>
      >("/employee", { body: createPayloads[0] });
      const created = unwrapValue(response, "employee");
      results.push({
        employee: created,
        created: true,
        usedPlaceholderBirthDate: !normalizeOptionalString(
          toCreate[0].input.birthDate,
        ),
        requested: toCreate[0].input,
        isPm: toCreate[0].isPm,
      });
    } else {
      const response = await ctx.tripletex.post<
        ListLikeResponse<EmployeeSummary>
      >("/employee/list", { body: createPayloads });
      const createdList = unwrapList(response, "employees");
      for (let j = 0; j < toCreate.length; j++) {
        const created = createdList[j];
        if (!created) {
          throw new Error(
            `Employee batch creation did not return entry for ${toCreate[j].input.email}.`,
          );
        }
        results.push({
          employee: created,
          created: true,
          usedPlaceholderBirthDate: !normalizeOptionalString(
            toCreate[j].input.birthDate,
          ),
          requested: toCreate[j].input,
          isPm: toCreate[j].isPm,
        });
      }
    }
  }

  // Sort results back to original prompt order
  const emailOrder = employees.map((e) => normalizeEmail(e.email));
  results.sort(
    (a, b) =>
      emailOrder.indexOf(normalizeEmail(a.requested.email)) -
      emailOrder.indexOf(normalizeEmail(b.requested.email)),
  );

  return results;
}

function pickExactEmployee(
  employees: readonly EmployeeSummary[],
  email: string,
): EmployeeSummary | null {
  const normalizedEmail = normalizeEmail(email);
  const matches = employees.filter(
    (emp) => normalizeEmail(emp.email) === normalizedEmail,
  );
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new Error(`Expected exactly one employee with email ${email}.`);
  }
  return matches[0];
}

// ── Timesheet planning ──

function planTimesheetEntries(
  employees: readonly ResolvedEmployee[],
  startDate: string,
): PlannedTimesheetEntry[] {
  return employees.flatMap((emp) =>
    splitProjectHours(emp.requested.hours, startDate).map((entry) => ({
      employeeId: requireId(emp.employee.id, "employee"),
      employeeEmail: emp.requested.email,
      date: entry.date,
      hours: entry.hours,
    })),
  );
}

function splitProjectHours(
  totalHours: number,
  firstDate: string,
): Array<{ date: string; hours: number }> {
  const entries: Array<{ date: string; hours: number }> = [];
  let remainingHours = roundHours(totalHours);
  let dayOffset = 0;

  while (remainingHours > 7.5) {
    entries.push({
      date: addDays(firstDate, dayOffset),
      hours: 7.5,
    });
    remainingHours = roundHours(remainingHours - 7.5);
    dayOffset += 1;
  }

  if (remainingHours > 0) {
    entries.push({
      date: addDays(firstDate, dayOffset),
      hours: remainingHours,
    });
  }

  return entries;
}

// ── Invoice helpers ──

function chooseOutgoingVatType(
  vatTypes: readonly VatTypeSummary[],
): VatTypeSummary {
  if (vatTypes.length === 0) {
    throw new Error("No outgoing VAT types found.");
  }

  const vat25 = vatTypes.find((vt) => sameNumber(vt.percentage, 25));
  if (vat25) return vat25;

  if (vatTypes.length === 1) return vatTypes[0];

  const positiveVat = vatTypes.find(
    (vt) => typeof vt.percentage === "number" && vt.percentage > 0,
  );
  if (positiveVat) return positiveVat;

  throw new Error("No decisive outgoing VAT type found.");
}

function chooseInvoiceBankAccount(
  accounts: readonly LedgerAccountSummary[],
): LedgerAccountSummary {
  const invoiceAccount = accounts.find((a) => a.isInvoiceAccount);
  if (invoiceAccount) return invoiceAccount;

  const account1920 = accounts.find(
    (a) => String(a.number) === String(INVOICE_BANK_ACCOUNT_NUMBER),
  );
  if (account1920) return account1920;

  if (accounts.length === 1) return accounts[0];

  throw new Error("No decisive invoice bank account found.");
}

function isMissingBankAccountError(error: unknown): boolean {
  return (
    error instanceof TripletexHttpError &&
    error.status === 422 &&
    error.message.includes(MISSING_BANK_ACCOUNT_MESSAGE)
  );
}

// ── Utility functions ──

function normalizeEmployeeInputs(
  employees: readonly FullProjectLifecycleEmployeeInput[] | undefined,
): Array<FullProjectLifecycleEmployeeInput & { email: string }> {
  if (!Array.isArray(employees) || employees.length === 0) {
    throw new Error("employees must contain at least one employee entry.");
  }
  return employees.map((emp, index) => ({
    employeeName: requireNonEmptyString(
      emp.employeeName,
      `employees[${index}].employeeName`,
    ),
    email: normalizeEmail(emp.email),
    hours: assertPositiveNumber(emp.hours, `employees[${index}].hours`),
    birthDate: normalizeOptionalString(emp.birthDate),
  }));
}

function splitEmployeeName(name: string): {
  firstName: string;
  lastName: string;
} {
  const parts = requireNonEmptyString(name, "employeeName")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length < 2) {
    throw new Error(
      `employeeName "${name}" must contain first and last name.`,
    );
  }
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

function makePlaceholderBirthDate(index: number): string {
  return addDays("1985-01-15", index);
}

function unwrapValue<TValue>(
  response: ValueOrWrapped<TValue>,
  label: string,
): TValue {
  if (isRecord(response) && "value" in response) {
    return requireValue((response as ResponseWrapper<TValue>).value, label);
  }
  return requireValue(response, label);
}

function unwrapList<TValue>(
  response: ListLikeResponse<TValue>,
  label: string,
): TValue[] {
  if (Array.isArray(response)) return response;
  if (
    isRecord(response) &&
    Array.isArray((response as ListResponse<TValue>).values)
  ) {
    return (response as ListResponse<TValue>).values ?? [];
  }
  if (
    isRecord(response) &&
    Array.isArray((response as ResponseWrapper<TValue[]>).value)
  ) {
    return (response as ResponseWrapper<TValue[]>).value ?? [];
  }
  throw new Error(`Tripletex did not return ${label}.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireValue<TValue>(
  value: TValue | null | undefined,
  label: string,
): TValue {
  if (value === undefined || value === null) {
    throw new Error(`Tripletex did not return a ${label}.`);
  }
  return value;
}

function requireId(value: number | null | undefined, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Tripletex did not return a valid ${label} id.`);
  }
  return value;
}

function requireNonEmptyString(
  value: string | undefined,
  fieldName: string,
): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
  return normalized;
}

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeOrganizationNumber(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, "");
}

function normalizeEmail(value: unknown): string {
  let normalized = normalizeOptionalString(value) ?? "";
  normalized = normalized.replace(/^mailto:/i, "");
  const bracketMatch = normalized.match(/<([^<>\s@]+@[^<>\s@]+)>/);
  if (bracketMatch) normalized = bracketMatch[1];
  normalized = normalized.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(normalized)) {
    throw new Error(`Invalid email address: ${JSON.stringify(value)}.`);
  }
  return normalized;
}

function assertPositiveNumber(value: unknown, fieldName: string): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`${fieldName} must be a positive number.`);
  }
  return num;
}

function sameText(left: unknown, right: unknown): boolean {
  return String(left ?? "").localeCompare(String(right ?? ""), undefined, { sensitivity: "base" }) === 0;
}

function sameNumber(
  left: number | null | undefined,
  right: number | null | undefined,
): boolean {
  return (
    typeof left === "number" &&
    typeof right === "number" &&
    Math.abs(left - right) < 0.000001
  );
}

function roundHours(value: unknown): number {
  return Number(Number(value).toFixed(4));
}

function roundCurrency(value: unknown): number {
  return Number(Number(value).toFixed(2));
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
