const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const TRANSACTION_ID = 6956903;
const PAYSLIP_ID = 32627921;
const SPECIFICATION_ID = 208280242;

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

const candidates = [
  `salary/transaction/:complete?id=${TRANSACTION_ID}`,
  `salary/transaction/:approve?id=${TRANSACTION_ID}`,
  `salary/transaction/:deliver?id=${TRANSACTION_ID}`,
  `salary/transaction/:book?id=${TRANSACTION_ID}`,
  `salary/transaction/:pay?id=${TRANSACTION_ID}`,
  `salary/transaction/:reopen?id=${TRANSACTION_ID}`,
  `salary/payslip/:complete?id=${PAYSLIP_ID}`,
  `salary/payslip/:approve?id=${PAYSLIP_ID}`,
  `salary/payslip/:deliver?id=${PAYSLIP_ID}`,
  `salary/payslip/:book?id=${PAYSLIP_ID}`,
  `salary/payslip/:pay?id=${PAYSLIP_ID}`,
  `salary/payslip/:reopen?id=${PAYSLIP_ID}`,
  `salary/specification/:approve?id=${SPECIFICATION_ID}`,
  `salary/specification/:deliver?id=${SPECIFICATION_ID}`,
  `salary/specification/:book?id=${SPECIFICATION_ID}`,
  `salary/specification/:pay?id=${SPECIFICATION_ID}`,
];

async function probe(method: string, path: string) {
  const response = await fetch(new URL(path, `${BASE_URL}/`), {
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
  results.push(await probe("PUT", candidate));
  results.push(await probe("POST", candidate));
  results.push(await probe("OPTIONS", candidate));
}

console.log(JSON.stringify(results.filter((row) => row.status !== 404), null, 2));
