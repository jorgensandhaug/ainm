import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type {
  AnalyzeExpenseIncreaseCreateInternalProjectsInput,
  AnalyzeExpenseIncreaseCreateInternalProjectsStrategy,
} from "../task";
import { ANALYZE_EXPENSE_INCREASE_CREATE_INTERNAL_PROJECTS_TASK_ID } from "../task";

const ANALYSIS_DATE_FROM = "2026-01-01";
const ANALYSIS_DATE_TO = "2026-03-01";
const JANUARY_MONTH = "2026-01";
const FEBRUARY_MONTH = "2026-02";
const LEDGER_PAGE_SIZE = 10000;
const PROJECT_SPECIFIC_ACTIVITY = "PROJECT_SPECIFIC_ACTIVITY";

interface ListResponse<TValue> {
  values?: TValue[];
  fullResultSize?: number;
}

interface ValueResponse<TValue> {
  value?: TValue;
}

interface LedgerAccountSummary {
  id?: number | null;
  type?: string | null;
  number?: number | null;
  name?: string | null;
  displayName?: string | null;
}

interface PostingSummary {
  amount?: number | null;
  date?: string | null;
  voucherDate?: string | null;
  transactionDate?: string | null;
  account?: LedgerAccountSummary | null;
}

interface EmployeeSummary {
  id?: number | null;
}

interface ProjectSummary {
  id?: number | null;
  name?: string | null;
  isInternal?: boolean | null;
  projectManager?: { id?: number | null } | null;
}

interface ProjectActivitySummary {
  id?: number | null;
  project?: { id?: number | null } | null;
  activity?: {
    id?: number | null;
    name?: string | null;
  } | null;
}

interface AccountIncreaseSummary {
  id: number;
  name: string;
  number: number;
  january: number;
  february: number;
  increase: number;
}

interface CreatedProjectVerification {
  id: number;
  name: string;
  isInternal: boolean;
  projectManagerId: number;
}

interface CreatedProjectActivityVerification {
  projectActivityId: number;
  projectId: number;
  activityId: number;
  name: string;
}

export const strategy = {
  strategyId: "28.cost-analysis-projects.v1",
  strategyPath:
    "src/tasks/task-28/strategies/cost-analysis-projects.ts",
  taskId: ANALYZE_EXPENSE_INCREASE_CREATE_INTERNAL_PROJECTS_TASK_ID,
  name: "Analyze expense increase and create internal projects",
  summary:
    "Reads the January-to-February 2026 ledger once, ranks expense-account increases locally, batch-creates three internal projects, and adds one inline project-specific activity per project.",
  hypothesis:
    "The proven six-call branch is one decisive ledger read, one assignable-manager lookup, one batch project create, and one project-activity write per selected account.",
  expectedCallProfile: {
    targetCalls: 6,
    maxCalls: 10,
  },
  stepOutline: [
    "GET /ledger/posting for the fixed 2026-01-01 through 2026-03-01 window, paginating only if the response proves more rows exist.",
    "Aggregate signed ledger amounts by expense account for January and February, then rank by February-minus-January descending.",
    "GET /employee with assignableProjectManagers=true and reuse the first returned manager id.",
    "POST /project/list once with the three internal projects named from the selected account labels.",
    "POST /project/projectActivity once per created project with an inline non-chargeable PROJECT_SPECIFIC_ACTIVITY using the same account label.",
  ],
  status: "draft",
  async run(
    ctx: StrategyContext,
    input: AnalyzeExpenseIncreaseCreateInternalProjectsInput,
  ): Promise<StrategyResult> {
    void input;

    const startDate = ctx.clock.today();
    const postings = await getLedgerPostings(ctx);
    const selectedAccounts = selectTopExpenseAccountIncreases(postings);

    if (selectedAccounts.length !== 3) {
      throw new Error(
        `Expected exactly 3 expense accounts with ranked increases, got ${selectedAccounts.length}.`,
      );
    }

    const employeeResponse = await ctx.tripletex.get<ListResponse<EmployeeSummary>>(
      "/employee",
      {
        query: {
          assignableProjectManagers: true,
          count: 1,
          fields: "*",
        },
      },
    );
    const managerId = requireAssignableProjectManagerId(
      employeeResponse.values ?? [],
    );

    const projectCreatePayload = selectedAccounts.map((account) => ({
      name: account.name,
      startDate,
      isInternal: true,
      projectManager: { id: managerId },
    }));
    const projectListResponse = await ctx.tripletex.post<
      ListResponse<ProjectSummary> | ProjectSummary[]
    >("/project/list", {
      body: projectCreatePayload,
    });
    const projects = requireCreatedProjects(
      unwrapListResponse(projectListResponse),
      selectedAccounts,
      managerId,
    );

    const activities: CreatedProjectActivityVerification[] = [];
    for (let index = 0; index < projects.length; index += 1) {
      const project = projects[index];
      const account = selectedAccounts[index];
      const activityResponse = await ctx.tripletex.post<
        ValueResponse<ProjectActivitySummary> | ProjectActivitySummary
      >("/project/projectActivity", {
        body: {
          project: { id: project.id },
          startDate,
          activity: {
            name: account.name,
            activityType: PROJECT_SPECIFIC_ACTIVITY,
            isChargeable: false,
          },
        },
      });
      activities.push(
        requireCreatedProjectActivity(
          unwrapValueResponse(activityResponse),
          project.id,
          account.name,
        ),
      );
    }

    return {
      createdEntityIds: toCreatedEntityIds(managerId, projects, activities),
      verification: {
        analysisWindow: {
          dateFrom: ANALYSIS_DATE_FROM,
          dateTo: ANALYSIS_DATE_TO,
        },
        startDate,
        selectedAccounts,
        managerId,
        projects,
        activities,
      },
    };
  },
} satisfies AnalyzeExpenseIncreaseCreateInternalProjectsStrategy;

