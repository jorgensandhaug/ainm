const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const auth = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;

async function api(path: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: auth,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}\n${text}`);
  return text ? JSON.parse(text) : null;
}

const payslips = await api(
  "/salary/payslip?employeeId=18441996&yearFrom=2026&monthFrom=1&yearTo=2027&monthTo=1&count=1000&fields=*",
);
console.log(JSON.stringify(payslips, null, 2));
