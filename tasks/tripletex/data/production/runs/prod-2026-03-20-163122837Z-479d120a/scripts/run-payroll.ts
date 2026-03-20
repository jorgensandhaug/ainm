const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "XO8U7C3AezcDTI4MuZHm1P1aslB7D44Pxs2xu7ERYlQ";

const TARGET_EMAIL = "marie.becker@example.org";
const TARGET_DATE = "2026-03-20";
const TARGET_YEAR = 2026;
const TARGET_MONTH = 3;
const BASE_SALARY = 44150;
const BONUS = 16200;

type TripletexListResponse<T> = {
  values?: T[];
  fullResultSize?: number;
};

type TripletexValueResponse<T> = {
  value?: T;
};

type Employee = {
  id: number;
  email?: string;
  dateOfBirth?: string | null;
  employments?: Employment[];
};

type DivisionRef = {
  id?: number | null;
};

type Employment = {
  id?: number;
  startDate?: string | null;
  endDate?: string | null;
  division?: DivisionRef | null;
  employmentDetails?: unknown[] | null;
  latestSalary?: unknown | null;
};

type SalaryType = {
  id: number;
  name?: string;
};

type SalaryTransaction = {
  id?: number;
  payslips?: Array<{ id?: number }>;
};

class TripletexError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
  const body = text ? safeJsonParse(text) : null;

  if (!response.ok) {
    throw new TripletexError(
      `Tripletex request failed: ${response.status} ${response.statusText}`,
      response.status,
      body ?? text,
    );
  }

  return body as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function exactEmailMatch(values: Employee[] | undefined, email: string): Employee | undefined {
  return values?.find((employee) => employee.email?.trim().toLowerCase() === email.toLowerCase());
}

function coversPayrollPeriod(employment: Employment | undefined, firstDay: string, lastDay: string): boolean {
  if (!employment?.startDate || !employment?.division?.id) {
    return false;
  }
  if (employment.startDate > lastDay) {
    return false;
  }
  if (employment.endDate && employment.endDate < firstDay) {
    return false;
  }
  return true;
}

function firstDayOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function lastDayOfMonth(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month, 0));
  return `${year}-${String(month).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function mustFindSalaryType(values: SalaryType[] | undefined, name: string): SalaryType {
  const match = values?.find((salaryType) => salaryType.name === name);
  if (!match) {
    throw new Error(`Missing salary type: ${name}`);
  }
  return match;
}

function errorDetails(error: unknown): string {
  if (error instanceof TripletexError) {
    return JSON.stringify(
      {
        status: error.status,
        body: error.body,
      },
      null,
      2,
    );
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function main() {
  const firstDay = firstDayOfMonth(TARGET_YEAR, TARGET_MONTH);
  const lastDay = lastDayOfMonth(TARGET_YEAR, TARGET_MONTH);

  const employeeResponse = await request<TripletexListResponse<Employee>>(
    `/employee?email=${encodeURIComponent(TARGET_EMAIL)}&count=10&fields=*`,
  );
  const employee = exactEmailMatch(employeeResponse.values, TARGET_EMAIL);

  if (!employee) {
    throw new Error(`Employee not found by exact email: ${TARGET_EMAIL}`);
  }

  if (!employee.dateOfBirth) {
    throw new Error(`Blocked: employee ${TARGET_EMAIL} is missing dateOfBirth`);
  }

  let activeEmployment =
    employee.employments?.find((employment) => coversPayrollPeriod(employment, firstDay, lastDay)) ?? null;

  if (!activeEmployment) {
    const employmentResponse = await request<TripletexListResponse<Employment>>(
      `/employee/employment?employeeId=${employee.id}&count=20&fields=*`,
    );
    activeEmployment =
      employmentResponse.values?.find((employment) => coversPayrollPeriod(employment, firstDay, lastDay)) ?? null;
  }

  if (!activeEmployment) {
    throw new Error(`Blocked: employee ${TARGET_EMAIL} has no active division-backed employment for ${TARGET_YEAR}-${TARGET_MONTH}`);
  }

  const salaryTypeResponse = await request<TripletexListResponse<SalaryType>>(`/salary/type?count=1000&fields=*`);
  const baseSalaryType = mustFindSalaryType(salaryTypeResponse.values, "Fastlønn");
  const bonusSalaryType = mustFindSalaryType(salaryTypeResponse.values, "Bonus");

  const payload = {
    date: TARGET_DATE,
    year: TARGET_YEAR,
    month: TARGET_MONTH,
    paySlipsAvailableDate: TARGET_DATE,
    payslips: [
      {
        employee: { id: employee.id },
        date: TARGET_DATE,
        year: TARGET_YEAR,
        month: TARGET_MONTH,
        specifications: [
          {
            employee: { id: employee.id },
            salaryType: { id: baseSalaryType.id },
            description: "Fastlønn mars 2026",
            year: TARGET_YEAR,
            month: TARGET_MONTH,
            count: 1,
            rate: BASE_SALARY,
            amount: BASE_SALARY,
          },
          {
            employee: { id: employee.id },
            salaryType: { id: bonusSalaryType.id },
            description: "Bonus mars 2026",
            year: TARGET_YEAR,
            month: TARGET_MONTH,
            count: 1,
            rate: BONUS,
            amount: BONUS,
          },
        ],
      },
    ],
  };

  const salaryTransactionResponse = await request<TripletexValueResponse<SalaryTransaction>>("/salary/transaction", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const transaction = salaryTransactionResponse.value;
  if (!transaction?.id) {
    throw new Error(`Salary transaction created without id: ${JSON.stringify(salaryTransactionResponse)}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        employeeId: employee.id,
        salaryTransactionId: transaction.id,
        payslipIds: transaction.payslips?.map((payslip) => payslip.id).filter(Boolean) ?? [],
        period: `${TARGET_YEAR}-${String(TARGET_MONTH).padStart(2, "0")}`,
        baseSalary: BASE_SALARY,
        bonus: BONUS,
        totalGross: BASE_SALARY + BONUS,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(errorDetails(error));
  process.exit(1);
});
