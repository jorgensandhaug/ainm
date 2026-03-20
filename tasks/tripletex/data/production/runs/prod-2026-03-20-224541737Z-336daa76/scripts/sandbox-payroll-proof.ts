const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const now = Date.now();
const email = `erik-larsen-proof-${now}@example.org`;
const firstName = "Erik";
const lastName = `Larsen Proof ${now}`;
const payrollDate = "2026-03-20";
const payrollMonthStart = "2026-03-01";
const year = 2026;
const month = 3;
const monthLabel = "mars 2026";
const baseSalary = 49100;
const bonus = 11200;

type ApiResult<T> = {
  status: number;
  data: T | null;
  text: string;
};

type WrapperList<T> = {
  values?: T[];
};

type WrapperValue<T> = {
  value?: T;
};

type ValidationMessage = {
  field?: string;
  message?: string;
};

type ErrorBody = {
  validationMessages?: ValidationMessage[];
  error?: string;
  message?: string;
};

type Employee = {
  id: number;
  email?: string | null;
  department?: { id?: number | null } | null;
};

type Department = {
  id: number;
};

type Division = {
  id: number;
};

type SalaryType = {
  id: number;
  name?: string | null;
};

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

function buildUrl(path: string, query?: Record<string, string>): string {
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function api<T>(
  method: string,
  path: string,
  opts: { query?: Record<string, string>; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const response = await fetch(buildUrl(path, opts.query), {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await response.text();
  let data: T | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = null;
    }
  }
  return { status: response.status, data, text };
}

function expectOk<T>(result: ApiResult<T>, context: string): T {
  if (result.status < 200 || result.status >= 300 || result.data == null) {
    throw new Error(`${context} failed with ${result.status}: ${result.text}`);
  }
  return result.data;
}

function values<T>(data: WrapperList<T> | null | undefined): T[] {
  return Array.isArray(data?.values) ? data.values : [];
}

function value<T>(data: WrapperValue<T> | null | undefined): T | null {
  return data?.value ?? null;
}

function validationField(result: ApiResult<unknown>, field: string): boolean {
  const body = result.data as ErrorBody | null;
  return (body?.validationMessages ?? []).some((item) => item.field === field);
}

function salaryTypeId(types: SalaryType[], name: string): number {
  const found = types.find((type) => (type.name ?? "").trim().toLowerCase() === name.toLowerCase());
  if (!found) {
    throw new Error(`Missing salary type ${name}`);
  }
  return found.id;
}

async function createUnderconfiguredEmployee(): Promise<Employee> {
  const initialCreate = await api<WrapperValue<Employee>>("POST", "employee", {
    body: {
      firstName,
      lastName,
      email,
      userType: "NO_ACCESS",
    },
  });

  if (initialCreate.status >= 200 && initialCreate.status < 300) {
    return value(expectOk(initialCreate, "POST /employee"))!;
  }

  if (!validationField(initialCreate, "department.id")) {
    throw new Error(`Unexpected create-employee failure: ${initialCreate.status} ${initialCreate.text}`);
  }

  const departmentRead = await api<WrapperList<Department>>("GET", "department", {
    query: { isInactive: "false", count: "1", fields: "*" },
  });
  const department = values(expectOk(departmentRead, "GET /department?isInactive=false&count=1&fields=*"))[0];
  if (!department) {
    throw new Error("Sandbox proof blocked: no active department");
  }

  const retryCreate = await api<WrapperValue<Employee>>("POST", "employee", {
    body: {
      firstName,
      lastName,
      email,
      userType: "NO_ACCESS",
      department: { id: department.id },
    },
  });

  return value(expectOk(retryCreate, "POST /employee retry with department"))!;
}

async function main(): Promise<void> {
  const createdEmployee = await createUnderconfiguredEmployee();

  const employeeRead = await api<WrapperList<Employee>>("GET", "employee", {
    query: { email, count: "10", fields: "*" },
  });
  const employee = values(expectOk(employeeRead, "GET /employee")).find(
    (item) => (item.email ?? "").toLowerCase() === email.toLowerCase(),
  );
  if (!employee) {
    throw new Error("Created sandbox employee not found by exact email");
  }

  const divisionRead = await api<WrapperList<Division>>("GET", "division", {
    query: { count: "1", fields: "*" },
  });
  const division = values(expectOk(divisionRead, "GET /division?count=1&fields=*"))[0];
  if (!division) {
    throw new Error("Sandbox proof blocked: no division");
  }

  const employeeUpdate = await api<WrapperValue<Employee>>("PUT", `employee/${employee.id}`, {
    body: { dateOfBirth: "1990-01-01" },
  });
  expectOk(employeeUpdate, `PUT /employee/${employee.id}`);

  const employmentCreate = await api<WrapperValue<unknown>>("POST", "employee/employment", {
    body: {
      employee: { id: employee.id },
      division: { id: division.id },
      startDate: payrollMonthStart,
      isMainEmployer: true,
      taxDeductionCode: "loennFraHovedarbeidsgiver",
    },
  });
  const employment = value(expectOk(employmentCreate, "POST /employee/employment"));

  const salaryTypeRead = await api<WrapperList<SalaryType>>("GET", "salary/type", {
    query: { count: "1000", fields: "*" },
  });
  const salaryTypes = values(expectOk(salaryTypeRead, "GET /salary/type?count=1000&fields=*"));
  const fastlonnId = salaryTypeId(salaryTypes, "Fastlønn");
  const bonusId = salaryTypeId(salaryTypes, "Bonus");

  const transactionCreate = await api<WrapperValue<{ id?: number }>>("POST", "salary/transaction", {
    body: {
      date: payrollDate,
      year,
      month,
      paySlipsAvailableDate: payrollDate,
      payslips: [
        {
          employee: { id: employee.id },
          date: payrollDate,
          year,
          month,
          specifications: [
            {
              employee: { id: employee.id },
              salaryType: { id: fastlonnId },
              description: `Fastlønn ${monthLabel}`,
              year,
              month,
              count: 1,
              rate: baseSalary,
              amount: baseSalary,
            },
            {
              employee: { id: employee.id },
              salaryType: { id: bonusId },
              description: `Bonus ${monthLabel}`,
              year,
              month,
              count: 1,
              rate: bonus,
              amount: bonus,
            },
          ],
        },
      ],
    },
  });
  const transaction = value(expectOk(transactionCreate, "POST /salary/transaction"));
  if (!transaction?.id) {
    throw new Error(`Missing salary transaction id in write response: ${JSON.stringify(transaction)}`);
  }

  const transactionRead = await api<WrapperValue<{ payslips?: Array<{ id?: number }> }>>(
    "GET",
    `salary/transaction/${transaction.id}`,
    { query: { fields: "*" } },
  );
  const transactionFull = value(expectOk(transactionRead, `GET /salary/transaction/${transaction.id}?fields=*`));
  const payslipId = transactionFull?.payslips?.[0]?.id;
  if (!payslipId) {
    throw new Error("Missing payslip id from salary transaction read");
  }

  const payslipRead = await api<WrapperValue<unknown>>("GET", `salary/payslip/${payslipId}`, {
    query: { fields: "*,specifications(*,salaryType(*))" },
  });
  const payslip = value(expectOk(payslipRead, `GET /salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`));

  console.log(
    JSON.stringify(
      {
        createdEmployeeId: createdEmployee.id,
        employeeId: employee.id,
        divisionId: division.id,
        employment,
        fastlonnId,
        bonusId,
        transaction,
        payslip,
      },
      null,
      2,
    ),
  );
}

await main();
