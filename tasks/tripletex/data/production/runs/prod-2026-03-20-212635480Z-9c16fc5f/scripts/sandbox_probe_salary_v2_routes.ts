const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
const TRANSACTION_ID = 6956892;
const PAYSLIP_ID = 32627910;

async function probe(path: string, method = "OPTIONS") {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const url = new URL(path.replace(/^\//, ""), base);
  const response = await fetch(url, {
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

const candidates = [
  "salary/v2",
  "salary/v2/transaction",
  "salary/v2/transaction/list",
  `salary/v2/transaction/${TRANSACTION_ID}`,
  "salary/v2/transaction/:complete",
  "salary/v2/transaction/:approve",
  "salary/v2/transaction/:book",
  "salary/v2/transaction/:send",
  `salary/v2/transaction/${TRANSACTION_ID}/:complete`,
  `salary/v2/transaction/${TRANSACTION_ID}/:approve`,
  `salary/v2/transaction/${TRANSACTION_ID}/:book`,
  "salary/v2/transactions",
  `salary/v2/transactions/${TRANSACTION_ID}`,
  "salary/v2/payment",
  "salary/v2/payment/list",
  `salary/v2/payment/${PAYSLIP_ID}`,
  "salary/v2/payments",
  `salary/v2/payments/${PAYSLIP_ID}`,
  "salary/v2/paymentType",
  "salary/v2/paymentTypes",
  "salary/v2/voucherOverview",
  `salary/v2/voucherOverview/${TRANSACTION_ID}`,
  "salary/v2/voucher",
  `salary/v2/voucher/${TRANSACTION_ID}`,
  "salary/v2/overviewData",
  `salary/v2/overviewData/${TRANSACTION_ID}`,
  "salary/v2/settings",
  "salary/v2/specification",
  `salary/v2/specification/${PAYSLIP_ID}`,
  "salary/v2/type",
  "salary/v2/types",
  "salaryV2/transaction",
  "salaryV2/payment",
  "salaryV2/paymentType",
  "salaryV2/voucherOverview",
  "salaryV2/overviewData",
];

const results = [];
for (const candidate of candidates) {
  results.push(await probe(candidate));
}

console.log(JSON.stringify(results, null, 2));
