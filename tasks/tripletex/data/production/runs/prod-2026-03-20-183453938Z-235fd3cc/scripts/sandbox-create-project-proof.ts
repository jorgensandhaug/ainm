const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const RUN_DATE = "2026-03-20";

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

const callLog: string[] = [];

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

async function request<T>(label: string, path: string, init?: RequestInit, params?: Record<string, string>): Promise<T> {
  callLog.push(label);
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
    throw new Error(JSON.stringify({ label, status: response.status, data }));
  }
  return data as T;
}

function fullName(employee: Employee): string {
  return [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim();
}

function uniqueByExact<T>(items: T[], predicate: (item: T) => boolean): T | undefined {
  const exact = items.filter(predicate);
  return exact.length === 1 ? exact[0] : undefined;
}

async function resolveUniqueCustomerCandidate(): Promise<Customer> {
  const broad = await request<ListResponse<Customer>>(
    "discover customers",
    "customer",
    undefined,
    { count: "100", fields: "*" },
  );
  const candidates = (broad.values ?? []).filter(
    (customer) => !!customer.organizationNumber && !!customer.name && !customer.isInactive,
  );
  for (const candidate of candidates) {
    const exact = await request<ListResponse<Customer>>(
      `prove customer ${candidate.organizationNumber}`,
      "customer",
      undefined,
      {
        organizationNumber: candidate.organizationNumber!,
        count: "10",
        fields: "*",
      },
    );
    const match = uniqueByExact(
      exact.values ?? [],
      (item) => item.organizationNumber === candidate.organizationNumber,
    );
    if (match) return match;
  }
  throw new Error("no unique customer candidate found");
}

async function resolveUniqueManagerCandidate(): Promise<Employee> {
  const broad = await request<ListResponse<Employee>>(
    "discover assignable managers",
    "employee",
    undefined,
    {
      assignableProjectManagers: "true",
      count: "100",
      fields: "*",
    },
  );
  const candidates = (broad.values ?? []).filter((employee) => !!employee.email);
  for (const candidate of candidates) {
    const exact = await request<ListResponse<Employee>>(
      `prove manager ${candidate.email}`,
      "employee",
      undefined,
      {
        email: candidate.email!,
        assignableProjectManagers: "true",
        count: "10",
        fields: "*",
      },
    );
    const match = uniqueByExact(
      exact.values ?? [],
      (item) => item.email === candidate.email,
    );
    if (match) return match;
  }
  throw new Error("no unique manager candidate found");
}

async function main() {
  const customer = await resolveUniqueCustomerCandidate();
  const manager = await resolveUniqueManagerCandidate();
  const projectName = `Codex Reflection Project ${Date.now()}`;

  const created = await request<Wrapper<Project>>(
    "create project",
    "project",
    {
      method: "POST",
      body: JSON.stringify({
        name: projectName,
        startDate: RUN_DATE,
        customer: { id: customer.id },
        projectManager: { id: manager.id },
      }),
    },
  );

  const project = created.value;
  if (
    !project ||
    project.name !== projectName ||
    project.startDate !== RUN_DATE ||
    project.customer?.id !== customer.id ||
    project.projectManager?.id !== manager.id
  ) {
    throw new Error(`project verification failed: ${JSON.stringify(created)}`);
  }

  console.log(
    JSON.stringify({
      proof: {
        customer: {
          id: customer.id,
          name: customer.name,
          organizationNumber: customer.organizationNumber,
        },
        manager: {
          id: manager.id,
          email: manager.email,
          name: fullName(manager),
        },
        project: {
          id: project.id,
          name: project.name,
          startDate: project.startDate,
        },
      },
      calls: callLog,
      callCount: callLog.length,
      canonicalTaskShapeCallCount: 3,
      canonicalTaskShape: [
        "GET /customer?organizationNumber=...&count=10&fields=*",
        "GET /employee?email=...&assignableProjectManagers=true&count=10&fields=*",
        "POST /project",
      ],
    }),
  );
}

await main();
