const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "REDACTED";

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

  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
  });
}

async function responseJson(response: Response): Promise<JsonValue> {
  const text = await response.text();
  return text ? (JSON.parse(text) as JsonValue) : null;
}

function asObject(value: JsonValue): Record<string, JsonValue> {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`Expected object, got: ${JSON.stringify(value)}`);
  }
  return value as Record<string, JsonValue>;
}

async function ensureDepartment(): Promise<{ id: number; source: "existing" | "created" }> {
  const listResponse = await request("/department?isInactive=false&count=1&fields=*");
  if (!listResponse.ok) {
    throw new Error(`Department lookup failed with ${listResponse.status}: ${await listResponse.text()}`);
  }

  const listJson = asObject(await responseJson(listResponse));
  const values = listJson.values;
  if (Array.isArray(values) && values.length > 0) {
    const first = asObject(values[0] as JsonValue);
    const id = first.id;
    if (typeof id === "number") {
      return { id, source: "existing" };
    }
  }

  const createResponse = await request("/department", {
    method: "POST",
    body: JSON.stringify({ name: "Codex Verification Department" }),
  });
  if (!createResponse.ok) {
    throw new Error(`Department create failed with ${createResponse.status}: ${await createResponse.text()}`);
  }

  const createJson = asObject(await responseJson(createResponse));
  const department = asObject(createJson.value as JsonValue);
  const id = department.id;
  if (typeof id !== "number") {
    throw new Error(`Department create response missing id: ${JSON.stringify(createJson)}`);
  }

  return { id, source: "created" };
}

async function expectValidation(
  label: string,
  payload: Record<string, JsonValue>,
): Promise<Record<string, JsonValue>> {
  const response = await request("/employee", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const json = asObject(await responseJson(response));
  if (response.status !== 422) {
    throw new Error(`${label} expected 422, got ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

function firstEmploymentStartDate(employee: Record<string, JsonValue>): string | null {
  const employments = employee.employments;
  if (!Array.isArray(employments) || employments.length === 0) {
    return null;
  }
  const first = employments[0];
  if (!first || Array.isArray(first) || typeof first !== "object") {
    return null;
  }
  const startDate = (first as Record<string, JsonValue>).startDate;
  return typeof startDate === "string" ? startDate : null;
}

async function main(): Promise<void> {
  const department = await ensureDepartment();
  const unique = `${Date.now()}`;
  const baseEmployee = {
    firstName: "Codex",
    lastName: `Verification ${unique}`,
    dateOfBirth: "1989-06-10",
    email: `codex.verify.${unique}@example.org`,
    employments: [{ startDate: "2026-10-25" }],
  };

  const missingUserType = await expectValidation("missingUserType", {
    ...baseEmployee,
    department: { id: department.id },
  });

  const missingDepartment = await expectValidation("missingDepartment", {
    ...baseEmployee,
    userType: "NO_ACCESS",
  });

  const createResponse = await request("/employee", {
    method: "POST",
    body: JSON.stringify({
      ...baseEmployee,
      userType: "NO_ACCESS",
      department: { id: department.id },
    }),
  });
  const createJson = asObject(await responseJson(createResponse));
  if (createResponse.status !== 201) {
    throw new Error(`Valid create expected 201, got ${createResponse.status}: ${JSON.stringify(createJson)}`);
  }

  const employee = asObject(createJson.value as JsonValue);
  const employeeId = employee.id;
  if (typeof employeeId !== "number") {
    throw new Error(`Employee create response missing id: ${JSON.stringify(createJson)}`);
  }

  const employmentResponse = await request(`/employee/employment?employeeId=${employeeId}&fields=*`);
  const employmentJson = asObject(await responseJson(employmentResponse));
  if (!employmentResponse.ok) {
    throw new Error(
      `Employment verification expected 200, got ${employmentResponse.status}: ${JSON.stringify(employmentJson)}`,
    );
  }
  const employmentValues = Array.isArray(employmentJson.values) ? employmentJson.values : [];
  const verifiedEmployment = employmentValues.find((value) => {
    if (!value || Array.isArray(value) || typeof value !== "object") {
      return false;
    }
    return (value as Record<string, JsonValue>).startDate === "2026-10-25";
  });

  const result = {
    departmentSource: department.source,
    departmentId: department.id,
    missingUserTypeValidation: missingUserType.validationMessages,
    missingDepartmentValidation: missingDepartment.validationMessages,
    employeeId,
    userType: employee.userType,
    email: employee.email,
    dateOfBirth: employee.dateOfBirth,
    nestedEmploymentStartDate: firstEmploymentStartDate(employee),
    employmentSearchCount: employmentValues.length,
    verifiedEmploymentStartDate:
      verifiedEmployment && typeof verifiedEmployment === "object" && !Array.isArray(verifiedEmployment)
        ? (verifiedEmployment as Record<string, JsonValue>).startDate
        : null,
  };

  console.log(JSON.stringify(result, null, 2));
}

await main();
