const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const auth = Buffer.from(`0:${sessionToken}`).toString("base64");

function buildUrl(path: string, params?: Record<string, string>) {
  const url = new URL(path, `${baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function api<T>(path: string, params: Record<string, string>) {
  const response = await fetch(buildUrl(path, params), {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return JSON.parse(text) as T;
}

type ListResponse<T> = { values: T[] };
type Customer = { id: number; name?: string; organizationNumber?: string };
type Employee = { id: number; name?: string; email?: string };

async function main() {
  const customers = await api<ListResponse<Customer>>("customer", {
    count: "20",
    fields: "*",
  });
  const employees = await api<ListResponse<Employee>>("employee", {
    assignableProjectManagers: "true",
    count: "20",
    fields: "*",
  });

  const usableCustomers = (customers.values ?? []).filter((value) => value.organizationNumber);
  const usableEmployees = (employees.values ?? []).filter((value) => value.email);

  console.log(
    JSON.stringify(
      {
        usableCustomers,
        usableEmployees,
      },
      null,
      2,
    ),
  );
}

await main();
