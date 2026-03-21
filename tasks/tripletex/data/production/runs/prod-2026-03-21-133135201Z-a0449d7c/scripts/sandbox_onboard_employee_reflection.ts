import { Buffer } from "node:buffer";

const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

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
    throw new Error(`${method} ${path} failed (${response.status}): ${JSON.stringify(json ?? text)}`);
  }

  return unwrap<T>(json);
}

async function main() {
  const suffix = Date.now().toString().slice(-6);
  const divisions = await api<any[]>("GET", "/division", { query: { count: "1", fields: "*" } });
  const division = divisions[0];
  if (!division?.id) {
    throw new Error("No division available in sandbox");
  }

  const experiments = [
    {
      key: "code-2511",
      departmentName: `Ref KS ${suffix} A`,
      occupationCode: { code: "2511" },
      employee: {
        firstName: "RefA",
        lastName: `Occup${suffix}`,
        dateOfBirth: "1987-01-24",
        email: `refa.${suffix}@example.org`,
      },
    },
    {
      key: "code-2511102",
      departmentName: `Ref KS ${suffix} B`,
      occupationCode: { code: "2511102" },
      employee: {
        firstName: "RefB",
        lastName: `Occup${suffix}`,
        dateOfBirth: "1987-01-24",
        email: `refb.${suffix}@example.org`,
      },
    },
    {
      key: "id-301-full-contract-shape",
      departmentName: `Ref KS ${suffix} C`,
      occupationCode: { code: "2511" },
      employee: {
        firstName: "Henrik",
        lastName: `Ødegård Ref ${suffix}`,
        dateOfBirth: "1987-01-24",
        nationalIdentityNumber: "24018793071",
        bankAccountNumber: "52967843393",
        email: `henrik.ref.${suffix}@example.org`,
      },
    },
  ];

  const results: any[] = [];

  for (const experiment of experiments) {
    const department = await api<any>("POST", "/department", {
      body: { name: experiment.departmentName },
    });

    try {
      const employee = await api<any>("POST", "/employee", {
        body: {
          ...experiment.employee,
          userType: "NO_ACCESS",
          department: { id: Number(department.id) },
          employments: [
            {
              startDate: "2026-09-09",
              division: { id: Number(division.id) },
              employmentDetails: [
                {
                  date: "2026-09-09",
                  employmentType: "ORDINARY",
                  employmentForm: "PERMANENT",
                  remunerationType: "MONTHLY_WAGE",
                  workingHoursScheme: "NOT_SHIFT",
                  percentageOfFullTimeEquivalent: 100,
                  annualSalary: 820000,
                  occupationCode: experiment.occupationCode,
                },
              ],
            },
          ],
        },
      });

      const employments = await api<any[]>("GET", "/employee/employment", {
        query: { employeeId: String(employee.id), fields: "*" },
      });
      const employmentDetails = await api<any[]>("GET", "/employee/employment/details", {
        query: { employmentId: String(employments[0].id), fields: "*" },
      });

      results.push({
        key: experiment.key,
        status: "success",
        employeeId: employee.id,
        departmentId: department.id,
        employmentId: employments[0]?.id ?? null,
        latestSalaryOccupationCode: employments[0]?.latestSalary?.occupationCode ?? null,
        employmentDetailsOccupationCode: employmentDetails[0]?.occupationCode ?? null,
      });
    } catch (error) {
      results.push({
        key: experiment.key,
        status: "error",
        error: String(error),
      });
    }
  }

  const codeSearch = await api<any[]>("GET", "/employee/employment/occupationCode", {
    query: { code: "2511", count: "1000", fields: "*" },
  });

  const exact2511 = codeSearch
    .filter((row) => typeof row?.code === "string" && row.code.startsWith("2511"))
    .sort((a, b) => String(a.code).localeCompare(String(b.code)));

  console.log(
    JSON.stringify(
      {
        divisionId: division.id,
        experiments: results,
        exact2511Count: exact2511.length,
        exact2511FirstFive: exact2511.slice(0, 5).map((row) => ({
          id: row.id,
          code: row.code,
          nameNO: row.nameNO,
        })),
      },
      null,
      2,
    ),
  );
}

await main();
