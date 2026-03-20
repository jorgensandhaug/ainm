const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const token = "-azgsECv-0Aya-Kt403IQ3ubNuiLZHnfitAcwrm49cU";

const projectName = "Integração Porto";
const startDate = "2026-03-20";
const customerOrgNumber = "872798277";
const customerName = "Porto Alegre Lda";
const managerEmail = "andre.oliveira@example.org";
const managerName = "André Oliveira";

const auth = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;

type ListResponse<T> = {
  values?: T[];
  fullResultSize?: number;
};

type WrappedResponse<T> = {
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

function buildUrl(path: string, params?: Record<string, string>) {
  const url = new URL(path, `${baseUrl}/`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, value);
    }
  }
  return url.toString();
}

async function api<T>(path: string, init?: RequestInit, params?: Record<string, string>) {
  const res = await fetch(buildUrl(path, params), {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    if (
      res.status === 403 &&
      data &&
      typeof data === "object" &&
      "error" in data &&
      data.error === "Invalid or expired token"
    ) {
      throw new Error("Blocked: invalid or expired token");
    }
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  return data as T;
}

function normalize(value: string | undefined) {
  return (value ?? "").trim().toLocaleLowerCase();
}

function employeeDisplayName(employee: Employee) {
  return [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim() || employee.name || "";
}

function pickCustomer(values: Customer[]) {
  const orgMatches = values.filter((value) => value.organizationNumber === customerOrgNumber);
  if (orgMatches.length === 1) return orgMatches[0];
  const exactNameMatches = orgMatches.filter((value) => value.name === customerName);
  if (exactNameMatches.length === 1) return exactNameMatches[0];
  throw new Error(`Customer match ambiguous or missing: ${JSON.stringify(orgMatches)}`);
}

function pickManager(values: Employee[]) {
  const emailMatches = values.filter((value) => normalize(value.email) === normalize(managerEmail));
  if (emailMatches.length === 1) return emailMatches[0];
  const exactNameMatches = emailMatches.filter(
    (value) => normalize(employeeDisplayName(value)) === normalize(managerName),
  );
  if (exactNameMatches.length === 1) return exactNameMatches[0];
  throw new Error(`Manager match ambiguous or missing: ${JSON.stringify(emailMatches)}`);
}

async function main() {
  const customerRes = await api<ListResponse<Customer>>("customer", undefined, {
    organizationNumber: customerOrgNumber,
    count: "10",
    fields: "*",
  });
  const customer = pickCustomer(customerRes.values ?? []);

  const managerRes = await api<ListResponse<Employee>>("employee", undefined, {
    email: managerEmail,
    assignableProjectManagers: "true",
    count: "10",
    fields: "*",
  });
  const manager = pickManager(managerRes.values ?? []);

  const createRes = await api<WrappedResponse<Project>>(
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

  const project = createRes.value;
  if (
    !project ||
    project.name !== projectName ||
    project.startDate !== startDate ||
    project.customer?.id !== customer.id ||
    project.projectManager?.id !== manager.id
  ) {
    throw new Error(`Unexpected project response: ${JSON.stringify(createRes)}`);
  }

  console.log(JSON.stringify(createRes, null, 2));
}

await main();
