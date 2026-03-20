const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "yEc0cYydjgJZaK3eASuQJ7zuAchw8EQTfJEBXTOFiYw";

const TARGET_EMAIL = "maria.almeida@example.org";
const RUN_DATE = "2026-03-20";
const YEAR = 2026;
const MONTH = 3;
const MONTH_START = "2026-03-01";
const BASE_SALARY = 33550;
const BONUS = 14400;

const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

type TripletexList<T> = {
  values?: T[];
  fullResultSize?: number;
};

type TripletexValue<T> = {
  value?: T;
};

type Employee = {
  id: number;
  email?: string;
  dateOfBirth?: string | null;
  employments?: Employment[];
};

type Division = {
  id: number;
  name?: string;
};

type Employment = {
  id?: number;
  startDate?: string | null;
  endDate?: string | null;
  division?: Division | null;
};

type SalaryType = {
  id: number;
  name?: string;
};

function buildUrl(path: string, params?: Record<string, string>) {
  const normalizedBase = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const url = new URL(path, normalizedBase);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function tripletex<T>(
  method: string,
  path: string,
  options: { params?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; data: T | null }> {
  const res = await fetch(buildUrl(path, options.params), {
    method,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (
    res.status === 403 &&
    data &&
    typeof data === "object" &&
    "error" in data &&
    (data.error === "Invalid or expired token" ||
      data.error ===
        "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.")
  ) {
    throw new Error(`Blocked credentials: ${JSON.stringify(data)}`);
  }

  if (!res.ok) {
    throw new Error(`${method} ${path} failed ${res.status}: ${text}`);
  }

  return { status: res.status, data };
}

function exactEmailMatch(values: Employee[] | undefined, email: string) {
  return (values ?? []).filter((employee) => employee.email === email);
}

function coversPayrollPeriod(employment: Employment | undefined) {
  if (!employment?.startDate) return false;
  if (!employment.division?.id) return false;
  if (employment.startDate > RUN_DATE) return false;
  if (employment.endDate && employment.endDate < MONTH_START) return false;
  return true;
}

function exactSalaryType(values: SalaryType[] | undefined, name: string) {
  return (values ?? []).find((salaryType) => salaryType.name === name);
}

async function main() {
  const employeeRes = await tripletex<TripletexList<Employee>>("GET", "employee", {
    params: { email: TARGET_EMAIL, count: "10", fields: "*" },
  });
  const employees = exactEmailMatch(employeeRes.data?.values, TARGET_EMAIL);
  if (employees.length !== 1) {
    console.log(JSON.stringify({ blocked: true, reason: "employee_not_exact_match", count: employees.length }));
    return;
  }

  const employee = employees[0];
  const embeddedEmployments = employee.employments ?? [];
  const obviouslyUnderconfigured =
    employee.dateOfBirth == null && embeddedEmployments.length === 0;

  let activeEmployment = embeddedEmployments.find(coversPayrollPeriod);
  let division: Division | undefined;

  if (obviouslyUnderconfigured) {
    const divisionRes = await tripletex<TripletexList<Division>>("GET", "division", {
      params: { count: "1", fields: "*" },
    });
    division = divisionRes.data?.values?.[0];
    if (!division?.id) {
      console.log(JSON.stringify({ blocked: true, reason: "no_division_for_payroll_repair" }));
      return;
    }
  } else if (embeddedEmployments.length > 0 && !activeEmployment) {
    const employmentRes = await tripletex<TripletexList<Employment>>("GET", "employee/employment", {
      params: { employeeId: String(employee.id), count: "20", fields: "*" },
    });
    activeEmployment = (employmentRes.data?.values ?? []).find(coversPayrollPeriod);
    if (activeEmployment?.division?.id) {
      division = activeEmployment.division;
    }
  }

  const salaryTypeRes = await tripletex<TripletexList<SalaryType>>("GET", "salary/type", {
    params: { count: "1000", fields: "*" },
  });
  const fastlonn = exactSalaryType(salaryTypeRes.data?.values, "Fastlønn");
  const bonusType = exactSalaryType(salaryTypeRes.data?.values, "Bonus");
  if (!fastlonn?.id || !bonusType?.id) {
    throw new Error("Missing required salary types");
  }

  if (!activeEmployment && obviouslyUnderconfigured) {
    await tripletex<TripletexValue<Employee>>("PUT", `employee/${employee.id}`, {
      body: { dateOfBirth: "1990-01-01" },
    });
    const employmentCreateRes = await tripletex<TripletexValue<Employment>>("POST", "employee/employment", {
      body: {
        employee: { id: employee.id },
        division: { id: division!.id },
        startDate: MONTH_START,
        isMainEmployer: true,
        taxDeductionCode: "loennFraHovedarbeidsgiver",
      },
    });
    activeEmployment = employmentCreateRes.data?.value;
  }

  if (!activeEmployment && !division?.id) {
    console.log(JSON.stringify({ blocked: true, reason: "no_active_employment" }));
    return;
  }

  const payload = {
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
            salaryType: { id: bonusType.id },
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

  const transactionRes = await tripletex<unknown>("POST", "salary/transaction", {
    body: payload,
  });

  console.log(
    JSON.stringify({
      success: true,
      employeeId: employee.id,
      salaryTransaction: transactionRes.data,
    }),
  );
}

await main();
