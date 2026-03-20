const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

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
  isInactive?: boolean;
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

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}\n${text}`);
  }

  return text ? (JSON.parse(text) as T) : (undefined as T);
}

function requireOne<T>(values: T[], label: string): T {
  if (values.length !== 1) {
    throw new Error(`${label}: expected exactly one match, got ${values.length}`);
  }
  return values[0];
}

const discoveryCustomers = await api<ListResponse<Customer>>("/customer?count=20&fields=*");
const seedCustomer = (discoveryCustomers.values ?? []).find(
  (item) => !!item.organizationNumber && !!item.name && !item.isInactive,
);
if (!seedCustomer?.organizationNumber || !seedCustomer.name) {
  throw new Error("No suitable sandbox customer found");
}

const discoveryManagers = await api<ListResponse<Employee>>(
  "/employee?assignableProjectManagers=true&count=20&fields=*",
);
const seedManager = (discoveryManagers.values ?? []).find(
  (item) => !!item.email && !!item.firstName && !!item.lastName,
);
if (!seedManager?.email || !seedManager.firstName || !seedManager.lastName) {
  throw new Error("No suitable sandbox assignable project manager found");
}

const resolvedCustomerResp = await api<ListResponse<Customer>>(
  `/customer?${new URLSearchParams({
    organizationNumber: seedCustomer.organizationNumber,
    count: "10",
    fields: "*",
  }).toString()}`,
);
const resolvedCustomer = requireOne(
  (resolvedCustomerResp.values ?? []).filter(
    (item) =>
      item.organizationNumber === seedCustomer.organizationNumber &&
      item.name === seedCustomer.name,
  ),
  "resolved customer",
);

const managerFullName = `${seedManager.firstName} ${seedManager.lastName}`.trim();
const resolvedManagerResp = await api<ListResponse<Employee>>(
  `/employee?${new URLSearchParams({
    email: seedManager.email,
    assignableProjectManagers: "true",
    count: "10",
    fields: "*",
  }).toString()}`,
);
const resolvedManager = requireOne(
  (resolvedManagerResp.values ?? []).filter(
    (item) =>
      item.email === seedManager.email &&
      `${item.firstName ?? ""} ${item.lastName ?? ""}`.trim() === managerFullName,
  ),
  "resolved project manager",
);

const projectName = `Codex Reflection Project ${Date.now()}`;
const startDate = "2026-03-20";

const created = await api<Wrapped<Project>>("/project", {
  method: "POST",
  body: JSON.stringify({
    name: projectName,
    startDate,
    customer: { id: resolvedCustomer.id },
    projectManager: { id: resolvedManager.id },
  }),
});

const project = created.value;
if (
  !project ||
  project.name !== projectName ||
  project.startDate !== startDate ||
  project.customer?.id !== resolvedCustomer.id ||
  project.projectManager?.id !== resolvedManager.id
) {
  throw new Error(`Unexpected project create response: ${JSON.stringify(created, null, 2)}`);
}

console.log(
  JSON.stringify(
    {
      discoveryCustomer: {
        id: seedCustomer.id,
        name: seedCustomer.name,
        organizationNumber: seedCustomer.organizationNumber,
      },
      discoveryManager: {
        id: seedManager.id,
        email: seedManager.email,
        name: managerFullName,
      },
      createdProject: {
        id: project.id,
        name: project.name,
        startDate: project.startDate,
        customerId: project.customer?.id,
        projectManagerId: project.projectManager?.id,
      },
    },
    null,
    2,
  ),
);
