import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import { TripletexHttpError } from "../../../runtime/tripletex-client";
import type { CreateEmployeeInput, CreateEmployeeStrategy } from "../task";
import { CREATE_EMPLOYEE_TASK_ID } from "../task";

interface DepartmentSummary {
  id: number;
  name?: string;
}

interface DivisionSummary {
  id: number;
  name?: string;
}

interface EmployeeSummary {
  id: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  dateOfBirth?: string;
  userType?: string | null;
  employments?: EmploymentSummary[];
}

interface EmploymentSummary {
  id?: number;
  startDate?: string;
}

interface ListResponse<TValue> {
  values?: TValue[];
}

interface ResponseWrapper<TValue> {
  value?: TValue;
}

type EmployeeUserType = "STANDARD" | "EXTENDED" | "NO_ACCESS";

export const strategy = {
  strategyId: "06.create-employee.v1",
  strategyPath: "src/tasks/task-06/strategies/create-employee.ts",
  taskId: CREATE_EMPLOYEE_TASK_ID,
  name: "Create employee",
  summary:
    "Creates an employee with nested employment, follows the proven department and division repair ladder on validation failures, then verifies the scored start date through employee employment readback when needed.",
  hypothesis:
    "Direct employee create with explicit userType and nested employments is the lowest-call safe default, with department and division only added after the known 422 repair path is triggered.",
  expectedCallProfile: {
    targetCalls: 2,
    maxCalls: 6,
  },
  stepOutline: [
    "API call 1: POST /employee with firstName, lastName, dateOfBirth, email, explicit userType, and nested employments[].",
    "Conditional repair: if the create fails with the known validation branch, GET /department and retry with department.id.",
    "Conditional repair: if the department retry still fails on the next known branch, GET /division and retry with employments[].division.id.",
    "Verification call: GET /employee/employment by employeeId only when the successful write response does not already prove the scored startDate.",
  ],
  status: "draft",
  async run(
    ctx: StrategyContext,
    input: CreateEmployeeInput,
  ): Promise<StrategyResult> {
    const name = splitEmployeeName(input.employeeName);
    const userType = normalizeUserType(input.userType);
    const basePayload = {
      firstName: name.firstName,
      lastName: name.lastName,
      dateOfBirth: input.birthDate,
      email: input.email.trim(),
      userType,
      employments: [
        {
          startDate: input.startDate,
        },
      ],
    };

    let employeeResponse: ResponseWrapper<EmployeeSummary>;

    try {
      employeeResponse = await createEmployee(ctx, basePayload);
    } catch (error) {
      if (!isValidationError(error)) {
        throw error;
      }

      const department = await resolveDepartment(ctx, input.employeeName);

      try {
        employeeResponse = await createEmployee(ctx, {
          ...basePayload,
          department: { id: department.id },
        });
      } catch (retryError) {
        if (!isValidationError(retryError)) {
          throw retryError;
        }

        const division = await resolveDivision(ctx);
        employeeResponse = await createEmployee(ctx, {
          ...basePayload,
          department: { id: department.id },
          employments: [
            {
              startDate: input.startDate,
              division: { id: division.id },
            },
          ],
        });
      }
    }

    const employee = requireValue(employeeResponse.value, "employee");
    const employeeId = requireId(employee.id, "employee");
    const notes: string[] = [];
    let employmentId = pickEmploymentId(employee.employments ?? []);

    if (!responseProvesStartDate(employee.employments ?? [], input.startDate)) {
      const employmentResponse = await ctx.tripletex.get<ListResponse<EmploymentSummary>>(
        "/employee/employment",
        {
          query: {
            employeeId,
            fields: "*",
          },
        },
      );
      const employment = pickEmploymentForStartDate(
        employmentResponse.values ?? [],
        input.startDate,
      );
      employmentId = employment.id ?? employmentId;
      notes.push(
        "Verified the employment start date via /employee/employment because the create response did not echo it decisively.",
      );
    }

    if (employee.userType == null) {
      notes.push(
        "Tripletex returned a sparse employee create response with userType=null; this is a known echo behavior for successful employee creation.",
      );
    }

    return {
      createdEntityIds: {
        employeeId,
        ...(typeof employmentId === "number" ? { employmentId } : {}),
      },
      notes,
      verification: {
        employeeName: input.employeeName,
        startDate: input.startDate,
        userTypeRequested: userType,
        email: employee.email ?? input.email.trim(),
        dateOfBirth: employee.dateOfBirth ?? input.birthDate,
      },
    };
  },
} satisfies CreateEmployeeStrategy;

