import { Buffer } from "node:buffer";

const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

function unwrap<T>(json: any): T {
  if (json?.values !== undefined) return json.values as T;
  if (json?.value !== undefined) return json.value as T;
  return json as T;
}

function buildUrl(path: string, query?: Record<string, string>) {
  const base = BASE_URL.replace(/\/+$/, "");
  const url = new URL(`${base}${path}`);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return url.toString();
}

async function api<T>(method: string, path: string, body?: any, query?: Record<string, string>) {
  const response = await fetch(buildUrl(path, query), {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${method} ${path} ${response.status}: ${JSON.stringify(json ?? text)}`);
  return unwrap<T>(json);
}

const suffix = Date.now().toString().slice(-6);
const division = (await api<any[]>("GET", "/division", undefined, { count: "1", fields: "*" }))[0];
const department = await api<any>("POST", "/department", { name: `Kundeservice Ref ${suffix}` });
const employee = await api<any>("POST", "/employee", {
  firstName: "Henrik",
  lastName: `Ødegård Ref ${suffix}`,
  dateOfBirth: "1987-01-24",
  nationalIdentityNumber: "24018793071",
  bankAccountNumber: "52967843393",
  email: `henrik.ref.${suffix}@example.org`,
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
          occupationCode: { id: 301 },
        },
      ],
    },
  ],
});
const employment = (await api<any[]>("GET", "/employee/employment", undefined, {
  employeeId: String(employee.id),
  fields: "*",
}))[0];
const details = await api<any[]>("GET", "/employee/employment/details", undefined, {
  employmentId: String(employment.id),
  fields: "*,occupationCode(*)",
});

console.log(
  JSON.stringify(
    {
      employeeId: employee.id,
      departmentId: department.id,
      employmentId: employment.id,
      details: details[0],
    },
    null,
    2,
  ),
);
