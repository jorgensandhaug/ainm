const baseUrl = process.env.TRIPLETEX_BASE_URL;
const token = process.env.TRIPLETEX_TOKEN;

if (!baseUrl) throw new Error("Missing TRIPLETEX_BASE_URL");
if (!token) throw new Error("Missing TRIPLETEX_TOKEN");

const target = {
  name: "Eirik Brekke",
  email: "eirik.brekke@example.org",
  year: 2026,
  month: 3,
  date: "2026-03-20",
  payrollStartDate: "2026-03-01",
  baseSalary: 41050,
  bonus: 9800,
};

const auth = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;

function buildUrl(path: string, query?: Record<string, string>): string {
  const trimmed = baseUrl!.replace(/\/+$/, "");
  const url = new URL(`${trimmed}/${path.replace(/^\/+/, "")}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function request<T = any>(
  method: string,
  path: string,
  opts: { query?: Record<string, string>; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(buildUrl(path, opts.query), {
    method,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const body = typeof data === "string" ? data : JSON.stringify(data);
    if (
      res.status === 403 &&
      typeof data === "object" &&
      data &&
      ((data.error === "Invalid or expired token") ||
        (data.error ===
          "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions."))
    ) {
      throw new Error(`Blocked credentials: ${body}`);
    }
    throw new Error(`${method} ${path} -> ${res.status}: ${body}`);
  }

  return data as T;
}

function getValues<T>(wrapper: any): T[] {
  return Array.isArray(wrapper?.values) ? wrapper.values : [];
}

function getValue<T>(wrapper: any): T {
  if (!wrapper || typeof wrapper !== "object" || !("value" in wrapper)) {
    throw new Error(`Missing wrapped value: ${JSON.stringify(wrapper)}`);
  }
  return wrapper.value as T;
}

function normalize(text: string | null | undefined): string {
  return (text ?? "").trim().toLowerCase();
}

const payrollMonthEnd = "2026-03-31";

function dateCoversPeriod(startDate?: string | null, endDate?: string | null): boolean {
  if (!startDate) return false;
  if (startDate > payrollMonthEnd) return false;
  if (endDate && endDate < target.payrollStartDate) return false;
  return true;
}

function hasActiveEmploymentFromEmbedded(employee: any): boolean | "unknown" {
  const employments = Array.isArray(employee?.employments) ? employee.employments : [];
  if (employments.length === 0) return false;

  let sawSparse = false;
  for (const employment of employments) {
    const startDate = employment?.startDate as string | null | undefined;
    const endDate = employment?.endDate as string | null | undefined;
    const divisionId = employment?.division?.id;
    if (!startDate || !divisionId) {
      sawSparse = true;
      continue;
    }
    if (dateCoversPeriod(startDate, endDate)) return true;
  }

  return sawSparse ? "unknown" : false;
}

async function main() {
  const employeeSearch = await request<any>("GET", "employee", {
    query: { email: target.email, count: "10", fields: "*" },
  });
  const employees = getValues<any>(employeeSearch).filter(
    (employee) => normalize(employee?.email) === normalize(target.email),
  );
  if (employees.length !== 1) {
    throw new Error(`Expected exactly one employee match, got ${employees.length}`);
  }

  const employee = employees[0];
  const employeeId = employee.id;
  if (!employeeId) throw new Error("Employee missing id");

  let payrollReady = false;
  let divisionId: number | null = null;

  const embeddedEmploymentState = hasActiveEmploymentFromEmbedded(employee);
  const underconfigured =
    employee?.dateOfBirth == null &&
    Array.isArray(employee?.employments) &&
    employee.employments.length === 0;

  if (embeddedEmploymentState === true) {
    payrollReady = true;
  } else if (underconfigured) {
    const divisionResp = await request<any>("GET", "division", {
      query: { count: "1", fields: "*" },
    });
    const divisions = getValues<any>(divisionResp);
    if (divisions.length === 0 || !divisions[0]?.id) {
      throw new Error("Blocked: employee underconfigured and no division available");
    }
    divisionId = divisions[0].id as number;
  } else {
    const employmentResp = await request<any>("GET", "employee/employment", {
      query: { employeeId: String(employeeId), count: "20", fields: "*" },
    });
    const employments = getValues<any>(employmentResp);
    const active = employments.find((employment) =>
      dateCoversPeriod(employment?.startDate, employment?.endDate),
    );
    if (active?.division?.id) {
      payrollReady = true;
      divisionId = active.division.id as number;
    }
  }

  const salaryTypeResp = await request<any>("GET", "salary/type", {
    query: { count: "1000", fields: "*" },
  });
  const salaryTypes = getValues<any>(salaryTypeResp);
  const fastlonn = salaryTypes.find(
    (type) => normalize(type?.name) === normalize("Fastlønn"),
  );
  const bonus = salaryTypes.find((type) => normalize(type?.name) === normalize("Bonus"));
  if (!fastlonn?.id || !bonus?.id) {
    throw new Error("Missing salary type ids for Fastlønn or Bonus");
  }

  if (!payrollReady) {
    if (!divisionId) {
      const divisionResp = await request<any>("GET", "division", {
        query: { count: "1", fields: "*" },
      });
      const divisions = getValues<any>(divisionResp);
      if (divisions.length === 0 || !divisions[0]?.id) {
        throw new Error("Blocked: no division available for employment repair");
      }
      divisionId = divisions[0].id as number;
    }

    if (employee?.dateOfBirth == null) {
      await request<any>("PUT", `employee/${employeeId}`, {
        body: {
          dateOfBirth: "1990-01-01",
        },
      });
    }

    await request<any>("POST", "employee/employment", {
      body: {
        employee: { id: employeeId },
        division: { id: divisionId },
        startDate: target.payrollStartDate,
        isMainEmployer: true,
        taxDeductionCode: "loennFraHovedarbeidsgiver",
      },
    });
  }

  const transactionPayload = {
    date: target.date,
    year: target.year,
    month: target.month,
    paySlipsAvailableDate: target.date,
    payslips: [
      {
        employee: { id: employeeId },
        date: target.date,
        year: target.year,
        month: target.month,
        specifications: [
          {
            employee: { id: employeeId },
            salaryType: { id: fastlonn.id },
            description: "Fastlønn mars 2026",
            year: target.year,
            month: target.month,
            count: 1,
            rate: target.baseSalary,
            amount: target.baseSalary,
          },
          {
            employee: { id: employeeId },
            salaryType: { id: bonus.id },
            description: "Bonus mars 2026",
            year: target.year,
            month: target.month,
            count: 1,
            rate: target.bonus,
            amount: target.bonus,
          },
        ],
      },
    ],
  };

  const transactionResp = await request<any>("POST", "salary/transaction", {
    body: transactionPayload,
  });
  const transaction = getValue<any>(transactionResp);
  if (!transaction?.id) {
    throw new Error(`Salary transaction response missing id: ${JSON.stringify(transactionResp)}`);
  }

  const summary = {
    employeeId,
    salaryTransactionId: transaction.id,
    amountBase: target.baseSalary,
    amountBonus: target.bonus,
    total: target.baseSalary + target.bonus,
    payslipIds:
      Array.isArray(transaction?.payslips) && transaction.payslips.length > 0
        ? transaction.payslips.map((p: any) => p?.id).filter(Boolean)
        : [],
  };
  console.log(JSON.stringify(summary, null, 2));
}

await main();
