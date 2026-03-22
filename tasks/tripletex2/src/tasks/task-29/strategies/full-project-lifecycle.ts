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
  employments?: EmploymentSummary[] | null;
}

interface EmploymentSummary {
  id?: number | null;
  startDate?: string | null;
}

interface DepartmentSummary {
  id?: number | null;
  name?: string | null;
}

interface DivisionSummary {
  id?: number | null;
  name?: string | null;
}

interface ProjectSummary {
  id?: number | null;
  name?: string | null;
  startDate?: string | null;
  customer?: IdRef | null;
  projectManager?: IdRef | null;
}

interface ActivitySummary {
  id?: number | null;
  name?: string | null;
  isChargeable?: boolean | null;
}

interface ProjectActivitySummary {
  id?: number | null;
  budgetFeeCurrency?: number | null;
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

interface OrderSummary {
  id?: number | null;
}

interface InvoiceSummary {
  id?: number | null;
  invoiceNumber?: number | null;
  customer?: IdRef | null;
  orders?: Array<IdRef | null> | null;
  amountExcludingVatCurrency?: number | null;
  amountCurrencyOutstanding?: number | null;
}

interface LedgerAccountSummary {
  id?: number | null;
  number?: number | string | null;
  bankAccountNumber?: string | null;
  isInvoiceAccount?: boolean | null;
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
}

interface EmployeeCreationSupport {
  departmentId: number;
  divisionId: number;
}

type ValueOrWrapped<TValue> = TValue | ResponseWrapper<TValue>;
type ListLikeResponse<TValue> =
  | TValue[]
  | ListResponse<TValue>
  | ResponseWrapper<TValue[]>;

export const strategy = {
  strategyId: "29.full-project-lifecycle.v1",
  strategyPath: "src/tasks/task-29/strategies/full-project-lifecycle.ts",
  taskId: FULL_PROJECT_LIFECYCLE_TASK_ID,
  name: "Full project lifecycle",
  summary:
    "Creates or reuses the customer, supplier, and employees needed for a new project, registers project hours and supplier cost, then creates the customer invoice through the proven order-to-invoice path.",
  hypothesis:
    "The strongest available path is the production-reflected lifecycle branch: create the project and one non-chargeable project-specific activity with the requested budget, bulk-write the split timesheet entries, post supplier cost through project/orderline, and invoice the project budget through POST /order followed by PUT /order/:invoice.",
  expectedCallProfile: {
    targetCalls: 13,
    maxCalls: 22,
  },
  stepOutline: [
    "Resolve or create the customer by organization number.",
    "Resolve or create the supplier by organization number.",
    "Try the preferred project-manager email as an assignable manager, then fall back to any assignable manager if needed.",
    "Resolve each employee by email and create only the missing ones using a shared department and division.",
    "POST /project with the resolved customer and chosen project manager.",
    "POST /project/projectActivity with one project-specific non-chargeable activity carrying the project budget.",
    "POST /timesheet/entry/list with one row per planned date chunk after splitting hours above 24 per day.",
    "POST /project/orderline for the supplier cost.",
    "GET /ledger/vatType, POST /order, then PUT /order/{id}/:invoice with sendToCustomer=false.",
    "Only if invoice creation fails on the known company-bank-account prerequisite, repair one invoice bank account and retry the same invoice write once.",
  ],
  status: "draft",
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

    const startDate = normalizeOptionalString(input.startDate) ?? ctx.clock.today();
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

    const customer = await resolveOrCreateCustomer(
      ctx,
      customerName,
      customerOrganizationNumber,
    );
    const supplier = await resolveOrCreateSupplier(
      ctx,
      supplierName,
      supplierOrganizationNumber,
    );

    const preferredManager = preferredProjectManagerEmail
      ? await resolveAssignableManagerByEmail(ctx, preferredProjectManagerEmail)
      : null;
    const fallbackManager =
      preferredManager === null ? await resolveAnyAssignableManager(ctx) : null;
    const projectManager = preferredManager ?? fallbackManager;
    if (!projectManager) {
      throw new Error(
        "Tripletex did not return any assignable project manager for the project create step.",
      );
    }

    let employeeCreationSupportPromise:
      | Promise<EmployeeCreationSupport>
      | undefined;
    const resolvedEmployees: ResolvedEmployee[] = [];

    for (let index = 0; index < employees.length; index += 1) {
      const employeeInput = employees[index];
      const resolvedEmployee = await resolveOrCreateEmployee(ctx, {
        employee: employeeInput,
        startDate,
        employeeIndex: index,
        getCreationSupport: () => {
          employeeCreationSupportPromise ??= resolveEmployeeCreationSupport(ctx);
          return employeeCreationSupportPromise;
        },
      });
      resolvedEmployees.push(resolvedEmployee);
    }

    const projectResponse = await ctx.tripletex.post<
      ValueOrWrapped<ProjectSummary>
    >("/project", {
      body: {
        name: projectName,
        startDate,
        customer: { id: requireId(customer.entity.id, "customer") },
        projectManager: { id: requireId(projectManager.id, "project manager") },
      },
    });
    const project = unwrapValue(projectResponse, "project");
    const projectId = requireId(project.id, "project");

    const projectActivityResponse = await ctx.tripletex.post<
      ValueOrWrapped<ProjectActivitySummary>
    >("/project/projectActivity", {
      body: {
        project: { id: projectId },
        startDate,
        budgetFeeCurrency: projectBudgetNok,
        activity: {
          name: activityName,
          activityType: PROJECT_SPECIFIC_ACTIVITY_TYPE,
          isChargeable: false,
        },
      },
    });
    const projectActivity = unwrapValue(
      projectActivityResponse,
      "project activity",
    );
    const projectActivityId = requireId(
      projectActivity.id,
      "project activity",
    );
    const activity = requireValue(projectActivity.activity, "activity");
    const activityId = requireId(activity.id, "activity");

    if (projectActivity.project?.id && projectActivity.project.id !== projectId) {
      throw new Error("Project activity did not reference the created project.");
    }
    assertApproxNumber(
      projectActivity.budgetFeeCurrency,
      projectBudgetNok,
      "project activity budgetFeeCurrency",
    );

    const plannedTimesheetEntries = planTimesheetEntries(
      resolvedEmployees,
      startDate,
    );
    const timesheetResponse = await ctx.tripletex.post<
      ListLikeResponse<TimesheetEntrySummary>
    >("/timesheet/entry/list", {
      body: plannedTimesheetEntries.map((entry) => ({
        employee: { id: entry.employeeId },
        project: { id: projectId },
        activity: { id: activityId },
        date: entry.date,
        hours: entry.hours,
      })),
    });
    const timesheetEntries = unwrapList(timesheetResponse, "timesheet entries");
    verifyTimesheetEntries(timesheetEntries, plannedTimesheetEntries, {
      expectedProjectId: projectId,
      expectedActivityId: activityId,
    });

    const projectCostResponse = await ctx.tripletex.post<
      ValueOrWrapped<ProjectOrderLineSummary>
    >("/project/orderline", {
      body: {
        project: { id: projectId },
        vendor: { id: requireId(supplier.entity.id, "supplier") },
        description: supplierCostDescription,
        date: invoiceDate,
        count: 1,
        unitCostCurrency: supplierCostNok,
        isChargeable: false,
      },
    });
    const projectCost = unwrapValue(projectCostResponse, "project cost");
    const projectCostId = requireId(projectCost.id, "project cost");
    if (projectCost.project?.id && projectCost.project.id !== projectId) {
      throw new Error("Project cost did not reference the created project.");
    }
    if (
      projectCost.vendor?.id &&
      projectCost.vendor.id !== requireId(supplier.entity.id, "supplier")
    ) {
      throw new Error("Project cost did not reference the resolved supplier.");
    }
    assertApproxNumber(
      projectCost.unitCostCurrency,
      supplierCostNok,
      "project cost unitCostCurrency",
    );

    const vatTypeResponse = await ctx.tripletex.get<ListResponse<VatTypeSummary>>(
      "/ledger/vatType",
      {
        query: {
          typeOfVat: "OUTGOING",
          vatDate: invoiceDate,
          fields: "*",
        },
      },
    );
    const vatType = chooseOutgoingVatType(vatTypeResponse.values ?? []);

    const orderResponse = await ctx.tripletex.post<ValueOrWrapped<OrderSummary>>(
      "/order",
      {
        body: {
          customer: { id: requireId(customer.entity.id, "customer") },
          project: { id: projectId },
          orderDate: invoiceDate,
          deliveryDate,
          orderLines: [
            {
              description: invoiceLineDescription,
              count: 1,
              unitPriceExcludingVatCurrency: projectBudgetNok,
              vatType: { id: requireId(vatType.id, "VAT type") },
            },
          ],
        },
      },
    );
    const order = unwrapValue(orderResponse, "order");
    const orderId = requireId(order.id, "order");

    let repairedInvoiceBankAccount = false;
    let invoiceResponse: ResponseWrapper<InvoiceSummary>;
    try {
      invoiceResponse = await createInvoiceFromOrder(ctx, orderId, invoiceDate);
    } catch (error) {
      if (!isMissingBankAccountError(error)) {
        throw error;
      }

      const ledgerAccountResponse = await ctx.tripletex.get<
        ListResponse<LedgerAccountSummary>
      >("/ledger/account", {
        query: {
          isBankAccount: true,
          fields: "*",
        },
      });
      const invoiceBankAccount = chooseInvoiceBankAccount(
        ledgerAccountResponse.values ?? [],
      );

      if (normalizeOptionalString(invoiceBankAccount.bankAccountNumber)) {
        throw error;
      }

      const existingNumbers = new Set(
        (ledgerAccountResponse.values ?? [])
          .map((account) => normalizeOptionalString(account.bankAccountNumber))
          .filter((value): value is string => Boolean(value)),
      );

      await ctx.tripletex.put<ValueOrWrapped<LedgerAccountSummary>>(
        `/ledger/account/${invoiceBankAccount.id}`,
        {
          body: {
            bankAccountNumber: makeValidBankAccountNumber(existingNumbers),
          },
        },
      );
      repairedInvoiceBankAccount = true;
      invoiceResponse = await createInvoiceFromOrder(ctx, orderId, invoiceDate);
    }

    const invoice = requireValue(invoiceResponse.value, "invoice");
    verifyInvoice(invoice, {
      expectedCustomerId: requireId(customer.entity.id, "customer"),
      expectedOrderId: orderId,
      expectedAmountExcludingVatCurrency: projectBudgetNok,
    });

    const createdEntityIds: Record<string, number> = {
      customerId: requireId(customer.entity.id, "customer"),
      supplierId: requireId(supplier.entity.id, "supplier"),
      projectManagerId: requireId(projectManager.id, "project manager"),
      projectId,
      projectActivityId,
      activityId,
      projectCostId,
      orderId,
      invoiceId: requireId(invoice.id, "invoice"),
    };

    resolvedEmployees.forEach((employee, index) => {
      createdEntityIds[`employee${index + 1}Id`] = requireId(
        employee.employee.id,
        `employee ${index + 1}`,
      );
    });

    const notes: string[] = [];
    if (customer.created) {
      notes.push(
        `Customer ${customerOrganizationNumber} did not exist and was created in this run.`,
      );
    } else if (
      normalizeOptionalString(customer.entity.name) &&
      !sameText(customer.entity.name ?? "", customerName)
    ) {
      notes.push(
        `Customer lookup matched organization number ${customerOrganizationNumber}, but the stored name "${customer.entity.name}" differed from extracted input "${customerName}".`,
      );
    }

    if (supplier.created) {
      notes.push(
        `Supplier ${supplierOrganizationNumber} did not exist and was created in this run.`,
      );
    } else if (
      normalizeOptionalString(supplier.entity.name) &&
      !sameText(supplier.entity.name ?? "", supplierName)
    ) {
      notes.push(
        `Supplier lookup matched organization number ${supplierOrganizationNumber}, but the stored name "${supplier.entity.name}" differed from extracted input "${supplierName}".`,
      );
    }

    const createdEmployees = resolvedEmployees.filter((employee) => employee.created);
    if (createdEmployees.length > 0) {
      notes.push(
        `Created ${createdEmployees.length} missing employee record(s) before registering project hours.`,
      );
    }

    const placeholderBirthDateEmails = resolvedEmployees
      .filter((employee) => employee.usedPlaceholderBirthDate)
      .map((employee) => employee.requested.email);
    if (placeholderBirthDateEmails.length > 0) {
      notes.push(
        `Tripletex required birth dates for employee creation, so deterministic placeholder birth dates were used for ${placeholderBirthDateEmails.join(", ")}.`,
      );
    }

    for (const employee of resolvedEmployees) {
      const entryCount = splitProjectHours(employee.requested.hours, startDate).length;
      if (entryCount > 1) {
        notes.push(
          `Split ${employee.requested.hours} hours for ${employee.requested.email} across ${entryCount} dates to stay within Tripletex's 24-hour per-entry limit.`,
        );
      }
    }

    if (
      preferredProjectManagerEmail &&
      normalizeOptionalString(projectManager.email) &&
      normalizeEmail(projectManager.email) !==
        normalizeEmail(preferredProjectManagerEmail)
    ) {
      notes.push(
        `Preferred manager ${preferredProjectManagerEmail} was not available as an assignable project manager, so the strategy used ${projectManager.email} instead.`,
      );
    }

    if (repairedInvoiceBankAccount) {
      notes.push(
        "The first invoice attempt hit the missing-company-bank-account validation branch, so the strategy repaired the invoice bank account and retried once.",
      );
    }

    return {
      createdEntityIds,
      notes,
      verification: {
        customerCreated: customer.created,
        supplierCreated: supplier.created,
        projectManagerEmailRequested: preferredProjectManagerEmail,
        projectManagerEmailUsed: normalizeOptionalString(projectManager.email),
        projectName: project.name ?? projectName,
        activityName: activity.name ?? activityName,
        budgetFeeCurrency: projectActivity.budgetFeeCurrency ?? projectBudgetNok,
        employeeSummaries: resolvedEmployees.map((employee) => ({
          email: employee.requested.email,
          employeeId: employee.employee.id,
          created: employee.created,
          requestedHours: employee.requested.hours,
        })),
        timesheetEntryIds: timesheetEntries.map((entry) => entry.id),
        timesheetDates: timesheetEntries.map((entry) => entry.date),
        timesheetEntryCount: timesheetEntries.length,
        supplierCostNok,
        projectCostId,
        invoiceDate,
        deliveryDate,
        invoiceNumber: invoice.invoiceNumber,
        amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
        amountCurrencyOutstanding: invoice.amountCurrencyOutstanding,
        repairedInvoiceBankAccount,
      },
    };
  },
} satisfies FullProjectLifecycleStrategy;

