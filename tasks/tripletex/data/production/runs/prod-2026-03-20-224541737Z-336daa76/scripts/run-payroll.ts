const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "nnh8VkPZrU9c_PEDtg5Vyq742taWkQZo9FuQI4IN5WE";

const employeeEmail = "erik.larsen@example.org";
const employeeName = "Erik Larsen";
const payrollDate = "2026-03-20";
const payrollMonthStart = "2026-03-01";
const payrollMonthEnd = "2026-03-31";
const year = 2026;
const month = 3;
const monthLabel = "mars 2026";
const baseSalary = 49100;
const bonus = 11200;
const grossSalary = baseSalary + bonus;
const currencyId = 1;

type ApiResult<T> = {
  status: number;
  data: T | null;
  text: string;
};

type TripletexList<T> = {
  values?: T[];
  fullResultSize?: number;
};

type TripletexValue<T> = {
  value?: T;
};

type Employee = {
  id: number;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  dateOfBirth?: string | null;
  employments?: Employment[];
};

type Employment = {
  id?: number;
  startDate?: string | null;
  endDate?: string | null;
  division?: { id?: number | null } | null;
};

type SalaryType = {
  id: number;
  name?: string | null;
};

type Division = {
  id: number;
};

type LedgerAccount = {
  id: number;
  number?: number | null;
};

type ValidationMessage = {
  field?: string;
  message?: string;
};

type ErrorBody = {
  error?: string;
  message?: string;
  validationMessages?: ValidationMessage[];
  source?: string;
};

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

