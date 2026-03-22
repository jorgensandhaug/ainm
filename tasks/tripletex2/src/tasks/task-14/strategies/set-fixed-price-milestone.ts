import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import { TripletexHttpError } from "../../../runtime/tripletex-client";
import type {
  SetProjectFixedPriceAndInvoiceMilestoneInput,
  SetProjectFixedPriceAndInvoiceMilestoneStrategy,
} from "../task";
import { SET_PROJECT_FIXED_PRICE_AND_INVOICE_MILESTONE_TASK_ID } from "../task";

const MISSING_BANK_ACCOUNT_MESSAGE =
  "Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.";

interface ListResponse<TValue> {
  values?: TValue[];
}

interface ResponseWrapper<TValue> {
  value?: TValue;
}

interface CustomerSummary {
  id?: number | null;
  name?: string | null;
  organizationNumber?: string | null;
}

interface EmployeeSummary {
  id?: number | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  displayName?: string | null;
}

interface ProjectSummary {
  id?: number | null;
  name?: string | null;
  startDate?: string | null;
  isClosed?: boolean | null;
  isFixedPrice?: boolean | null;
  fixedprice?: number | null;
  customer?: CustomerSummary | null;
  projectManager?: EmployeeSummary | null;
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
  customer?: { id?: number | null } | null;
  orders?: Array<{ id?: number | null } | null> | null;
  amountExcludingVatCurrency?: number | null;
  amountCurrencyOutstanding?: number | null;
}

interface LedgerAccountSummary {
  id?: number | null;
  number?: number | string | null;
  bankAccountNumber?: string | null;
  isInvoiceAccount?: boolean | null;
}

