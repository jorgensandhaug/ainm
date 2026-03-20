const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const PAYSLIP_ID = 32627552;

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

async function get(path: string) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

const sparse = await get(`/salary/payslip/${PAYSLIP_ID}?fields=*`);
const expanded = await get(
  `/salary/payslip/${PAYSLIP_ID}?fields=*,specifications(*,salaryType(*),employee(*),department(*),project(*))`,
);

console.log(JSON.stringify({ sparse, expanded }, null, 2));
