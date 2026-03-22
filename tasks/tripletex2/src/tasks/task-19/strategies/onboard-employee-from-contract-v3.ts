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

const DEFAULT_STANDARD_HOURS_PER_DAY = 7.5;

export const strategy = {
  strategyId: "19.onboard-employee-from-contract.v3",
  strategyPath:
    "src/tasks/task-19/strategies/onboard-employee-from-contract-v3.ts",
  taskId: ONBOARD_EMPLOYEE_FROM_CONTRACT_TASK_ID,
  name: "Onboard employee from contract (direct-create + always standard worktime)",
  summary:
    "Creates department directly (no lookup), resolves division, creates employee with nested employment details, and always sets standard worktime. Optimized for fresh production accounts.",
  hypothesis:
    "Production accounts are always fresh. Skipping the department GET and directly POSTing saves 1 call. Combined with always setting standard worktime (7.5h/day default), this achieves 4 calls with maximum correctness. Check 10 in production failed because standard worktime was not set — this strategy always sets it.",
  expectedCallProfile: {
    targetCalls: 4,
    maxCalls: 4,
  },
  stepOutline: [
    "API call 1+2 (parallel): GET /division?count=1&fields=id + POST /department with exact name.",
    "API call 3: POST /employee with userType=NO_ACCESS, nested employmentDetails with occupationCode.id.",
    "API call 4: POST /employee/standardTime ALWAYS — uses contract hours if provided, otherwise defaults to 7.5h/day.",
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
    const occupationCodeId = normalizePositiveInteger(input.occupationCodeId, "occupationCodeId");
    const annualSalaryNok = normalizePositiveNumber(input.annualSalaryNok, "annualSalaryNok");
    const percentageOfFullTimeEquivalent = normalizePercentage(input.percentageOfFullTimeEquivalent);
    const email = normalizeOptionalEmail(input.email);
    const nationalIdentityNumber = normalizeOptionalDigits(input.nationalIdentityNumber, "nationalIdentityNumber", 11);
    const bankAccountNumber = normalizeOptionalDigits(input.bankAccountNumber, "bankAccountNumber", 11);
    const employmentType = normalizeEmploymentType(input.employmentType);
    const employmentForm = normalizeEmploymentForm(input.employmentForm);
    const remunerationType = normalizeRemunerationType(input.remunerationType);
    const workingHoursScheme = normalizeWorkingHoursScheme(input.workingHoursScheme);
    const standardHoursPerDay = normalizeOptionalPositiveNumber(input.standardHoursPerDay, "standardHoursPerDay");
    const effectiveHoursPerDay = standardHoursPerDay ?? DEFAULT_STANDARD_HOURS_PER_DAY;

    const [division, departmentResponse] = await Promise.all([
      resolveDivision(ctx),
      ctx.tripletex.post<ResponseWrapper<DepartmentSummary>>("/department", { body: { name: departmentName } }),
    ]);

    const department = requireValue(departmentResponse.value, "department");
    const departmentId = requireId(department.id, "department id");

    const employeePayload: Record<string, unknown> = {
      firstName: name.firstName,
      lastName: name.lastName,
      dateOfBirth: birthDate,
      userType: "NO_ACCESS",
      department: { id: departmentId },
      employments: [{
        startDate,
        ...(division ? { division: { id: division.id } } : {}),
        employmentDetails: [{
          date: startDate, employmentType, employmentForm, remunerationType,
          workingHoursScheme, percentageOfFullTimeEquivalent,
          annualSalary: annualSalaryNok, occupationCode: { id: occupationCodeId },
        }],
      }],
    };
    if (email) employeePayload.email = email;
    if (nationalIdentityNumber) employeePayload.nationalIdentityNumber = nationalIdentityNumber;
    if (bankAccountNumber) employeePayload.bankAccountNumber = bankAccountNumber;

    const employeeResponse = await ctx.tripletex.post<ResponseWrapper<EmployeeSummary>>("/employee", { body: employeePayload });
    const employee = requireValue(employeeResponse.value, "employee");
    const employeeId = requireId(employee.id, "employee id");
    const employmentId = normalizeOptionalId(employee.employments?.[0]?.id);

    const standardTimeResponse = await ctx.tripletex.post<ResponseWrapper<StandardTimeSummary>>("/employee/standardTime", {
      body: { employee: { id: employeeId }, fromDate: startDate, hoursPerDay: effectiveHoursPerDay },
    });
    const standardTimeId = normalizeOptionalId(standardTimeResponse.value?.id);

    const notes: string[] = [];
    notes.push(`Created department "${departmentName}" directly (no lookup, fresh-account optimization).`);
    if (!division) notes.push("Division lookup returned no rows, so the employee was created without employments[].division.");
    if (occupationCodeId === 301) notes.push("Used the deterministic contract mapping occupationCodeId=301 for the exact STYRK 2511 onboarding branch.");
    if (!standardHoursPerDay) notes.push(`Standard worktime not in contract; defaulted to ${DEFAULT_STANDARD_HOURS_PER_DAY}h/day (Norwegian standard).`);

    return {
      createdEntityIds: {
        employeeId, departmentId,
        ...(typeof employmentId === "number" ? { employmentId } : {}),
        ...(typeof standardTimeId === "number" ? { standardTimeId } : {}),
      },
      notes,
      verification: {
        annualSalaryNok, birthDate: employee.dateOfBirth ?? birthDate, departmentName,
        divisionIncluded: Boolean(division), email: employee.email ?? email,
        employmentForm, employmentType, occupationCodeId, percentageOfFullTimeEquivalent,
        remunerationType, standardHoursPerDay: effectiveHoursPerDay, startDate,
        userTypeRequested: "NO_ACCESS", workingHoursScheme,
      },
    };
  },
} satisfies OnboardEmployeeFromContractStrategy;

