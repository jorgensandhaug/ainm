const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "XUumiAPwFo62TM3-0zI8U0bRikQSR8WJl_d1tj2Q7t0";

const PROJECT_NAME = "Actualización Dorada";
const START_DATE = "2026-03-20";
const CUSTOMER_ORG_NO = "800043328";
const CUSTOMER_NAME = "Dorada SL";
const MANAGER_EMAIL = "carmen.rodriguez@example.org";
const MANAGER_NAME = "Carmen Rodríguez";

const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

type ListResponse<T> = {
  values?: T[];
};

type Wrapped<T> = {
  value?: T;
};

type Customer = {
  id: number;
  name?: string;
  organizationNumber?: string;
};

type Employee = {
  id: number;
  email?: string;
  firstName?: string;
  lastName?: string;
};

type Project = {
  id: number;
  name?: string;
  startDate?: string;
  customer?: { id?: number };
  projectManager?: { id?: number };
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}\n${text}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

function expectOne<T>(values: T[] | undefined, label: string): T {
  if (!values || values.length !== 1) {
    throw new Error(`${label}: expected 1 match, got ${values?.length ?? 0}`);
  }
  return values[0];
}

const customerQuery = new URLSearchParams({
  organizationNumber: CUSTOMER_ORG_NO,
  count: "10",
  fields: "*",
});

const employeeQuery = new URLSearchParams({
  email: MANAGER_EMAIL,
  assignableProjectManagers: "true",
  count: "10",
  fields: "*",
});

const customerResp = await api<ListResponse<Customer>>(`/customer?${customerQuery.toString()}`);
const customer = expectOne(
  (customerResp.values ?? []).filter(
    (item) =>
      item.organizationNumber === CUSTOMER_ORG_NO &&
      item.name === CUSTOMER_NAME,
  ),
  "customer",
);

const employeeResp = await api<ListResponse<Employee>>(`/employee?${employeeQuery.toString()}`);
const employee = expectOne(
  (employeeResp.values ?? []).filter(
    (item) =>
      item.email === MANAGER_EMAIL &&
      `${item.firstName ?? ""} ${item.lastName ?? ""}`.trim() === MANAGER_NAME,
  ),
  "project manager",
);

const payload = {
  name: PROJECT_NAME,
  startDate: START_DATE,
  customer: { id: customer.id },
  projectManager: { id: employee.id },
};

const created = await api<Wrapped<Project>>("/project", {
  method: "POST",
  body: JSON.stringify(payload),
});

const project = created.value;
if (
  !project ||
  project.name !== PROJECT_NAME ||
  project.startDate !== START_DATE ||
  project.customer?.id !== customer.id ||
  project.projectManager?.id !== employee.id
) {
  throw new Error(`project verification failed: ${JSON.stringify(created, null, 2)}`);
}

console.log(JSON.stringify({
  id: project.id,
  name: project.name,
  startDate: project.startDate,
  customerId: project.customer?.id,
  projectManagerId: project.projectManager?.id,
}, null, 2));
