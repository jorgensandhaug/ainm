import { Buffer } from "node:buffer";

const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "D-PGCWQL0xTbqCHKRlHr6ZATan7uUdyTaA1gpdQzy_Q";

const EMPLOYEE = {
  firstName: "Henrik",
  lastName: "Ødegård",
  dateOfBirth: "1987-01-24",
  nationalIdentityNumber: "24018793071",
  email: "henrik.degard@example.org",
  bankAccountNumber: "52967843393",
  departmentName: "Kundeservice",
  occupationCodeId: 301,
  employmentForm: "PERMANENT",
  remunerationType: "MONTHLY_WAGE",
  percentageOfFullTimeEquivalent: 100,
  annualSalary: 820000,
  startDate: "2026-09-09",
} as const;

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

function unwrap<T>(json: any): T {
  if (json?.values !== undefined) return json.values as T;
  if (json?.value !== undefined) return json.value as T;
  return json as T;
}

function buildUrl(path: string, query?: Record<string, string>): string {
  const base = BASE_URL.replace(/\/+$/, "");
  const url = new URL(`${base}${path}`);
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
  opts: { query?: Record<string, string>; body?: Json } = {},
): Promise<T> {
  const response = await fetch(buildUrl(path, opts.query), {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`,
      Accept: "application/json",
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const errorMessage = json?.error ?? json?.message ?? text ?? `HTTP ${response.status}`;
    if (
      response.status === 403 &&
      (errorMessage === "Invalid or expired token" ||
        errorMessage ===
          "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.")
    ) {
      throw new Error(`Blocked by unusable credentials: ${errorMessage}`);
    }
    throw new Error(`${method} ${path} failed (${response.status}): ${JSON.stringify(json ?? text)}`);
  }

  return unwrap<T>(json);
}

function pickDepartment(departments: any[], name: string): any | null {
  const exact = departments.filter((department) => department?.name === name);
  if (exact.length === 0) return null;
  exact.sort((a, b) => Number(b.id) - Number(a.id));
  return exact[0];
}

async function main() {
  const [divisions, departments] = await Promise.all([
    api<any[]>("GET", "/division", { query: { count: "1", fields: "id" } }),
    api<any[]>("GET", "/department", {
      query: { name: EMPLOYEE.departmentName, isInactive: "false", count: "1000", fields: "*" },
    }),
  ]);

  const divisionId = Array.isArray(divisions) && divisions.length > 0 ? Number(divisions[0].id) : null;
  let department = pickDepartment(departments, EMPLOYEE.departmentName);
  if (!department) {
    department = await api<any>("POST", "/department", { body: { name: EMPLOYEE.departmentName } });
  }

  const employeePayload: Record<string, unknown> = {
    firstName: EMPLOYEE.firstName,
    lastName: EMPLOYEE.lastName,
    dateOfBirth: EMPLOYEE.dateOfBirth,
    nationalIdentityNumber: EMPLOYEE.nationalIdentityNumber,
    email: EMPLOYEE.email,
    bankAccountNumber: EMPLOYEE.bankAccountNumber,
    userType: "NO_ACCESS",
    department: { id: Number(department.id) },
    employments: [
      {
        startDate: EMPLOYEE.startDate,
        ...(divisionId ? { division: { id: divisionId } } : {}),
        employmentDetails: [
          {
            date: EMPLOYEE.startDate,
            employmentType: "ORDINARY",
            employmentForm: EMPLOYEE.employmentForm,
            remunerationType: EMPLOYEE.remunerationType,
            workingHoursScheme: "NOT_SHIFT",
            percentageOfFullTimeEquivalent: EMPLOYEE.percentageOfFullTimeEquivalent,
            annualSalary: EMPLOYEE.annualSalary,
            occupationCode: { id: EMPLOYEE.occupationCodeId },
          },
        ],
      },
    ],
  };

  const employee = await api<any>("POST", "/employee", { body: employeePayload });
  console.log(
    JSON.stringify(
      {
        employeeId: employee.id,
        departmentId: department.id,
        divisionId,
        occupationCodeId: EMPLOYEE.occupationCodeId,
      },
      null,
      2,
    ),
  );
}

await main();
