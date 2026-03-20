const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

const KNOWN_READY_EMAIL = "payroll-proof-469473@example.org";
const KNOWN_READY_ID = 18564428;
const KNOWN_MISSING_DOB_EMAIL = "fernando.sanchez@example.org";
const KNOWN_MISSING_DOB_ID = 18175853;

function endpoint(path: string): string {
  return new URL(path.replace(/^\//, ""), `${BASE_URL.replace(/\/+$/, "")}/`).toString();
}

async function api<T>(path: string): Promise<T> {
  const res = await fetch(endpoint(path), {
    headers: {
      Authorization: auth,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    return {
      error: { status: res.status, statusText: res.statusText, path, body: text },
    } as T;
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

const result = {
  salesModules: await api<any>("company/salesmodules?count=1000&fields=*"),
  salarySettings: await api<any>("salary/settings?fields=*"),
  readyEmployeeSearch: await api<any>(
    `employee?email=${encodeURIComponent(KNOWN_READY_EMAIL)}&count=10&fields=*`,
  ),
  readyEmployeeRead: await api<any>(`employee/${KNOWN_READY_ID}?fields=*`),
  readyEmployeeEmployment: await api<any>(
    `employee/employment?employeeId=${KNOWN_READY_ID}&count=20&fields=*`,
  ),
  missingDobEmployeeSearch: await api<any>(
    `employee?email=${encodeURIComponent(KNOWN_MISSING_DOB_EMAIL)}&count=10&fields=*`,
  ),
  missingDobEmployeeRead: await api<any>(`employee/${KNOWN_MISSING_DOB_ID}?fields=*`),
  missingDobEmployeeEmployment: await api<any>(
    `employee/employment?employeeId=${KNOWN_MISSING_DOB_ID}&count=20&fields=*`,
  ),
};

console.log(JSON.stringify(result, null, 2));
