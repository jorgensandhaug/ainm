const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const COMPANY_ID = 108114337;
const EMPLOYEE_ID = 18587860;

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

type Candidate = {
  path: string;
  body?: unknown;
};

const candidates: Candidate[] = [
  {
    path: "wageTransaction",
    body: {
      companyId: COMPANY_ID,
      comment: "sandbox wageTransaction probe",
      historical: false,
      payrollTaxCalcMethod: "AA",
    },
  },
  {
    path: "wagePayment",
    body: {
      companyId: COMPANY_ID,
      employeeId: EMPLOYEE_ID,
      description: "sandbox wagePayment probe",
      vacationAllowanceExtraAmount: 0,
      wageTransactionId: 0,
    },
  },
  {
    path: "wageSpecification",
    body: {
      companyId: COMPANY_ID,
      wageCodeId: 0,
      employeeId: EMPLOYEE_ID,
      wagePaymentId: 0,
      date: "2026-03-20",
      description: "sandbox wageSpecification probe",
      count: 1,
      type: 0,
    },
  },
  {
    path: "wageCode",
    body: {
      companyId: COMPANY_ID,
      number: "999999",
      name: "Sandbox probe",
      description: "sandbox wageCode probe",
      inactive: false,
    },
  },
  {
    path: "wage/transaction",
    body: {
      companyId: COMPANY_ID,
      comment: "sandbox wage/transaction probe",
      historical: false,
      payrollTaxCalcMethod: "AA",
    },
  },
  {
    path: "wage/payment",
    body: {
      companyId: COMPANY_ID,
      employeeId: EMPLOYEE_ID,
      description: "sandbox wage/payment probe",
      wageTransactionId: 0,
    },
  },
  {
    path: "wage/specification",
    body: {
      companyId: COMPANY_ID,
      wageCodeId: 0,
      employeeId: EMPLOYEE_ID,
      wagePaymentId: 0,
      date: "2026-03-20",
      description: "sandbox wage/specification probe",
      count: 1,
      type: 0,
    },
  },
  {
    path: "salaryV2/transaction",
    body: {
      date: "2026-03-20",
      year: 2026,
      month: 3,
      completed: false,
      paymentDate: "2026-03-20",
      hasBankTransfers: false,
    },
  },
  {
    path: "salaryV2/payment",
    body: {
      employee: { id: EMPLOYEE_ID },
      date: "2026-03-20",
      year: 2026,
      month: 3,
      comment: "sandbox salaryV2/payment probe",
    },
  },
  {
    path: "salaryV2/specification",
    body: {
      description: "sandbox salaryV2/specification probe",
      date: "2026-03-20",
      year: 2026,
      month: 3,
      count: 1,
      amount: 1,
    },
  },
  {
    path: "salary/v2/transaction",
    body: {
      date: "2026-03-20",
      year: 2026,
      month: 3,
      completed: false,
      paymentDate: "2026-03-20",
      hasBankTransfers: false,
    },
  },
  {
    path: "salary/v2/payment",
    body: {
      employee: { id: EMPLOYEE_ID },
      date: "2026-03-20",
      year: 2026,
      month: 3,
      comment: "sandbox salary/v2/payment probe",
    },
  },
];

async function probe(method: "OPTIONS" | "POST", candidate: Candidate) {
  const response = await fetch(new URL(candidate.path, `${BASE_URL}/`), {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(method === "POST" ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(candidate.body ?? {}) } : {}),
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
    method,
    path: candidate.path,
    status: response.status,
    allow: response.headers.get("allow"),
    body,
  };
}

const results = [];
for (const candidate of candidates) {
  results.push(await probe("OPTIONS", candidate));
  results.push(await probe("POST", candidate));
}

console.log(JSON.stringify(results.filter((row) => row.status !== 404), null, 2));