function buildUrl(path: string, query?: Record<string, string>): string {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const normalizedPath = path.replace(/^\/+/, "");
  const url = new URL(`${normalizedBase}/${normalizedPath}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
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

function invalidToken(result: ApiResult<unknown>): boolean {
  const body = result.data as ErrorBody | null;
  return (
    result.status === 403 &&
    !!body?.error &&
    (body.error === "Invalid or expired token" ||
      body.error ===
        "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.")
  );
}

function expectOk<T>(result: ApiResult<T>, context: string): T {
  if (invalidToken(result)) {
    throw new Error(`Blocked by unusable credentials at ${context}: ${result.text}`);
  }
  if (result.status < 200 || result.status >= 300 || result.data == null) {
    throw new Error(`${context} failed with ${result.status}: ${result.text}`);
  }
  return result.data;
}

function exactEmailMatch(employees: Employee[]): Employee[] {
  const target = employeeEmail.trim().toLowerCase();
  return employees.filter((employee) => (employee.email ?? "").trim().toLowerCase() === target);
}

function overlapsPayrollMonth(employment: Employment): boolean {
  const startDate = employment.startDate ?? "";
  const endDate = employment.endDate ?? "9999-12-31";
  return !!startDate && startDate <= payrollMonthEnd && endDate >= payrollMonthStart;
}

function hasUsableDivision(employment: Employment): boolean {
  return typeof employment.division?.id === "number";
}

function extractValues<T>(data: TripletexList<T> | null | undefined): T[] {
  return Array.isArray(data?.values) ? data.values : [];
}

function extractValue<T>(data: TripletexValue<T> | null | undefined): T | null {
  return data?.value ?? null;
}

function getValidationMessages(result: ApiResult<unknown>): string[] {
  const body = result.data as ErrorBody | null;
  return (body?.validationMessages ?? []).map((item) => `${item.field ?? "?"}: ${item.message ?? ""}`);
}

function resolveSalaryType(types: SalaryType[], name: string): SalaryType {
  const match = types.find((type) => (type.name ?? "").trim().toLowerCase() === name.trim().toLowerCase());
  if (!match) {
    throw new Error(`Missing salary type ${name}`);
  }
  return match;
}

async function createVoucherFallback(): Promise<void> {
  const accountResponse = await api<TripletexList<LedgerAccount>>("GET", "ledger/account", {
    query: { number: "5000,1920", fields: "*" },
  });
  const accounts = extractValues(expectOk(accountResponse, "GET /ledger/account?number=5000,1920&fields=*"));
  const salaryAccount = accounts.find((account) => account.number === 5000);
  const bankAccount = accounts.find((account) => account.number === 1920);
  if (!salaryAccount || !bankAccount) {
    throw new Error(`Missing payroll voucher accounts: ${JSON.stringify(accounts)}`);
  }

  const voucherPayload = {
    date: payrollDate,
    description: `Lønn ${employeeName} ${monthLabel}`,
    voucherType: null,
    postings: [
      {
        row: 1,
        date: payrollDate,
        description: `Lønn ${employeeName} ${monthLabel}`,
        account: { id: salaryAccount.id },
        currency: { id: currencyId },
        amount: grossSalary,
        amountCurrency: grossSalary,
        amountGross: grossSalary,
        amountGrossCurrency: grossSalary,
      },
      {
        row: 2,
        date: payrollDate,
        description: `Lønn ${employeeName} ${monthLabel}`,
        account: { id: bankAccount.id },
        currency: { id: currencyId },
        amount: -grossSalary,
        amountCurrency: -grossSalary,
        amountGross: -grossSalary,
        amountGrossCurrency: -grossSalary,
      },
    ],
  };

  const voucherResponse = await api<TripletexValue<unknown>>("POST", "ledger/voucher", {
    body: voucherPayload,
  });
  const voucher = expectOk(voucherResponse, "POST /ledger/voucher");
  console.log(
    JSON.stringify(
      {
        mode: "voucher",
        grossSalary,
        voucher: extractValue(voucher) ?? voucher,
      },
      null,
      2,
    ),
  );
}

async function main(): Promise<void> {
  const employeeResponse = await api<TripletexList<Employee>>("GET", "employee", {
    query: { email: employeeEmail, count: "10", fields: "*" },
  });
  const employees = extractValues(expectOk(employeeResponse, "GET /employee"));
  const matchedEmployees = exactEmailMatch(employees);
  if (matchedEmployees.length !== 1) {
    throw new Error(`Expected exactly one employee for ${employeeEmail}, got ${matchedEmployees.length}`);
  }

  const employee = matchedEmployees[0];
  let dateOfBirth = employee.dateOfBirth ?? null;
  let readyEmployments = Array.isArray(employee.employments) ? employee.employments : [];
  let repaired = false;

  if (dateOfBirth === null && readyEmployments.length === 0) {
    const divisionResponse = await api<TripletexList<Division>>("GET", "division", {
      query: { count: "1", fields: "*" },
    });
    const divisions = extractValues(expectOk(divisionResponse, "GET /division?count=1&fields=*"));
    const division = divisions[0];
    if (!division) {
      await createVoucherFallback();
      return;
    }

    const salaryTypeResponse = await api<TripletexList<SalaryType>>("GET", "salary/type", {
      query: { count: "1000", fields: "*" },
    });
    if (invalidToken(salaryTypeResponse)) {
      throw new Error(`Blocked by unusable credentials at GET /salary/type: ${salaryTypeResponse.text}`);
    }
    if (salaryTypeResponse.status === 403) {
      await createVoucherFallback();
      return;
    }
    const salaryTypes = extractValues(expectOk(salaryTypeResponse, "GET /salary/type"));

    const updateEmployeeResponse = await api<TripletexValue<Employee>>("PUT", `employee/${employee.id}`, {
      body: { dateOfBirth: "1990-01-01" },
    });
    const updatedEmployee = extractValue(expectOk(updateEmployeeResponse, `PUT /employee/${employee.id}`));
    dateOfBirth = updatedEmployee?.dateOfBirth ?? "1990-01-01";

    const employmentResponse = await api<TripletexValue<Employment>>("POST", "employee/employment", {
      body: {
        employee: { id: employee.id },
        division: { id: division.id },
        startDate: payrollMonthStart,
        isMainEmployer: true,
        taxDeductionCode: "loennFraHovedarbeidsgiver",
      },
    });
    const createdEmployment = extractValue(expectOk(employmentResponse, "POST /employee/employment"));
    readyEmployments = createdEmployment ? [createdEmployment] : [];
    repaired = true;

    await postSalaryTransaction(employee.id, salaryTypes, repaired);
    return;
  }

  let activeEmployments = readyEmployments.filter((employment) => overlapsPayrollMonth(employment) && hasUsableDivision(employment));
  if (activeEmployments.length === 0) {
    const sparseEmployments = readyEmployments.some(
      (employment) => !employment.startDate || !employment.division || employment.division.id == null,
    );
    if (readyEmployments.length > 0 || sparseEmployments) {
      const employmentResponse = await api<TripletexList<Employment>>("GET", "employee/employment", {
        query: { employeeId: String(employee.id), count: "20", fields: "*" },
      });
      const employments = extractValues(expectOk(employmentResponse, "GET /employee/employment"));
      readyEmployments = employments;
      activeEmployments = readyEmployments.filter(
        (employment) => overlapsPayrollMonth(employment) && hasUsableDivision(employment),
      );
    }
  }

  if (activeEmployments.length === 0) {
    const divisionResponse = await api<TripletexList<Division>>("GET", "division", {
      query: { count: "1", fields: "*" },
    });
    const divisions = extractValues(expectOk(divisionResponse, "GET /division?count=1&fields=*"));
    const division = divisions[0];
    if (!division) {
      await createVoucherFallback();
      return;
    }

    if (dateOfBirth === null) {
      const updateEmployeeResponse = await api<TripletexValue<Employee>>("PUT", `employee/${employee.id}`, {
        body: { dateOfBirth: "1990-01-01" },
      });
      const updatedEmployee = extractValue(expectOk(updateEmployeeResponse, `PUT /employee/${employee.id}`));
      dateOfBirth = updatedEmployee?.dateOfBirth ?? "1990-01-01";
    }

    const employmentResponse = await api<TripletexValue<Employment>>("POST", "employee/employment", {
      body: {
        employee: { id: employee.id },
        division: { id: division.id },
        startDate: payrollMonthStart,
        isMainEmployer: true,
        taxDeductionCode: "loennFraHovedarbeidsgiver",
      },
    });
    const createdEmployment = extractValue(expectOk(employmentResponse, "POST /employee/employment"));
    readyEmployments = createdEmployment ? [createdEmployment] : [];
    repaired = true;
  }

  const salaryTypeResponse = await api<TripletexList<SalaryType>>("GET", "salary/type", {
    query: { count: "1000", fields: "*" },
  });
  if (invalidToken(salaryTypeResponse)) {
    throw new Error(`Blocked by unusable credentials at GET /salary/type: ${salaryTypeResponse.text}`);
  }
  if (salaryTypeResponse.status === 403) {
    await createVoucherFallback();
    return;
  }
  const salaryTypes = extractValues(expectOk(salaryTypeResponse, "GET /salary/type"));
  await postSalaryTransaction(employee.id, salaryTypes, repaired);
}

async function postSalaryTransaction(employeeId: number, salaryTypes: SalaryType[], repaired: boolean): Promise<void> {
  const fastlonn = resolveSalaryType(salaryTypes, "Fastlønn");
  const bonusType = resolveSalaryType(salaryTypes, "Bonus");

  const payload = {
    date: payrollDate,
    year,
    month,
    paySlipsAvailableDate: payrollDate,
    payslips: [
      {
        employee: { id: employeeId },
        date: payrollDate,
        year,
        month,
        specifications: [
          {
            employee: { id: employeeId },
            salaryType: { id: fastlonn.id },
            description: `Fastlønn ${monthLabel}`,
            year,
            month,
            count: 1,
            rate: baseSalary,
            amount: baseSalary,
          },
          {
            employee: { id: employeeId },
            salaryType: { id: bonusType.id },
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
  };

  const transactionResponse = await api<TripletexValue<unknown>>("POST", "salary/transaction", { body: payload });
  if (invalidToken(transactionResponse)) {
    throw new Error(`Blocked by unusable credentials at POST /salary/transaction: ${transactionResponse.text}`);
  }
  if (transactionResponse.status === 403) {
    await createVoucherFallback();
    return;
  }
  if (transactionResponse.status === 422) {
    const messages = getValidationMessages(transactionResponse);
    throw new Error(
      `POST /salary/transaction failed with 422 after${repaired ? "" : "out"} repair: ${JSON.stringify(messages)} body=${transactionResponse.text}`,
    );
  }

  const transaction = extractValue(expectOk(transactionResponse, "POST /salary/transaction")) ?? transactionResponse.data;
  console.log(
    JSON.stringify(
      {
        mode: "payroll",
        grossSalary,
        transaction,
      },
      null,
      2,
    ),
  );
}

await main();
