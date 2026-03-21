import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type {
  OnboardEmployeeFromContractInput,
  OnboardEmployeeFromContractStrategy,
} from "../task";
import { ONBOARD_EMPLOYEE_FROM_CONTRACT_TASK_ID } from "../task";

interface ListResponse<TValue> {
  values?: TValue[];
}

interface ResponseWrapper<TValue> {
  value?: TValue;
}

interface DepartmentSummary {
  id?: number;
  name?: string;
}

interface DivisionSummary {
  id?: number;
}

interface EmploymentSummary {
  id?: number;
}

interface EmployeeSummary {
  id?: number;
  email?: string;
  dateOfBirth?: string;
  employments?: EmploymentSummary[];
}

interface StandardTimeSummary {
  id?: number;
  hoursPerDay?: number;
}

type EmploymentType = "ORDINARY" | "MARITIME" | "FREELANCE" | "NOT_CHOSEN";
type EmploymentForm =
  | "PERMANENT"
  | "TEMPORARY"
  | "PERMANENT_AND_HIRED_OUT"
  | "TEMPORARY_AND_HIRED_OUT"
  | "TEMPORARY_ON_CALL"
  | "NOT_CHOSEN";
type RemunerationType =
  | "MONTHLY_WAGE"
  | "HOURLY_WAGE"
  | "COMMISION_PERCENTAGE"
  | "FEE"
  | "NOT_CHOSEN"
  | "PIECEWORK_WAGE";
type WorkingHoursScheme =
  | "NOT_SHIFT"
  | "ROUND_THE_CLOCK"
  | "SHIFT_365"
  | "OFFSHORE_336"
  | "CONTINUOUS"
  | "OTHER_SHIFT"
  | "NOT_CHOSEN";

