import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type { CreateProjectInput, CreateProjectStrategy } from "../task";
import { CREATE_PROJECT_TASK_ID } from "../task";

interface ResponseWrapper<TValue> {
  value?: TValue;
}

interface ListResponse<TValue> {
  values?: TValue[];
}

interface CustomerSummary {
  id: number;
  name?: string;
  organizationNumber?: string;
}

interface EmployeeSummary {
  id: number;
  email?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  displayName?: string;
}

interface ProjectSummary {
  id?: number;
  name?: string;
  startDate?: string;
  customer?: { id?: number };
  projectManager?: { id?: number };
}

export const strategy = {
  strategyId: "05.create-project.v1",
  strategyPath: "src/tasks/task-05/strategies/create-project.ts",
  taskId: CREATE_PROJECT_TASK_ID,
  name: "Resolve customer and manager, then create project",
  summary:
    "Looks up the existing customer by organization number, resolves an assignable project manager by exact email match, then creates the project with both resolved ids.",
  hypothesis:
    "The trusted three-call flow matches the proven production path for create-project and avoids the unsafe nested-customer and manager-without-id shortcuts.",
  expectedCallProfile: {
    targetCalls: 3,
    maxCalls: 3,
  },
  stepOutline: [
    "API call 1: GET /customer filtered by organization number and keep one exact match locally.",
    "API call 2: GET /employee filtered by email with assignableProjectManagers=true and keep one exact match locally.",
    "API call 3: POST /project with name, startDate, customer.id, and projectManager.id.",
  ],
  status: "draft",
  async run(
    ctx: StrategyContext,
    input: CreateProjectInput,
  ): Promise<StrategyResult> {
    assertNonEmptyText(input.projectName, "projectName");
    assertNonEmptyText(
      input.customerOrganizationNumber,
      "customerOrganizationNumber",
    );
    assertNonEmptyText(input.projectManagerEmail, "projectManagerEmail");

    const startDate = input.startDate ?? ctx.clock.today();
    const normalizedOrganizationNumber = normalizeOrganizationNumber(
      input.customerOrganizationNumber,
    );
    const normalizedManagerEmail = normalizeEmail(input.projectManagerEmail);

    const customerResponse = await ctx.tripletex.get<ListResponse<CustomerSummary>>(
      "/customer",
      {
        query: {
          organizationNumber: normalizedOrganizationNumber,
          count: 10,
          fields: "*",
        },
      },
    );
    const customer = pickExactCustomer(
      customerResponse.values ?? [],
      normalizedOrganizationNumber,
      input.customerName,
    );

    const employeeResponse = await ctx.tripletex.get<ListResponse<EmployeeSummary>>(
      "/employee",
      {
        query: {
          email: normalizedManagerEmail,
          assignableProjectManagers: true,
          count: 10,
          fields: "*",
        },
      },
    );
    const projectManager = pickExactProjectManager(
      employeeResponse.values ?? [],
      normalizedManagerEmail,
      input.projectManagerName,
    );

    const projectResponse = await ctx.tripletex.post<ResponseWrapper<ProjectSummary>>(
      "/project",
      {
        body: {
          name: input.projectName,
          startDate,
          customer: { id: customer.id },
          projectManager: { id: projectManager.id },
        },
      },
    );

    const project = projectResponse.value;
    const projectId = requireId(project?.id, "project");
    const notes: string[] = [];
    maybeAddNameMismatchNote(
      notes,
      "customer",
      input.customerName,
      customer.name,
    );
    maybeAddNameMismatchNote(
      notes,
      "project manager",
      input.projectManagerName,
      formatEmployeeName(projectManager),
    );

    return {
      createdEntityIds: {
        customerId: customer.id,
        projectManagerId: projectManager.id,
        projectId,
      },
      notes,
      verification: {
        projectName: project?.name ?? input.projectName,
        startDate: project?.startDate ?? startDate,
        customerId: project?.customer?.id ?? customer.id,
        projectManagerId: project?.projectManager?.id ?? projectManager.id,
      },
    };
  },
} satisfies CreateProjectStrategy;

function pickExactCustomer(
  customers: readonly CustomerSummary[],
  organizationNumber: string,
  preferredName?: string,
): CustomerSummary {
  const exactMatches = customers.filter(
    (customer) =>
      normalizeOrganizationNumber(customer.organizationNumber) ===
      organizationNumber,
  );

  return pickSingleMatch(
    exactMatches,
    preferredName,
    (customer) => customer.name,
    `Expected exactly one customer with organization number ${organizationNumber}`,
  );
}

function pickExactProjectManager(
  employees: readonly EmployeeSummary[],
  email: string,
  preferredName?: string,
): EmployeeSummary {
  const exactMatches = employees.filter(
    (employee) => normalizeEmail(employee.email) === email,
  );

  return pickSingleMatch(
    exactMatches,
    preferredName,
    formatEmployeeName,
    `Expected exactly one assignable project manager with email ${email}`,
  );
}

function pickSingleMatch<TValue>(
  values: readonly TValue[],
  preferredName: string | undefined,
  getName: (value: TValue) => string | undefined,
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

function requireId(value: number | undefined, entityName: string): number {
  if (typeof value !== "number") {
    throw new Error(`Tripletex did not return a ${entityName} id.`);
  }

  return value;
}

function assertNonEmptyText(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
}

function normalizeOrganizationNumber(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, "");
}

function normalizeEmail(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function sameText(left: string | undefined, right: string | undefined): boolean {
  return (left ?? "").trim().localeCompare((right ?? "").trim(), undefined, {
    sensitivity: "base",
  }) === 0;
}

function formatEmployeeName(employee: EmployeeSummary): string | undefined {
  const joinedName = [employee.firstName, employee.lastName]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ")
    .trim();

  return (
    joinedName ||
    employee.name?.trim() ||
    employee.displayName?.trim() ||
    undefined
  );
}

function maybeAddNameMismatchNote(
  notes: string[],
  label: string,
  expectedName: string | undefined,
  actualName: string | undefined,
): void {
  if (
    expectedName?.trim() &&
    actualName?.trim() &&
    !sameText(expectedName, actualName)
  ) {
    notes.push(
      `Resolved ${label} name "${actualName}" differed from prompt name "${expectedName.trim()}".`,
    );
  }
}
