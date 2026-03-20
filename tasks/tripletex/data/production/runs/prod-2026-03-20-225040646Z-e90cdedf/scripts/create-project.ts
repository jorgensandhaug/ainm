const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "eOMb4YkGf3q3m47Fe1PdE4k8tTZ-eMuQ8Tvo0Kp9eOo";

const projectName = "Análise Porto";
const customerName = "Porto Alegre Lda";
const organizationNumber = "996943305";
const managerName = "Lucas Oliveira";
const managerEmail = "lucas.oliveira@example.org";
const startDate = "2026-03-20";

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;
const apiBase = baseUrl.replace(/\/+$/, "");

type WrappedList<T> = { values?: T[] };
type WrappedValue<T> = { value?: T };

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
  name?: string;
  startDate?: string;
  customer?: { id?: number; name?: string; organizationNumber?: string };
  projectManager?: { id?: number; name?: string; email?: string };
};

function apiUrl(pathWithQuery: string): string {
  return `${apiBase}/${pathWithQuery.replace(/^\/+/, "")}`;
}

async function tripletex<T>(pathWithQuery: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(pathWithQuery), {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    if (
      response.status === 403 &&
      (data?.error === "Invalid or expired token" ||
        data?.error ===
          "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.")
    ) {
      throw new Error(`Blocked credentials: ${data.error}`);
    }

    const detail =
      data?.validationMessages?.map((m: { field?: string; message?: string }) => `${m.field ?? "?"}: ${m.message ?? ""}`).join(" | ") ||
      data?.message ||
      data?.error ||
      text ||
      `HTTP ${response.status}`;
    throw new Error(`Tripletex ${response.status}: ${detail}`);
  }

  return data as T;
}

function exactCustomerMatch(customers: Customer[]): Customer {
  const exactOrg = customers.filter((customer) => customer.organizationNumber === organizationNumber);
  if (exactOrg.length === 1) return exactOrg[0];

  const exactOrgAndName = exactOrg.filter((customer) => customer.name === customerName);
  if (exactOrgAndName.length === 1) return exactOrgAndName[0];

  throw new Error(`Customer resolution failed: found ${exactOrg.length} org-number matches`);
}

function exactManagerMatch(employees: Employee[]): Employee {
  const exactEmail = employees.filter((employee) => employee.email === managerEmail);
  if (exactEmail.length === 1) return exactEmail[0];

  const exactEmailAndName = exactEmail.filter((employee) => employee.name === managerName);
  if (exactEmailAndName.length === 1) return exactEmailAndName[0];

  throw new Error(`Manager resolution failed: found ${exactEmail.length} exact email matches`);
}

async function main() {
  const customers = await tripletex<WrappedList<Customer>>(
    `customer?organizationNumber=${encodeURIComponent(organizationNumber)}&count=10&fields=*`,
  );
  const customer = exactCustomerMatch(customers.values ?? []);

  const employees = await tripletex<WrappedList<Employee>>(
    `employee?email=${encodeURIComponent(managerEmail)}&assignableProjectManagers=true&count=10&fields=*`,
  );
  const projectManager = exactManagerMatch(employees.values ?? []);

  const created = await tripletex<WrappedValue<Project>>("project", {
    method: "POST",
    body: JSON.stringify({
      name: projectName,
      startDate,
      customer: { id: customer.id },
      projectManager: { id: projectManager.id },
    }),
  });

  const project = created.value;
  if (
    !project ||
    project.name !== projectName ||
    project.startDate !== startDate ||
    project.customer?.id !== customer.id ||
    project.projectManager?.id !== projectManager.id
  ) {
    throw new Error("Project write response did not verify requested final state");
  }

  console.log(
    JSON.stringify(
      {
        id: project.id,
        name: project.name,
        startDate: project.startDate,
        customer: project.customer,
        projectManager: project.projectManager,
      },
      null,
      2,
    ),
  );
}

await main();