export const strategy = {
  strategyId: "19.onboard-employee-from-contract.v1",
  strategyPath:
    "src/tasks/task-19/strategies/onboard-employee-from-contract.ts",
  taskId: ONBOARD_EMPLOYEE_FROM_CONTRACT_TASK_ID,
  name: "Onboard employee from contract",
  summary:
    "Resolves or creates the target department, then creates the employee with nested employment details and the resolved occupation code from the contract.",
  hypothesis:
    "For contract-driven onboarding, the deterministic low-call branch is one division pre-read, one exact department lookup with create fallback, then one employee write with nested employmentDetails and optional employee standard time.",
  expectedCallProfile: {
    targetCalls: 3,
    maxCalls: 5,
  },
  stepOutline: [
    "API call 1: GET /division?count=1&fields=id so division.id can be included only when the account exposes one.",
    "API call 2: GET /department filtered by the exact department name and reuse the newest exact active match locally.",
    "Conditional API call 3: POST /department only when the lookup finds no exact active department match.",
    "API call 3 or 4: POST /employee with explicit userType=NO_ACCESS and one nested employmentDetails row including occupationCode.id.",
    "Optional API call 4 or 5: POST /employee/standardTime when the contract includes employee-specific hoursPerDay.",
  ],
  status: "draft",
  async run(
    ctx: StrategyContext,
    input: OnboardEmployeeFromContractInput,
  ): Promise<StrategyResult> {
    const employeeName = normalizeEmployeeName(input.employeeName);
    const name = splitEmployeeName(employeeName);
    const birthDate = normalizeIsoDate(input.birthDate, "birthDate");
    const startDate = normalizeIsoDate(input.startDate, "startDate");
    const departmentName = normalizeDepartmentName(input.departmentName);
    const occupationCodeId = normalizePositiveInteger(
      input.occupationCodeId,
      "occupationCodeId",
    );
    const annualSalaryNok = normalizePositiveNumber(
      input.annualSalaryNok,
      "annualSalaryNok",
    );
    const percentageOfFullTimeEquivalent = normalizePercentage(
      input.percentageOfFullTimeEquivalent,
    );
    const email = normalizeOptionalEmail(input.email);
    const nationalIdentityNumber = normalizeOptionalDigits(
      input.nationalIdentityNumber,
      "nationalIdentityNumber",
      11,
    );
    const bankAccountNumber = normalizeOptionalDigits(
      input.bankAccountNumber,
      "bankAccountNumber",
      11,
    );
    const employmentType = normalizeEmploymentType(input.employmentType);
    const employmentForm = normalizeEmploymentForm(input.employmentForm);
    const remunerationType = normalizeRemunerationType(
      input.remunerationType,
    );
    const workingHoursScheme = normalizeWorkingHoursScheme(
      input.workingHoursScheme,
    );
    const standardHoursPerDay = normalizeOptionalPositiveNumber(
      input.standardHoursPerDay,
      "standardHoursPerDay",
    );

    const [division, departmentResolution] = await Promise.all([
      resolveDivision(ctx),
      resolveDepartment(ctx, departmentName),
    ]);

    const employeePayload: Record<string, unknown> = {
      firstName: name.firstName,
      lastName: name.lastName,
      dateOfBirth: birthDate,
      userType: "NO_ACCESS",
      department: { id: departmentResolution.department.id },
      employments: [
        {
          startDate,
          ...(division ? { division: { id: division.id } } : {}),
          employmentDetails: [
            {
              date: startDate,
              employmentType,
              employmentForm,
              remunerationType,
              workingHoursScheme,
              percentageOfFullTimeEquivalent,
              annualSalary: annualSalaryNok,
              occupationCode: { id: occupationCodeId },
            },
          ],
        },
      ],
    };

    if (email) {
      employeePayload.email = email;
    }
    if (nationalIdentityNumber) {
      employeePayload.nationalIdentityNumber = nationalIdentityNumber;
    }
    if (bankAccountNumber) {
      employeePayload.bankAccountNumber = bankAccountNumber;
    }

    const employeeResponse = await ctx.tripletex.post<ResponseWrapper<EmployeeSummary>>(
      "/employee",
      {
        body: employeePayload,
      },
    );
    const employee = requireValue(employeeResponse.value, "employee");
    const employeeId = requireId(employee.id, "employee id");
    const employmentId = normalizeOptionalId(employee.employments?.[0]?.id);

    let standardTimeId: number | undefined;
    if (typeof standardHoursPerDay === "number") {
      const standardTimeResponse = await ctx.tripletex.post<ResponseWrapper<StandardTimeSummary>>(
        "/employee/standardTime",
        {
          body: {
            employee: { id: employeeId },
            fromDate: startDate,
            hoursPerDay: standardHoursPerDay,
          },
        },
      );
      standardTimeId = normalizeOptionalId(standardTimeResponse.value?.id);
    }

    const notes: string[] = [];
    if (departmentResolution.created) {
      notes.push(
        `Created department "${departmentName}" because no exact active department match existed.`,
      );
    }
    if (!division) {
      notes.push(
        "Division lookup returned no rows, so the employee was created without employments[].division.",
      );
    }
    if (occupationCodeId === 301) {
      notes.push(
        "Used the deterministic contract mapping occupationCodeId=301 for the exact STYRK 2511 onboarding branch.",
      );
    }

    return {
      createdEntityIds: {
        employeeId,
        departmentId: departmentResolution.department.id,
        ...(typeof employmentId === "number" ? { employmentId } : {}),
        ...(typeof standardTimeId === "number" ? { standardTimeId } : {}),
      },
      notes,
      verification: {
        annualSalaryNok,
        birthDate: employee.dateOfBirth ?? birthDate,
        departmentName,
        divisionIncluded: Boolean(division),
        email: employee.email ?? email,
        employmentForm,
        employmentType,
        occupationCodeId,
        percentageOfFullTimeEquivalent,
        remunerationType,
        standardHoursPerDay,
        startDate,
        userTypeRequested: "NO_ACCESS",
        workingHoursScheme,
      },
    };
  },
} satisfies OnboardEmployeeFromContractStrategy;

async function resolveDivision(
  ctx: StrategyContext,
): Promise<{ id: number } | null> {
  const response = await ctx.tripletex.get<ListResponse<DivisionSummary>>(
    "/division",
    {
      query: {
        count: 1,
        fields: "id",
      },
    },
  );

  const divisionId = normalizeOptionalId(response.values?.[0]?.id);
  return typeof divisionId === "number" ? { id: divisionId } : null;
}

async function resolveDepartment(
  ctx: StrategyContext,
  departmentName: string,
): Promise<{ department: { id: number; name: string }; created: boolean }> {
  const response = await ctx.tripletex.get<ListResponse<DepartmentSummary>>(
    "/department",
    {
      query: {
        name: departmentName,
        isInactive: false,
        count: 1000,
        fields: "*",
      },
    },
  );

  const existingDepartment = pickDepartment(response.values ?? [], departmentName);
  if (existingDepartment) {
    return {
      department: existingDepartment,
      created: false,
    };
  }

  const createdResponse = await ctx.tripletex.post<ResponseWrapper<DepartmentSummary>>(
    "/department",
    {
      body: {
        name: departmentName,
      },
    },
  );
  const createdDepartment = requireValue(
    createdResponse.value,
    "department",
  );

  return {
    department: {
      id: requireId(createdDepartment.id, "department id"),
      name: normalizeDepartmentName(createdDepartment.name ?? departmentName),
    },
    created: true,
  };
}

