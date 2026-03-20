const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "REDACTED";

const projectName = "Implementation Ridgepoint";
const customerOrgNumber = "948050927";
const customerName = "Ridgepoint Ltd";
const managerEmail = "edward.brown@example.org";
const projectStartDate = "2026-03-19";

const auth = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

type Envelope<T> = { value?: T; values?: T[]; fullResultSize?: number };

type Customer = {
  id: number;
  name?: string;
  organizationNumber?: string;
};

type Employee = {
  id: number;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
};

type Project = {
  id: number;
  name?: string;
  customer?: Customer;
  projectManager?: Employee;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}\n${text}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function expectSingleExactCustomer(values: Customer[] | undefined): Customer {
  const matches = (values ?? []).filter(
    (customer) =>
      customer.organizationNumber === customerOrgNumber &&
      customer.name === customerName,
  );

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one customer match, got ${matches.length}: ${JSON.stringify(values ?? [])}`,
    );
  }

  return matches[0];
}

function expectSingleExactEmployee(values: Employee[] | undefined): Employee | null {
  const matches = (values ?? []).filter(
    (employee) => (employee.email ?? "").toLowerCase() === managerEmail.toLowerCase(),
  );

  if (matches.length === 1) {
    return matches[0];
  }

  if (matches.length > 1) {
    throw new Error(
      `Expected exactly one employee match, got ${matches.length}: ${JSON.stringify(values ?? [])}`,
    );
  }

  return null;
}

function assertProjectState(project: Project, customerId: number, managerId: number): void {
  if (project.name !== projectName) {
    throw new Error(`Project name mismatch: ${JSON.stringify(project)}`);
  }
  if (project.customer?.id !== customerId) {
    throw new Error(`Project customer mismatch: ${JSON.stringify(project)}`);
  }
  if (project.projectManager?.id !== managerId) {
    throw new Error(`Project manager mismatch: ${JSON.stringify(project)}`);
  }
}

async function main() {
  const customerResult = await api<Envelope<Customer>>(
    `/customer?organizationNumber=${encodeURIComponent(customerOrgNumber)}&count=10&fields=*`,
  );
  const customer = expectSingleExactCustomer(customerResult.values);

  let employeeResult = await api<Envelope<Employee>>(
    `/employee?email=${encodeURIComponent(managerEmail)}&assignableProjectManagers=true&count=10&fields=*`,
  );
  let employee = expectSingleExactEmployee(employeeResult.values);

  if (!employee) {
    employeeResult = await api<Envelope<Employee>>(
      `/employee?email=${encodeURIComponent(managerEmail)}&count=10&fields=*`,
    );
    employee = expectSingleExactEmployee(employeeResult.values);
  }

  if (!employee) {
    throw new Error(`Employee not found for email ${managerEmail}`);
  }

  const createResult = await api<Envelope<Project>>("/project", {
    method: "POST",
    body: JSON.stringify({
      name: projectName,
      startDate: projectStartDate,
      customer: { id: customer.id },
      projectManager: { id: employee.id },
    }),
  });

  const createdProject = createResult.value;
  if (!createdProject?.id) {
    throw new Error(`Missing created project in response: ${JSON.stringify(createResult)}`);
  }

  let verifiedProject = createdProject;
  const createResponseProvesState =
    createdProject.name === projectName &&
    createdProject.customer?.id === customer.id &&
    createdProject.projectManager?.id === employee.id;

  if (!createResponseProvesState) {
    const verifyResult = await api<Envelope<Project>>(
      `/project?id=${createdProject.id}&count=1&fields=*`,
    );
    const fetched = verifyResult.values?.[0];
    if (!fetched) {
      throw new Error(`Created project not found on verification read: ${createdProject.id}`);
    }
    verifiedProject = fetched;
  }

  assertProjectState(verifiedProject, customer.id, employee.id);

  console.log(
    JSON.stringify(
      {
        projectId: verifiedProject.id,
        projectName: verifiedProject.name,
        customerId: verifiedProject.customer?.id,
        customerName: verifiedProject.customer?.name,
        projectManagerId: verifiedProject.projectManager?.id,
        projectManagerEmail: employee.email,
      },
      null,
      2,
    ),
  );
}

await main();
