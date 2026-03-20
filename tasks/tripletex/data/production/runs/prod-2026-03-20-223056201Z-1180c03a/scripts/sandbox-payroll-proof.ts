const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;
const runDate = "2026-03-20";
const year = 2026;
const month = 3;
const monthStart = "2026-03-01";

class BlockedError extends Error {}

type Wrapper<T> = {
  value?: T;
  values?: T[];
  validationMessages?: Array<{ field?: string; message?: string }>;
  [key: string]: unknown;
};

type Department = { id: number };
type Division = { id: number };
type Employee = { id: number; dateOfBirth?: string | null };
type Employment = { id?: number; division?: { id?: number | null } | null; startDate?: string | null };
type SalaryType = { id: number; name?: string | null };

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
  options: { params?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; data: Wrapper<T> }> {
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
  const data = text ? JSON.parse(text) : {};
  const errorText =
    typeof data?.error === "string"
      ? data.error
      : typeof data?.message === "string"
        ? data.message
        : `${response.status}`;
  if (
    response.status === 403 &&
    (errorText.includes("Invalid or expired token") ||
      errorText.includes("Invalid or expired proxy token"))
  ) {
    throw new BlockedError(errorText);
  }

  return { status: response.status, data };
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("nb-NO");
}

async function createUnderconfiguredEmployee(): Promise<number> {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const email = `payroll-proof-${suffix}@example.org`;
  const basePayload: any = {
    firstName: "Payroll",
    lastName: `Proof ${suffix}`,
    email,
    userType: "NO_ACCESS",
  };

  let createResp = await request<Employee>("POST", "employee", { body: basePayload });
  if (createResp.status === 422) {
    const departmentField = createResp.data.validationMessages?.find((item) => item.field === "department.id");
    if (departmentField) {
      const departmentResp = await request<Department>("GET", "department", {
        params: { isInactive: "false", count: "1", fields: "*" },
      });
      const department = departmentResp.data.values?.[0];
      if (!department?.id) {
        throw new Error("Sandbox proof could not resolve a department for disposable employee create");
      }
      createResp = await request<Employee>("POST", "employee", {
        body: { ...basePayload, department: { id: department.id } },
      });
    }
  }

  if (createResp.status < 200 || createResp.status >= 300 || !createResp.data.value?.id) {
    throw new Error(`Disposable employee create failed: ${JSON.stringify(createResp.data)}`);
  }

  return createResp.data.value.id;
}

async function main() {
  const employeeId = await createUnderconfiguredEmployee();

  const divisionResp = await request<Division>("GET", "division", {
    params: { count: "1", fields: "*" },
  });
  const division = divisionResp.data.values?.[0];
  if (!division?.id) {
    throw new Error("Sandbox proof requires an existing division");
  }

  const employeeUpdateResp = await request<Employee>("PUT", `employee/${employeeId}`, {
    body: { dateOfBirth: "1990-01-01" },
  });
  if (employeeUpdateResp.status < 200 || employeeUpdateResp.status >= 300) {
    throw new Error(`Employee DOB repair failed: ${JSON.stringify(employeeUpdateResp.data)}`);
  }

  const employmentResp = await request<Employment>("POST", "employee/employment", {
    body: {
      employee: { id: employeeId },
      division: { id: division.id },
      startDate: monthStart,
      isMainEmployer: true,
      taxDeductionCode: "loennFraHovedarbeidsgiver",
    },
  });
  if (employmentResp.status < 200 || employmentResp.status >= 300 || !employmentResp.data.value?.id) {
    throw new Error(`Employment repair failed: ${JSON.stringify(employmentResp.data)}`);
  }

  const salaryTypeResp = await request<SalaryType>("GET", "salary/type", {
    params: { count: "1000", fields: "*" },
  });
  const salaryTypes = salaryTypeResp.data.values ?? [];
  const fastlonn = salaryTypes.find((item) => normalize(item.name) === "fastlønn");
  const bonus = salaryTypes.find((item) => normalize(item.name) === "bonus");
  if (!fastlonn?.id || !bonus?.id) {
    throw new Error("Sandbox proof could not resolve Fastlønn/Bonus");
  }

  const salaryTransactionResp = await request<any>("POST", "salary/transaction", {
    body: {
      date: runDate,
      year,
      month,
      paySlipsAvailableDate: runDate,
      payslips: [
        {
          employee: { id: employeeId },
          date: runDate,
          year,
          month,
          specifications: [
            {
              employee: { id: employeeId },
              salaryType: { id: fastlonn.id },
              description: "Fastlønn mars 2026",
              year,
              month,
              count: 1,
              rate: 33550,
              amount: 33550,
            },
            {
              employee: { id: employeeId },
              salaryType: { id: bonus.id },
              description: "Bonus mars 2026",
              year,
              month,
              count: 1,
              rate: 14400,
              amount: 14400,
            },
          ],
        },
      ],
    },
  });
  if (
    salaryTransactionResp.status < 200 ||
    salaryTransactionResp.status >= 300 ||
    !salaryTransactionResp.data.value?.id
  ) {
    throw new Error(`Salary transaction failed: ${JSON.stringify(salaryTransactionResp.data)}`);
  }

  const transactionId = salaryTransactionResp.data.value.id;
  const transactionReadResp = await request<any>("GET", `salary/transaction/${transactionId}`, {
    params: { fields: "*" },
  });
  const payslipId = transactionReadResp.data.value?.payslips?.[0]?.id;
  if (!payslipId) {
    throw new Error(`Salary transaction verification failed: ${JSON.stringify(transactionReadResp.data)}`);
  }

  const payslipResp = await request<any>("GET", `salary/payslip/${payslipId}`, {
    params: { fields: "*,specifications(*,salaryType(*))" },
  });

  console.log(
    JSON.stringify({
      ok: true,
      employeeId,
      divisionId: division.id,
      employmentId: employmentResp.data.value.id,
      fastlonnId: fastlonn.id,
      bonusId: bonus.id,
      salaryTransactionId: transactionId,
      payslipId,
      grossAmount: payslipResp.data.value?.grossAmount ?? null,
      amount: payslipResp.data.value?.amount ?? null,
      specifications:
        payslipResp.data.value?.specifications?.map((item: any) => ({
          salaryType: item.salaryType?.name ?? null,
          description: item.description ?? null,
          amount: item.amount ?? null,
        })) ?? [],
    }),
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  const blocked = error instanceof BlockedError;
  console.error(JSON.stringify({ ok: false, blocked, error: message }));
  process.exit(1);
});
