const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

async function api(path: string) {
  const response = await fetch(new URL(path.replace(/^\//, ""), `${BASE_URL}/`), {
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${response.status} ${path}\n${text}`);
  }
  return body;
}

const employees = await api("employee?count=1000&fields=*");
const values = Array.isArray(employees?.values) ? employees.values : [];

const summarized = values.map((employee: any) => ({
  id: employee.id,
  email: employee.email,
  displayName: employee.displayName,
  dateOfBirth: employee.dateOfBirth,
  bankAccountNumber: employee.bankAccountNumber,
  nationalIdentityNumber: employee.nationalIdentityNumber,
  departmentId: employee.department?.id ?? null,
  employments: Array.isArray(employee.employments)
    ? employee.employments.map((employment: any) => ({
        id: employment.id,
        startDate: employment.startDate ?? null,
        endDate: employment.endDate ?? null,
        divisionId: employment.division?.id ?? null,
      }))
    : [],
  deliveryMethodWageSlipString: employee.deliveryMethodWageSlipString ?? null,
}));

const candidates = summarized
  .filter((employee: any) => employee.dateOfBirth && employee.bankAccountNumber)
  .sort((a: any, b: any) => {
    const score = (row: any) =>
      Number(Boolean(row.nationalIdentityNumber)) +
      Number(Boolean(row.deliveryMethodWageSlipString)) +
      row.employments.filter((employment: any) => employment.startDate && employment.divisionId).length;
    return score(b) - score(a);
  });

console.log(JSON.stringify({ count: summarized.length, candidates: candidates.slice(0, 40) }, null, 2));
