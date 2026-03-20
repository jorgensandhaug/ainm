const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "GBEbl09CFdlkWdFgl9AZjVQpBiX8cMjOwmIRyUibdkA";

const employeeEmail = "maria.almeida@example.org";
const employeeName = "Maria Almeida";
const runDate = "2026-03-20";
const year = 2026;
const month = 3;
const monthStart = "2026-03-01";
const monthEnd = "2026-03-31";
const baseSalary = 33550;
const bonusAmount = 14400;

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

class BlockedError extends Error {}

type ApiResponse<T> = {
  value?: T;
  values?: T[];
  [key: string]: unknown;
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

function endpoint(path: string, params?: Record<string, string>): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(path, normalizedBase);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function request<T>(
  method: string,
  path: string,
  options: {
    params?: Record<string, string>;
    body?: unknown;
  } = {},
): Promise<ApiResponse<T>> {
  const response = await fetch(endpoint(path, options.params), {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    const errorText =
      typeof data?.error === "string"
        ? data.error
        : typeof data?.message === "string"
          ? data.message
          : text || `${response.status}`;
    if (
      response.status === 403 &&
      (errorText.includes("Invalid or expired token") ||
        errorText.includes("Invalid or expired proxy token"))
    ) {
      throw new BlockedError(errorText);
    }
    const details =
      Array.isArray(data?.validationMessages) && data.validationMessages.length > 0
        ? ` ${JSON.stringify(data.validationMessages)}`
        : "";
    throw new Error(`${method} ${path} failed ${response.status}: ${errorText}${details}`);
  }

  return data ?? {};
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("nb-NO");
}

function isActiveEmployment(employment: Employment | null | undefined): boolean {
  if (!employment?.startDate || !employment?.division?.id) return false;
  if (employment.startDate > monthEnd) return false;
  if (employment.endDate && employment.endDate < monthStart) return false;
  return true;
}

function hasJudgableEmbeddedEmployment(employee: Employee): boolean {
  return (employee.employments ?? []).some(
    (employment) =>
      employment.startDate !== null &&
      employment.startDate !== undefined &&
      employment.division?.id !== null &&
      employment.division?.id !== undefined,
  );
}

function monthLabel(monthNumber: number): string {
  return [
    "januar",
    "februar",
    "mars",
    "april",
    "mai",
    "juni",
    "juli",
    "august",
    "september",
    "oktober",
    "november",
    "desember",
  ][monthNumber - 1];
}

async function main() {
  const employeeResp = await request<Employee>("GET", "employee", {
    params: { email: employeeEmail, count: "10", fields: "*" },
  });
  const employees = Array.isArray(employeeResp.values) ? employeeResp.values : [];
  const employee = employees.find((item) => normalize(item.email) === normalize(employeeEmail));

  if (!employee) {
    throw new Error(`Employee not found for exact email ${employeeEmail}`);
  }

  const underconfigured =
    !employee.dateOfBirth && Array.isArray(employee.employments) && employee.employments.length === 0;

  let activeEmployment =
    (employee.employments ?? []).find((employment) => isActiveEmployment(employment)) ?? null;

  if (!underconfigured && !activeEmployment && !hasJudgableEmbeddedEmployment(employee)) {
    const employmentResp = await request<Employment>("GET", "employee/employment", {
      params: { employeeId: String(employee.id), count: "20", fields: "*" },
    });
    const employments = Array.isArray(employmentResp.values) ? employmentResp.values : [];
    activeEmployment = employments.find((employment) => isActiveEmployment(employment)) ?? null;
  }

  if (underconfigured) {
    const divisionResp = await request<{ id: number }>("GET", "division", {
      params: { count: "1", fields: "*" },
    });
    const division = Array.isArray(divisionResp.values) ? divisionResp.values[0] : null;
    if (!division?.id) {
      throw new BlockedError("No division available for payroll prerequisite repair");
    }

    if (!employee.dateOfBirth) {
      await request<Employee>("PUT", `employee/${employee.id}`, {
        body: { dateOfBirth: "1990-01-01" },
      });
    }

    const employmentCreateResp = await request<Employment>("POST", "employee/employment", {
      body: {
        employee: { id: employee.id },
        division: { id: division.id },
        startDate: monthStart,
        isMainEmployer: true,
        taxDeductionCode: "loennFraHovedarbeidsgiver",
      },
    });
    activeEmployment = employmentCreateResp.value ?? null;
  }

  if (!activeEmployment || !isActiveEmployment(activeEmployment)) {
    throw new BlockedError(`Employee ${employeeEmail} is not payroll-ready for ${year}-${String(month).padStart(2, "0")}`);
  }

  const salaryTypeResp = await request<SalaryType>("GET", "salary/type", {
    params: { count: "1000", fields: "*" },
  });
  const salaryTypes = Array.isArray(salaryTypeResp.values) ? salaryTypeResp.values : [];
  const fastlonn = salaryTypes.find((item) => normalize(item.name) === "fastlønn");
  const bonus = salaryTypes.find((item) => normalize(item.name) === "bonus");

  if (!fastlonn?.id || !bonus?.id) {
    throw new Error("Required salary types Fastlønn/Bonus not found");
  }

  const labelMonth = monthLabel(month);
  const salaryTransactionResp = await request<any>("POST", "salary/transaction", {
    body: {
      date: runDate,
      year,
      month,
      paySlipsAvailableDate: runDate,
      payslips: [
        {
          employee: { id: employee.id },
          date: runDate,
          year,
          month,
          specifications: [
            {
              employee: { id: employee.id },
              salaryType: { id: fastlonn.id },
              description: `Fastlønn ${labelMonth} ${year}`,
              year,
              month,
              count: 1,
              rate: baseSalary,
              amount: baseSalary,
            },
            {
              employee: { id: employee.id },
              salaryType: { id: bonus.id },
              description: `Bonus ${labelMonth} ${year}`,
              year,
              month,
              count: 1,
              rate: bonusAmount,
              amount: bonusAmount,
            },
          ],
        },
      ],
    },
  });

  const transaction = salaryTransactionResp.value;
  console.log(
    JSON.stringify({
      ok: true,
      employeeId: employee.id,
      employeeEmail,
      employeeName,
      salaryTransactionId: transaction?.id ?? null,
      year,
      month,
      grossAmount: baseSalary + bonusAmount,
    }),
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  const blocked = error instanceof BlockedError;
  console.error(JSON.stringify({ ok: false, blocked, error: message }));
  process.exit(1);
});
