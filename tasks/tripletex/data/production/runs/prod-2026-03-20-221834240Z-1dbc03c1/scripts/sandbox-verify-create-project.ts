const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const START_DATE = "2026-03-20";

type ListResponse<T> = {
  values?: T[];
  fullResultSize?: number;
};

type WrapperResponse<T> = {
  value?: T;
};

type Customer = {
  id: number;
  name?: string;
  organizationNumber?: string;
};

type Employee = {
  id: number;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
};

type Project = {
  id: number;
  name?: string;
  startDate?: string;
  customer?: { id?: number };
  projectManager?: { id?: number };
};

function buildUrl(pathWithQuery: string): string {
  return new URL(pathWithQuery, BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`).toString();
}

async function api(pathWithQuery: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`);
  headers.set("Accept", "application/json");
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(buildUrl(pathWithQuery), { ...init, headers });
}

async function parseJsonSafe(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function expectOk<T>(response: Response): Promise<T> {
  const body = await parseJsonSafe(response);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`);
  return body as T;
}

function fullName(employee: Employee): string {
  const combined = [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim();
  return employee.name || combined;
}

async function main() {
  const discoveryCustomer = await expectOk<ListResponse<Customer>>(
    await api("customer?count=50&fields=*"),
  );
  const customer = (discoveryCustomer.values ?? []).find(
    (entry) => entry.organizationNumber && entry.name,
  );
  if (!customer?.organizationNumber || !customer.name) {
    throw new Error(`No suitable sandbox customer found: ${JSON.stringify(discoveryCustomer)}`);
  }

  const discoveryManager = await expectOk<ListResponse<Employee>>(
    await api("employee?assignableProjectManagers=true&count=50&fields=*"),
  );
  const manager = (discoveryManager.values ?? []).find(
    (entry) => entry.email && fullName(entry),
  );
  if (!manager?.email) {
    throw new Error(`No suitable sandbox project manager found: ${JSON.stringify(discoveryManager)}`);
  }

  const projectName = `Codex Reflection Project ${Date.now()}`;

  const customerLookup = await expectOk<ListResponse<Customer>>(
    await api(`customer?organizationNumber=${encodeURIComponent(customer.organizationNumber)}&count=10&fields=*`),
  );
  const customerMatches = (customerLookup.values ?? []).filter(
    (entry) => entry.organizationNumber === customer.organizationNumber,
  );
  if (customerMatches.length !== 1) {
    throw new Error(`Customer exact-match failed: ${JSON.stringify(customerLookup)}`);
  }

  const managerLookup = await expectOk<ListResponse<Employee>>(
    await api(`employee?email=${encodeURIComponent(manager.email)}&assignableProjectManagers=true&count=10&fields=*`),
  );
  const managerMatches = (managerLookup.values ?? []).filter(
    (entry) => entry.email === manager.email,
  );
  if (managerMatches.length !== 1) {
    throw new Error(`Manager exact-match failed: ${JSON.stringify(managerLookup)}`);
  }

  const createProject = await expectOk<WrapperResponse<Project>>(
    await api("project", {
      method: "POST",
      body: JSON.stringify({
        name: projectName,
        startDate: START_DATE,
        customer: { id: customerMatches[0].id },
        projectManager: { id: managerMatches[0].id },
      }),
    }),
  );

  const project = createProject.value;
  if (
    !project ||
    project.name !== projectName ||
    project.startDate !== START_DATE ||
    project.customer?.id !== customerMatches[0].id ||
    project.projectManager?.id !== managerMatches[0].id
  ) {
    throw new Error(`Project verification failed: ${JSON.stringify(createProject)}`);
  }

  console.log(JSON.stringify({
    provedPath: [
      `GET /customer?organizationNumber=${customer.organizationNumber}&count=10&fields=*`,
      `GET /employee?email=${manager.email}&assignableProjectManagers=true&count=10&fields=*`,
      "POST /project",
    ],
    discovery: {
      customer: {
        id: customer.id,
        name: customer.name,
        organizationNumber: customer.organizationNumber,
      },
      manager: {
        id: manager.id,
        name: fullName(manager),
        email: manager.email,
      },
    },
    createdProject: {
      id: project.id,
      name: project.name,
      startDate: project.startDate,
      customerId: project.customer?.id,
      projectManagerId: project.projectManager?.id,
    },
  }, null, 2));
}

await main();
