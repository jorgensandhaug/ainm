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
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
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
  if (!response.ok) throw new Error(`${method} ${path} ${response.status}: ${JSON.stringify(json ?? text)}`);
  return unwrap<T>(json);
}

async function createEmployeeCase(params: {
  label: string;
  departmentName: string;
  divisionId: number;
  nestedOccupationCode?: { id: number };
  followupOccupationCode?: { id: number };
  suffix: string;
}) {
  const department = await api<any>("POST", "/department", {
    body: { name: params.departmentName },
  });
  const employee = await api<any>("POST", "/employee", {
    body: {
      firstName: params.label,
      lastName: `Ref ${params.suffix}`,
      dateOfBirth: "1987-01-24",
      email: `${params.label.toLowerCase()}.${params.suffix}@example.org`,
      userType: "NO_ACCESS",
      department: { id: Number(department.id) },
      employments: [
        {
          startDate: "2026-09-09",
          division: { id: params.divisionId },
          employmentDetails: [
            {
              date: "2026-09-09",
              employmentType: "ORDINARY",
              employmentForm: "PERMANENT",
              remunerationType: "MONTHLY_WAGE",
              workingHoursScheme: "NOT_SHIFT",
              percentageOfFullTimeEquivalent: 100,
              annualSalary: 820000,
              ...(params.nestedOccupationCode ? { occupationCode: params.nestedOccupationCode } : {}),
            },
          ],
        },
      ],
    },
  });
  const employments = await api<any[]>("GET", "/employee/employment", {
    query: { employeeId: String(employee.id), fields: "*" },
  });
  let details = await api<any[]>("GET", "/employee/employment/details", {
    query: { employmentId: String(employments[0].id), fields: "*,occupationCode(*)" },
  });
  if (params.followupOccupationCode) {
    await api<any>("PUT", `/employee/employment/details/${details[0].id}`, {
      body: {
        id: Number(details[0].id),
        version: Number(details[0].version ?? 0),
        employment: { id: Number(employments[0].id) },
        date: "2026-09-09",
        employmentType: "ORDINARY",
        employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: 100,
        annualSalary: 820000,
        occupationCode: params.followupOccupationCode,
      },
    });
    details = await api<any[]>("GET", "/employee/employment/details", {
      query: { employmentId: String(employments[0].id), fields: "*,occupationCode(*)" },
    });
  }
  return {
    label: params.label,
    employeeId: employee.id,
    employmentId: employments[0].id,
    details,
  };
}

async function main() {
  const suffix = Date.now().toString().slice(-6);
  const divisions = await api<any[]>("GET", "/division", { query: { count: "1", fields: "*" } });
  const divisionId = Number(divisions[0].id);

  const results = [];
  results.push(
    await createEmployeeCase({
      label: "Nested4930",
      departmentName: `Occ Nested4930 ${suffix}`,
      divisionId,
      nestedOccupationCode: { id: 4930 },
      suffix,
    }),
  );
  results.push(
    await createEmployeeCase({
      label: "Follow4930",
      departmentName: `Occ Follow4930 ${suffix}`,
      divisionId,
      followupOccupationCode: { id: 4930 },
      suffix,
    }),
  );
  results.push(
    await createEmployeeCase({
      label: "Nested301",
      departmentName: `Occ Nested301 ${suffix}`,
      divisionId,
      nestedOccupationCode: { id: 301 },
      suffix,
    }),
  );
  results.push(
    await createEmployeeCase({
      label: "Follow301",
      departmentName: `Occ Follow301 ${suffix}`,
      divisionId,
      followupOccupationCode: { id: 301 },
      suffix,
    }),
  );

  console.log(JSON.stringify({ divisionId, results }, null, 2));
}

await main();
