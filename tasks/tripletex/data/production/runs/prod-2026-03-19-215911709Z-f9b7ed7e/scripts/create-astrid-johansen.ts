const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "REDACTED";

const EMPLOYEE_BASE_PAYLOAD = {
  firstName: "Astrid",
  lastName: "Johansen",
  dateOfBirth: "1989-06-10",
  email: "astrid.johansen@example.org",
  userType: "NO_ACCESS",
  employments: [
    {
      startDate: "2026-10-25",
    },
  ],
};

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function authHeader(): string {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", authHeader());
  headers.set("Accept", "application/json");
  if (init.body) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${init.method ?? "GET"} ${path} failed: ${response.status} ${errorText}`);
  }

  return response;
}

async function requestJson(path: string, init: RequestInit = {}): Promise<JsonValue> {
  const response = await request(path, init);
  return (await response.json()) as JsonValue;
}

function asObject(value: JsonValue): Record<string, JsonValue> {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`Expected object, got: ${JSON.stringify(value)}`);
  }
  return value as Record<string, JsonValue>;
}

function getNestedEmploymentStartDate(employee: Record<string, JsonValue>): string | null {
  const employments = employee.employments;
  if (!Array.isArray(employments) || employments.length === 0) {
    return null;
  }

  const firstEmployment = employments[0];
  if (!firstEmployment || Array.isArray(firstEmployment) || typeof firstEmployment !== "object") {
    return null;
  }

  const startDate = (firstEmployment as Record<string, JsonValue>).startDate;
  return typeof startDate === "string" ? startDate : null;
}

async function ensureDepartment(): Promise<number> {
  const departmentListWrapper = asObject(
    await requestJson("/department?isInactive=false&count=1&fields=*"),
  );
  const existingValues = departmentListWrapper.values;
  if (Array.isArray(existingValues) && existingValues.length > 0) {
    const firstDepartment = existingValues[0];
    if (firstDepartment && !Array.isArray(firstDepartment) && typeof firstDepartment === "object") {
      const departmentId = (firstDepartment as Record<string, JsonValue>).id;
      if (typeof departmentId === "number") {
        return departmentId;
      }
    }
  }

  const departmentWrapper = asObject(
    await requestJson("/department", {
      method: "POST",
      body: JSON.stringify({
        name: "Standardavdeling",
      }),
    }),
  );
  const department = asObject(departmentWrapper.value as JsonValue);
  const departmentId = department.id;
  if (typeof departmentId !== "number") {
    throw new Error(`Department creation missing numeric id: ${JSON.stringify(departmentWrapper)}`);
  }
  return departmentId;
}

async function main(): Promise<void> {
  const departmentId = await ensureDepartment();
  const employeeWrapper = asObject(
    await requestJson("/employee", {
      method: "POST",
      body: JSON.stringify({
        ...EMPLOYEE_BASE_PAYLOAD,
        department: { id: departmentId },
      }),
    }),
  );
  const employee = asObject(employeeWrapper.value as JsonValue);
  const employeeId = employee.id;
  if (typeof employeeId !== "number") {
    throw new Error(`Employee creation missing numeric id: ${JSON.stringify(employeeWrapper)}`);
  }

  let employmentResult: JsonValue | null = null;
  let employmentStartDate = getNestedEmploymentStartDate(employee);

  if (!employmentStartDate) {
    const employments = employee.employments;
    if (Array.isArray(employments) && employments.length > 0) {
      const employmentListWrapper = asObject(
        await requestJson(`/employee/employment?employeeId=${employeeId}&fields=*`),
      );
      const values = employmentListWrapper.values;
      if (Array.isArray(values)) {
        const matching = values.find((value) => {
          if (!value || Array.isArray(value) || typeof value !== "object") {
            return false;
          }
          return (value as Record<string, JsonValue>).startDate === "2026-10-25";
        });
        if (matching && typeof matching === "object" && !Array.isArray(matching)) {
          employmentResult = matching as JsonValue;
          employmentStartDate = "2026-10-25";
        }
      }
    }
  }

  if (!employmentStartDate) {
    const employmentWrapper = asObject(
      await requestJson("/employee/employment", {
        method: "POST",
        body: JSON.stringify({
          employee: { id: employeeId },
          startDate: "2026-10-25",
        }),
      }),
    );
    const employment = asObject(employmentWrapper.value as JsonValue);
    employmentResult = employment;
    const startDate = employment.startDate;
    employmentStartDate = typeof startDate === "string" ? startDate : null;
  }

  if (employmentStartDate !== "2026-10-25") {
    throw new Error(
      `Employee created but employment startDate not verified: ${JSON.stringify({
        employee,
        employmentResult,
      })}`,
    );
  }

  const summary = {
    employeeId,
    firstName: employee.firstName,
    lastName: employee.lastName,
    dateOfBirth: employee.dateOfBirth,
    email: employee.email,
    employmentStartDate,
  };

  console.log(JSON.stringify(summary, null, 2));
}

await main();
