const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "REDACTED";

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

type Department = {
  id: number;
  name?: string;
  isInactive?: boolean;
};

type Employee = {
  id: number;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  email?: string;
  department?: Department;
  employments?: Array<{ startDate?: string }>;
};

type Employment = {
  id: number;
  startDate?: string;
  employee?: { id: number };
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${init?.method ?? "GET"} ${path} failed: ${res.status} ${text}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

async function ensureDepartment(): Promise<Department> {
  const list = await request<{ values?: Department[] }>(
    "/department?isInactive=false&count=1&fields=*",
  );
  const existing = list.values?.[0];
  if (existing?.id) {
    return existing;
  }

  const created = await request<{ value: Department }>("/department", {
    method: "POST",
    body: JSON.stringify({
      name: "General",
    }),
  });
  if (!created.value?.id) {
    throw new Error("Department creation succeeded without an id in response");
  }
  return created.value;
}

async function main() {
  const department = await ensureDepartment();

  const employeePayload = {
    firstName: "Nathan",
    lastName: "Moreau",
    dateOfBirth: "1981-04-17",
    email: "nathan.moreau@example.org",
    userType: "NO_ACCESS",
    department: { id: department.id },
    employments: [{ startDate: "2026-01-06" }],
  };

  const createdEmployee = await request<{ value: Employee }>("/employee", {
    method: "POST",
    body: JSON.stringify(employeePayload),
  });

  const employee = createdEmployee.value;
  if (!employee?.id) {
    throw new Error("Employee creation succeeded without an id in response");
  }

  let verifiedStartDate = employee.employments?.[0]?.startDate;
  if (verifiedStartDate !== "2026-01-06") {
    const employmentList = await request<{ values?: Employment[] }>(
      `/employee/employment?employeeId=${employee.id}&fields=*`,
    );
    verifiedStartDate = employmentList.values?.[0]?.startDate;
  }

  if (verifiedStartDate !== "2026-01-06") {
    throw new Error(
      `Employee created but start date verification failed: ${verifiedStartDate ?? "missing"}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        employeeId: employee.id,
        departmentId: department.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        dateOfBirth: employee.dateOfBirth,
        email: employee.email,
        verifiedStartDate,
      },
      null,
      2,
    ),
  );
}

await main();
