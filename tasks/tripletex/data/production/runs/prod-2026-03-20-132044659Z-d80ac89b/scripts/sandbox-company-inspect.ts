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

const employeeResp = await api("/employee?count=1&fields=*");
const employee = employeeResp.values?.[0];
if (!employee) throw new Error("employee not found");

const company = await api(`/company/${employee.companyId}?fields=*`);
console.log(JSON.stringify({ employee, company }, null, 2));
