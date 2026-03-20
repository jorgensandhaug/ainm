const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "aq3Qd4xwqCa_7RVUpaYIL1W8pC7LwNqMaZLtcHfna1E";

const PROJECT_NAME = "Migration Lumière";
const START_DATE = "2026-03-20";
const CUSTOMER_NAME = "Lumière SARL";
const CUSTOMER_ORG_NO = "849572458";
const MANAGER_NAME = "Nathan Dubois";
const MANAGER_EMAIL = "nathan.dubois@example.org";

type ListResponse<T> = {
  values?: T[];
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

async function tripletexFetch(pathWithQuery: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");

  return fetch(buildUrl(pathWithQuery), {
    ...init,
    headers,
  });
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

function isInvalidTokenBody(body: any): boolean {
  return body?.error === "Invalid or expired token" ||
    body?.error === "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.";
}

function exactCustomerMatch(values: Customer[]): Customer[] {
  const exactOrg = values.filter((customer) => customer.organizationNumber === CUSTOMER_ORG_NO);
  if (exactOrg.length <= 1) return exactOrg;
  const exactName = exactOrg.filter((customer) => customer.name === CUSTOMER_NAME);
  return exactName.length > 0 ? exactName : exactOrg;
}

function exactEmployeeMatch(values: Employee[]): Employee[] {
  const exactEmail = values.filter((employee) => employee.email === MANAGER_EMAIL);
  if (exactEmail.length <= 1) return exactEmail;
  const exactName = exactEmail.filter((employee) => {
    const fullName = [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim();
    return employee.name === MANAGER_NAME || fullName === MANAGER_NAME;
  });
  return exactName.length > 0 ? exactName : exactEmail;
}

async function expectOkJson<T>(response: Response): Promise<T> {
  const body = await parseJsonSafe(response);
  if (!response.ok) {
    if (response.status === 403 && isInvalidTokenBody(body)) {
      throw new Error(`Blocked credentials: ${JSON.stringify(body)}`);
    }
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
  return body as T;
}

async function main() {
  const customerResp = await tripletexFetch(
    `customer?organizationNumber=${encodeURIComponent(CUSTOMER_ORG_NO)}&count=10&fields=*`,
  );
  const customerBody = await expectOkJson<ListResponse<Customer>>(customerResp);
  const customerMatches = exactCustomerMatch(customerBody.values ?? []);
  if (customerMatches.length !== 1) {
    throw new Error(`Customer resolution failed: ${JSON.stringify(customerBody)}`);
  }

  const employeeResp = await tripletexFetch(
    `employee?email=${encodeURIComponent(MANAGER_EMAIL)}&assignableProjectManagers=true&count=10&fields=*`,
  );
  const employeeBody = await expectOkJson<ListResponse<Employee>>(employeeResp);
  const employeeMatches = exactEmployeeMatch(employeeBody.values ?? []);
  if (employeeMatches.length !== 1) {
    throw new Error(`Project manager resolution failed: ${JSON.stringify(employeeBody)}`);
  }

  const createResp = await tripletexFetch("project", {
    method: "POST",
    body: JSON.stringify({
      name: PROJECT_NAME,
      startDate: START_DATE,
      customer: { id: customerMatches[0].id },
      projectManager: { id: employeeMatches[0].id },
    }),
  });
  const createBody = await expectOkJson<WrapperResponse<Project>>(createResp);
  const project = createBody.value;
  if (
    !project ||
    project.name !== PROJECT_NAME ||
    project.startDate !== START_DATE ||
    project.customer?.id !== customerMatches[0].id ||
    project.projectManager?.id !== employeeMatches[0].id
  ) {
    throw new Error(`Project verification failed: ${JSON.stringify(createBody)}`);
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
