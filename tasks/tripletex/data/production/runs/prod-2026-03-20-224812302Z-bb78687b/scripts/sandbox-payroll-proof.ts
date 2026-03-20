const baseUrl = process.env.TRIPLETEX_BASE_URL;
const token = process.env.TRIPLETEX_TOKEN;

if (!baseUrl) throw new Error("Missing TRIPLETEX_BASE_URL");
if (!token) throw new Error("Missing TRIPLETEX_TOKEN");

const auth = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;
const suffix = `${Date.now()}`;
const employeeEmail = `eirik.brekke.reflection.${suffix}@example.org`;

function buildUrl(path: string, query?: Record<string, string>): string {
  const trimmed = baseUrl!.replace(/\/+$/, "");
  const url = new URL(`${trimmed}/${path.replace(/^\/+/, "")}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
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
    throw new Error(`${method} ${path} -> ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }
  return data as T;
}

function getValue<T>(wrapper: any): T {
  return wrapper?.value as T;
}

function getValues<T>(wrapper: any): T[] {
  return Array.isArray(wrapper?.values) ? (wrapper.values as T[]) : [];
}

function normalize(text: string | null | undefined): string {
  return (text ?? "").trim().toLowerCase();
}

async function main() {
  const departmentResp = await request<any>("GET", "department", {
    query: { count: "1", fields: "*" },
  });
  const department = getValues<any>(departmentResp)[0];
  if (!department?.id) throw new Error("Expected existing department in sandbox");

  const createdEmployeeResp = await request<any>("POST", "employee", {
    body: {
      firstName: "Eirik",
      lastName: `Brekke Reflection ${suffix}`,
      email: employeeEmail,
      userType: "NO_ACCESS",
      department: { id: department.id },
    },
  });
  const createdEmployee = getValue<any>(createdEmployeeResp);

  const employeeSearch = await request<any>("GET", "employee", {
    query: { email: employeeEmail, count: "10", fields: "*" },
  });
  const employees = getValues<any>(employeeSearch).filter(
    (employee) => normalize(employee?.email) === normalize(employeeEmail),
  );
  if (employees.length !== 1) {
    throw new Error(`Expected 1 employee, got ${employees.length}`);
  }
  const employee = employees[0];
  if (employee?.dateOfBirth != null) throw new Error("Expected underconfigured dateOfBirth=null");
  if (!Array.isArray(employee?.employments) || employee.employments.length !== 0) {
    throw new Error("Expected underconfigured employments=[]");
  }

  const divisionResp = await request<any>("GET", "division", {
    query: { count: "1", fields: "*" },
  });
  const division = getValues<any>(divisionResp)[0];
  if (!division?.id) throw new Error("Expected existing division in sandbox");

  const updatedEmployeeResp = await request<any>("PUT", `employee/${employee.id}`, {
    body: { dateOfBirth: "1990-01-01" },
  });
  const updatedEmployee = getValue<any>(updatedEmployeeResp);

  const employmentResp = await request<any>("POST", "employee/employment", {
    body: {
      employee: { id: employee.id },
      division: { id: division.id },
      startDate: "2026-03-01",
      isMainEmployer: true,
      taxDeductionCode: "loennFraHovedarbeidsgiver",
    },
  });
  const employment = getValue<any>(employmentResp);

  const salaryTypesResp = await request<any>("GET", "salary/type", {
    query: { count: "1000", fields: "*" },
  });
  const salaryTypes = getValues<any>(salaryTypesResp);
  const fastlonn = salaryTypes.find((type) => normalize(type?.name) === "fastlønn");
  const bonus = salaryTypes.find((type) => normalize(type?.name) === "bonus");
  if (!fastlonn?.id || !bonus?.id) throw new Error("Missing Fastlønn/Bonus ids");

  const transactionResp = await request<any>("POST", "salary/transaction", {
    body: {
      date: "2026-03-20",
      year: 2026,
      month: 3,
      paySlipsAvailableDate: "2026-03-20",
      payslips: [
        {
          employee: { id: employee.id },
          date: "2026-03-20",
          year: 2026,
          month: 3,
          specifications: [
            {
              employee: { id: employee.id },
              salaryType: { id: fastlonn.id },
              description: "Fastlønn mars 2026",
              year: 2026,
              month: 3,
              count: 1,
              rate: 41050,
              amount: 41050,
            },
            {
              employee: { id: employee.id },
              salaryType: { id: bonus.id },
              description: "Bonus mars 2026",
              year: 2026,
              month: 3,
              count: 1,
              rate: 9800,
              amount: 9800,
            },
          ],
        },
      ],
    },
  });
  const transaction = getValue<any>(transactionResp);

  const transactionRead = await request<any>("GET", `salary/transaction/${transaction.id}`, {
    query: { fields: "*" },
  });
  const transactionValue = getValue<any>(transactionRead);
  const payslipId = transactionValue?.payslips?.[0]?.id;
  if (!payslipId) throw new Error("Missing payslip id");

  const payslipResp = await request<any>("GET", `salary/payslip/${payslipId}`, {
    query: { fields: "*,specifications(*,salaryType(*))" },
  });
  const payslip = getValue<any>(payslipResp);

  console.log(
    JSON.stringify(
      {
        createdEmployeeId: createdEmployee?.id,
        searchedEmployeeId: employee.id,
        departmentId: department.id,
        divisionId: division.id,
        updatedDateOfBirth: updatedEmployee?.dateOfBirth,
        employmentId: employment?.id,
        fastlonnId: fastlonn.id,
        bonusId: bonus.id,
        salaryTransactionId: transaction.id,
        payslipId,
        grossAmount: payslip?.grossAmount,
        amount: payslip?.amount,
        specifications: Array.isArray(payslip?.specifications)
          ? payslip.specifications.map((spec: any) => ({
              salaryType: spec?.salaryType?.name,
              amount: spec?.amount,
              description: spec?.description,
            }))
          : [],
      },
      null,
      2,
    ),
  );
}

await main();