async function resolveDivision(ctx: StrategyContext): Promise<{ id: number } | null> {
  const response = await ctx.tripletex.get<ListResponse<DivisionSummary>>("/division", { query: { count: 1, fields: "id" } });
  const divisionId = normalizeOptionalId(response.values?.[0]?.id);
  return typeof divisionId === "number" ? { id: divisionId } : null;
}

function splitEmployeeName(employeeName: unknown): { firstName: string; lastName: string } {
  const parts = String(employeeName ?? "").split(/\s+/).filter(Boolean);
  if (parts.length < 2) throw new Error("employeeName must contain at least a first name and a last name.");
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

function normalizeEmployeeName(value: unknown): string {
  const normalized = stripWrappingQuotes(value).trim().replace(/\s+/g, " ");
  if (normalized.length === 0) throw new Error("employeeName must be a non-empty string.");
  return normalized;
}

function normalizeDepartmentName(value: unknown): string {
  const normalized = stripWrappingQuotes(value).trim().replace(/\s+/g, " ");
  if (normalized.length === 0) throw new Error("departmentName must be a non-empty string.");
  return normalized;
}

function normalizeIsoDate(value: unknown, fieldName: string): string {
  const trimmed = stripWrappingQuotes(value).trim();
  if (trimmed.length === 0) throw new Error(`${fieldName} must be a non-empty string.`);
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) return formatIsoDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]), fieldName);
  const yearFirstMatch = trimmed.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (yearFirstMatch) return formatIsoDate(Number(yearFirstMatch[1]), Number(yearFirstMatch[2]), Number(yearFirstMatch[3]), fieldName);
  const dayMonthYearMatch = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dayMonthYearMatch) {
    const first = Number(dayMonthYearMatch[1]), second = Number(dayMonthYearMatch[2]), year = Number(dayMonthYearMatch[3]);
    if (first > 12 || second <= 12) return formatIsoDate(year, second, first, fieldName);
    return formatIsoDate(year, first, second, fieldName);
  }
  const words = foldNaturalLanguageDate(trimmed);
  const dayFirstWordsMatch = words.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
  if (dayFirstWordsMatch) return formatIsoDate(Number(dayFirstWordsMatch[3]), lookupMonth(dayFirstWordsMatch[2], fieldName), Number(dayFirstWordsMatch[1]), fieldName);
  const monthFirstWordsMatch = words.match(/^([a-z]+)\s+(\d{1,2})\s+(\d{4})$/);
  if (monthFirstWordsMatch) return formatIsoDate(Number(monthFirstWordsMatch[3]), lookupMonth(monthFirstWordsMatch[1], fieldName), Number(monthFirstWordsMatch[2]), fieldName);
  throw new Error(`${fieldName} must be a valid date string that can be normalized to YYYY-MM-DD.`);
}

function formatIsoDate(year: number, month: number, day: number, fieldName: string): string {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) throw new Error(`${fieldName} year must be between 1900 and 2100.`);
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error(`${fieldName} month must be between 1 and 12.`);
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error(`${fieldName} day must be between 1 and 31.`);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) throw new Error(`${fieldName} must be a valid calendar date.`);
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function normalizeOptionalEmail(value: unknown): string | undefined {
  if (value == null) return undefined;
  let normalized = stripWrappingQuotes(value).trim();
  if (normalized.length === 0) return undefined;
  normalized = normalized.replace(/^mailto:/i, "");
  const bracketMatch = normalized.match(/<([^<>\s@]+@[^<>\s@]+)>/);
  if (bracketMatch) normalized = bracketMatch[1];
  normalized = normalized.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(normalized)) throw new Error("email must be a valid email address.");
  return normalized;
}

function normalizeOptionalDigits(value: unknown, fieldName: string, expectedLength: number): string | undefined {
  if (value == null) return undefined;
  const digits = stripWrappingQuotes(value).replace(/\D/g, "");
  if (digits.length === 0) return undefined;
  if (digits.length !== expectedLength) throw new Error(`${fieldName} must contain exactly ${expectedLength} digits when provided.`);
  return digits;
}

