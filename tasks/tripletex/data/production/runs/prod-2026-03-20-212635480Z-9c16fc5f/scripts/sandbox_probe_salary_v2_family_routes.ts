const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const TRANSACTION_ID = Number(process.argv[2] ?? "6956919");
const PAYSLIP_ID = Number(process.argv[3] ?? "32627937");
const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

const candidates = [
  "salary/payment?count=1&fields=*",
  "salary/payment/validation?count=1&fields=*",
  "salary/paymentType?count=1&fields=*",
  "salary/paymentType/available?count=1&fields=*",
  "salary/voucher?count=1&fields=*",
  "salary/voucherOverview?count=1&fields=*",
  "salary/voucher/overview?count=1&fields=*",
  "salary/wagePeriodTransaction?count=1&fields=*",
  "salary/wagePeriodVoucher?count=1&fields=*",
  "salary/wageVoucher?count=1&fields=*",
  "salary/salaryPayment?count=1&fields=*",
  "salary/salaryPayments?count=1&fields=*",
  `salary/transaction/${TRANSACTION_ID}/salaryPayments?count=1&fields=*`,
  `salary/transaction/${TRANSACTION_ID}/salaryPayment?count=1&fields=*`,
  `salary/transaction/${TRANSACTION_ID}/payment?count=1&fields=*`,
  `salary/transaction/${TRANSACTION_ID}/paymentType?count=1&fields=*`,
  `salary/transaction/${TRANSACTION_ID}/voucher?count=1&fields=*`,
  `salary/transaction/${TRANSACTION_ID}/voucherOverview?count=1&fields=*`,
  `salary/transaction/${TRANSACTION_ID}/wagePeriodTransaction?count=1&fields=*`,
  `salary/transaction/${TRANSACTION_ID}/wageVoucher?count=1&fields=*`,
  `salary/payslip/${PAYSLIP_ID}/salaryPayments?count=1&fields=*`,
  `salary/payslip/${PAYSLIP_ID}/payment?count=1&fields=*`,
  `salary/payslip/${PAYSLIP_ID}/voucher?count=1&fields=*`,
  `salary/payslip/${PAYSLIP_ID}/validation?count=1&fields=*`,
  "wagePeriodTransaction?count=1&fields=*",
  "wagePeriodVoucher?count=1&fields=*",
  "wageVoucher?count=1&fields=*",
  "salaryPayment?count=1&fields=*",
  "salaryPayments?count=1&fields=*",
  "salaryVoucher?count=1&fields=*",
  "salaryVoucherOverview?count=1&fields=*",
  "salaryPaymentType?count=1&fields=*",
];

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

const results = [];
for (const candidate of candidates) {
  const getResult = await probe(candidate, "GET");
  if (getResult.status !== 404) {
    results.push(getResult);
    continue;
  }
  const optionsResult = await probe(candidate, "OPTIONS");
  if (optionsResult.status !== 404) {
    results.push(optionsResult);
  }
}

console.log(JSON.stringify(results, null, 2));
