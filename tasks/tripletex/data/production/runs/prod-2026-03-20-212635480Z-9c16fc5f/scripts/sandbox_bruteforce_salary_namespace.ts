const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const TRANSACTION_ID = Number(process.argv[2] ?? "6956925");
const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

const nouns = [
  "payment",
  "payments",
  "salaryPayment",
  "salaryPayments",
  "paymentType",
  "paymentTypes",
  "voucher",
  "vouchers",
  "voucherOverview",
  "overview",
  "wage",
  "wagePayment",
  "wagePayments",
  "wagePeriod",
  "wagePeriodTransaction",
  "wagePeriodTransactions",
  "wageVoucher",
  "wageVouchers",
  "transaction",
  "transactions",
  "complete",
  "completion",
  "finalize",
  "book",
  "pay",
  "approve",
  "approval",
  "deliver",
  "send",
  "bankList",
  "details",
  "validation",
];

const paths = new Set<string>();

for (const noun of nouns) {
  paths.add(`salary/${noun}?count=1&fields=*`);
  paths.add(`salary/${noun}/list?count=1&fields=*`);
  paths.add(`salary/${noun}/overview?count=1&fields=*`);
  paths.add(`salary/${noun}/types?count=1&fields=*`);
  paths.add(`salary/transaction/${TRANSACTION_ID}/${noun}?count=1&fields=*`);
  paths.add(`salary/transaction/:${noun}?id=${TRANSACTION_ID}&count=1&fields=*`);
}

async function probe(path: string, method: "GET" | "OPTIONS") {
  const response = await fetch(`${BASE_URL}/${path}`, {
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

const interesting = [];
for (const path of paths) {
  const getResult = await probe(path, "GET");
  const message = JSON.stringify(getResult.body ?? "");
  const pathParamNoise =
    getResult.status === 422 &&
    (message.includes("Expected number") ||
      message.includes("Path Param") ||
      message.includes("For input string"));

  if (getResult.status !== 404 && !pathParamNoise) {
    interesting.push(getResult);
    continue;
  }

  const optionsResult = await probe(path, "OPTIONS");
  if (optionsResult.status !== 404) {
    interesting.push(optionsResult);
  }
}

console.log(JSON.stringify(interesting, null, 2));
