const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "n3Am_dWoiUjVtwCoWOP4aYJZRWC1fEgBtAgAuSdKTcY";

const projectName = "Actualización Sierra";
const customerName = "Sierra SL";
const customerOrgNumber = "953403188";
const projectManagerName = "Ana Romero";
const projectManagerEmail = "ana.romero@example.org";
const startDate = "2026-03-20";

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

type WrappedList<T> = { values?: T[]; fullResultSize?: number };
type WrappedValue<T> = { value?: T };

type Customer = {
  id: number;
  name?: string;
  organizationNumber?: string;
};

type Employee = {
  id: number;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

type Project = {
  id: number;
  name?: string;
  startDate?: string;
  customer?: { id?: number };
  projectManager?: { id?: number };
};

function endpoint(path: string, params?: Record<string, string>) {
  const url = new URL(path, `${baseUrl}/`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function request<T>(method: string, path: string, init?: {
  params?: Record<string, string>;
  body?: unknown;
}): Promise<T> {
  const response = await fetch(endpoint(path, init?.params), {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(JSON.stringify({
      status: response.status,
      body: data,
    }));
  }

  return data as T;
}

function normalizeName(employee: Employee) {
  const joined = [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim();
  return joined || employee.name || "";
}

function pickExactCustomer(values: Customer[]) {
  const exactOrg = values.filter((customer) => customer.organizationNumber === customerOrgNumber);
  if (exactOrg.length === 1) return exactOrg[0];

  const exactOrgAndName = exactOrg.filter((customer) => customer.name === customerName);
  if (exactOrgAndName.length === 1) return exactOrgAndName[0];

  throw new Error(`Ambiguous customer match: ${JSON.stringify(values)}`);
}

function pickExactManager(values: Employee[]) {
  const exactEmail = values.filter((employee) => employee.email === projectManagerEmail);
  if (exactEmail.length === 1) return exactEmail[0];

  const exactEmailAndName = exactEmail.filter((employee) => normalizeName(employee) === projectManagerName || employee.name === projectManagerName);
  if (exactEmailAndName.length === 1) return exactEmailAndName[0];

  throw new Error(`Ambiguous project manager match: ${JSON.stringify(values)}`);
}

async function main() {
  const customers = await request<WrappedList<Customer>>("GET", "customer", {
    params: {
      organizationNumber: customerOrgNumber,
      count: "10",
      fields: "*",
    },
  });
  const customer = pickExactCustomer(customers.values ?? []);

  const employees = await request<WrappedList<Employee>>("GET", "employee", {
    params: {
      email: projectManagerEmail,
      assignableProjectManagers: "true",
      count: "10",
      fields: "*",
    },
  });
  const projectManager = pickExactManager(employees.values ?? []);

  const created = await request<WrappedValue<Project>>("POST", "project", {
    body: {
      name: projectName,
      startDate,
      customer: { id: customer.id },
      projectManager: { id: projectManager.id },
    },
  });

  const project = created.value;
  if (
    !project ||
    project.name !== projectName ||
    project.startDate !== startDate ||
    project.customer?.id !== customer.id ||
    project.projectManager?.id !== projectManager.id
  ) {
    throw new Error(`Unexpected project response: ${JSON.stringify(created)}`);
  }

  console.log(JSON.stringify({
    id: project.id,
    name: project.name,
    startDate: project.startDate,
    customerId: project.customer?.id,
    projectManagerId: project.projectManager?.id,
  }));
}

await main();