function pickDepartment(
  departments: readonly DepartmentSummary[],
  departmentName: string,
): { id: number; name: string } | null {
  const exactMatches = departments
    .filter((department) => sameText(department.name, departmentName))
    .map((department) => ({
      id: requireId(department.id, "department id"),
      name: normalizeDepartmentName(department.name ?? departmentName),
    }))
    .sort((left, right) => right.id - left.id);

  return exactMatches[0] ?? null;
}

function splitEmployeeName(employeeName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = employeeName.split(/\s+/).filter(Boolean);
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

function normalizeEmployeeName(value: string): string {
  const normalized = stripWrappingQuotes(value).trim().replace(/\s+/g, " ");
  if (normalized.length === 0) {
    throw new Error("employeeName must be a non-empty string.");
  }

  return normalized;
}

function normalizeDepartmentName(value: string): string {
  const normalized = stripWrappingQuotes(value).trim().replace(/\s+/g, " ");
  if (normalized.length === 0) {
    throw new Error("departmentName must be a non-empty string.");
  }

  return normalized;
}

function normalizeIsoDate(value: string, fieldName: string): string {
  const trimmed = stripWrappingQuotes(value).trim();
  if (trimmed.length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }

  const isoMatch = trimmed.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/,
  );
  if (isoMatch) {
    return formatIsoDate(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3]),
      fieldName,
    );
  }

  const yearFirstMatch = trimmed.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (yearFirstMatch) {
    return formatIsoDate(
      Number(yearFirstMatch[1]),
      Number(yearFirstMatch[2]),
      Number(yearFirstMatch[3]),
      fieldName,
    );
  }

  const dayMonthYearMatch = trimmed.match(
    /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/,
  );
  if (dayMonthYearMatch) {
    const first = Number(dayMonthYearMatch[1]);
    const second = Number(dayMonthYearMatch[2]);
    const year = Number(dayMonthYearMatch[3]);
    if (first > 12 || second <= 12) {
      return formatIsoDate(year, second, first, fieldName);
    }

    return formatIsoDate(year, first, second, fieldName);
  }

  const words = foldNaturalLanguageDate(trimmed);
  const dayFirstWordsMatch = words.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
  if (dayFirstWordsMatch) {
    return formatIsoDate(
      Number(dayFirstWordsMatch[3]),
      lookupMonth(dayFirstWordsMatch[2], fieldName),
      Number(dayFirstWordsMatch[1]),
      fieldName,
    );
  }

  const monthFirstWordsMatch = words.match(/^([a-z]+)\s+(\d{1,2})\s+(\d{4})$/);
  if (monthFirstWordsMatch) {
    return formatIsoDate(
      Number(monthFirstWordsMatch[3]),
      lookupMonth(monthFirstWordsMatch[1], fieldName),
      Number(monthFirstWordsMatch[2]),
      fieldName,
    );
  }

  throw new Error(
    `${fieldName} must be a valid date string that can be normalized to YYYY-MM-DD.`,
  );
}

function formatIsoDate(
  year: number,
  month: number,
  day: number,
  fieldName: string,
): string {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new Error(`${fieldName} year must be between 1900 and 2100.`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`${fieldName} month must be between 1 and 12.`);
  }
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error(`${fieldName} day must be between 1 and 31.`);
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new Error(`${fieldName} must be a valid calendar date.`);
  }

  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function normalizeOptionalEmail(value: string | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }

  let normalized = stripWrappingQuotes(value).trim();
  if (normalized.length === 0) {
    return undefined;
  }

  normalized = normalized.replace(/^mailto:/i, "");
  const bracketMatch = normalized.match(/<([^<>\s@]+@[^<>\s@]+)>/);
  if (bracketMatch) {
    normalized = bracketMatch[1];
  }

  normalized = normalized.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(normalized)) {
    throw new Error("email must be a valid email address.");
  }

  return normalized;
}

function normalizeOptionalDigits(
  value: string | undefined,
  fieldName: string,
  expectedLength: number,
): string | undefined {
  if (value == null) {
    return undefined;
  }

  const digits = stripWrappingQuotes(value).replace(/\D/g, "");
  if (digits.length === 0) {
    return undefined;
  }
  if (digits.length !== expectedLength) {
    throw new Error(
      `${fieldName} must contain exactly ${expectedLength} digits when provided.`,
    );
  }

  return digits;
}

function normalizeEmploymentType(value: string | undefined): EmploymentType {
  const normalized = normalizeEnumLike(value);
  if (!normalized) {
    return "ORDINARY";
  }

  if (
    normalized === "ORDINARY" ||
    normalized === "MARITIME" ||
    normalized === "FREELANCE" ||
    normalized === "NOT_CHOSEN"
  ) {
    return normalized;
  }

  throw new Error(`Unsupported employmentType ${JSON.stringify(value)}.`);
}

