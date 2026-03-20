const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const PROOF_EMPLOYEE_ID = 18564428;
const TARGET_DATE = "2026-06-15";
const TARGET_YEAR = 2026;
const TARGET_MONTH = 6;
const BASE_SALARY = 44150;
const BONUS = 16200;

type ListResponse<T> = { values?: T[] };
type ValueResponse<T> = { value?: T };

type Employee = {
  id: number;
  email?: string;
  dateOfBirth?: string | null;
  employments?: Employment[] | null;
};

type Employment = {
  id?: number;
  startDate?: string | null;
  endDate?: string | null;
  division?: { id?: number | null } | null;
  latestSalary?: unknown | null;
  employmentDetails?: unknown[] | null;
};

type SalaryType = {
  id: number;
  name?: string;
};

type SalaryTransaction = {
  id?: number;
  payslips?: Array<{ id?: number }>;
};

type Payslip = {
  id?: number;
  grossAmount?: number;
  amount?: number;
  specifications?: Array<{
    id?: number;
    amount?: number;
    description?: string;
    salaryType?: { id?: number; name?: string };
  }>;
};

class HttpError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? parseMaybeJson(text) : null;

  if (!response.ok) {
    throw new HttpError(response.status, body ?? text);
  }

  return body as T;
}

function parseMaybeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function firstDay(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function lastDay(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month, 0));
  return `${year}-${String(month).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function employmentCoversPeriod(employment: Employment | undefined, start: string, end: string): boolean {
  if (!employment?.startDate || !employment?.division?.id) {
    return false;
  }
  if (employment.startDate > end) {
    return false;
  }
  if (employment.endDate && employment.endDate < start) {
    return false;
  }
  return true;
}

function exactSalaryType(values: SalaryType[] | undefined, name: string): SalaryType {
  const found = values?.find((value) => value.name === name);
  if (!found) {
    throw new Error(`Missing salary type ${name}`);
  }
  return found;
}

async function main() {
  const periodStart = firstDay(TARGET_YEAR, TARGET_MONTH);
  const periodEnd = lastDay(TARGET_YEAR, TARGET_MONTH);

  const employeeResponse = await api<ListResponse<Employee>>(
    `/employee?id=${PROOF_EMPLOYEE_ID}&count=10&fields=*`,
  );
  const employee = employeeResponse.values?.find((value) => value.id === PROOF_EMPLOYEE_ID);
  if (!employee) {
    throw new Error(`Employee ${PROOF_EMPLOYEE_ID} not found`);
  }
  if (!employee.dateOfBirth) {
    throw new Error(`Employee ${PROOF_EMPLOYEE_ID} unexpectedly missing dateOfBirth`);
  }

  let employment =
    employee.employments?.find((value) => employmentCoversPeriod(value, periodStart, periodEnd)) ?? null;
  let usedEmploymentExpansion = false;

  if (!employment) {
    usedEmploymentExpansion = true;
    const employmentResponse = await api<ListResponse<Employment>>(
      `/employee/employment?employeeId=${PROOF_EMPLOYEE_ID}&count=20&fields=*`,
    );
    employment =
      employmentResponse.values?.find((value) => employmentCoversPeriod(value, periodStart, periodEnd)) ?? null;
  }

  if (!employment) {
    throw new Error(`Employee ${PROOF_EMPLOYEE_ID} has no active division-backed employment for the target month`);
  }

  const salaryTypeResponse = await api<ListResponse<SalaryType>>(`/salary/type?count=1000&fields=*`);
  const fastlonn = exactSalaryType(salaryTypeResponse.values, "Fastlønn");
  const bonus = exactSalaryType(salaryTypeResponse.values, "Bonus");

  const createResponse = await api<ValueResponse<SalaryTransaction>>("/salary/transaction", {
    method: "POST",
    body: JSON.stringify({
      date: TARGET_DATE,
      year: TARGET_YEAR,
      month: TARGET_MONTH,
      paySlipsAvailableDate: TARGET_DATE,
      payslips: [
        {
          employee: { id: PROOF_EMPLOYEE_ID },
          date: TARGET_DATE,
          year: TARGET_YEAR,
          month: TARGET_MONTH,
          specifications: [
            {
              employee: { id: PROOF_EMPLOYEE_ID },
              salaryType: { id: fastlonn.id },
              description: "Fastlønn juni 2026",
              year: TARGET_YEAR,
              month: TARGET_MONTH,
              count: 1,
              rate: BASE_SALARY,
              amount: BASE_SALARY,
            },
            {
              employee: { id: PROOF_EMPLOYEE_ID },
              salaryType: { id: bonus.id },
              description: "Bonus juni 2026",
              year: TARGET_YEAR,
              month: TARGET_MONTH,
              count: 1,
              rate: BONUS,
              amount: BONUS,
            },
          ],
        },
      ],
    }),
  });

  const transactionId = createResponse.value?.id;
  if (!transactionId) {
    throw new Error(`Missing salary transaction id from create response`);
  }

  const transactionRead = await api<ValueResponse<SalaryTransaction>>(`/salary/transaction/${transactionId}?fields=*`);
  const payslipId = transactionRead.value?.payslips?.[0]?.id;
  if (!payslipId) {
    throw new Error(`Missing payslip id from salary transaction ${transactionId}`);
  }

  const payslipRead = await api<ValueResponse<Payslip>>(
    `/salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`,
  );
  const payslip = payslipRead.value;
  if (!payslip) {
    throw new Error(`Missing payslip ${payslipId}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        employeeId: employee.id,
        employeeEmail: employee.email ?? null,
        usedEmploymentExpansion,
        employment: {
          startDate: employment.startDate ?? null,
          endDate: employment.endDate ?? null,
          divisionId: employment.division?.id ?? null,
        },
        salaryTypeIds: {
          fastlonn: fastlonn.id,
          bonus: bonus.id,
        },
        salaryTransactionId: transactionId,
        payslipId,
        grossAmount: payslip.grossAmount ?? null,
        amount: payslip.amount ?? null,
        specifications: (payslip.specifications ?? []).map((specification) => ({
          salaryTypeName: specification.salaryType?.name ?? null,
          description: specification.description ?? null,
          amount: specification.amount ?? null,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  if (error instanceof HttpError) {
    console.error(JSON.stringify({ status: error.status, body: error.body }, null, 2));
  } else if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }
  process.exit(1);
});