async function getLedgerPostings(
  ctx: StrategyContext,
): Promise<PostingSummary[]> {
  const allPostings: PostingSummary[] = [];
  let from = 0;

  while (true) {
    const response = await ctx.tripletex.get<ListResponse<PostingSummary>>(
      "/ledger/posting",
      {
        query: {
          dateFrom: ANALYSIS_DATE_FROM,
          dateTo: ANALYSIS_DATE_TO,
          count: LEDGER_PAGE_SIZE,
          from,
          fields: "*,account(*)",
        },
      },
    );

    const page = response.values ?? [];
    allPostings.push(...page);

    if (page.length === 0) {
      return allPostings;
    }

    if (typeof response.fullResultSize === "number") {
      if (allPostings.length >= response.fullResultSize) {
        return allPostings;
      }
    } else if (page.length < LEDGER_PAGE_SIZE) {
      return allPostings;
    }

    from += page.length;
  }
}

function selectTopExpenseAccountIncreases(
  postings: readonly PostingSummary[],
): AccountIncreaseSummary[] {
  const aggregates = new Map<
    number,
    {
      id: number;
      name: string;
      number: number;
      january: number;
      february: number;
    }
  >();

  for (const posting of postings) {
    const account = posting.account;
    if (!account || typeof account.id !== "number") {
      continue;
    }

    if (typeof posting.amount !== "number" || !isExpenseAccount(account)) {
      continue;
    }

    const month = postingMonth(posting);
    if (month !== JANUARY_MONTH && month !== FEBRUARY_MONTH) {
      continue;
    }

    const current = aggregates.get(account.id) ?? {
      id: account.id,
      name: toAccountLabel(account),
      number:
        typeof account.number === "number"
          ? account.number
          : Number.MAX_SAFE_INTEGER,
      january: 0,
      february: 0,
    };

    if (month === JANUARY_MONTH) {
      current.january += posting.amount;
    }

    if (month === FEBRUARY_MONTH) {
      current.february += posting.amount;
    }

    aggregates.set(account.id, current);
  }

  return [...aggregates.values()]
    .map((entry) => ({
      ...entry,
      increase: entry.february - entry.january,
    }))
    .sort((left, right) => {
      if (right.increase !== left.increase) {
        return right.increase - left.increase;
      }

      if (right.february !== left.february) {
        return right.february - left.february;
      }

      return left.number - right.number;
    })
    .slice(0, 3);
}

