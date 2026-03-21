import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import { TripletexHttpError } from "../../../runtime/tripletex-client";
import type {
  RegisterProjectHoursAndCreateProjectInvoiceInput,
  RegisterProjectHoursAndCreateProjectInvoiceStrategy,
} from "../task";
import { REGISTER_PROJECT_HOURS_AND_CREATE_PROJECT_INVOICE_TASK_ID } from "../task";

const PROJECT_SPECIFIC_HOURLY_RATE_MODEL =
  "TYPE_PROJECT_SPECIFIC_HOURLY_RATES";
const MISSING_BANK_ACCOUNT_MESSAGE =
  "Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.";

interface ListResponse<TValue> {
  values?: TValue[];
}

interface ResponseWrapper<TValue> {
  value?: TValue;
}

interface EmployeeSummary {
  id: number;
  email?: string | null;
}

interface CustomerSummary {
  id: number;
  name?: string | null;
  organizationNumber?: string | null;
}

interface ProjectSummary {
  id: number;
  name?: string | null;
  startDate?: string | null;
  isClosed?: boolean | null;
  customer?: CustomerSummary | null;
}

interface ActivitySummary {
  id: number;
  name?: string | null;
  isChargeable?: boolean | null;
}

interface ProjectHourlyRateSummary {
  id: number;
  startDate?: string | null;
  hourlyRateModel?: string | null;
  project?: { id?: number | null } | null;
  projectSpecificRates?: ProjectSpecificRateSummary[] | null;
}

interface ProjectSpecificRateSummary {
  id: number;
  hourlyRate?: number | null;
  employee?: { id?: number | null } | null;
  activity?: { id?: number | null } | null;
}

interface TimesheetEntrySummary {
  id: number;
  hours?: number | null;
  projectChargeableHours?: number | null;
  chargeable?: boolean | null;
  hourlyRate?: number | null;
  date?: string | null;
  project?: { id?: number | null } | null;
  activity?: { id?: number | null } | null;
}

interface VatTypeSummary {
  id: number;
  percentage?: number | null;
}

interface OrderSummary {
  id: number;
}

interface InvoiceSummary {
  id: number;
  invoiceNumber?: number | null;
  customer?: { id?: number | null } | null;
  orders?: Array<{ id?: number | null } | null> | null;
  amountExcludingVatCurrency?: number | null;
  amountCurrencyOutstanding?: number | null;
}

interface LedgerAccountSummary {
  id: number;
  number?: number | string | null;
  bankAccountNumber?: string | null;
  isInvoiceAccount?: boolean | null;
}

interface PlannedTimesheetEntry {
  date: string;
  hours: number;
}