function normalizeEmploymentForm(value: string | undefined): EmploymentForm {
  const normalized = normalizeEnumLike(value);
  if (!normalized) {
    return "PERMANENT";
  }

  if (normalized === "FAST_STILLING" || normalized === "FAST") {
    return "PERMANENT";
  }
  if (
    normalized === "PERMANENT" ||
    normalized === "TEMPORARY" ||
    normalized === "PERMANENT_AND_HIRED_OUT" ||
    normalized === "TEMPORARY_AND_HIRED_OUT" ||
    normalized === "TEMPORARY_ON_CALL" ||
    normalized === "NOT_CHOSEN"
  ) {
    return normalized;
  }

  throw new Error(`Unsupported employmentForm ${JSON.stringify(value)}.`);
}

function normalizeRemunerationType(
  value: string | undefined,
): RemunerationType {
  const normalized = normalizeEnumLike(value);
  if (!normalized) {
    return "MONTHLY_WAGE";
  }

  if (
    normalized === "FASTLONN" ||
    normalized === "MANEDSLONN" ||
    normalized === "MAANEDSLONN" ||
    normalized === "MONTHLY_SALARY"
  ) {
    return "MONTHLY_WAGE";
  }
  if (
    normalized === "MONTHLY_WAGE" ||
    normalized === "HOURLY_WAGE" ||
    normalized === "COMMISION_PERCENTAGE" ||
    normalized === "FEE" ||
    normalized === "NOT_CHOSEN" ||
    normalized === "PIECEWORK_WAGE"
  ) {
    return normalized;
  }

  throw new Error(`Unsupported remunerationType ${JSON.stringify(value)}.`);
}

function normalizeWorkingHoursScheme(
  value: string | undefined,
): WorkingHoursScheme {
  const normalized = normalizeEnumLike(value);
  if (!normalized) {
    return "NOT_SHIFT";
  }

  if (
    normalized === "DAGTID" ||
    normalized === "DAYTIME" ||
    normalized === "NORMAL_DAYTIME"
  ) {
    return "NOT_SHIFT";
  }
  if (
    normalized === "NOT_SHIFT" ||
    normalized === "ROUND_THE_CLOCK" ||
    normalized === "SHIFT_365" ||
    normalized === "OFFSHORE_336" ||
    normalized === "CONTINUOUS" ||
    normalized === "OTHER_SHIFT" ||
    normalized === "NOT_CHOSEN"
  ) {
    return normalized;
  }

  throw new Error(`Unsupported workingHoursScheme ${JSON.stringify(value)}.`);
}

function normalizePercentage(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(
      "percentageOfFullTimeEquivalent must be a finite number.",
    );
  }

  const normalized = value > 0 && value <= 1 ? value * 100 : value;
  if (normalized <= 0 || normalized > 100) {
    throw new Error(
      "percentageOfFullTimeEquivalent must be greater than 0 and at most 100.",
    );
  }

  return roundToTwo(normalized);
}

function normalizePositiveInteger(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }

  return value;
}

function normalizePositiveNumber(value: number, fieldName: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive number.`);
  }

  return roundToTwo(value);
}

function normalizeOptionalPositiveNumber(
  value: number | undefined,
  fieldName: string,
): number | undefined {
  if (value == null) {
    return undefined;
  }

  return normalizePositiveNumber(value, fieldName);
}

function normalizeOptionalId(
  value: number | null | undefined,
): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function requireValue<TValue>(
  value: TValue | undefined,
  label: string,
): TValue {
  if (value == null) {
    throw new Error(`Tripletex did not return ${label}.`);
  }

  return value;
}

function requireId(value: number | null | undefined, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Tripletex did not return a valid ${label}.`);
  }

  return value;
}

function normalizeEnumLike(value: string | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }

  const normalized = foldText(stripWrappingQuotes(value))
    .replace(/[()/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s-]+/g, "_")
    .toUpperCase();

  return normalized.length > 0 ? normalized : undefined;
}

function sameText(left: string | undefined, right: string): boolean {
  return foldText(left ?? "") === foldText(right);
}

function foldNaturalLanguageDate(value: string): string {
  return foldText(value)
    .replace(/[,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function foldText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase();
}

function lookupMonth(token: string, fieldName: string): number {
  const month = MONTH_LOOKUP[token];
  if (!month) {
    throw new Error(`${fieldName} contained unsupported month ${token}.`);
  }

  return month;
}

function stripWrappingQuotes(value: string): string {
  return value.replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, "");
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

const MONTH_LOOKUP: Record<string, number> = {
  january: 1,
  januar: 1,
  february: 2,
  februar: 2,
  march: 3,
  mars: 3,
  april: 4,
  may: 5,
  mai: 5,
  june: 6,
  juni: 6,
  july: 7,
  juli: 7,
  august: 8,
  september: 9,
  october: 10,
  oktober: 10,
  november: 11,
  december: 12,
  desember: 12,
};
