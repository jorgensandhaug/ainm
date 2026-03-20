const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "Or1chy7HNmd1Ydd5uUjE3_qj4zYQe_K81T32LZLBuuo";

const PROJECT_NAME = "Migração Montanha";
const PROJECT_START_DATE = "2026-03-20";
const CUSTOMER_NAME = "Montanha Lda";
const CUSTOMER_ORG_NO = "986713344";
const PROJECT_MANAGER_NAME = "Bruno Pereira";
const PROJECT_MANAGER_EMAIL = "bruno.pereira@example.org";

type ListResponse<T> = {
  values?: T[];
};

type Wrapper<T> = {
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

function buildUrl(path: string, params?: Record<string, string>): string {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const url = new URL(path, base);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function request<T>(path: string, init?: RequestInit, params?: Record<string, string>): Promise<T> {
  const response = await fetch(buildUrl(path, params), {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    throw new Error(
      JSON.stringify({
        status: response.status,
        path,
        data,
      }),
    );
  }

  return data as T;
}

function uniqueMatch<T>(items: T[], label: string): T {
  if (items.length !== 1) {
    throw new Error(`${label} not unique: ${items.length}`);
  }
  return items[0];
}

function fullName(employee: Employee): string {
  return [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim();
}

async function main() {
  const customerRes = await request<ListResponse<Customer>>("customer", undefined, {
    organizationNumber: CUSTOMER_ORG_NO,
    count: "10",
    fields: "*",
  });

  const customerMatches = (customerRes.values ?? []).filter(
    (customer) => customer.organizationNumber === CUSTOMER_ORG_NO,
  );
  const customer =
    customerMatches.length === 1
      ? customerMatches[0]
      : uniqueMatch(
          customerMatches.filter((item) => item.name === CUSTOMER_NAME),
          "customer",
        );

  const managerRes = await request<ListResponse<Employee>>("employee", undefined, {
    email: PROJECT_MANAGER_EMAIL,
    assignableProjectManagers: "true",
    count: "10",
    fields: "*",
  });

  const managerMatches = (managerRes.values ?? []).filter(
    (employee) => employee.email === PROJECT_MANAGER_EMAIL,
  );
  const manager =
    managerMatches.length === 1
      ? managerMatches[0]
      : uniqueMatch(
          managerMatches.filter((item) => fullName(item) === PROJECT_MANAGER_NAME),
          "project manager",
        );

  const projectRes = await request<Wrapper<Project>>(
    "project",
    {
      method: "POST",
      body: JSON.stringify({
        name: PROJECT_NAME,
        startDate: PROJECT_START_DATE,
        customer: { id: customer.id },
        projectManager: { id: manager.id },
      }),
    },
  );

  const project = projectRes.value;
  if (
    !project ||
    project.name !== PROJECT_NAME ||
    project.startDate !== PROJECT_START_DATE ||
    project.customer?.id !== customer.id ||
    project.projectManager?.id !== manager.id
  ) {
    throw new Error(`project verification failed: ${JSON.stringify(projectRes)}`);
  }

  console.log(
    JSON.stringify({
      id: project.id,
      name: project.name,
      startDate: project.startDate,
      customerId: project.customer?.id,
      projectManagerId: project.projectManager?.id,
    }),
  );
}

await main();
