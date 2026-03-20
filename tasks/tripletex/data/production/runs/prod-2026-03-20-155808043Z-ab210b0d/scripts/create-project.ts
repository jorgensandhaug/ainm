const baseUrl = process.env.TRIPLETEX_BASE_URL;
const token = process.env.TRIPLETEX_TOKEN;

if (!baseUrl || !token) {
  throw new Error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_TOKEN");
}

const projectName = "Analyse Sjøbris";
const customerOrgNumber = "883693329";
const customerName = "Sjøbris AS";
const managerEmail = "steinar.berge@example.org";
const managerName = "Steinar Berge";
const startDate = "2026-03-20";

const auth = Buffer.from(`0:${token}`).toString("base64");

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
  customer?: { id?: number };
  projectManager?: { id?: number };
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function pickCustomer(customers: Customer[] | undefined): Customer | undefined {
  const exactOrg = customers?.filter(
    (customer) => customer.organizationNumber === customerOrgNumber,
  );
  if (!exactOrg?.length) return undefined;
  if (exactOrg.length === 1 || !customerName) return exactOrg[0];
  return exactOrg.find((customer) => customer.name === customerName) ?? exactOrg[0];
}

function pickManager(employees: Employee[] | undefined): Employee | undefined {
  const exactEmail = employees?.filter((employee) => employee.email === managerEmail);
  if (!exactEmail?.length) return undefined;
  if (exactEmail.length === 1 || !managerName) return exactEmail[0];
  return exactEmail.find((employee) => employee.name === managerName) ?? exactEmail[0];
}

async function main() {
  const customerResp = await request<WrappedList<Customer>>(
    `/customer?organizationNumber=${encodeURIComponent(customerOrgNumber)}&count=10&fields=*`,
  );
  const customer = pickCustomer(customerResp.values);
  if (!customer?.id) {
    throw new Error("Customer not found with exact org number/name match");
  }

  const managerResp = await request<WrappedList<Employee>>(
    `/employee?email=${encodeURIComponent(managerEmail)}&assignableProjectManagers=true&count=10&fields=*`,
  );
  const manager = pickManager(managerResp.values);
  if (!manager?.id) {
    throw new Error("Assignable project manager not found with exact email match");
  }

  const createResp = await request<WrappedValue<Project>>("/project", {
    method: "POST",
    body: JSON.stringify({
      name: projectName,
      startDate,
      customer: { id: customer.id },
      projectManager: { id: manager.id },
    }),
  });

  const project = createResp.value;
  if (
    !project?.id ||
    project.name !== projectName ||
    project.startDate !== startDate ||
    project.customer?.id !== customer.id ||
    project.projectManager?.id !== manager.id
  ) {
    throw new Error(`Unexpected create response: ${JSON.stringify(createResp)}`);
  }

  console.log(
    JSON.stringify({
      projectId: project.id,
      name: project.name,
      startDate: project.startDate,
      customerId: project.customer.id,
      projectManagerId: project.projectManager.id,
    }),
  );
}

await main();