export const strategy = {
  strategyId: "15.register-hours-then-project-order-invoice.v1",
  strategyPath:
    "src/tasks/task-15/strategies/register-hours-then-project-order-invoice.ts",
  taskId: REGISTER_PROJECT_HOURS_AND_CREATE_PROJECT_INVOICE_TASK_ID,
  name: "Register hours then project order invoice",
  summary:
    "Resolves the employee, project, and project activity, writes the required project hours, then creates an unsent project-linked invoice from a manual order line.",
  hypothesis:
    "The trusted public path is to register the requested hours first, configure a project-specific rate only when the activity is chargeable, and always create the invoice through a real project-linked order line.",
  expectedCallProfile: {
    targetCalls: 7,
    maxCalls: 12,
  },
  stepOutline: [
    "API call 1: GET /employee to resolve the exact employee by email.",
    "API call 2: GET /project with expanded customer data to resolve the exact project and linked customer.",
    "API call 3: GET /activity/>forTimeSheet to resolve the exact project activity and its chargeability branch.",
    "Optional chargeable branch: GET/POST/PUT /project/hourlyRates plus POST/PUT /project/hourlyRates/projectSpecificRates to ensure the employee+activity rate exists.",
    "POST /timesheet/entry once per planned date chunk, keeping projectChargeableHours at or below 24.",
    "GET /ledger/vatType to resolve a safe outgoing VAT type for the invoice date.",
    "POST /order with one real project-linked order line derived from the prompt hours and rate, then PUT /order/{id}/:invoice with sendToCustomer=false.",
  ],
  status: "draft",
  async run(
    ctx: StrategyContext,
    input: RegisterProjectHoursAndCreateProjectInvoiceInput,
  ): Promise<StrategyResult> {
    assertPositiveNumber(input.hours, "hours");
    assertPositiveNumber(
      input.hourlyRateExcludingVatNok,
      "hourlyRateExcludingVatNok",
    );

    const employeeEmail = requireNonEmptyString(
      input.employeeEmail,
      "employeeEmail",
    );
    const projectName = requireNonEmptyString(input.projectName, "projectName");
    const activityName = requireNonEmptyString(
      input.activityName,
      "activityName",
    );
    const customerOrganizationNumber = normalizeOrganizationNumber(
      input.customerOrganizationNumber,
    );
    if (!customerOrganizationNumber) {
      throw new Error("customerOrganizationNumber must be provided.");
    }

    const customerName = normalizeOptionalString(input.customerName);
    const entryDate = input.entryDate ?? input.invoiceDate ?? ctx.clock.today();
    const invoiceDate = input.invoiceDate ?? entryDate;
    const invoiceLineDescription =
      normalizeOptionalString(input.invoiceLineDescription) ?? activityName;
    const expectedInvoiceAmount = roundCurrency(
      input.hours * input.hourlyRateExcludingVatNok,
    );

    const employeeResponse = await ctx.tripletex.get<ListResponse<EmployeeSummary>>(
      "/employee",
      {
        query: {
          email: employeeEmail,
          count: 10,
          fields: "*",
        },
      },
    );
    const employee = pickExactEmployee(
      employeeResponse.values ?? [],
      employeeEmail,
    );

    const projectResponse = await ctx.tripletex.get<ListResponse<ProjectSummary>>(
      "/project",
      {
        query: {
          name: projectName,
          count: 50,
          fields: "*,customer(*)",
        },
      },
    );
    const project = pickExactProject(
      projectResponse.values ?? [],
      projectName,
      customerOrganizationNumber,
      customerName,
    );
    const customerId = requireId(project.customer?.id, "project customer");

    const activityResponse = await ctx.tripletex.get<ListResponse<ActivitySummary>>(
      "/activity/>forTimeSheet",
      {
        query: {
          projectId: project.id,
          employeeId: employee.id,
          date: entryDate,
          query: activityName,
          filterExistingHours: false,
          count: 50,
          fields: "*",
        },
      },
    );
    const activity = pickExactActivity(
      activityResponse.values ?? [],
      activityName,
    );

    let projectHourlyRateId: number | undefined;
    let projectSpecificRateId: number | undefined;

    if (activity.isChargeable === true) {
      const projectHourlyRateResponse = await ctx.tripletex.get<
        ListResponse<ProjectHourlyRateSummary>
      >("/project/hourlyRates", {
        query: {
          projectId: project.id,
          count: 100,
          fields: "*,projectSpecificRates(*,employee(*),activity(*))",
        },
      });

      let projectHourlyRate = pickProjectHourlyRateHolder(
        projectHourlyRateResponse.values ?? [],
        project.id,
      );
      const existingExactRate =
        projectHourlyRate?.hourlyRateModel === PROJECT_SPECIFIC_HOURLY_RATE_MODEL
          ? findExactProjectSpecificRate(
              projectHourlyRate.projectSpecificRates ?? [],
              employee.id,
              activity.id,
            )
          : null;

      if (!projectHourlyRate) {
        const createProjectHourlyRateResponse = await ctx.tripletex.post<
          ResponseWrapper<ProjectHourlyRateSummary>
        >("/project/hourlyRates", {
          body: {
            project: { id: project.id },
            startDate: project.startDate ?? entryDate,
            hourlyRateModel: PROJECT_SPECIFIC_HOURLY_RATE_MODEL,
          },
        });
        projectHourlyRate = requireValue(
          createProjectHourlyRateResponse.value,
          "project hourly-rate holder",
        );
      } else if (
        projectHourlyRate.hourlyRateModel !== PROJECT_SPECIFIC_HOURLY_RATE_MODEL
      ) {
        const updateProjectHourlyRateResponse = await ctx.tripletex.put<
          ResponseWrapper<ProjectHourlyRateSummary>
        >(`/project/hourlyRates/${projectHourlyRate.id}`, {
          body: {
            project: { id: project.id },
            startDate: projectHourlyRate.startDate ?? project.startDate ?? entryDate,
            hourlyRateModel: PROJECT_SPECIFIC_HOURLY_RATE_MODEL,
          },
        });
        projectHourlyRate = requireValue(
          updateProjectHourlyRateResponse.value,
          "project hourly-rate holder",
        );
      }

      projectHourlyRateId = requireId(
        projectHourlyRate.id,
        "project hourly-rate holder",
      );

      if (
        existingExactRate &&
        sameNumber(existingExactRate.hourlyRate, input.hourlyRateExcludingVatNok)
      ) {
        projectSpecificRateId = existingExactRate.id;
      } else if (existingExactRate) {
        const updateProjectSpecificRateResponse = await ctx.tripletex.put<
          ResponseWrapper<ProjectSpecificRateSummary>
        >(`/project/hourlyRates/projectSpecificRates/${existingExactRate.id}`, {
          body: {
            projectHourlyRate: { id: projectHourlyRateId },
            employee: { id: employee.id },
            activity: { id: activity.id },
            hourlyRate: input.hourlyRateExcludingVatNok,
          },
        });
        projectSpecificRateId = requireId(
          updateProjectSpecificRateResponse.value?.id,
          "project specific rate",
        );
      } else {
        const createProjectSpecificRateResponse = await ctx.tripletex.post<
          ResponseWrapper<ProjectSpecificRateSummary>
        >("/project/hourlyRates/projectSpecificRates", {
          body: {
            projectHourlyRate: { id: projectHourlyRateId },
            employee: { id: employee.id },
            activity: { id: activity.id },
            hourlyRate: input.hourlyRateExcludingVatNok,
          },
        });
        projectSpecificRateId = requireId(
          createProjectSpecificRateResponse.value?.id,
          "project specific rate",
        );
      }
    }

    const plannedEntries = splitProjectHours(input.hours, entryDate);
    const timesheetEntries: TimesheetEntrySummary[] = [];

    for (const plannedEntry of plannedEntries) {
      const timesheetResponse = await ctx.tripletex.post<
        ResponseWrapper<TimesheetEntrySummary>
      >("/timesheet/entry", {
        body: {
          employee: { id: employee.id },
          project: { id: project.id },
          activity: { id: activity.id },
          date: plannedEntry.date,
          hours: plannedEntry.hours,
          projectChargeableHours: plannedEntry.hours,
        },
      });

      const timesheetEntry = requireValue(
        timesheetResponse.value,
        "timesheet entry",
      );
      verifyTimesheetEntry(timesheetEntry, {
        expectedProjectId: project.id,
        expectedActivityId: activity.id,
        expectedHours: plannedEntry.hours,
        expectedHourlyRate:
          activity.isChargeable === true
            ? input.hourlyRateExcludingVatNok
            : undefined,
        expectedChargeable: activity.isChargeable === true,
      });
      timesheetEntries.push(timesheetEntry);
    }

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

    const orderResponse = await ctx.tripletex.post<ResponseWrapper<OrderSummary>>(
      "/order",
      {
        body: {
          customer: { id: customerId },
          project: { id: project.id },
          orderDate: invoiceDate,
          deliveryDate: invoiceDate,
          orderLines: [
            {
              description: invoiceLineDescription,
              count: input.hours,
              unitPriceExcludingVatCurrency: input.hourlyRateExcludingVatNok,
              vatType: { id: vatType.id },
            },
          ],
        },
      },
    );
    const orderId = requireId(orderResponse.value?.id, "order");

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

      await ctx.tripletex.put<ResponseWrapper<LedgerAccountSummary>>(
        `/ledger/account/${invoiceBankAccount.id}`,
        {
          body: {
            bankAccountNumber: makeValidBankAccountNumber(),
          },
        },
      );
      repairedInvoiceBankAccount = true;
      invoiceResponse = await createInvoiceFromOrder(ctx, orderId, invoiceDate);
    }

    const invoice = requireValue(invoiceResponse.value, "invoice");
    verifyInvoice(invoice, {
      expectedCustomerId: customerId,
      expectedOrderId: orderId,
      expectedAmountExcludingVatCurrency: expectedInvoiceAmount,
    });

    const createdEntityIds: Record<string, number> = {
      orderId,
      invoiceId: requireId(invoice.id, "invoice"),
    };

    if (timesheetEntries.length === 1) {
      createdEntityIds.timesheetEntryId = requireId(
        timesheetEntries[0].id,
        "timesheet entry",
      );
    }

    if (projectHourlyRateId !== undefined) {
      createdEntityIds.projectHourlyRateId = projectHourlyRateId;
    }

    if (projectSpecificRateId !== undefined) {
      createdEntityIds.projectSpecificRateId = projectSpecificRateId;
    }

    const notes: string[] = [];
    if (activity.isChargeable !== true) {
      notes.push(
        "Resolved activity is non-chargeable, so the strategy skipped project-hourly-rate writes and used the trusted manual project-linked order fallback for the invoice.",
      );
    }
    if (plannedEntries.length > 1) {
      notes.push(
        `Split ${input.hours} hours across ${plannedEntries.length} dates to stay within Tripletex's 24-hour per-entry limit.`,
      );
    }
    if (
      customerName &&
      normalizeOptionalString(project.customer?.name) &&
      !sameText(project.customer?.name ?? "", customerName)
    ) {
      notes.push(
        `Project lookup matched organization number ${customerOrganizationNumber}, but the expanded project customer name "${project.customer?.name}" differed from the extracted customer name "${customerName}".`,
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
        employeeId: employee.id,
        projectId: project.id,
        activityId: activity.id,
        customerId,
        activityChargeable: activity.isChargeable === true,
        timesheetEntryIds: timesheetEntries.map((entry) => entry.id),
        timesheetDates: timesheetEntries.map((entry) => entry.date),
        registeredHours: timesheetEntries.map((entry) => entry.hours),
        hourlyRatesObserved: timesheetEntries.map((entry) => entry.hourlyRate),
        invoiceDate,
        invoiceNumber: invoice.invoiceNumber,
        amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
        amountCurrencyOutstanding: invoice.amountCurrencyOutstanding,
      },
    };
  },
} satisfies RegisterProjectHoursAndCreateProjectInvoiceStrategy;

