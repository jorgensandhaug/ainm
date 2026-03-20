const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const projectName = "Análise Porto Reflection e90cdedf";
const startDate = "2026-03-20";

const candidates = [
  {
    customerName: "Porto Alegre Lda",
    organizationNumber: "996943305",
    managerName: "Lucas Oliveira",
    managerEmail: "lucas.oliveira@example.org",
  },
  {
    customerName: "Havbris AS",
    organizationNumber: "999148387",
    managerName: "Henrik Degaard",
    managerEmail: "henrik.degard@example.org",
  },
  {
    customerName: "Lumière SARL",
    organizationNumber: "849572458",
    managerName: "Nathan Dubois",
    managerEmail: "nathan.dubois@example.org",
  },
] as const;

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

function resolveCustomer(customers: Customer[], organizationNumber: string, customerName: string): Customer {
  const exactOrg = customers.filter((customer) => customer.organizationNumber === organizationNumber);
  if (exactOrg.length === 1) return exactOrg[0];

  const exactOrgAndName = exactOrg.filter((customer) => customer.name === customerName);
  if (exactOrgAndName.length === 1) return exactOrgAndName[0];

  throw new Error(`Sandbox customer resolution failed: ${exactOrg.length} exact org-number matches`);
}

function resolveManager(employees: Employee[], managerEmail: string, managerName: string): Employee {
  const exactEmail = employees.filter((employee) => employee.email === managerEmail);
  if (exactEmail.length === 1) return exactEmail[0];

  const exactEmailAndName = exactEmail.filter((employee) => employee.name === managerName);
  if (exactEmailAndName.length === 1) return exactEmailAndName[0];

  throw new Error(`Sandbox manager resolution failed: ${exactEmail.length} exact email matches`);
}

async function main() {
  let chosen:
    | {
        customerName: string;
        organizationNumber: string;
        managerName: string;
        managerEmail: string;
      }
    | undefined;
  let customer: Customer | undefined;
  let projectManager: Employee | undefined;

  for (const candidate of candidates) {
    const customers = await tripletex<WrappedList<Customer>>(
      `customer?organizationNumber=${encodeURIComponent(candidate.organizationNumber)}&count=10&fields=*`,
    );
    const resolvedCustomer = (customers.values ?? []).filter(
      (entry) => entry.organizationNumber === candidate.organizationNumber,
    );
    if (resolvedCustomer.length === 0) continue;

    const employees = await tripletex<WrappedList<Employee>>(
      `employee?email=${encodeURIComponent(candidate.managerEmail)}&assignableProjectManagers=true&count=10&fields=*`,
    );
    const resolvedManagers = (employees.values ?? []).filter((entry) => entry.email === candidate.managerEmail);
    if (resolvedManagers.length === 0) continue;

    chosen = candidate;
    customer = resolveCustomer(customers.values ?? [], candidate.organizationNumber, candidate.customerName);
    projectManager = resolveManager(employees.values ?? [], candidate.managerEmail, candidate.managerName);
    break;
  }

  if (!chosen || !customer || !projectManager) {
    const allCustomers = await tripletex<WrappedList<Customer>>("customer?count=100&fields=*");
    const discoveredCustomer = (allCustomers.values ?? []).find(
      (entry) => typeof entry.organizationNumber === "string" && entry.organizationNumber.length > 0 && typeof entry.name === "string" && entry.name.length > 0,
    );
    if (!discoveredCustomer) {
      throw new Error("Sandbox verification could not find any customer with organizationNumber");
    }

    const allManagers = await tripletex<WrappedList<Employee>>("employee?assignableProjectManagers=true&count=100&fields=*");
    const discoveredManager = (allManagers.values ?? []).find(
      (entry) => typeof entry.email === "string" && entry.email.length > 0,
    );
    if (!discoveredManager) {
      throw new Error("Sandbox verification could not find any assignable project manager with email");
    }

    chosen = {
      customerName: discoveredCustomer.name!,
      organizationNumber: discoveredCustomer.organizationNumber!,
      managerName: discoveredManager.name ?? "",
      managerEmail: discoveredManager.email!,
    };
    customer = discoveredCustomer;
    projectManager = discoveredManager;
  }

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
    throw new Error("Sandbox create response did not verify the expected linked project state");
  }

  console.log(
    JSON.stringify(
      {
        chosen,
        customer,
        projectManager,
        project,
      },
      null,
      2,
    ),
  );
}

await main();
