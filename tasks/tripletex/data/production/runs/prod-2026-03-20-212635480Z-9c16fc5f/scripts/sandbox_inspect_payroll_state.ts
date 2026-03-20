const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const EMPLOYEE_ID = 18582627;
const TRANSACTION_ID = 6956851;
const PAYSLIP_ID = 32627869;

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

async function api(path: string) {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const url = new URL(path.replace(/^\//, ""), base);
  const response = await fetch(url, {
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} ${path}\n${text}`);
  }
  return text ? JSON.parse(text) : null;
}

const result = {
  settings: await api("salary/settings?fields=*"),
  transaction: await api(`salary/transaction/${TRANSACTION_ID}?fields=*`),
  payslip: await api(`salary/payslip/${PAYSLIP_ID}?fields=*,specifications(*,salaryType(*),employee(*),department(*),project(*))`),
  payslipSearch: await api(
    `salary/payslip?employeeId=${EMPLOYEE_ID}&yearFrom=2026&yearTo=2026&monthFrom=3&monthTo=4&count=1000&fields=*`,
  ),
  compilation: await api(`salary/compilation?employeeId=${EMPLOYEE_ID}&year=2026&fields=*`),
};

console.log(JSON.stringify(result, null, 2));