function pickExactEmployee(
  employees: readonly EmployeeSummary[],
  email: string,
): EmployeeSummary {
  const normalizedEmail = email.trim().toLowerCase();
  const matches = employees.filter(
    (employee) => employee.email?.trim().toLowerCase() === normalizedEmail,
  );

  if (matches.length === 0) {
    throw new Error(`Expected an existing employee with email ${email}.`);
  }

  if (matches.length > 1) {
    throw new Error(`Expected exactly one employee with email ${email}.`);
  }

  return matches[0];
}

function pickExactProject(
  projects: readonly ProjectSummary[],
  projectName: string,
  customerOrganizationNumber: string,
  customerName?: string,
): ProjectSummary {
  const exactNameMatches = projects.filter((project) =>
    sameText(project.name ?? "", projectName),
  );
  const orgMatches = exactNameMatches.filter(
    (project) =>
      normalizeOrganizationNumber(project.customer?.organizationNumber) ===
      customerOrganizationNumber,
  );

  if (orgMatches.length === 0) {
    throw new Error(
      `Expected a project named "${projectName}" for organization number ${customerOrganizationNumber}, but no exact expanded match was found.`,
    );
  }

  return pickBestProjectCandidate(
    orgMatches,
    `project ${projectName} / ${customerOrganizationNumber}`,
    customerName,
  );
}

