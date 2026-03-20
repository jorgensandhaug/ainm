const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "CSDutcloFVGiG9_p6tlwfi-SFFWfhpoGkcDw7r74XZU";

const projectName = "Integrasjon Havbris";
const startDate = "2026-03-20";
const customerOrganizationNumber = "999148387";
const customerName = "Havbris AS";
const managerEmail = "henrik.degard@example.org";
const managerName = "Henrik Ødegård";

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

async function tripletex<T>(path: string, init?: RequestInit, params?: Record<string, string>): Promise<T> {
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
    if (
      response.status === 403 &&
      (body?.error === "Invalid or expired token" ||
        body?.error ===
          "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.")
    ) {
      throw new Error(`Blocked credentials: ${JSON.stringify(body)}`);
    }
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return body as T;
}

type ListResponse<T> = { values: T[]; fullResultSize?: number };
type Wrapped<T> = { value: T };

type Customer = {
  id: number;
  name?: string;
  organizationNumber?: string;
};

type Employee = {
  id: number;
  name?: string;
  email?: string;
};

type Project = {
  id: number;
  name: string;
  startDate: string;
  customer?: { id: number; organizationNumber?: string; name?: string };
  projectManager?: { id: number; email?: string; name?: string };
};

function requireSingleExactCustomer(customers: Customer[]) {
  const exactOrg = customers.filter((customer) => customer.organizationNumber === customerOrganizationNumber);
  if (exactOrg.length === 1) {
    return exactOrg[0];
  }
  const exactOrgAndName = exactOrg.filter((customer) => customer.name === customerName);
  if (exactOrgAndName.length === 1) {
    return exactOrgAndName[0];
  }
  throw new Error(`Customer resolution failed: ${JSON.stringify(customers)}`);
}

function requireSingleExactManager(employees: Employee[]) {
  const exactEmail = employees.filter((employee) => employee.email === managerEmail);
  if (exactEmail.length === 1) {
    return exactEmail[0];
  }
  const exactEmailAndName = exactEmail.filter((employee) => employee.name === managerName);
  if (exactEmailAndName.length === 1) {
    return exactEmailAndName[0];
  }
  throw new Error(`Manager resolution failed: ${JSON.stringify(employees)}`);
}

async function main() {
  const customers = await tripletex<ListResponse<Customer>>("customer", undefined, {
    organizationNumber: customerOrganizationNumber,
    count: "10",
    fields: "*",
  });
  const customer = requireSingleExactCustomer(customers.values ?? []);

  const employees = await tripletex<ListResponse<Employee>>("employee", undefined, {
    email: managerEmail,
    assignableProjectManagers: "true",
    count: "10",
    fields: "*",
  });
  const manager = requireSingleExactManager(employees.values ?? []);

  const created = await tripletex<Wrapped<Project>>(
    "project",
    {
      method: "POST",
      body: JSON.stringify({
        name: projectName,
        startDate,
        customer: { id: customer.id },
        projectManager: { id: manager.id },
      }),
    },
  );

  console.log(JSON.stringify(created, null, 2));
}

await main();
