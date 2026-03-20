const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "ao3GjpJ8_ai55JqMYx7aa3ux0SLZpbXgR8S7sS_HKys";

const TARGET_EMAIL = "mia.hoffmann@example.org";
const RUN_DATE = "2026-03-20";
const YEAR = 2026;
const MONTH = 3;
const BASE_SALARY = 40350;
const BONUS = 7350;

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

type WrappedList<T> = {
  values: T[];
  fullResultSize?: number;
};

type WrappedValue<T> = {
  value: T;
};

type TripletexError = {
  error?: string;
  message?: string;
  validationMessages?: Array<{ field?: string; message?: string }>;
};

type Employee = {
  id: number;
  email?: string | null;
  dateOfBirth?: string | null;
  employments?: Employment[];
};

type Employment = {
  id?: number;
  startDate?: string | null;
  endDate?: string | null;
  division?: { id?: number | null } | null;
  latestSalary?: unknown;
  employmentDetails?: unknown[] | null;
};

type SalaryType = {
  id: number;
  name?: string | null;
};

function buildUrl(path: string): string {
  const normalizedBase = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  return new URL(path.replace(/^\//, ""), normalizedBase).toString();
}

function isInvalidToken(status: number, bodyText: string): boolean {
  if (status !== 403) return false;
  try {
    const parsed = JSON.parse(bodyText) as TripletexError;
    return parsed.error === "Invalid or expired token";
  } catch {
    return false;
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildUrl(path), {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();

  if (!response.ok) {
    if (isInvalidToken(response.status, text)) {
      throw new Error("BLOCKED: Invalid or expired token");
    }
    throw new Error(`${response.status} ${response.statusText} ${path}\n${text}`);
  }

  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

function exactEmployeeMatch(values: Employee[]): Employee | undefined {
  const matches = values.filter((employee) => employee.email === TARGET_EMAIL);
  if (matches.length !== 1) {
    return undefined;
  }
  return matches[0];
}

function isEmploymentActiveInPeriod(employment: Employment): boolean {
  const start = employment.startDate;
  const end = employment.endDate;
  const divisionId = employment.division?.id;
  if (!start || !divisionId) {
    return false;
  }
  if (start > RUN_DATE) {
    return false;
  }
  if (end && end < RUN_DATE) {
    return false;
  }
  return true;
}

function getActiveEmployment(employments: Employment[] | null | undefined): Employment | undefined {
  return (employments ?? []).find(isEmploymentActiveInPeriod);
}

function mustVerifyTransaction(writeValue: any): boolean {
  const payslips = Array.isArray(writeValue?.payslips) ? writeValue.payslips : [];
  if (payslips.length !== 1) {
    return true;
  }
  const specifications = Array.isArray(payslips[0]?.specifications) ? payslips[0].specifications : [];
  return specifications.length !== 2;
}

function salaryTypeByName(values: SalaryType[], name: string): SalaryType | undefined {
  return values.find((salaryType) => salaryType.name === name);
}

function blocked(message: string): never {
  throw new Error(`BLOCKED: ${message}`);
}

async function main() {
  const employeeResponse = await api<WrappedList<Employee>>(
    `employee?email=${encodeURIComponent(TARGET_EMAIL)}&count=10&fields=*`,
  );
  const employee = exactEmployeeMatch(employeeResponse.values);
  if (!employee) {
    blocked(`Employee exact match not found for ${TARGET_EMAIL}`);
  }

  if (!employee.dateOfBirth) {
    blocked(`Employee ${TARGET_EMAIL} missing dateOfBirth`);
  }

  let activeEmployment = getActiveEmployment(employee.employments);
  if (!activeEmployment) {
    const employmentResponse = await api<WrappedList<Employment>>(
      `employee/employment?employeeId=${employee.id}&count=20&fields=*`,
    );
    activeEmployment = getActiveEmployment(employmentResponse.values);
  }

  if (!activeEmployment) {
    blocked(`Employee ${TARGET_EMAIL} has no active division-backed employment in ${YEAR}-${String(MONTH).padStart(2, "0")}`);
  }

  const salaryTypesResponse = await api<WrappedList<SalaryType>>("salary/type?count=1000&fields=*");
  const fastlonn = salaryTypeByName(salaryTypesResponse.values, "Fastlønn");
  const bonus = salaryTypeByName(salaryTypesResponse.values, "Bonus");

  if (!fastlonn || !bonus) {
    throw new Error("Required salary types not found");
  }

  const transactionPayload = {
    date: RUN_DATE,
    year: YEAR,
    month: MONTH,
    paySlipsAvailableDate: RUN_DATE,
    payslips: [
      {
        employee: { id: employee.id },
        date: RUN_DATE,
        year: YEAR,
        month: MONTH,
        specifications: [
          {
            employee: { id: employee.id },
            salaryType: { id: fastlonn.id },
            description: "Fastlønn mars 2026",
            year: YEAR,
            month: MONTH,
            count: 1,
            rate: BASE_SALARY,
            amount: BASE_SALARY,
          },
          {
            employee: { id: employee.id },
            salaryType: { id: bonus.id },
            description: "Bonus mars 2026",
            year: YEAR,
            month: MONTH,
            count: 1,
            rate: BONUS,
            amount: BONUS,
          },
        ],
      },
    ],
  };

  const transactionResponse = await api<WrappedValue<any>>("salary/transaction", {
    method: "POST",
    body: JSON.stringify(transactionPayload),
  });

  const result: Record<string, unknown> = {
    employeeId: employee.id,
    salaryTransactionId: transactionResponse.value?.id ?? null,
    grossAmountExpected: BASE_SALARY + BONUS,
    writeResponse: transactionResponse.value,
  };

  if (mustVerifyTransaction(transactionResponse.value) && transactionResponse.value?.id) {
    const verifiedTransaction = await api<WrappedValue<any>>(
      `salary/transaction/${transactionResponse.value.id}?fields=*`,
    );
    result.verifiedTransaction = verifiedTransaction.value;
  }

  console.log(JSON.stringify(result, null, 2));
}

await main();
