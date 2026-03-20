const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const RUN_DATE = "2026-03-20";
const YEAR = 2026;
const MONTH = 3;
const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

type Link = { id: number; name?: string | null; displayName?: string | null };
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
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(`${response.status} ${response.statusText}`);
    (error as Error & { status?: number; body?: unknown }).status = response.status;
    (error as Error & { status?: number; body?: unknown }).body = body;
    throw error;
  }
  return body as T;
}

async function createDraftTransaction() {
  const employee = { id: 18564428 };

  const salaryTypeRes = await api<WrappedList<Link>>("salary/type?count=1000&fields=*");
  const fastlonn = salaryTypeRes.values.find((value) => value.name === "Fastlønn");
  const bonusType = salaryTypeRes.values.find((value) => value.name === "Bonus");
  if (!fastlonn?.id || !bonusType?.id) {
    throw new Error("missing salary types");
  }

  const created = await api<WrappedValue<{ id: number; payslips?: Array<{ id?: number }> }>>(
    "salary/transaction",
    {
      method: "POST",
      body: JSON.stringify({
        date: RUN_DATE,
        year: YEAR,
        month: MONTH,
        paySlipsAvailableDate: RUN_DATE,
        payslips: [
          {
            employee,
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

  return created.value.id;
}

async function probe(method: string, path: string, body?: unknown) {
  const response = await fetch(`${BASE_URL}/${path}`, {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json; charset=utf-8" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // Keep raw text.
  }
  return { method, path, status: response.status, body: parsed };
}

const transactionId = await createDraftTransaction();
const candidates = [
  ["PUT", `salary/transaction/${transactionId}/:complete`],
  ["PUT", `salary/transaction/:complete?id=${transactionId}`],
  ["PUT", `salary/transaction/${transactionId}/:approve`],
  ["PUT", `salary/transaction/:approve?id=${transactionId}`],
  ["PUT", `salary/transaction/${transactionId}/:pay`],
  ["PUT", `salary/transaction/${transactionId}/:finalize`],
  ["PUT", `salary/transaction/${transactionId}/:book`],
  ["PUT", `salary/transaction/${transactionId}/:send`],
  ["POST", `salary/transaction/${transactionId}/:complete`],
  ["POST", `salary/transaction/:complete?id=${transactionId}`],
];

const results = [];
for (const [method, path] of candidates) {
  results.push(await probe(method, path));
}

console.log(JSON.stringify({ transactionId, results }, null, 2));
