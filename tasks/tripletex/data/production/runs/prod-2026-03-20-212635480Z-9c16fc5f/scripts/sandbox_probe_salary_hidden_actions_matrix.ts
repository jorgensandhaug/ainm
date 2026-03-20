const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const TRANSACTION_ID = 6956903;
const PAYSLIP_ID = 32627921;

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

const routes = [
  "salary/voucher",
  "salary/voucherOverview",
  "salary/overviewData",
  "salary/overviewReimbursements",
  "salary/overviewTax",
  "salary/pensionVoucher",
  "salary/amessageWageOverview",
  "salary/specification",
  "salary/supplement",
  "salary/payment",
  "salary/paymentType",
  "salary/modules",
  "salary/employee",
  "salary/employeeToEmploymentsRelationship",
  "salary/transaction",
  "salary/payment/list",
  "salary/voucher/list",
  "salary/voucherOverview/list",
  `salary/specification/${PAYSLIP_ID}`,
  `salary/payment/${PAYSLIP_ID}`,
  `salary/voucher/${TRANSACTION_ID}`,
  `salary/voucherOverview/${TRANSACTION_ID}`,
  `salary/transaction/${TRANSACTION_ID}/voucher`,
  `salary/transaction/${TRANSACTION_ID}/voucherOverview`,
  `salary/transaction/${TRANSACTION_ID}/payment`,
  `salary/transaction/${TRANSACTION_ID}/payments`,
  `salary/transaction/${TRANSACTION_ID}/salaryPayments`,
  `salary/transaction/${TRANSACTION_ID}/wagePeriodTransaction`,
  `salary/transaction/${TRANSACTION_ID}/overviewData`,
];

const actionRoutes = [
  `salary/transaction/${TRANSACTION_ID}/:complete`,
  `salary/transaction/${TRANSACTION_ID}/:approve`,
  `salary/transaction/${TRANSACTION_ID}/:deliver`,
  `salary/transaction/${TRANSACTION_ID}/:book`,
  `salary/transaction/${TRANSACTION_ID}/:reopen`,
  `salary/transaction/${TRANSACTION_ID}/:reOpen`,
  `salary/transaction/${TRANSACTION_ID}/:reverse`,
  `salary/transaction/${TRANSACTION_ID}/:pay`,
  `salary/transaction/${TRANSACTION_ID}/:sendToBank`,
  `salary/transaction/${TRANSACTION_ID}/:send`,
  `salary/payment/${PAYSLIP_ID}/:complete`,
  `salary/payment/${PAYSLIP_ID}/:approve`,
  `salary/payment/${PAYSLIP_ID}/:deliver`,
  `salary/payment/${PAYSLIP_ID}/:book`,
  `salary/payment/${PAYSLIP_ID}/:reopen`,
  `salary/payment/${PAYSLIP_ID}/:pay`,
  `salary/payment/${PAYSLIP_ID}/:sendToBank`,
  `salary/voucher/${TRANSACTION_ID}/:approve`,
  `salary/voucher/${TRANSACTION_ID}/:book`,
  `salary/voucher/${TRANSACTION_ID}/:reverse`,
  `salary/wagePeriodTransaction/${TRANSACTION_ID}/:complete`,
  `salary/wagePeriodTransaction/${TRANSACTION_ID}/:approve`,
  `salary/wagePeriodTransaction/${TRANSACTION_ID}/:book`,
  `salary/wagePeriodTransaction/${TRANSACTION_ID}/:pay`,
  `wagePeriodTransaction/${TRANSACTION_ID}/:complete`,
  `wagePeriodTransaction/${TRANSACTION_ID}/:approve`,
  `wagePeriodTransaction/${TRANSACTION_ID}/:book`,
  `wagePeriodTransaction/${TRANSACTION_ID}/:pay`,
  `salary/:complete?id=${TRANSACTION_ID}`,
  `salary/payment/:complete?id=${PAYSLIP_ID}`,
  `salary/voucher/:approve?id=${TRANSACTION_ID}`,
  `salary/wagePeriodTransaction/:complete?id=${TRANSACTION_ID}`,
  `wagePeriodTransaction/:complete?id=${TRANSACTION_ID}`,
];

async function call(method: string, path: string) {
  const url = new URL(path.replace(/^\//, ""), `${BASE_URL}/`);
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

const results = [];
for (const path of routes) {
  results.push(await call("GET", `${path}?count=1&fields=*`));
}
for (const path of actionRoutes) {
  results.push(await call("PUT", path));
  results.push(await call("POST", path));
}

console.log(JSON.stringify(results.filter((row) => row.status !== 404), null, 2));