function requireAssignableProjectManagerId(
  employees: readonly EmployeeSummary[],
): number {
  const managerId = employees[0]?.id;
  if (typeof managerId !== "number") {
    throw new Error("No assignable project manager was returned by Tripletex.");
  }

  return managerId;
}

function requireCreatedProjects(
  projects: readonly ProjectSummary[],
  selectedAccounts: readonly AccountIncreaseSummary[],
  managerId: number,
): CreatedProjectVerification[] {
  if (projects.length !== selectedAccounts.length) {
    throw new Error(
      `Tripletex returned ${projects.length} projects, expected ${selectedAccounts.length}.`,
    );
  }

  return projects.map((project, index) => {
    if (typeof project.id !== "number") {
      throw new Error(`Created project at index ${index} is missing an id.`);
    }

    const expectedName = selectedAccounts[index]?.name;
    if (typeof expectedName !== "string") {
      throw new Error(`Missing expected account name for project index ${index}.`);
    }

    return {
      id: project.id,
      name: project.name ?? expectedName,
      isInternal: project.isInternal ?? true,
      projectManagerId: project.projectManager?.id ?? managerId,
    };
  });
}

function requireCreatedProjectActivity(
  activity: ProjectActivitySummary | undefined,
  projectId: number,
  expectedName: string,
): CreatedProjectActivityVerification {
  if (!activity || typeof activity.id !== "number") {
    throw new Error(
      `Tripletex did not return the created project activity for project ${projectId}.`,
    );
  }

  const activityId = activity.activity?.id;
  if (typeof activityId !== "number") {
    throw new Error(
      `Tripletex did not return the nested activity id for project ${projectId}.`,
    );
  }

  return {
    projectActivityId: activity.id,
    projectId: activity.project?.id ?? projectId,
    activityId,
    name: activity.activity?.name ?? expectedName,
  };
}

function toCreatedEntityIds(
  managerId: number,
  projects: readonly CreatedProjectVerification[],
  activities: readonly CreatedProjectActivityVerification[],
): Record<string, number> {
  const entityIds: Record<string, number> = {
    projectManagerId: managerId,
  };

  for (let index = 0; index < projects.length; index += 1) {
    entityIds[`project${index + 1}Id`] = projects[index].id;
  }

  for (let index = 0; index < activities.length; index += 1) {
    entityIds[`projectActivity${index + 1}Id`] =
      activities[index].projectActivityId;
    entityIds[`activity${index + 1}Id`] = activities[index].activityId;
  }

  return entityIds;
}

function postingMonth(posting: PostingSummary): string | null {
  const dateValue =
    posting.date ?? posting.voucherDate ?? posting.transactionDate;

  return typeof dateValue === "string" && dateValue.length >= 7
    ? dateValue.slice(0, 7)
    : null;
}

function isExpenseAccount(account: LedgerAccountSummary): boolean {
  if (account.type === "OPERATING_EXPENSES") {
    return true;
  }

  return (
    typeof account.number === "number" &&
    account.number >= 4000 &&
    account.number <= 8999
  );
}

function toAccountLabel(account: LedgerAccountSummary): string {
  if (typeof account.displayName === "string" && account.displayName.length > 0) {
    return account.displayName;
  }

  if (
    typeof account.number === "number" &&
    typeof account.name === "string" &&
    account.name.length > 0
  ) {
    return `${account.number} ${account.name}`;
  }

  if (typeof account.name === "string" && account.name.length > 0) {
    return account.name;
  }

  if (typeof account.number === "number") {
    return String(account.number);
  }

  return "Unnamed account";
}

function unwrapListResponse<TValue>(
  response: ListResponse<TValue> | TValue[],
): TValue[] {
  if (Array.isArray(response)) {
    return response;
  }

  return Array.isArray(response.values) ? response.values : [];
}

function unwrapValueResponse<TValue>(
  response: ValueResponse<TValue> | TValue,
): TValue | undefined {
  if (isRecord(response) && "value" in response) {
    return response.value as TValue | undefined;
  }

  return response as TValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
