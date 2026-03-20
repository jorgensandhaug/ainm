const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
const suffix = `${Date.now()}`;
const runDate = "2026-03-20";
const monthStart = "2026-03-01";

type Wrapper<T> = { value?: T };
type ListWrapper<T> = { values?: T[] };

type Employee = { id: number; email?: string };
type Division = { id: number; name?: string };
type SalaryType = { id: number; name?: string };
type Employment = { id: number; division?: { id: number } | null };
type SalaryTransaction = { id: number; payslips?: { id: number }[] };
type Department = { id: number; name?: string };

function buildUrl(path: string, params?: Record<string, string>) {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const url = new URL(path, base);
  if (params) {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  }
  return url.toString();
}

async function api<T>(
  method: string,
  path: string,
  options: { params?: Record<string, string>; body?: unknown } = {},
): Promise<T | null> {
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
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${method} ${path} ${res.status}: ${text}`);
  }
  return json;
}

function findSalaryType(values: SalaryType[] | undefined, name: string) {
  return (values ?? []).find((value) => value.name === name);
}

async function main() {
  const departmentList = await api<ListWrapper<Department>>("GET", "department", {
    params: { isInactive: "false", count: "1", fields: "*" },
  });
  let departmentId = departmentList?.values?.[0]?.id;
  if (!departmentId) {
    const departmentCreate = await api<Wrapper<Department>>("POST", "department", {
      body: { name: `Payroll Reflection Department ${suffix}` },
    });
    departmentId = departmentCreate?.value?.id;
  }
  if (!departmentId) throw new Error("Missing department id");

  const employeeCreate = await api<Wrapper<Employee>>("POST", "employee", {
    body: {
      firstName: "Maria",
      lastName: `Reflection ${suffix}`,
      email: `maria.almeida.reflection.${suffix}@example.org`,
      userType: "NO_ACCESS",
      department: { id: departmentId },
    },
  });
  const employeeId = employeeCreate?.value?.id;
  if (!employeeId) throw new Error("Missing employee id");

  const divisionCreateResponse = await fetch(buildUrl("division"), {
    method: "POST",
    headers: {
      Authorization: auth,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: `Payroll Reflection Division ${suffix}`,
    }),
  });
  const divisionCreateText = await divisionCreateResponse.text();
  const divisionCreateBody = divisionCreateText ? JSON.parse(divisionCreateText) : null;

  const existingDivisionList = await api<ListWrapper<Division>>("GET", "division", {
    params: { count: "1", fields: "*" },
  });
  const divisionId = existingDivisionList?.values?.[0]?.id;
  if (!divisionId) throw new Error("Missing division id");

  const salaryTypeList = await api<ListWrapper<SalaryType>>("GET", "salary/type", {
    params: { count: "1000", fields: "*" },
  });
  const fastlonn = findSalaryType(salaryTypeList?.values, "Fastlønn");
  const bonus = findSalaryType(salaryTypeList?.values, "Bonus");
  if (!fastlonn?.id || !bonus?.id) throw new Error("Missing salary types");

  await api<Wrapper<Employee>>("PUT", `employee/${employeeId}`, {
    body: { dateOfBirth: "1990-01-01" },
  });

  const employmentCreate = await api<Wrapper<Employment>>("POST", "employee/employment", {
    body: {
      employee: { id: employeeId },
      division: { id: divisionId },
      startDate: monthStart,
      isMainEmployer: true,
      taxDeductionCode: "loennFraHovedarbeidsgiver",
    },
  });
  if (!employmentCreate?.value?.id) throw new Error("Missing employment id");

  const salaryTransactionCreate = await api<Wrapper<SalaryTransaction>>("POST", "salary/transaction", {
    body: {
      date: runDate,
      year: 2026,
      month: 3,
      paySlipsAvailableDate: runDate,
      payslips: [
        {
          employee: { id: employeeId },
          date: runDate,
          year: 2026,
          month: 3,
          specifications: [
            {
              employee: { id: employeeId },
              salaryType: { id: fastlonn.id },
              description: "Fastlønn mars 2026",
              year: 2026,
              month: 3,
              count: 1,
              rate: 33550,
              amount: 33550,
            },
            {
              employee: { id: employeeId },
              salaryType: { id: bonus.id },
              description: "Bonus mars 2026",
              year: 2026,
              month: 3,
              count: 1,
              rate: 14400,
              amount: 14400,
            },
          ],
        },
      ],
    },
  });
  const transactionId = salaryTransactionCreate?.value?.id;
  if (!transactionId) throw new Error("Missing salary transaction id");

  const salaryTransactionRead = await api<Wrapper<SalaryTransaction>>(
    "GET",
    `salary/transaction/${transactionId}`,
    { params: { fields: "*" } },
  );
  const payslipId = salaryTransactionRead?.value?.payslips?.[0]?.id;
  if (!payslipId) throw new Error("Missing payslip id");

  const payslipRead = await api<unknown>("GET", `salary/payslip/${payslipId}`, {
    params: { fields: "*,specifications(*,salaryType(*))" },
  });

  console.log(
    JSON.stringify(
      {
        employeeId,
        divisionProbeStatus: divisionCreateResponse.status,
        divisionProbeBody: divisionCreateBody,
        divisionId,
        employmentId: employmentCreate.value?.id,
        fastlonnId: fastlonn.id,
        bonusId: bonus.id,
        transactionId,
        payslipId,
        payslip: payslipRead,
      },
      null,
      2,
    ),
  );
}

await main();
