import type { StrategyResult } from "../../../runtime/contracts";
import type {
  CreateDepartmentInput,
  CreateDepartmentStrategy,
} from "../task";
import { CREATE_DEPARTMENT_TASK_ID } from "../task";

interface DepartmentSummary {
  id: number;
  name?: string;
  displayName?: string;
  isInactive?: boolean;
}

interface DepartmentResponse {
  value?: DepartmentSummary;
  values?: DepartmentSummary[];
  fullResultSize?: number;
}

export const strategy = {
  strategyId: "03.direct-create-departments.v1",
  strategyPath:
    "src/tasks/task-03/strategies/direct-create-departments.ts",
  taskId: CREATE_DEPARTMENT_TASK_ID,
  name: "Direct create departments",
  summary:
    "Creates departments in one write call, using the batch endpoint only when the prompt asks for multiple names.",
  hypothesis:
    "The trusted standard and production batch script both show that create-department is a zero-read flow: POST /department for one name, POST /department/list once for several.",
  expectedCallProfile: {
    targetCalls: 1,
    maxCalls: 1,
  },
  stepOutline: [
    "Validate the prompt-provided department names without normalizing them.",
    "If one name was requested, POST /department with { name }.",
    "If several names were requested, POST /department/list once with the full array.",
    "Verify the created departments directly from response.value or response.values.",
  ],
  status: "draft",
  async run(
    ctx,
    input: CreateDepartmentInput,
  ): Promise<StrategyResult> {
    const departmentNames = validateDepartmentNames(input.departmentNames);

    if (departmentNames.length === 1) {
      const response = await ctx.tripletex.post<DepartmentResponse>(
        "/department",
        {
          body: {
            name: departmentNames[0],
          },
        },
      );

      const createdDepartment = requireDepartment(
        response.value,
        departmentNames[0],
      );

      return {
        createdEntityIds: {
          departmentId: createdDepartment.id,
        },
        verification: {
          departments: [toDepartmentVerification(createdDepartment)],
        },
      };
    }

    const response = await ctx.tripletex.post<DepartmentResponse>(
      "/department/list",
      {
        body: departmentNames.map((name) => ({ name })),
      },
    );

    const createdDepartments = requireDepartmentBatch(
      response.values ?? [],
      departmentNames,
    );

    return {
      createdEntityIds: toDepartmentEntityIds(createdDepartments),
      verification: {
        departments: createdDepartments.map(toDepartmentVerification),
        fullResultSize: response.fullResultSize,
      },
    };
  },
} satisfies CreateDepartmentStrategy;

function validateDepartmentNames(
  departmentNames: readonly string[] | undefined,
): string[] {
  if (!Array.isArray(departmentNames) || departmentNames.length === 0) {
    throw new Error("departmentNames must contain at least one department.");
  }

  return departmentNames.map((name, index) => {
    if (typeof name !== "string" || name.trim().length === 0) {
      throw new Error(
        `departmentNames[${index}] must be a non-empty string.`,
      );
    }

    return name;
  });
}

function requireDepartment(
  department: DepartmentSummary | undefined,
  expectedName: string,
): DepartmentSummary {
  if (!department || typeof department.id !== "number") {
    throw new Error("Tripletex did not return the created department.");
  }

  if (department.name !== expectedName) {
    throw new Error(
      `Tripletex returned department name ${JSON.stringify(department.name)} instead of ${JSON.stringify(expectedName)}.`,
    );
  }

  return department;
}

function requireDepartmentBatch(
  departments: readonly DepartmentSummary[],
  expectedNames: readonly string[],
): DepartmentSummary[] {
  if (departments.length !== expectedNames.length) {
    throw new Error(
      `Tripletex returned ${departments.length} departments, expected ${expectedNames.length}.`,
    );
  }

  return departments.map((department, index) =>
    requireDepartment(department, expectedNames[index]),
  );
}

function toDepartmentEntityIds(
  departments: readonly DepartmentSummary[],
): Record<string, number> {
  return Object.fromEntries(
    departments.map((department, index) => [
      `department${index + 1}Id`,
      department.id,
    ]),
  );
}

function toDepartmentVerification(
  department: DepartmentSummary,
): Record<string, unknown> {
  return {
    id: department.id,
    name: department.name,
    displayName: department.displayName,
    isInactive: department.isInactive,
  };
}
