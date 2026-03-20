const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const requestedCustomerOrg = "999148387";
const requestedCustomerName = "Havbris AS";
const requestedManagerEmail = "henrik.degard@example.org";
const requestedManagerName = "Henrik Ødegård";
const projectName = `Reflection Project ${Date.now()}`;
const startDate = "2026-03-20";

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

async function api<T>(path: string, init?: RequestInit, params?: Record<string, string>) {
  const response = await fetch(buildUrl(path, params), {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return body as T;
}

type ListResponse<T> = { values: T[] };
type Customer = { id: number; name?: string; organizationNumber?: string };
type Employee = { id: number; name?: string; email?: string };
type Project = {
  id: number;
  name: string;
  startDate: string;
  customer?: { id: number };
  projectManager?: { id: number };
};

function pickExactCustomer(values: Customer[]) {
  const exact = values.filter((value) => value.organizationNumber === requestedCustomerOrg);
  if (exact.length === 1) return exact[0];
  const byName = exact.filter((value) => value.name === requestedCustomerName);
  if (byName.length === 1) return byName[0];
  return null;
}

function pickExactManager(values: Employee[]) {
  const exact = values.filter((value) => value.email === requestedManagerEmail);
  if (exact.length === 1) return exact[0];
  const byName = exact.filter((value) => value.name === requestedManagerName);
  if (byName.length === 1) return byName[0];
  return null;
}

async function main() {
  const customers = await api<ListResponse<Customer>>("customer", undefined, {
    organizationNumber: requestedCustomerOrg,
    count: "10",
    fields: "*",
  });
  const customer = pickExactCustomer(customers.values ?? []);

  const employees = await api<ListResponse<Employee>>("employee", undefined, {
    email: requestedManagerEmail,
    assignableProjectManagers: "true",
    count: "10",
    fields: "*",
  });
  const manager = pickExactManager(employees.values ?? []);

  if (!customer || !manager) {
    console.log(
      JSON.stringify(
        {
          foundRequestedCustomer: customer,
          foundRequestedManager: manager,
          customers: customers.values,
          employees: employees.values,
        },
        null,
        2,
      ),
    );
    return;
  }

  const created = await api<{ value: Project }>("project", {
    method: "POST",
    body: JSON.stringify({
      name: projectName,
      startDate,
      customer: { id: customer.id },
      projectManager: { id: manager.id },
    }),
  });

  console.log(
    JSON.stringify(
      {
        customer,
        manager,
        created: created.value,
      },
      null,
      2,
    ),
  );
}

await main();
