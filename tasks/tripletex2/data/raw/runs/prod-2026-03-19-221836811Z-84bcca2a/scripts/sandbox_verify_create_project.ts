const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "REDACTED";

const auth = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

type Envelope<T> = { value?: T; values?: T[] };

type AddressableEntity = {
  id: number;
  version?: number;
};

type Department = AddressableEntity & {
  name?: string;
  isInactive?: boolean;
};

type Customer = AddressableEntity & {
  name?: string;
  email?: string;
  organizationNumber?: string;
};

type Employee = AddressableEntity & {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
};

type Project = AddressableEntity & {
  name?: string;
  startDate?: string;
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

  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const error = new Error(`${response.status} ${response.statusText}`);
    (error as Error & { body?: unknown }).body = body;
    throw error;
  }

  return body as T;
}

function uniqueDigits8(seed: number): string {
  return String(seed % 100_000_000).padStart(8, "0");
}

function orgChecksum(digits: number[]): number {
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  const sum = digits.reduce((acc, digit, index) => acc + digit * weights[index], 0);
  const remainder = sum % 11;
  const control = remainder === 0 ? 0 : 11 - remainder;
  if (control === 10) {
    return -1;
  }
  return control;
}

function generateValidOrgNumber(seed: number): string {
  let n = seed;
  while (true) {
    const body = uniqueDigits8(n)
      .split("")
      .map((digit) => Number(digit));
    const control = orgChecksum(body);
    if (control >= 0) {
      return `${body.join("")}${control}`;
    }
    n += 1;
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const seed = Date.now();
  const suffix = uniqueDigits8(seed);
  const orgNumber = generateValidOrgNumber(seed);
  const today = "2026-03-19";
  const customerName = `Sandbox Ridgepoint ${suffix}`;
  const projectName = `Sandbox Project ${suffix}`;
  const employeeEmail = `sandbox.edward.${suffix}@example.org`;

  const departmentSearch = await api<Envelope<Department>>(
    "/department?isInactive=false&count=1&fields=*",
  );
  let department = departmentSearch.values?.[0];

  if (!department) {
    const createdDepartment = await api<Envelope<Department>>("/department", {
      method: "POST",
      body: JSON.stringify({ name: `Sandbox Dept ${suffix}` }),
    });
    department = createdDepartment.value;
  }

  assert(department?.id, "Missing department id");

  const createdCustomer = await api<Envelope<Customer>>("/customer", {
    method: "POST",
    body: JSON.stringify({
      name: customerName,
      email: `billing.${suffix}@example.org`,
      organizationNumber: orgNumber,
    }),
  });
  assert(createdCustomer.value?.id, "Missing created customer id");

  const createdEmployee = await api<Envelope<Employee>>("/employee", {
    method: "POST",
    body: JSON.stringify({
      firstName: "Edward",
      lastName: `Brown ${suffix}`,
      dateOfBirth: "1989-06-10",
      email: employeeEmail,
      userType: "NO_ACCESS",
      department: { id: department.id },
      employments: [{ startDate: today }],
    }),
  });
  assert(createdEmployee.value?.id, "Missing created employee id");

  const filteredManagers = await api<Envelope<Employee>>(
    `/employee?email=${encodeURIComponent(employeeEmail)}&assignableProjectManagers=true&count=10&fields=*`,
  );
  const plainEmployeeSearch = await api<Envelope<Employee>>(
    `/employee?email=${encodeURIComponent(employeeEmail)}&count=10&fields=*`,
  );

  const assignableManagers = await api<Envelope<Employee>>(
    "/employee?assignableProjectManagers=true&count=20&fields=*",
  );
  const usableManager = (assignableManagers.values ?? []).find((employee) => employee.email);
  assert(usableManager?.id, "Missing usable assignable project manager");
  assert(usableManager.email, "Missing email on usable assignable project manager");

  const usableManagerPlainSearch = await api<Envelope<Employee>>(
    `/employee?email=${encodeURIComponent(usableManager.email)}&count=10&fields=*`,
  );
  const usableManagerAssignableSearch = await api<Envelope<Employee>>(
    `/employee?email=${encodeURIComponent(usableManager.email)}&assignableProjectManagers=true&count=10&fields=*`,
  );

  let missingStartDateError: unknown;
  try {
    await api<Envelope<Project>>("/project", {
      method: "POST",
      body: JSON.stringify({
        name: `${projectName} Missing Start`,
        customer: { id: createdCustomer.value.id },
        projectManager: { id: usableManager.id },
      }),
    });
  } catch (error) {
    missingStartDateError = (error as Error & { body?: unknown }).body;
  }

  let noAccessEmployeeProjectError: unknown;
  try {
    await api<Envelope<Project>>("/project", {
      method: "POST",
      body: JSON.stringify({
        name: `${projectName} No Access Employee`,
        startDate: today,
        customer: { id: createdCustomer.value.id },
        projectManager: { id: createdEmployee.value.id },
      }),
    });
  } catch (error) {
    noAccessEmployeeProjectError = (error as Error & { body?: unknown }).body;
  }

  const createdProject = await api<Envelope<Project>>("/project", {
    method: "POST",
    body: JSON.stringify({
      name: projectName,
      startDate: today,
      customer: { id: createdCustomer.value.id },
      projectManager: { id: usableManager.id },
    }),
  });

  assert(createdProject.value?.id, "Missing created project id");

  console.log(
    JSON.stringify(
      {
        customer: createdCustomer.value,
        employee: createdEmployee.value,
        employeeSearchAssignableCount: filteredManagers.values?.length ?? 0,
        employeeSearchPlainCount: plainEmployeeSearch.values?.length ?? 0,
        usableManager,
        usableManagerPlainSearchCount: usableManagerPlainSearch.values?.length ?? 0,
        usableManagerAssignableSearchCount: usableManagerAssignableSearch.values?.length ?? 0,
        missingStartDateError,
        noAccessEmployeeProjectError,
        createdProject: createdProject.value,
        createResponseProvesLinks:
          createdProject.value?.name === projectName &&
          createdProject.value?.startDate === today &&
          createdProject.value?.customer?.id === createdCustomer.value.id &&
          createdProject.value?.projectManager?.id === usableManager.id,
      },
      null,
      2,
    ),
  );
}

await main();