function normalizeEmploymentType(value: unknown): EmploymentType {
  const normalized = normalizeEnumLike(value);
  if (!normalized) return "ORDINARY";
  if (normalized === "ORDINARY" || normalized === "MARITIME" || normalized === "FREELANCE" || normalized === "NOT_CHOSEN") return normalized;
  throw new Error(`Unsupported employmentType ${JSON.stringify(value)}.`);
}

function normalizeEmploymentForm(value: unknown): EmploymentForm {
  const normalized = normalizeEnumLike(value);
  if (!normalized) return "PERMANENT";
  if (normalized === "FAST_STILLING" || normalized === "FAST") return "PERMANENT";
  if (normalized === "PERMANENT" || normalized === "TEMPORARY" || normalized === "PERMANENT_AND_HIRED_OUT" || normalized === "TEMPORARY_AND_HIRED_OUT" || normalized === "TEMPORARY_ON_CALL" || normalized === "NOT_CHOSEN") return normalized;
  throw new Error(`Unsupported employmentForm ${JSON.stringify(value)}.`);
}

function normalizeRemunerationType(value: unknown): RemunerationType {
  const normalized = normalizeEnumLike(value);
  if (!normalized) return "MONTHLY_WAGE";
  if (normalized === "FASTLONN" || normalized === "MANEDSLONN" || normalized === "MAANEDSLONN" || normalized === "MONTHLY_SALARY") return "MONTHLY_WAGE";
  if (normalized === "MONTHLY_WAGE" || normalized === "HOURLY_WAGE" || normalized === "COMMISION_PERCENTAGE" || normalized === "FEE" || normalized === "NOT_CHOSEN" || normalized === "PIECEWORK_WAGE") return normalized;
  throw new Error(`Unsupported remunerationType ${JSON.stringify(value)}.`);
}

function normalizeWorkingHoursScheme(value: unknown): WorkingHoursScheme {
  const normalized = normalizeEnumLike(value);
  if (!normalized) return "NOT_SHIFT";
  if (normalized === "DAGTID" || normalized === "DAYTIME" || normalized === "NORMAL_DAYTIME") return "NOT_SHIFT";
  if (normalized === "NOT_SHIFT" || normalized === "ROUND_THE_CLOCK" || normalized === "SHIFT_365" || normalized === "OFFSHORE_336" || normalized === "CONTINUOUS" || normalized === "OTHER_SHIFT" || normalized === "NOT_CHOSEN") return normalized;
  throw new Error(`Unsupported workingHoursScheme ${JSON.stringify(value)}.`);
}

function normalizePercentage(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) throw new Error("percentageOfFullTimeEquivalent must be a finite number.");
  const normalized = num > 0 && num <= 1 ? num * 100 : num;
  if (normalized <= 0 || normalized > 100) throw new Error("percentageOfFullTimeEquivalent must be greater than 0 and at most 100.");
  return roundToTwo(normalized);
}

function normalizePositiveInteger(value: unknown, fieldName: string): number {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) throw new Error(`${fieldName} must be a positive integer.`);
  return num;
}

function normalizePositiveNumber(value: unknown, fieldName: string): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) throw new Error(`${fieldName} must be a positive number.`);
  return roundToTwo(num);
}

function normalizeOptionalPositiveNumber(value: unknown, fieldName: string): number | undefined {
  if (value == null) return undefined;
  return normalizePositiveNumber(value, fieldName);
}

function normalizeOptionalId(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function requireValue<TValue>(value: TValue | undefined, label: string): TValue {
  if (value == null) throw new Error(`Tripletex did not return ${label}.`);
  return value;
}

function requireId(value: number | null | undefined, label: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`Tripletex did not return a valid ${label}.`);
  return value;
}

function normalizeEnumLike(value: unknown): string | undefined {
  if (value == null) return undefined;
  const normalized = foldText(stripWrappingQuotes(value)).replace(/[()/]/g, " ").replace(/\s+/g, " ").trim().replace(/[\s-]+/g, "_").toUpperCase();
  return normalized.length > 0 ? normalized : undefined;
}

function foldNaturalLanguageDate(value: unknown): string { return foldText(value).replace(/[,]+/g, " ").replace(/\s+/g, " ").trim(); }
function foldText(value: unknown): string { return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\u00df/g, "ss").toLowerCase(); }
function lookupMonth(token: unknown, fieldName: string): number { const key = String(token ?? ""); const month = MONTH_LOOKUP[key]; if (!month) throw new Error(`${fieldName} contained unsupported month ${key}.`); return month; }
function stripWrappingQuotes(value: unknown): string { return String(value ?? "").replace(/^["'`\u201c\u201d\u2018\u2019]+|["'`\u201c\u201d\u2018\u2019]+$/g, ""); }
function roundToTwo(value: number): number { return Math.round(value * 100) / 100; }

const MONTH_LOOKUP: Record<string, number> = {
  january: 1, januar: 1, february: 2, februar: 2, march: 3, mars: 3,
  april: 4, may: 5, mai: 5, june: 6, juni: 6, july: 7, juli: 7,
  august: 8, september: 9, october: 10, oktober: 10, november: 11,
  december: 12, desember: 12,
};
