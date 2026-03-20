const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const TRANSACTION_ID = 6956892;
const PAYSLIP_ID = 32627910;
const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

async function fetchJson(path: string) {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const url = new URL(path.replace(/^\//, ""), base);
  const response = await fetch(url, {
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
  return { status: response.status, body };
}

const transaction = await fetchJson(
  `salary/transaction/${TRANSACTION_ID}?fields=*,completed,reversed,reverser,okAllowReverseDifferentDate,paymentDate,paymentType(*),voucher(*),sumPaidAmount,sumTaxDeductionAmount,allowDeletePayments,anyExternalChangesOnThisTransaction,attachment(*),ameldingWageId,containsNegativeWps,useLandscapeForBankList,numberEmployees,wagePeriodTransactionId,ameldingWageNumber,wagePeriodTransactionNumber,reverseVoucherDisplayName,urlDetails`,
);

const payslip = await fetchJson(
  `salary/payslip/${PAYSLIP_ID}?fields=*,number,bankAccountOrIban,payrollTaxPercentage,deliveryMethodPaySlip,isTaxCardMissing,comment,employeeHourlyWage,seamenDaysOnBoard,lastMonthPaidAmount,employeeSalaryDate,suggestAddReadjustment,isEmploymentInfoAmeldinger,seamenDeduction,validationResults(*),holidayAllowanceRate,payrollTaxMunicipality(*),division(*)`,
);

console.log(JSON.stringify({ transaction, payslip }, null, 2));
