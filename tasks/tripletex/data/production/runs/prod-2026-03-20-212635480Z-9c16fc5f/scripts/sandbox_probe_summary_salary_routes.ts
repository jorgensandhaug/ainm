const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

const candidates = [
  "employee/>overview?count=1&fields=*",
  "employee/>employeeOverview?count=1&fields=*",
  "employee/>payrollOverview?count=1&fields=*",
  "salary/>overview?count=1&fields=*",
  "salary/>voucherOverview?count=1&fields=*",
  "salary/>paymentType?count=1&fields=*",
  "salary/>payment?count=1&fields=*",
  "salary/transaction/>overview?count=1&fields=*",
  "salary/transaction/>voucherOverview?count=1&fields=*",
  "salary/transaction/>paymentType?count=1&fields=*",
  "salary/transaction/>payment?count=1&fields=*",
  "salary/payslip/>overview?count=1&fields=*",
  "salary/payslip/>voucherOverview?count=1&fields=*",
  "wagePeriodTransaction/>overview?count=1&fields=*",
  "salaryVoucher/>overview?count=1&fields=*",
];

async function probe(path: string, method: "GET" | "POST" | "OPTIONS") {
  const response = await fetch(`${BASE_URL}/${path}`, {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(method === "POST" ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify({}) } : {}),
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
  const getResult = await probe(candidate, "GET");
  if (getResult.status !== 404) {
    results.push(getResult);
    continue;
  }
  const postResult = await probe(candidate, "POST");
  if (postResult.status !== 404) {
    results.push(postResult);
    continue;
  }
  const optionsResult = await probe(candidate, "OPTIONS");
  if (optionsResult.status !== 404) {
    results.push(optionsResult);
  }
}

console.log(JSON.stringify(results, null, 2));
