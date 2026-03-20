const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "REDACTED";

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
  userType?: string;
  department?: Department;
  employments?: Array<{ id?: number; startDate?: string }>;
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

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} failed: ${res.status} ${text}`);
  }

  return text ? (JSON.parse(text) as T) : (undefined as T);
}

async function ensureDepartment(): Promise<Department> {
  const departments = await request<{ values?: Department[] }>(
    "/department?isInactive=false&count=1&fields=*",
  );
  const existing = departments.values?.[0];
  if (existing?.id) {
    return existing;
  }

  const created = await request<{ value: Department }>("/department", {
    method: "POST",
    body: JSON.stringify({ name: "General" }),
  });
  if (!created.value?.id) {
    throw new Error("Department response missing id");
  }
  return created.value;
}

async function main() {
  const department = await ensureDepartment();
  const unique = Date.now();
  const email = `nathan.moreau.sandbox.${unique}@example.org`;

  const created = await request<{ value: Employee }>("/employee", {
    method: "POST",
    body: JSON.stringify({
      firstName: "Nathan",
      lastName: `Moreau Sandbox ${unique}`,
      dateOfBirth: "1981-04-17",
      email,
      userType: "NO_ACCESS",
      department: { id: department.id },
      employments: [{ startDate: "2026-01-06" }],
    }),
  });

  const employee = created.value;
  const employments = await request<{ values?: Employment[] }>(
    `/employee/employment?employeeId=${employee.id}&fields=*`,
  );

  console.log(
    JSON.stringify(
      {
        department,
        createResponse: employee,
        employmentRead: employments.values?.[0] ?? null,
      },
      null,
      2,
    ),
  );
}

await main();
