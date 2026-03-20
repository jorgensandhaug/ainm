const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const RUN_DATE = "2026-03-20";
const YEAR = 2026;
const MONTH = 3;
const EMPLOYEE_ID = 18584102;
const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

type Link = { id: number; name?: string | null };
type WrappedList<T> = { values: T[] };
type WrappedValue<T> = { value: T };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const url = new URL(path.replace(/^\//, ""), base);
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const error = new Error(`${response.status} ${response.statusText} ${path}`);
    (error as Error & { status?: number; body?: unknown }).status = response.status;
    (error as Error & { status?: number; body?: unknown }).body = body;
    throw error;
  }
  return body as T;
}

async function raw(path: string, init?: RequestInit) {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const url = new URL(path.replace(/^\//, ""), base);
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json,application/octet-stream",
      ...(init?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const contentType = response.headers.get("content-type") ?? "";
  const text = contentType.includes("application/json") ? await response.text() : null;
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return {
    status: response.status,
    allow: response.headers.get("allow"),
    contentType,
    body,
  };
}

async function maybePdf(path: string) {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const url = new URL(path.replace(/^\//, ""), base);
  const response = await fetch(url, {
    headers: {
      Authorization: authHeader,
      Accept: "application/octet-stream,application/json",
    },
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (response.ok) {
    const bytes = (await response.arrayBuffer()).byteLength;
    return { status: response.status, contentType, bytes };
  }
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep raw text.
  }
  return { status: response.status, contentType, body };
}

const salaryTypes = await api<WrappedList<Link>>("salary/type?count=1000&fields=*");
const fastlonn = salaryTypes.values.find((value) => value.name === "Fastlønn");
const bonusType = salaryTypes.values.find((value) => value.name === "Bonus");
if (!fastlonn?.id || !bonusType?.id) throw new Error("missing salary types");

const created = await api<WrappedValue<{ id: number; payslips?: Array<{ id?: number }> }>>(
  "salary/transaction?generateTaxDeduction=true",
  {
    method: "POST",
    body: JSON.stringify({
      date: RUN_DATE,
      year: YEAR,
      month: MONTH,
      paySlipsAvailableDate: RUN_DATE,
      payslips: [
        {
          employee: { id: EMPLOYEE_ID },
          date: RUN_DATE,
          year: YEAR,
          month: MONTH,
          specifications: [
            {
              salaryType: { id: fastlonn.id },
              description: "Fastlønn mars 2026",
              year: YEAR,
              month: MONTH,
              count: 1,
              rate: 50400,
              amount: 50400,
            },
            {
              salaryType: { id: bonusType.id },
              description: "Bonus mars 2026",
              year: YEAR,
              month: MONTH,
              count: 1,
              rate: 7050,
              amount: 7050,
            },
          ],
        },
      ],
    }),
  },
);

const transactionId = created.value.id;
const payslipId = created.value.payslips?.[0]?.id;
if (!payslipId) throw new Error("missing payslip id");

const before = {
  transactionId,
  payslipId,
  pdf: await maybePdf(`salary/payslip/${payslipId}/pdf`),
  search: await raw(
    `salary/payslip?employeeId=${EMPLOYEE_ID}&yearFrom=2026&yearTo=2026&monthFrom=3&monthTo=4&count=50&fields=*`,
  ),
};

const actions = [
  ["PUT", `salary/payslip/${payslipId}/:deliver`],
  ["POST", `salary/payslip/${payslipId}/:deliver`],
  ["PUT", `salary/payslip/${payslipId}/:send`],
  ["POST", `salary/payslip/${payslipId}/:send`],
  ["PUT", `salary/payslip/${payslipId}/:publish`],
  ["POST", `salary/payslip/${payslipId}/:publish`],
  ["PUT", `salary/payslip/${payslipId}/:complete`],
  ["POST", `salary/payslip/${payslipId}/:complete`],
  ["PUT", `salary/payslip/${payslipId}/:makeAvailable`],
  ["POST", `salary/payslip/${payslipId}/:makeAvailable`],
  ["PUT", `salary/payslip/${payslipId}/:email`],
  ["POST", `salary/payslip/${payslipId}/:email`],
];

const results = [];
for (const [method, path] of actions) {
  results.push({
    method,
    path,
    response: await raw(path, { method }),
    pdfAfter: await maybePdf(`salary/payslip/${payslipId}/pdf`),
    searchAfter: await raw(
      `salary/payslip?employeeId=${EMPLOYEE_ID}&yearFrom=2026&yearTo=2026&monthFrom=3&monthTo=4&count=50&fields=*`,
    ),
  });
}

console.log(JSON.stringify({ before, results }, null, 2));
