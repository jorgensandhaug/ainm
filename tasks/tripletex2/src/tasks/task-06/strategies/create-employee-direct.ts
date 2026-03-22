import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import { TripletexHttpError } from "../../../runtime/tripletex-client";
import type { CreateEmployeeInput, CreateEmployeeStrategy } from "../task";
import { CREATE_EMPLOYEE_TASK_ID } from "../task";

/**
 * Production-proven 2-call path for fresh accounts, with a collapsed
 * single-step repair fallback that resolves department + division in
 * parallel before one retry.
 *
 * v1 used a sequential 3-level repair ladder (POST → GET dept → POST →
 * GET div → POST → verify = 6 calls in sandbox).  v2 collapses that
 * into (POST → GET dept + GET div → POST → verify = 5 calls max).
 */

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
  strategyId: "06.create-employee-direct.v2",
  strategyPath:
    "src/tasks/task-06/strategies/create-employee-direct.ts",
  taskId: CREATE_EMPLOYEE_TASK_ID,
  name: "Direct employee create with collapsed repair",
  summary:
    "Posts the employee directly; if the account requires department or division, resolves both in parallel and retries once. Verifies the scored start date through a single employment readback when the create response is sparse.",
  hypothesis:
    "The production-proven 2-call path (direct POST, employment readback) is optimal for fresh accounts. Collapsing the sequential repair ladder from v1 into a single parallel resolution + retry reduces worst-case calls from 6 to 5.",
  expectedCallProfile: {
    targetCalls: 2,
    maxCalls: 5,
  },
  stepOutline: [
    "API call 1: POST /employee with firstName, lastName, dateOfBirth, email, explicit userType, and nested employments[].",
    "If call 1 returns a generic 422: GET /department and GET /division in parallel (2 calls), then retry POST /employee with department.id and employments[].division.id (1 call).",
    "Verification: GET /employee/employment by employeeId when the create response does not prove the scored startDate.",
  ],
  status: "draft",
  async run(
    ctx: StrategyContext,
    input: CreateEmployeeInput,
  ): Promise<StrategyResult> {
    const normalizedEmployeeName = normalizeEmployeeName(input.employeeName);
    const normalizedBirthDate = normalizeIsoDate(input.birthDate, "birthDate");
    const normalizedEmail = normalizeEmail(input.email);
    const normalizedStartDate = normalizeIsoDate(input.startDate, "startDate");
    const name = splitEmployeeName(normalizedEmployeeName);
    const userType = normalizeUserType(input.userType);

    const basePayload = {
      firstName: name.firstName,
      lastName: name.lastName,
      dateOfBirth: normalizedBirthDate,
      email: normalizedEmail,
      userType,
      employments: [
        {
          startDate: normalizedStartDate,
        },
      ],
    };

    let employeeResponse: ResponseWrapper<EmployeeSummary>;

    try {
      employeeResponse = await createEmployee(ctx, basePayload);
    } catch (error) {
      if (!isRepairableValidationError(error)) {
        throw error;
      }

      const [department, division] = await resolvePrerequisites(ctx, normalizedEmployeeName);

      employeeResponse = await createEmployee(ctx, {
        ...basePayload,
        ...(department ? { department: { id: department.id } } : {}),
        employments: [
          {
            startDate: normalizedStartDate,
            ...(division ? { division: { id: division.id } } : {}),
          },
        ],
      });
    }

    const employee = requireValue(employeeResponse.value, "employee");
    const employeeId = requireId(employee.id, "employee");
    const notes: string[] = [];
    let employmentId = pickEmploymentId(employee.employments ?? []);

    if (
      !responseProvesStartDate(
        employee.employments ?? [],
        normalizedStartDate,
      )
    ) {
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
        normalizedStartDate,
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
        employeeName: normalizedEmployeeName,
        firstName: name.firstName,
        lastName: name.lastName,
        startDate: normalizedStartDate,
        userTypeRequested: userType,
        email: employee.email ?? normalizedEmail,
        dateOfBirth: employee.dateOfBirth ?? normalizedBirthDate,
      },
    };
  },
} satisfies CreateEmployeeStrategy;

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function createEmployee(
  ctx: StrategyContext,
  body: Record<string, unknown>,
): Promise<ResponseWrapper<EmployeeSummary>> {
  return ctx.tripletex.post<ResponseWrapper<EmployeeSummary>>("/employee", {
    body,
  });
}

/**
 * Resolves department and division in parallel.
 * Returns [department | null, division | null].
 */
