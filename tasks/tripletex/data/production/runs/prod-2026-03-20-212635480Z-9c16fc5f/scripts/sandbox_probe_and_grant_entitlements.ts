const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

async function api(path: string, init?: RequestInit) {
  const response = await fetch(`${BASE_URL}/${path}`, {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init?.headers ?? {}),
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
    status: response.status,
    body,
  };
}

const whoAmI = await api("token/session/>whoAmI?fields=*");
const employeeId =
  (whoAmI.body as any)?.value?.employeeId ?? (whoAmI.body as any)?.value?.employee?.id ?? null;

const beforeEntitlements = employeeId
  ? await api(`employee/entitlement?employeeId=${employeeId}&count=1000&fields=*`)
  : null;
const beforeSalarySpecification = await api("salary/specification?count=1&fields=*");
const beforeSalaryTransactionList = await api("salary/transaction?count=1&fields=*");

const grantAll = employeeId
  ? await api(
      `employee/entitlement/:grantEntitlementsByTemplate?employeeId=${employeeId}&template=ALL_PRIVILEGES`,
      { method: "PUT" },
    )
  : null;

const afterEntitlements = employeeId
  ? await api(`employee/entitlement?employeeId=${employeeId}&count=1000&fields=*`)
  : null;
const afterSalarySpecification = await api("salary/specification?count=1&fields=*");
const afterSalaryTransactionList = await api("salary/transaction?count=1&fields=*");

console.log(
  JSON.stringify(
    {
      whoAmI,
      beforeEntitlements,
      beforeSalarySpecification,
      beforeSalaryTransactionList,
      grantAll,
      afterEntitlements,
      afterSalarySpecification,
      afterSalaryTransactionList,
    },
    null,
    2,
  ),
);
