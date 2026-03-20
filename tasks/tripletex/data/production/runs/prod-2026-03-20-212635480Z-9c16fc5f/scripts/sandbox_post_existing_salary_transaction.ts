const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const TRANSACTION_ID = Number(process.argv[2] ?? "6956925");
const PAYSLIP_ID = Number(process.argv[3] ?? "32627943");
const EMPLOYEE_ID = Number(process.argv[4] ?? "18587860");
const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

async function api(path: string, init?: RequestInit) {
  const response = await fetch(`${BASE_URL}/${path}`, {
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
  return {
    status: response.status,
    body,
  };
}

const current = await api(`salary/transaction/${TRANSACTION_ID}?fields=*`);
const paymentTypes = await api("ledger/paymentTypeOut?count=1000&fields=*");
const wagePaymentType = (paymentTypes.body as any).values.find((value: any) => value.showWagePeriodTransaction);

const payloads = [
  {
    label: "id-version-completed",
    body: {
      id: TRANSACTION_ID,
      version: (current.body as any)?.value?.version ?? 0,
      completed: true,
    },
  },
  {
    label: "id-version-completed-payment",
    body: {
      id: TRANSACTION_ID,
      version: (current.body as any)?.value?.version ?? 0,
      completed: true,
      paymentDate: "2026-03-20",
    },
  },
  {
    label: "id-version-completed-payment-type",
    body: {
      id: TRANSACTION_ID,
      version: (current.body as any)?.value?.version ?? 0,
      completed: true,
      paymentDate: "2026-03-20",
      paymentType: wagePaymentType ? { id: wagePaymentType.id } : undefined,
    },
  },
  {
    label: "id-version-public-plus-hidden",
    body: {
      id: TRANSACTION_ID,
      version: (current.body as any)?.value?.version ?? 0,
      date: "2026-03-20",
      year: 2026,
      month: 3,
      paySlipsAvailableDate: "2026-03-20",
      completed: true,
      paymentDate: "2026-03-20",
      paymentType: wagePaymentType ? { id: wagePaymentType.id } : undefined,
      payslips: [{ id: PAYSLIP_ID }],
    },
  },
];

const results = [];
for (const payload of payloads) {
  results.push({
    label: payload.label,
    response: await api("salary/transaction", {
      method: "POST",
      body: JSON.stringify(payload.body),
    }),
    afterTransaction: await api(`salary/transaction/${TRANSACTION_ID}?fields=*`),
    afterPayslip: await api(`salary/payslip/${PAYSLIP_ID}?fields=*`),
    afterSearch: await api(
      `salary/payslip?employeeId=${EMPLOYEE_ID}&yearFrom=2026&yearTo=2027&monthFrom=3&monthTo=4&count=100&fields=*`,
    ),
    afterCompilation: await api(`salary/compilation?employeeId=${EMPLOYEE_ID}&year=2026&fields=*`),
    afterPostings: await api(
      `ledger/posting?employeeId=${EMPLOYEE_ID}&dateFrom=2026-03-20&dateTo=2026-03-21&type=WAGE&fields=*`,
    ),
  });
}

console.log(JSON.stringify({ current, wagePaymentType, results }, null, 2));