async function resolveOrCreateCustomer(
  ctx: StrategyContext,
  customerName: string,
  organizationNumber: string,
): Promise<ResolvedEntity<CustomerSummary>> {
  const customerResponse = await ctx.tripletex.get<ListResponse<CustomerSummary>>(
    "/customer",
    {
      query: {
        organizationNumber,
        count: 10,
        fields: "*",
      },
    },
  );
  const existingCustomer = pickExactPartyByOrganizationNumber(
    customerResponse.values ?? [],
    organizationNumber,
    customerName,
    "customer",
  );
  if (existingCustomer) {
    return { entity: existingCustomer, created: false };
  }

  const createResponse = await ctx.tripletex.post<ValueOrWrapped<CustomerSummary>>(
    "/customer",
    {
      body: {
        name: customerName,
        organizationNumber,
      },
    },
  );

  return {
    entity: unwrapValue(createResponse, "customer"),
    created: true,
  };
}

async function resolveOrCreateSupplier(
  ctx: StrategyContext,
  supplierName: string,
  organizationNumber: string,
): Promise<ResolvedEntity<SupplierSummary>> {
  const supplierResponse = await ctx.tripletex.get<ListResponse<SupplierSummary>>(
    "/supplier",
    {
      query: {
        organizationNumber,
        count: 10,
        fields: "*",
      },
    },
  );
  const existingSupplier = pickExactPartyByOrganizationNumber(
    supplierResponse.values ?? [],
    organizationNumber,
    supplierName,
    "supplier",
  );
  if (existingSupplier) {
    return { entity: existingSupplier, created: false };
  }

  const createResponse = await ctx.tripletex.post<ValueOrWrapped<SupplierSummary>>(
    "/supplier",
    {
      body: {
        name: supplierName,
        organizationNumber,
      },
    },
  );

  return {
    entity: unwrapValue(createResponse, "supplier"),
    created: true,
  };
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
    (value) =>
      normalizeOrganizationNumber(value.organizationNumber) === organizationNumber,
  );

  if (orgMatches.length === 0) {
    return null;
  }
  if (orgMatches.length === 1) {
    return orgMatches[0];
  }

  const nameMatches = orgMatches.filter((value) =>
    sameText(value.name ?? "", preferredName),
  );
  if (nameMatches.length === 1) {
    return nameMatches[0];
  }

  throw new Error(
    `Expected exactly one ${label} with organization number ${organizationNumber}, but found ${orgMatches.length}.`,
  );
}