export const strategy = {
  strategyId: "14.set-fixed-price-milestone.v1",
  strategyPath: "src/tasks/task-14/strategies/set-fixed-price-milestone.ts",
  taskId: SET_PROJECT_FIXED_PRICE_AND_INVOICE_MILESTONE_TASK_ID,
  name: "Set fixed price and invoice milestone",
  summary:
    "Uses the project-first resolver to reuse or create the project, enforces the target fixed-price state, then invoices one unsent milestone order line.",
  hypothesis:
    "The trusted minimum path is to search the project first, skip separate customer and manager reads when the expanded project row already proves them, and only repair the bank-account prerequisite after the specific invoice failure appears.",
  expectedCallProfile: {
    targetCalls: 4,
    maxCalls: 11,
  },
  stepOutline: [
    "API call 1: GET /project with expanded customer and project-manager data to find the exact project and detect whether the project write can be skipped.",
    "Conditional resolver calls: GET /customer, optional POST /customer, and GET /employee only when the project-first read did not already prove those ids.",
    "Conditional project write: POST /project if missing or PUT /project/{id} when the fixed-price or manager state still needs mutation.",
    "GET /ledger/vatType for the invoice date, POST /order with one milestone line, then PUT /order/{id}/:invoice with sendToCustomer=false.",
    "Conditional repair: if the invoice write fails with the known company bank-account validation, GET /ledger/account, PUT the chosen invoice account, and retry the same invoice write once.",
  ],
  status: "draft",
  async run(
    ctx: StrategyContext,
    input: SetProjectFixedPriceAndInvoiceMilestoneInput,
  ): Promise<StrategyResult> {
    const projectName = requireNonEmptyString(input.projectName, "projectName");
    const customerOrganizationNumber = normalizeOrganizationNumber(
      input.customerOrganizationNumber,
    );
    if (!customerOrganizationNumber) {
      throw new Error("customerOrganizationNumber must be a non-empty string.");
    }

    const projectManagerEmail = requireNonEmptyString(
      input.projectManagerEmail,
      "projectManagerEmail",
    ).toLowerCase();
    assertPositiveNumber(
      input.fixedPriceExcludingVatNok,
      "fixedPriceExcludingVatNok",
    );
    assertPositiveNumber(
      input.milestoneAmountExcludingVatNok,
      "milestoneAmountExcludingVatNok",
    );

    const customerName = normalizeOptionalString(input.customerName);
    const projectManagerName = normalizeOptionalString(input.projectManagerName);
    const invoiceDate = input.invoiceDate ?? ctx.clock.today();
    const milestoneDescription =
      normalizeOptionalString(input.milestoneDescription) ??
      buildDefaultMilestoneDescription(input.milestonePercentage);

    const notes: string[] = [];

    const projectSearchResponse = await ctx.tripletex.get<ListResponse<ProjectSummary>>(
      "/project",
      {
        query: {
          name: projectName,
          count: 50,
          fields: "*,customer(*),projectManager(*)",
        },
      },
    );

    let project = pickExactProject(
      projectSearchResponse.values ?? [],
      projectName,
      customerOrganizationNumber,
      customerName,
    );

    let customerCreated = false;
    let customer = project?.customer ?? null;
    if (typeof customer?.id !== "number") {
      const resolvedCustomer = await resolveCustomer(ctx, {
        organizationNumber: customerOrganizationNumber,
        customerName,
      });
      customer = resolvedCustomer.customer;
      customerCreated = resolvedCustomer.created;
    }

    const customerId = requireId(customer?.id, "customer");
    const managerAlreadyMatches = projectManagerMatches(project, projectManagerEmail);
    let projectManager = managerAlreadyMatches ? project?.projectManager ?? null : null;
    if (typeof projectManager?.id !== "number") {
      projectManager = await resolveProjectManager(ctx, {
        email: projectManagerEmail,
        projectManagerName,
      });
    }

    const projectManagerId = requireId(projectManager?.id, "project manager");
    const targetStartDate =
      normalizeOptionalString(input.startDate) ??
      normalizeOptionalString(project?.startDate) ??
      ctx.clock.today();

    let projectWriteSkipped = false;
    if (!project) {
      const createProjectResponse = await ctx.tripletex.post<
        ResponseWrapper<ProjectSummary>
      >("/project", {
        body: buildProjectPayload({
          projectName,
          startDate: targetStartDate,
          customerId,
          projectManagerId,
          fixedPriceExcludingVatNok: input.fixedPriceExcludingVatNok,
        }),
      });
      project = requireValue(createProjectResponse.value, "project");
    } else if (
      projectNeedsUpdate(project, {
        fixedPriceExcludingVatNok: input.fixedPriceExcludingVatNok,
        projectManagerId,
        projectManagerEmail,
        startDate: normalizeOptionalString(input.startDate),
      })
    ) {
      const updateProjectResponse = await ctx.tripletex.put<
        ResponseWrapper<ProjectSummary>
      >(`/project/${requireId(project.id, "project")}`, {
        body: buildProjectPayload({
          projectName,
          startDate: targetStartDate,
          customerId,
          projectManagerId,
          fixedPriceExcludingVatNok: input.fixedPriceExcludingVatNok,
        }),
      });
      project = requireValue(updateProjectResponse.value, "project");
    } else {
      projectWriteSkipped = true;
    }

    const projectId = requireId(project?.id, "project");

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
          project: { id: projectId },
          orderDate: invoiceDate,
          deliveryDate: invoiceDate,
          invoiceOnAccountVatHigh: false,
          orderLines: [
            {
              description: milestoneDescription,
              count: 1,
              unitPriceExcludingVatCurrency:
                input.milestoneAmountExcludingVatNok,
              vatType: { id: requireId(vatType.id, "vat type") },
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

      await repairMissingCompanyBankAccount(ctx);
      repairedInvoiceBankAccount = true;
      invoiceResponse = await createInvoiceFromOrder(ctx, orderId, invoiceDate);
    }

    const invoice = requireValue(invoiceResponse.value, "invoice");
    verifyInvoice(invoice, {
      expectedCustomerId: customerId,
      expectedOrderId: orderId,
      expectedAmountExcludingVatCurrency: input.milestoneAmountExcludingVatNok,
    });

    maybeAddNameMismatchNote(notes, "customer", customerName, customer?.name);
    maybeAddNameMismatchNote(
      notes,
      "project manager",
      projectManagerName,
      formatEmployeeName(projectManager),
    );
    if (customerCreated) {
      notes.push(
        "Customer was missing, so the strategy created it with invoiceSendMethod=MANUAL before creating the project.",
      );
    }
    if (repairedInvoiceBankAccount) {
      notes.push(
        "The first invoice attempt hit the missing-company-bank-account validation branch, so the strategy repaired the invoice bank account and retried once.",
      );
    }

    return {
      createdEntityIds: {
        customerId,
        projectManagerId,
        projectId,
        orderId,
        invoiceId: requireId(invoice.id, "invoice"),
      },
      notes,
      verification: {
        customerCreated,
        projectWriteSkipped,
        invoiceDate,
        invoiceNumber: invoice.invoiceNumber,
        fixedPriceExcludingVatNok: input.fixedPriceExcludingVatNok,
        milestonePercentage: input.milestonePercentage,
        amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
        amountCurrencyOutstanding: invoice.amountCurrencyOutstanding,
      },
    };
  },
} satisfies SetProjectFixedPriceAndInvoiceMilestoneStrategy;

async function resolveCustomer(
  ctx: StrategyContext,
  input: {
    organizationNumber: string;
    customerName?: string;
  },
): Promise<{ customer: CustomerSummary; created: boolean }> {
  const customerResponse = await ctx.tripletex.get<ListResponse<CustomerSummary>>(
    "/customer",
    {
      query: {
        organizationNumber: input.organizationNumber,
        count: 10,
        fields: "*",
      },
    },
  );

  const exactMatches = (customerResponse.values ?? []).filter(
    (customer) =>
      normalizeOrganizationNumber(customer.organizationNumber) ===
      input.organizationNumber,
  );

  if (exactMatches.length > 0) {
    return {
      customer: pickSingleMatch(
        exactMatches,
        input.customerName,
        (customer) => customer.name,
        `Expected exactly one customer with organization number ${input.organizationNumber}`,
      ),
      created: false,
    };
  }

  const customerName = requireNonEmptyString(
    input.customerName,
    "customerName",
  );
  const createCustomerResponse = await ctx.tripletex.post<
    ResponseWrapper<CustomerSummary>
  >("/customer", {
    body: {
      name: customerName,
      organizationNumber: input.organizationNumber,
      invoiceSendMethod: "MANUAL",
    },
  });

  return {
    customer: requireValue(createCustomerResponse.value, "customer"),
    created: true,
  };
}

async function resolveProjectManager(
  ctx: StrategyContext,
  input: {
    email: string;
    projectManagerName?: string;
  },
): Promise<EmployeeSummary> {
  const employeeResponse = await ctx.tripletex.get<ListResponse<EmployeeSummary>>(
    "/employee",
    {
      query: {
        email: input.email,
        assignableProjectManagers: true,
        count: 10,
        fields: "*",
      },
    },
  );

  return pickSingleMatch(
    (employeeResponse.values ?? []).filter(
      (employee) => normalizeEmail(employee.email) === input.email,
    ),
    input.projectManagerName,
    formatEmployeeName,
    `Expected exactly one assignable project manager with email ${input.email}`,
  );
}

function pickExactProject(
  projects: readonly ProjectSummary[],
  projectName: string,
  customerOrganizationNumber: string,
  customerName?: string,
): ProjectSummary | null {
  const exactNameMatches = projects.filter((project) =>
    sameText(project.name, projectName),
  );
  const organizationMatches = exactNameMatches.filter(
    (project) =>
      normalizeOrganizationNumber(project.customer?.organizationNumber) ===
      customerOrganizationNumber,
  );

  if (organizationMatches.length === 0) {
    return null;
  }

  return pickBestProjectCandidate(
    organizationMatches,
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
      sameText(project.customer?.name, customerName),
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

function projectManagerMatches(
  project: ProjectSummary | null,
  projectManagerEmail: string,
): boolean {
  return normalizeEmail(project?.projectManager?.email) === projectManagerEmail;
}

function projectNeedsUpdate(
  project: ProjectSummary,
  input: {
    fixedPriceExcludingVatNok: number;
    projectManagerId: number;
    projectManagerEmail: string;
    startDate?: string;
  },
): boolean {
  const existingProjectManagerId =
    typeof project.projectManager?.id === "number"
      ? project.projectManager.id
      : undefined;
  const managerMatches =
    existingProjectManagerId === input.projectManagerId ||
    normalizeEmail(project.projectManager?.email) === input.projectManagerEmail;

  if (!managerMatches) {
    return true;
  }

  if (project.isFixedPrice !== true) {
    return true;
  }

  if (!sameNumber(project.fixedprice, input.fixedPriceExcludingVatNok)) {
    return true;
  }

  if (input.startDate && !sameText(project.startDate, input.startDate)) {
    return true;
  }

  return false;
}

function buildProjectPayload(input: {
  projectName: string;
  startDate: string;
  customerId: number;
  projectManagerId: number;
  fixedPriceExcludingVatNok: number;
}) {
  return {
    name: input.projectName,
    startDate: input.startDate,
    customer: { id: input.customerId },
    projectManager: { id: input.projectManagerId },
    isFixedPrice: true,
    fixedprice: input.fixedPriceExcludingVatNok,
    invoiceOnAccountVatHigh: false,
  };
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

async function repairMissingCompanyBankAccount(
  ctx: StrategyContext,
): Promise<void> {
  const accountResponse = await ctx.tripletex.get<ListResponse<LedgerAccountSummary>>(
    "/ledger/account",
    {
      query: {
        isBankAccount: true,
        fields: "*",
      },
    },
  );
  const accounts = accountResponse.values ?? [];
  const account = chooseInvoiceBankAccount(accounts);

  const existingNumbers = new Set(
    accounts
      .map((candidate) => normalizeOptionalString(candidate.bankAccountNumber))
      .filter((value): value is string => typeof value === "string"),
  );

  await ctx.tripletex.put(`/ledger/account/${requireId(account.id, "ledger account")}`, {
    body: {
      bankAccountNumber: generateUniqueBankAccountNumber(existingNumbers),
    },
  });
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

function maybeAddNameMismatchNote(
  notes: string[],
  label: string,
  expectedName: string | undefined,
  actualName: string | null | undefined,
): void {
  const normalizedExpectedName = normalizeOptionalString(expectedName);
  const normalizedActualName = normalizeOptionalString(actualName);
  if (
    normalizedExpectedName &&
    normalizedActualName &&
    !sameText(normalizedExpectedName, normalizedActualName)
  ) {
    notes.push(
      `Resolved ${label} name "${normalizedActualName}" differed from extracted input "${normalizedExpectedName}".`,
    );
  }
}

function pickSingleMatch<TValue>(
  values: readonly TValue[],
  preferredName: string | undefined,
  getName: (value: TValue) => string | null | undefined,
  errorPrefix: string,
): TValue {
  if (values.length === 0) {
    throw new Error(`${errorPrefix}, but none were found.`);
  }

  if (values.length === 1) {
    return values[0];
  }

  const narrowed = preferredName
    ? values.filter((value) => sameText(getName(value), preferredName))
    : values;

  if (narrowed.length === 1) {
    return narrowed[0];
  }

  if (preferredName && narrowed.length === 0) {
    throw new Error(
      `${errorPrefix}; ${values.length} exact matches remained and none matched the provided name "${preferredName}".`,
    );
  }

  throw new Error(`${errorPrefix}, but found ${narrowed.length}.`);
}

function buildDefaultMilestoneDescription(
  milestonePercentage: number | undefined,
): string {
  if (typeof milestonePercentage === "number" && Number.isFinite(milestonePercentage)) {
    return `Milestone invoice ${formatNumber(milestonePercentage)}% of fixed price`;
  }

  return "Milestone invoice";
}

function formatEmployeeName(
  employee: EmployeeSummary | null | undefined,
): string | undefined {
  const joinedName = [employee?.firstName, employee?.lastName]
    .filter((value): value is string => Boolean(normalizeOptionalString(value)))
    .join(" ")
    .trim();

  return (
    normalizeOptionalString(joinedName) ??
    normalizeOptionalString(employee?.name) ??
    normalizeOptionalString(employee?.displayName) ??
    undefined
  );
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
  const normalizedValue = normalizeOptionalString(value);
  if (!normalizedValue) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }

  return normalizedValue;
}

function normalizeOptionalString(value: unknown): string | undefined {
  const normalizedValue = String(value ?? "").trim();
  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

function normalizeOrganizationNumber(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, "");
}

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function sameText(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizeOptionalString(left) ?? "";
  const normalizedRight = normalizeOptionalString(right) ?? "";
  return (
    normalizedLeft.localeCompare(normalizedRight, undefined, {
      sensitivity: "base",
    }) === 0
  );
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

function assertPositiveNumber(value: unknown, fieldName: string): void {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
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

function isMissingBankAccountError(error: unknown): boolean {
  return (
    error instanceof TripletexHttpError &&
    error.status === 422 &&
    error.message.includes(MISSING_BANK_ACCOUNT_MESSAGE)
  );
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function computeNorwegianBankAccountCheckDigit(first10: string): string | null {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = first10
    .split("")
    .reduce(
      (total, digit, index) => total + Number(digit) * weights[index],
      0,
    );
  const remainder = sum % 11;
  const checkDigit = 11 - remainder;

  if (checkDigit === 11) {
    return "0";
  }
  if (checkDigit === 10) {
    return null;
  }

  return String(checkDigit);
}

function generateUniqueBankAccountNumber(existing: ReadonlySet<string>): string {
  for (let candidate = 1200000000; candidate <= 1299999999; candidate += 1) {
    const first10 = String(candidate);
    const checkDigit = computeNorwegianBankAccountCheckDigit(first10);
    if (!checkDigit) {
      continue;
    }

    const bankAccountNumber = `${first10}${checkDigit}`;
    if (!existing.has(bankAccountNumber)) {
      return bankAccountNumber;
    }
  }

  throw new Error("Could not generate a unique checksum-valid bank account number.");
}
