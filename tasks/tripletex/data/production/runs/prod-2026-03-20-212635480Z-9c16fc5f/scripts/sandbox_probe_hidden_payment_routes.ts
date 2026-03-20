const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
const TRANSACTION_ID = 6956887;
const PAYSLIP_ID = 32627905;

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

const rawCandidates = [
  "payment",
  "payment/list",
  "payment/:approve",
  "payment/:cancel",
  "payment/:delete",
  "payment/:book",
  "payment/:complete",
  "payment/:sendToBank",
  "payment/approval",
  "payment/approval/list",
  "payment/approvalList",
  "payment/notApproved",
  "payment/status",
  "payment/sourceVoucher",
  "paymentType",
  "payments",
  "autopayTransaction",
  "autopayTransaction/list",
  "ztlTransaction",
  "ztlTransaction/list",
  "salary/payment",
  "salary/payment/list",
  "salary/paymentType",
  "salary/paymentType/list",
  "salary/voucher",
  "salary/voucherOverview",
  "salary/wagePeriodTransaction",
  "salary/wageTransaction",
  "salary/payroll",
  "salary/complete",
  "salary/:complete",
  "salary/transaction/:addPayment",
  "salary/transaction/:complete",
  "salary/transaction/:book",
  "salary/transaction/:deliver",
  "salary/transaction/:pay",
  "salary/transaction/:approve",
  "salary/transaction/:finalize",
  "salary/transaction/:send",
  `payment/${TRANSACTION_ID}`,
  `payment/${PAYSLIP_ID}`,
  `salary/payment/${TRANSACTION_ID}`,
  `salary/payment/${PAYSLIP_ID}`,
  `salary/transaction/${TRANSACTION_ID}/addPayment`,
  `salary/transaction/${TRANSACTION_ID}/payment`,
  `salary/transaction/${TRANSACTION_ID}/paymentType`,
  `salary/transaction/${TRANSACTION_ID}/complete`,
  `salary/transaction/${TRANSACTION_ID}/pay`,
  `salary/transaction/${TRANSACTION_ID}/book`,
  `salary/transaction/${TRANSACTION_ID}/deliver`,
  `salary/transaction/${TRANSACTION_ID}/voucher`,
  `salary/transaction/${TRANSACTION_ID}/voucherOverview`,
  `salary/transaction/${TRANSACTION_ID}/wagePeriodTransaction`,
  `salary/transaction/${TRANSACTION_ID}/salaryPayment`,
  `salary/payslip/${PAYSLIP_ID}/deliver`,
  `salary/payslip/${PAYSLIP_ID}/payment`,
  `salary/payslip/${PAYSLIP_ID}/complete`,
  `salary/payslip/${PAYSLIP_ID}/voucher`,
  "wagePeriodTransaction",
  "wagePeriodTransaction/list",
  `wagePeriodTransaction/${TRANSACTION_ID}`,
  "wageTransaction",
  "wageTransaction/list",
  `wageTransaction/${TRANSACTION_ID}`,
];

const uniqueCandidates = [...new Set(rawCandidates)];
const results = [];
for (const candidate of uniqueCandidates) {
  const result = await probe(candidate);
  if (result.status !== 404 || result.allow || result.body) {
    results.push(result);
  }
}

console.log(JSON.stringify(results, null, 2));