async function resolveAssignableManagerByEmail(
  ctx: StrategyContext,
  email: string,
): Promise<EmployeeSummary | null> {
  const response = await ctx.tripletex.get<ListResponse<EmployeeSummary>>(
    "/employee",
    {
      query: {
        email,
        assignableProjectManagers: true,
        count: 10,
        fields: "*",
      },
    },
  );

  return pickExactEmployee(response.values ?? [], email, true);
}

async function resolveAnyAssignableManager(
  ctx: StrategyContext,
): Promise<EmployeeSummary | null> {
  const response = await ctx.tripletex.get<ListResponse<EmployeeSummary>>(
    "/employee",
    {
      query: {
        assignableProjectManagers: true,
        count: 50,
        fields: "*",
      },
    },
  );

  const candidates = response.values ?? [];
  if (candidates.length === 0) {
    return null;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  const withEmail = candidates.find((candidate) =>
    Boolean(normalizeOptionalString(candidate.email)),
  );
  return withEmail ?? candidates[0];
}

async function resolveOrCreateEmployee(
  ctx: StrategyContext,
  input: {
    employee: FullProjectLifecycleEmployeeInput;
    startDate: string;
    employeeIndex: number;
    getCreationSupport(): Promise<EmployeeCreationSupport>;
  },
): Promise<ResolvedEmployee> {
  const lookupResponse = await ctx.tripletex.get<ListResponse<EmployeeSummary>>(
    "/employee",
    {
      query: {
        email: input.employee.email,
        count: 10,
        fields: "*",
      },
    },
  );
  const existingEmployee = pickExactEmployee(
    lookupResponse.values ?? [],
    input.employee.email,
    false,
  );
  if (existingEmployee) {
    return {
      employee: existingEmployee,
      created: false,
      usedPlaceholderBirthDate: false,
      requested: input.employee,
    };
  }

  const creationSupport = await input.getCreationSupport();
  const splitName = splitEmployeeName(input.employee.employeeName);
  const birthDate =
    normalizeOptionalString(input.employee.birthDate) ??
    makePlaceholderBirthDate(input.employeeIndex);

  const createResponse = await ctx.tripletex.post<ValueOrWrapped<EmployeeSummary>>(
    "/employee",
    {
      body: {
        firstName: splitName.firstName,
        lastName: splitName.lastName,
        email: input.employee.email,
        dateOfBirth: birthDate,
        userType: "NO_ACCESS",
        department: { id: creationSupport.departmentId },
        employments: [
          {
            startDate: input.startDate,
            division: { id: creationSupport.divisionId },
          },
        ],
      },
    },
  );

  return {
    employee: unwrapValue(createResponse, "employee"),
    created: true,
    usedPlaceholderBirthDate: !normalizeOptionalString(input.employee.birthDate),
    requested: input.employee,
  };
}

function pickExactEmployee(
  employees: readonly EmployeeSummary[],
  email: string,
  allowMissing: boolean,
): EmployeeSummary | null {
  const normalizedEmail = normalizeEmail(email);
  const matches = employees.filter(
    (employee) => normalizeEmail(employee.email) === normalizedEmail,
  );

  if (matches.length === 0) {
    if (allowMissing) {
      return null;
    }
    return null;
  }

  if (matches.length > 1) {
    throw new Error(`Expected exactly one employee with email ${email}.`);
  }

  return matches[0];
}

async function resolveEmployeeCreationSupport(
  ctx: StrategyContext,
): Promise<EmployeeCreationSupport> {
  const [departmentResponse, divisionResponse] = await Promise.all([
    ctx.tripletex.get<ListResponse<DepartmentSummary>>("/department", {
      query: {
        isInactive: false,
        count: 1,
        fields: "*",
      },
    }),
    ctx.tripletex.get<ListResponse<DivisionSummary>>("/division", {
      query: {
        count: 1,
        fields: "*",
      },
    }),
  ]);

  let department = departmentResponse.values?.[0] ?? null;
  if (!department) {
    const createdDepartment = await ctx.tripletex.post<
      ValueOrWrapped<DepartmentSummary>
    >("/department", {
      body: {
        name: "Avdeling",
      },
    });
    department = unwrapValue(createdDepartment, "department");
  }

  const division = divisionResponse.values?.[0] ?? null;
  if (!division?.id) {
    throw new Error(
      "Tripletex required a division for employee creation, but no division was available.",
    );
  }

  return {
    departmentId: requireId(department.id, "department"),
    divisionId: requireId(division.id, "division"),
  };
}

function planTimesheetEntries(
  employees: readonly ResolvedEmployee[],
  startDate: string,
): PlannedTimesheetEntry[] {
  return employees.flatMap((employee) =>
    splitProjectHours(employee.requested.hours, startDate).map((entry) => ({
      employeeId: requireId(employee.employee.id, "employee"),
      employeeEmail: employee.requested.email,
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

  while (remainingHours > 24) {
    entries.push({
      date: addDays(firstDate, dayOffset),
      hours: 24,
    });
    remainingHours = roundHours(remainingHours - 24);
    dayOffset += 1;
  }

  entries.push({
    date: addDays(firstDate, dayOffset),
    hours: remainingHours,
  });

  return entries;
}

function verifyTimesheetEntries(
  entries: readonly TimesheetEntrySummary[],
  expectedEntries: readonly PlannedTimesheetEntry[],
  input: { expectedProjectId: number; expectedActivityId: number },
): void {
  if (entries.length !== expectedEntries.length) {
    throw new Error(
      `Tripletex returned ${entries.length} timesheet entries, expected ${expectedEntries.length}.`,
    );
  }

  for (let index = 0; index < entries.length; index += 1) {
    const actual = entries[index];
    const expected = expectedEntries[index];

    if (actual.project?.id && actual.project.id !== input.expectedProjectId) {
      throw new Error("Timesheet entry did not reference the created project.");
    }
    if (actual.activity?.id && actual.activity.id !== input.expectedActivityId) {
      throw new Error("Timesheet entry did not reference the created activity.");
    }
    if (actual.employee?.id && actual.employee.id !== expected.employeeId) {
      throw new Error("Timesheet entry did not reference the expected employee.");
    }
    assertApproxNumber(actual.hours, expected.hours, "timesheet hours");
    if (normalizeOptionalString(actual.date) && actual.date !== expected.date) {
      throw new Error("Timesheet entry date did not match the planned date.");
    }
  }
}

function chooseOutgoingVatType(
  vatTypes: readonly VatTypeSummary[],
): VatTypeSummary {
  if (vatTypes.length === 0) {
    throw new Error("Tripletex did not return any outgoing VAT types.");
  }

  const vat25 = vatTypes.find((vatType) => sameNumber(vatType.percentage, 25));
  if (vat25) {
    return vat25;
  }

  if (vatTypes.length === 1) {
    return vatTypes[0];
  }

  const positiveVat = vatTypes.find(
    (vatType) =>
      typeof vatType.percentage === "number" && vatType.percentage > 0,
  );
  if (positiveVat) {
    return positiveVat;
  }

  throw new Error(
    "Tripletex did not return a decisive outgoing VAT type for the project invoice.",
  );
}

async function createInvoiceFromOrder(
  ctx: StrategyContext,
  orderId: number,
  invoiceDate: string,
): Promise<ResponseWrapper<InvoiceSummary>> {
  return ctx.tripletex.put<ResponseWrapper<InvoiceSummary>>(
    `/order/${orderId}/:invoice`,
    {
      query: {
        invoiceDate,
        sendToCustomer: false,
      },
    },
  );
}

function verifyInvoice(
  invoice: InvoiceSummary,
  input: {
    expectedCustomerId: number;
    expectedOrderId: number;
    expectedAmountExcludingVatCurrency: number;
  },
): void {
  if (invoice.customer?.id !== input.expectedCustomerId) {
    throw new Error("Invoice customer did not match the resolved customer.");
  }

  const orderId = invoice.orders?.[0]?.id;
  if (typeof orderId === "number" && orderId !== input.expectedOrderId) {
    throw new Error("Invoice did not reference the created order.");
  }

  assertApproxNumber(
    invoice.amountExcludingVatCurrency,
    input.expectedAmountExcludingVatCurrency,
    "invoice amountExcludingVatCurrency",
  );
}

function chooseInvoiceBankAccount(
  accounts: readonly LedgerAccountSummary[],
): LedgerAccountSummary {
  const invoiceAccount = accounts.find((account) => account.isInvoiceAccount);
  if (invoiceAccount) {
    return invoiceAccount;
  }

  const account1920 = accounts.find((account) => String(account.number) === "1920");
  if (account1920) {
    return account1920;
  }

  if (accounts.length === 1) {
    return accounts[0];
  }

  throw new Error("Tripletex did not return a decisive invoice bank account.");
}

function isMissingBankAccountError(error: unknown): boolean {
  return (
    error instanceof TripletexHttpError &&
    error.status === 422 &&
    error.message.includes(MISSING_BANK_ACCOUNT_MESSAGE)
  );
}

function makeValidBankAccountNumber(
  existingNumbers: ReadonlySet<string>,
): string {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  for (let sequence = 3210000000; sequence < 3299999999; sequence += 1) {
    const prefix = String(sequence);
    const sum = prefix
      .split("")
      .reduce(
        (total, digit, index) => total + Number(digit) * weights[index],
        0,
      );
    const remainder = sum % 11;
    const checkDigit = remainder === 0 ? 0 : 11 - remainder;
    if (checkDigit < 10) {
      const candidate = `${prefix}${checkDigit}`;
      if (!existingNumbers.has(candidate)) {
        return candidate;
      }
    }
  }

  throw new Error("Unable to generate a valid invoice bank account number.");
}

function normalizeEmployeeInputs(
  employees: readonly FullProjectLifecycleEmployeeInput[] | undefined,
): Array<FullProjectLifecycleEmployeeInput & { email: string }> {
  if (!Array.isArray(employees) || employees.length === 0) {
    throw new Error("employees must contain at least one employee entry.");
  }

  return employees.map((employee, index) => ({
    employeeName: requireNonEmptyString(
      employee.employeeName,
      `employees[${index}].employeeName`,
    ),
    email: normalizeEmail(employee.email),
    hours: assertPositiveNumber(employee.hours, `employees[${index}].hours`),
    birthDate: normalizeOptionalString(employee.birthDate),
  }));
}

function splitEmployeeName(employeeName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = requireNonEmptyString(employeeName, "employeeName")
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length < 2) {
    throw new Error(
      `employeeName "${employeeName}" must contain at least a first name and a last name.`,
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
  if (Array.isArray(response)) {
    return response;
  }

  if (isRecord(response) && Array.isArray((response as ListResponse<TValue>).values)) {
    return (response as ListResponse<TValue>).values ?? [];
  }

  if (isRecord(response) && Array.isArray((response as ResponseWrapper<TValue[]>).value)) {
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

function requireNonEmptyString(value: string | undefined, fieldName: string): string {
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
  if (bracketMatch) {
    normalized = bracketMatch[1];
  }

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

function assertApproxNumber(
  actual: number | null | undefined,
  expected: number | null | undefined,
  label: string,
): void {
  if (
    typeof actual !== "number" ||
    !Number.isFinite(actual) ||
    typeof expected !== "number" ||
    !Number.isFinite(expected) ||
    Math.abs(actual - expected) > 0.000001
  ) {
    throw new Error(`${label} did not match the expected value.`);
  }
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

function roundHours(value: number): number {
  return Number(value.toFixed(4));
}

function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
