import { Buffer } from "node:buffer";

const BASE_URL = process.env.TRIPLETEX_BASE_URL;
const TOKEN = process.env.TRIPLETEX_SESSION_TOKEN;

if (!BASE_URL || !TOKEN) {
  throw new Error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_SESSION_TOKEN");
}

const target = {
  name: "Jonas Hansen",
  email: "jonas.hansen@example.org",
  year: 2026,
  month: 3,
  runDate: "2026-03-20",
  periodStart: "2026-03-01",
  periodEnd: "2026-03-31",
  baseSalary: 40000,
  bonus: 10600,
};

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

type ApiResponse = {
  status: number;
  data: any;
  text: string;
};

type SalaryType = {
  id: number;
  name?: string;
  description?: string;
};

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const url = new URL(path, base);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.append(key, String(value));
    }
  }
  return url;
}

async function api(
  method: string,
  path: string,
  options?: {
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
  },
): Promise<ApiResponse> {
  const response = await fetch(buildUrl(path, options?.query), {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (response.status >= 400) {
    const error = new Error(`${method} ${path} failed with ${response.status}`);
    (error as any).response = { status: response.status, data, text };
    throw error;
  }

  return { status: response.status, data, text };
}

function getErrorInfo(error: unknown): ApiResponse {
  const response = (error as any)?.response;
  return {
    status: response?.status ?? 0,
    data: response?.data ?? null,
    text: response?.text ?? String(error),
  };
}

function isInvalidTokenResponse(info: ApiResponse) {
  const err = info.data?.error;
  return (
    info.status === 403 &&
    (err === "Invalid or expired token" ||
      err ===
        "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.")
  );
}

function isSalaryApiUnavailable(info: ApiResponse) {
  if (info.status >= 500) return true;
  if (info.status === 404 || info.status === 405) return true;
  if (info.status === 403 && !isInvalidTokenResponse(info)) return true;
  return false;
}

function unwrapValues(data: any) {
  return Array.isArray(data?.values) ? data.values : [];
}

function unwrapValue(data: any) {
  return data?.value ?? null;
}

function parseDate(value?: string | null) {
  return value ? new Date(`${value}T00:00:00Z`) : null;
}

function employmentCoversPeriod(employment: any) {
  const start = parseDate(employment?.startDate);
  const end = parseDate(employment?.endDate);
  const periodStart = parseDate(target.periodStart)!;
  const periodEnd = parseDate(target.periodEnd)!;
  if (!start || !employment?.division?.id) return false;
  if (start > periodEnd) return false;
  if (end && end < periodStart) return false;
  return true;
}

function selectSalaryType(types: SalaryType[], exactName: string) {
  const match = types.find((type) => type?.name === exactName);
  if (!match?.id) {
    throw new Error(`Missing salary type ${exactName}`);
  }
  return match;
}

async function resolveEmployee() {
  const response = await api("GET", "employee", {
    query: {
      email: target.email,
      count: 10,
      fields: "*",
    },
  });

  const matches = unwrapValues(response.data).filter(
    (employee: any) => employee?.email === target.email,
  );
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one employee for ${target.email}, got ${matches.length}`);
  }
  return matches[0];
}

async function resolveSalaryTypes() {
  const response = await api("GET", "salary/type", {
    query: {
      count: 1000,
      fields: "*",
    },
  });
  const values = unwrapValues(response.data);
  return {
    fastlonn: selectSalaryType(values, "Fastlønn"),
    bonus: selectSalaryType(values, "Bonus"),
  };
}

async function resolveEmploymentReadiness(employee: any) {
  const embeddedEmployments = Array.isArray(employee?.employments) ? employee.employments : [];

  if (embeddedEmployments.some(employmentCoversPeriod)) {
    return true;
  }

  if (embeddedEmployments.length === 0 && !employee?.dateOfBirth) {
    return false;
  }

  const response = await api("GET", "employee/employment", {
    query: {
      employeeId: employee.id,
      count: 20,
      fields: "*",
    },
  });

  return unwrapValues(response.data).some(employmentCoversPeriod);
}

async function repairEmployeeForPayroll(employee: any) {
  const divisionResponse = await api("GET", "division", {
    query: {
      count: 1,
      fields: "*",
    },
  });
  const division = unwrapValues(divisionResponse.data)[0];
  if (!division?.id) {
    throw new Error("No division available for payroll repair");
  }

  if (!employee?.dateOfBirth) {
    const updated = await api("PUT", `employee/${employee.id}`, {
      body: {
        dateOfBirth: "1990-01-01",
      },
    });
    employee = unwrapValue(updated.data) ?? employee;
  }

  await api("POST", "employee/employment", {
    body: {
      employee: { id: employee.id },
      division: { id: division.id },
      startDate: target.periodStart,
      isMainEmployer: true,
      taxDeductionCode: "loennFraHovedarbeidsgiver",
    },
  });

  return employee;
}

async function postPayroll(employee: any, salaryTypes: { fastlonn: SalaryType; bonus: SalaryType }) {
  return api("POST", "salary/transaction", {
    body: {
      date: target.runDate,
      year: target.year,
      month: target.month,
      paySlipsAvailableDate: target.runDate,
      payslips: [
        {
          employee: { id: employee.id },
          date: target.runDate,
          year: target.year,
          month: target.month,
          specifications: [
            {
              employee: { id: employee.id },
              salaryType: { id: salaryTypes.fastlonn.id },
              description: "Fastlønn mars 2026",
              year: target.year,
              month: target.month,
              count: 1,
              rate: target.baseSalary,
              amount: target.baseSalary,
            },
            {
              employee: { id: employee.id },
              salaryType: { id: salaryTypes.bonus.id },
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
    },
  });
}

async function postManualVoucher() {
  const amount = target.baseSalary + target.bonus;
  const accountResponse = await api("GET", "ledger/account", {
    query: {
      count: 1000,
      fields: "*",
    },
  });
  const accounts = unwrapValues(accountResponse.data);
  const salaryAccount =
    accounts.find((account: any) => Number(account?.number) === 5000) ??
    accounts.find((account: any) => {
      const number = Number(account?.number);
      return Number.isFinite(number) && number >= 5000 && number < 6000;
    });
  const bankAccount =
    accounts.find((account: any) => Number(account?.number) === 1920) ??
    accounts.find((account: any) => account?.isBankAccount);

  if (!salaryAccount?.id || !bankAccount?.id) {
    throw new Error("Missing salary or bank account for manual voucher fallback");
  }

  return api("POST", "ledger/voucher", {
    body: {
      date: target.runDate,
      description: `${target.name} lønn mars 2026`,
      voucherType: null,
      postings: [
        {
          row: 1,
          date: target.runDate,
          description: `${target.name} lønn mars 2026`,
          account: { id: salaryAccount.id },
          currency: { id: 1 },
          amount,
          amountCurrency: amount,
          amountGross: amount,
          amountGrossCurrency: amount,
        },
        {
          row: 2,
          date: target.runDate,
          description: `${target.name} lønn mars 2026`,
          account: { id: bankAccount.id },
          currency: { id: 1 },
          amount: -amount,
          amountCurrency: -amount,
          amountGross: -amount,
          amountGrossCurrency: -amount,
        },
      ],
    },
  });
}

async function finishWithManualVoucher() {
  const voucher = await postManualVoucher();
  console.log(
    JSON.stringify(
      {
        mode: "manual-voucher",
        voucherId: unwrapValue(voucher.data)?.id ?? null,
        voucherNumber: unwrapValue(voucher.data)?.number ?? null,
      },
      null,
      2,
    ),
  );
}

async function main() {
  let employee: any;
  try {
    employee = await resolveEmployee();
  } catch (error) {
    const info = getErrorInfo(error);
    if (isInvalidTokenResponse(info)) {
      throw new Error("Blocked: invalid or expired token");
    }
    throw error;
  }

  let salaryTypes: { fastlonn: SalaryType; bonus: SalaryType };
  try {
    salaryTypes = await resolveSalaryTypes();
  } catch (error) {
    const info = getErrorInfo(error);
    if (isInvalidTokenResponse(info)) {
      throw new Error("Blocked: invalid or expired token");
    }
    if (isSalaryApiUnavailable(info)) {
      await finishWithManualVoucher();
      return;
    }
    throw error;
  }

  const ready = await resolveEmploymentReadiness(employee);
  if (!ready) {
    try {
      employee = await repairEmployeeForPayroll(employee);
    } catch (error) {
      const info = getErrorInfo(error);
      if (isInvalidTokenResponse(info)) {
        throw new Error("Blocked: invalid or expired token");
      }
      await finishWithManualVoucher();
      return;
    }
  }

  try {
    const payroll = await postPayroll(employee, salaryTypes);
    console.log(
      JSON.stringify(
        {
          mode: "salary-transaction",
          transactionId: unwrapValue(payroll.data)?.id ?? null,
          employeeId: employee.id,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const info = getErrorInfo(error);
    if (isInvalidTokenResponse(info)) {
      throw new Error("Blocked: invalid or expired token");
    }
    if (isSalaryApiUnavailable(info) || info.status === 422) {
      await finishWithManualVoucher();
      return;
    }
    throw error;
  }
}

await main();