function pickBestProjectCandidate(
  projects: readonly ProjectSummary[],
  label: string,
  customerName?: string,
): ProjectSummary {
  if (projects.length === 1) {
    return projects[0];
  }

  if (customerName) {
    const customerNameMatches = projects.filter((project) =>
      sameText(project.customer?.name ?? "", customerName),
    );
    if (customerNameMatches.length === 1) {
      return customerNameMatches[0];
    }
  }

  const openMatches = projects.filter((project) => project.isClosed !== true);
  if (openMatches.length === 1) {
    return openMatches[0];
  }

  throw new Error(`Expected exactly one match for ${label}.`);
}

function pickExactActivity(
  activities: readonly ActivitySummary[],
  activityName: string,
): ActivitySummary {
  const matches = activities.filter((activity) =>
    sameText(activity.name ?? "", activityName),
  );

  if (matches.length === 0) {
    throw new Error(
      `Expected an existing project activity named "${activityName}".`,
    );
  }

  if (matches.length > 1) {
    throw new Error(
      `Expected exactly one project activity named "${activityName}".`,
    );
  }

  return matches[0];
}

function pickProjectHourlyRateHolder(
  holders: readonly ProjectHourlyRateSummary[],
  projectId: number,
): ProjectHourlyRateSummary | null {
  const exactProjectMatches = holders.filter((holder) => {
    const holderProjectId = holder.project?.id;
    return holderProjectId === undefined || holderProjectId === null
      ? true
      : holderProjectId === projectId;
  });

  if (exactProjectMatches.length === 0) {
    return null;
  }

  if (exactProjectMatches.length === 1) {
    return exactProjectMatches[0];
  }

  const projectSpecificMatches = exactProjectMatches.filter(
    (holder) => holder.hourlyRateModel === PROJECT_SPECIFIC_HOURLY_RATE_MODEL,
  );
  if (projectSpecificMatches.length === 1) {
    return projectSpecificMatches[0];
  }

  throw new Error(
    `Expected at most one project hourly-rate holder for project ${projectId}.`,
  );
}

