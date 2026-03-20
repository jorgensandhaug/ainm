const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const TRANSACTION_ID = 6956903;
const PAYSLIP_ID = 32627921;

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

const candidates = [
  "salaryTransaction",
  "salaryTransaction/:complete?id=6956903",
  `salaryTransaction/${TRANSACTION_ID}`,
  `salaryTransaction/${TRANSACTION_ID}/:complete`,
  "salaryPayment",
  `salaryPayment/${PAYSLIP_ID}`,
  `salaryPayment/${PAYSLIP_ID}/:complete`,
  "salaryPaymentType",
  "salaryVoucher",
  `salaryVoucher/${TRANSACTION_ID}`,
  "salaryVoucherOverview",
  `salaryVoucherOverview/${TRANSACTION_ID}`,
  "salaryOverviewData",
  "salaryOverviewTax",
  "salaryOverviewReimbursements",
  "salaryModules",
  "salaryEmployee",
  "salarySpecification",
  `salarySpecification/${PAYSLIP_ID}`,
  "wagePeriodTransaction",
  `wagePeriodTransaction/${TRANSACTION_ID}`,
  `wagePeriodTransaction/${TRANSACTION_ID}/:complete`,
];

async function probe(method: string, path: string) {
  const response = await fetch(new URL(path.replace(/^\//, ""), `${BASE_URL}/`), {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
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
    method,
    path,
    status: response.status,
    allow: response.headers.get("allow"),
    body,
  };
}

const results = [];
for (const candidate of candidates) {
  results.push(await probe("GET", `${candidate}${candidate.includes("?") ? "&" : "?"}count=1&fields=*`));
  results.push(await probe("PUT", candidate));
  results.push(await probe("POST", candidate));
}
console.log(JSON.stringify(results.filter((row) => row.status !== 404), null, 2));
