const baseUrl = process.env.TRIPLETEX_BASE_URL;
const token = process.env.TRIPLETEX_TOKEN;

if (!baseUrl || !token) {
  throw new Error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_TOKEN");
}

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
  customer?: { id?: number; organizationNumber?: string; name?: string };
  projectManager?: { id?: number; email?: string; name?: string };
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

  return (await response.json()) as T;
}

async function main() {
  const seedCustomers = await request<WrappedList<Customer>>(
    "/customer?count=200&fields=*",
  );
  const candidateCustomer = seedCustomers.values?.find(
    (customer) => customer.organizationNumber && customer.name,
  );
  if (!candidateCustomer?.organizationNumber || !candidateCustomer.name) {
    throw new Error("No sandbox customer with organization number and name found");
  }

  const seedManagers = await request<WrappedList<Employee>>(
    "/employee?assignableProjectManagers=true&count=200&fields=*",
  );
  const candidateManager = seedManagers.values?.find(
    (employee) => employee.email,
  );
  if (!candidateManager?.email) {
    throw new Error(`No sandbox assignable project manager with email found: ${JSON.stringify(seedManagers)}`);
  }

  const customerResp = await request<WrappedList<Customer>>(
    `/customer?organizationNumber=${encodeURIComponent(candidateCustomer.organizationNumber)}&count=10&fields=*`,
  );
  const exactCustomers =
    customerResp.values?.filter(
      (customer) => customer.organizationNumber === candidateCustomer.organizationNumber,
    ) ?? [];
  if (!exactCustomers.length) {
    throw new Error("Filtered customer lookup did not return exact organization number hit");
  }

  const managerResp = await request<WrappedList<Employee>>(
    `/employee?email=${encodeURIComponent(candidateManager.email)}&assignableProjectManagers=true&count=10&fields=*`,
  );
  const exactManagers =
    managerResp.values?.filter((employee) => employee.email === candidateManager.email) ?? [];
  if (!exactManagers.length) {
    throw new Error("Filtered manager lookup did not return exact email hit");
  }

  const chosenCustomer =
    exactCustomers.find((customer) => customer.name === candidateCustomer.name) ?? exactCustomers[0];
  const chosenManager =
    (candidateManager.name
      ? exactManagers.find((employee) => employee.name === candidateManager.name)
      : undefined) ?? exactManagers[0];

  const startDate = "2026-03-20";
  const projectName = `Sandbox Verify Project ${Date.now()}`;
  const createResp = await request<WrappedValue<Project>>("/project", {
    method: "POST",
    body: JSON.stringify({
      name: projectName,
      startDate,
      customer: { id: chosenCustomer.id },
      projectManager: { id: chosenManager.id },
    }),
  });

  const project = createResp.value;
  if (
    !project?.id ||
    project.name !== projectName ||
    project.startDate !== startDate ||
    project.customer?.id !== chosenCustomer.id ||
    project.projectManager?.id !== chosenManager.id
  ) {
    throw new Error(`Unexpected create response: ${JSON.stringify(createResp)}`);
  }

  console.log(
    JSON.stringify({
      seedCustomer: {
        id: candidateCustomer.id,
        name: candidateCustomer.name,
        organizationNumber: candidateCustomer.organizationNumber,
      },
      filteredCustomerMatches: exactCustomers.length,
      seedManager: {
        id: candidateManager.id,
        name: candidateManager.name,
        email: candidateManager.email,
      },
      filteredManagerMatches: exactManagers.length,
      createdProject: {
        id: project.id,
        name: project.name,
        startDate: project.startDate,
        customerId: project.customer?.id,
        projectManagerId: project.projectManager?.id,
      },
    }),
  );
}

await main();