function findExactProjectSpecificRate(
  rates: readonly ProjectSpecificRateSummary[],
  employeeId: number,
  activityId: number,
): ProjectSpecificRateSummary | null {
  const matches = rates.filter(
    (rate) =>
      rate.employee?.id === employeeId && rate.activity?.id === activityId,
  );

  if (matches.length === 0) {
    return null;
  }

  if (matches.length > 1) {
    throw new Error(
      `Expected at most one project-specific rate for employee ${employeeId} and activity ${activityId}.`,
    );
  }

  return matches[0];
}

function splitProjectHours(
  totalHours: number,
  firstDate: string,
): PlannedTimesheetEntry[] {
  const entries: PlannedTimesheetEntry[] = [];
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

  const zeroVat = vatTypes.find((vatType) => sameNumber(vatType.percentage, 0));
  if (zeroVat && vatTypes.every((vatType) => sameNumber(vatType.percentage, 0))) {
    return zeroVat;
  }

  throw new Error(
    "Tripletex did not return a decisive outgoing VAT type for a normal taxable project invoice.",
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

function verifyTimesheetEntry(
  entry: TimesheetEntrySummary,
  input: {
    expectedProjectId: number;
    expectedActivityId: number;
    expectedHours: number;
    expectedChargeable: boolean;
    expectedHourlyRate?: number;
  },
): void {
  if (entry.project?.id !== input.expectedProjectId) {
    throw new Error("Timesheet entry project did not match the resolved project.");
  }

  if (entry.activity?.id !== input.expectedActivityId) {
    throw new Error("Timesheet entry activity did not match the resolved activity.");
  }

  assertApproxNumber(entry.hours, input.expectedHours, "timesheet hours");
  assertApproxNumber(
    entry.projectChargeableHours,
    input.expectedHours,
    "timesheet projectChargeableHours",
  );

  if (input.expectedChargeable) {
    if (entry.chargeable !== true) {
      throw new Error("Expected the chargeable branch to return chargeable=true.");
    }
    assertApproxNumber(
      entry.hourlyRate,
      input.expectedHourlyRate,
      "timesheet hourlyRate",
    );
    return;
  }

  if (entry.chargeable !== false) {
    throw new Error(
      "Expected the non-chargeable branch to return chargeable=false.",
    );
  }
  assertApproxNumber(entry.hourlyRate, 0, "timesheet hourlyRate");
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
    throw new Error("Invoice customer did not match the resolved project customer.");
  }

  assertApproxNumber(
    invoice.amountExcludingVatCurrency,
    input.expectedAmountExcludingVatCurrency,
    "invoice amountExcludingVatCurrency",
  );

  const firstOrderId = invoice.orders?.[0]?.id;
  if (
    typeof firstOrderId === "number" &&
    firstOrderId !== input.expectedOrderId
  ) {
    throw new Error("Invoice response did not reference the created order.");
  }
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

function makeValidBankAccountNumber(): string {
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
      return `${prefix}${checkDigit}`;
    }
  }

  throw new Error("Unable to generate a valid invoice bank account number.");
}

function requireId(value: number | null | undefined, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Tripletex did not return a valid ${label} id.`);
  }

  return value;
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

function requireNonEmptyString(value: string | undefined, fieldName: string): string {
  const normalizedValue = normalizeOptionalString(value);
  if (!normalizedValue) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }

  return normalizedValue;
}

function normalizeOptionalString(value: string | null | undefined): string | undefined {
  const normalizedValue = value?.trim();
  return normalizedValue ? normalizedValue : undefined;
}

function normalizeOrganizationNumber(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "");
}

function sameText(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: "base" }) === 0;
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

function assertPositiveNumber(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive number.`);
  }
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