async function resolvePrerequisites(
  ctx: StrategyContext,
  employeeName: string,
): Promise<[DepartmentSummary | null, DivisionSummary | null]> {
  const [departmentResult, divisionResult] = await Promise.all([
    resolveDepartment(ctx, employeeName),
    resolveDivision(ctx),
  ]);

  return [departmentResult, divisionResult];
}

async function resolveDepartment(
  ctx: StrategyContext,
  employeeName: string,
): Promise<DepartmentSummary | null> {
  const response = await ctx.tripletex.get<ListResponse<DepartmentSummary>>(
    "/department",
    {
      query: {
        isInactive: false,
        count: 1,
        fields: "*",
      },
    },
  );

  const existing = response.values?.[0];
  if (existing) {
    return existing;
  }

  const created = await ctx.tripletex.post<ResponseWrapper<DepartmentSummary>>(
    "/department",
    {
      body: {
        name: `${employeeName.trim()} Department`,
      },
    },
  );

  return created.value ?? null;
}

async function resolveDivision(
  ctx: StrategyContext,
): Promise<DivisionSummary | null> {
  const response = await ctx.tripletex.get<ListResponse<DivisionSummary>>(
    "/division",
    {
      query: {
        count: 1,
        fields: "*",
      },
    },
  );

  return response.values?.[0] ?? null;
}

// ---------------------------------------------------------------------------
// Validation and normalization
// ---------------------------------------------------------------------------

function splitEmployeeName(employeeName: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = normalizeEmployeeName(employeeName);
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

function normalizeEmployeeName(value: string): string {
  const normalized = stripWrappingQuotes(value).trim().replace(/\s+/g, " ");
  if (normalized.length === 0) {
    throw new Error("employeeName must be a non-empty string.");
  }

  return normalized;
}

function normalizeEmail(value: string): string {
  let normalized = stripWrappingQuotes(value).trim();
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

function formatIsoDate(
  year: number,
  month: number,
  day: number,
  fieldName: string,
): string {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error(`${fieldName} must contain numeric date parts.`);
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new Error(`${fieldName} must be a valid calendar date.`);
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function foldNaturalLanguageDate(value: string): string {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(\d{1,2})(st|nd|rd|th)\b/g, "$1")
    .replace(/\bde\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lookupMonth(token: string, fieldName: string): number {
  const month = NATURAL_LANGUAGE_MONTHS[token];
  if (typeof month !== "number") {
    throw new Error(`${fieldName} includes an unsupported month name "${token}".`);
  }

  return month;
}

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return trimmed;
  }

  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if (
    (first === `"` && last === `"`) ||
    (first === `'` && last === `'`)
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Error discrimination
// ---------------------------------------------------------------------------

function isRepairableValidationError(
  error: unknown,
): error is TripletexHttpError {
  if (!(error instanceof TripletexHttpError) || error.status !== 422) {
    return false;
  }

  return !hasInputFieldValidationHint(error.message);
}

function hasInputFieldValidationHint(message: string): boolean {
  const hint = stripDiacritics(message).toLowerCase();
  return INPUT_FIELD_ERROR_HINTS.some((fieldHint) => hint.includes(fieldHint));
}

const INPUT_FIELD_ERROR_HINTS = [
  "dateofbirth",
  "birthdate",
  "startdate",
  "email",
  "firstname",
  "lastname",
  "fornavn",
  "etternavn",
  "epost",
  "e-post",
  "fodselsdato",
  "employments.startdate",
];

// ---------------------------------------------------------------------------
// Month name lookup (multilingual)
// ---------------------------------------------------------------------------

const NATURAL_LANGUAGE_MONTHS: Readonly<Record<string, number>> = {
  jan: 1,
  januar: 1,
  january: 1,
  janeiro: 1,
  enero: 1,
  feb: 2,
  februar: 2,
  february: 2,
  fevereiro: 2,
  febrero: 2,
  mar: 3,
  mars: 3,
  march: 3,
  marco: 3,
  marzo: 3,
  apr: 4,
  april: 4,
  abr: 4,
  abril: 4,
  mai: 5,
  may: 5,
  maio: 5,
  mayo: 5,
  jun: 6,
  juni: 6,
  june: 6,
  junho: 6,
  junio: 6,
  jul: 7,
  juli: 7,
  july: 7,
  julho: 7,
  julio: 7,
  aug: 8,
  august: 8,
  agosto: 8,
  sep: 9,
  sept: 9,
  september: 9,
  septiembre: 9,
  setembro: 9,
  okt: 10,
  oct: 10,
  october: 10,
  octubre: 10,
  outubro: 10,
  nov: 11,
  november: 11,
  noviembre: 11,
  novembro: 11,
  des: 12,
  dec: 12,
  december: 12,
  diciembre: 12,
  dezembro: 12,
};