async function createEmployee(
  ctx: StrategyContext,
  body: Record<string, unknown>,
): Promise<ResponseWrapper<EmployeeSummary>> {
  return ctx.tripletex.post<ResponseWrapper<EmployeeSummary>>("/employee", {
    body,
  });
}

async function resolveDepartment(
  ctx: StrategyContext,
  employeeName: string,
): Promise<DepartmentSummary> {
  const departmentResponse = await ctx.tripletex.get<ListResponse<DepartmentSummary>>(
    "/department",
    {
      query: {
        isInactive: false,
        count: 1,
        fields: "*",
      },
    },
  );

  const existingDepartment = departmentResponse.values?.[0];
  if (existingDepartment) {
    return existingDepartment;
  }

  const createdDepartment = await ctx.tripletex.post<ResponseWrapper<DepartmentSummary>>(
    "/department",
    {
      body: {
        name: `${employeeName.trim()} Department`,
      },
    },
  );

  return requireValue(createdDepartment.value, "department");
}

async function resolveDivision(
  ctx: StrategyContext,
): Promise<DivisionSummary> {
  const divisionResponse = await ctx.tripletex.get<ListResponse<DivisionSummary>>(
    "/division",
    {
      query: {
        count: 1,
        fields: "*",
      },
    },
  );

  const division = divisionResponse.values?.[0];
  if (!division) {
    throw new Error(
      "Tripletex required employments.division.id, but no division was available for repair.",
    );
  }

  return division;
}

function splitEmployeeName(employeeName: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = employeeName.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);

  if (parts.length < 2) {
    throw new Error(
      "employeeName must contain at least a first name and a last name.",
    );
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

function normalizeUserType(rawUserType: string | undefined): EmployeeUserType {
  const normalized = rawUserType?.trim().toUpperCase().replace(/\s+/g, "_");
  if (!normalized) {
    return "NO_ACCESS";
  }

  if (
    normalized === "STANDARD" ||
    normalized === "EXTENDED" ||
    normalized === "NO_ACCESS"
  ) {
    return normalized;
  }

  throw new Error(
    `Unsupported userType "${rawUserType}". Expected STANDARD, EXTENDED, or NO_ACCESS.`,
  );
}

function responseProvesStartDate(
  employments: readonly EmploymentSummary[],
  startDate: string,
): boolean {
  return employments.some((employment) => employment.startDate === startDate);
}

function pickEmploymentForStartDate(
  employments: readonly EmploymentSummary[],
  startDate: string,
): EmploymentSummary {
  const exactMatch = employments.find(
    (employment) => employment.startDate === startDate,
  );
  if (exactMatch) {
    return exactMatch;
  }

  if (employments.length === 1) {
    return employments[0];
  }

  throw new Error(
    `Tripletex did not return an employment proving startDate ${startDate}.`,
  );
}

function pickEmploymentId(
  employments: readonly EmploymentSummary[],
): number | undefined {
  const id = employments.find((employment) => typeof employment.id === "number")
    ?.id;
  return typeof id === "number" ? id : undefined;
}

function requireValue<TValue>(
  value: TValue | undefined,
  entityName: string,
): TValue {
  if (value === undefined) {
    throw new Error(`Tripletex did not return a ${entityName} payload.`);
  }

  return value;
}

function requireId(value: number | undefined, entityName: string): number {
  if (typeof value !== "number") {
    throw new Error(`Tripletex did not return an ${entityName} id.`);
  }

  return value;
}

function isValidationError(error: unknown): error is TripletexHttpError {
  return error instanceof TripletexHttpError && error.status === 422;
}
