const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const customerOrganizationNumber = "889752963";
const customerName = "Codex Payment Probe 752963";
const managerEmail = "simen.sandhaug@gmail.com";
const projectName = `Project Proof ${Date.now()}`;
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
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return JSON.parse(text) as T;
}

type ListResponse<T> = { values: T[] };
type Customer = { id: number; name?: string; organizationNumber?: string };
type Employee = { id: number; email?: string; displayName?: string };
type Project = {
  id: number;
  name: string;
  startDate: string;
  customer?: { id: number };
  projectManager?: { id: number };
};

function requireSingleExactCustomer(values: Customer[]) {
  const exact = values.filter((value) => value.organizationNumber === customerOrganizationNumber);
  if (exact.length === 1) return exact[0];
  const byName = exact.filter((value) => value.name === customerName);
  if (byName.length === 1) return byName[0];
  throw new Error(`Customer resolution failed: ${JSON.stringify(values)}`);
}

function requireSingleExactManager(values: Employee[]) {
  const exact = values.filter((value) => value.email === managerEmail);
  if (exact.length === 1) return exact[0];
  throw new Error(`Manager resolution failed: ${JSON.stringify(values)}`);
}

async function main() {
  const customers = await api<ListResponse<Customer>>("customer", undefined, {
    organizationNumber: customerOrganizationNumber,
    count: "10",
    fields: "*",
  });
  const customer = requireSingleExactCustomer(customers.values ?? []);

  const employees = await api<ListResponse<Employee>>("employee", undefined, {
    email: managerEmail,
    assignableProjectManagers: "true",
    count: "10",
    fields: "*",
  });
  const manager = requireSingleExactManager(employees.values ?? []);

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
