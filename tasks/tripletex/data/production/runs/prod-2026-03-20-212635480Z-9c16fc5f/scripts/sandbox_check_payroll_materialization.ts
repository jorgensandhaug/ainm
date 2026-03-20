const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const employeeId = Number(process.argv[2]);
const transactionId = Number(process.argv[3]);
const payslipId = Number(process.argv[4]);

if (!employeeId || !transactionId || !payslipId) {
  throw new Error("Usage: bun sandbox_check_payroll_materialization.ts <employeeId> <transactionId> <payslipId>");
}

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

async function request(path: string, accept = "application/json") {
  const url = new URL(path.replace(/^\//, ""), `${BASE_URL}/`);
  const response = await fetch(url, {
    headers: {
      Authorization: authHeader,
      Accept: accept,
    },
  });
  const text = await response.text();
  let body: unknown = text;
  if (accept.includes("json")) {
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // Keep raw text.
    }
  }
  return {
    status: response.status,
    ok: response.ok,
    headers: Object.fromEntries(response.headers.entries()),
    body,
  };
}

const result = {
  transaction: await request(`salary/transaction/${transactionId}?fields=*`),
  payslip: await request(
    `salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*),employee(*),department(*),project(*))`,
  ),
  payslipSearch: await request(
    `salary/payslip?employeeId=${employeeId}&yearFrom=2026&yearTo=2026&monthFrom=1&monthTo=12&count=1000&fields=*`,
  ),
  payslipPdf: await request(`salary/payslip/${payslipId}/pdf`, "application/pdf"),
  compilation: await request(`salary/compilation?employeeId=${employeeId}&year=2026&fields=*`),
  postings: await request(
    `ledger/posting?employeeId=${employeeId}&dateFrom=2026-01-01&dateTo=2026-12-31&count=1000&fields=*`,
  ),
};

console.log(JSON.stringify(result, null, 2));
