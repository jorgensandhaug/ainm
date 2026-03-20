const baseUrl = process.env.TRIPLETEX_BASE_URL;
const token = process.env.TRIPLETEX_TOKEN;

if (!baseUrl || !token) {
  throw new Error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_TOKEN");
}

const auth = Buffer.from(`0:${token}`).toString("base64");

type JsonObject = Record<string, unknown>;

const employeeData = {
  firstName: "Lucy",
  lastName: "Wilson",
  dateOfBirth: "1986-12-28",
  email: "lucy.wilson@example.org",
  userType: "NO_ACCESS",
  employments: [
    {
      startDate: "2026-04-25",
    },
  ],
};

function endpoint(path: string, query?: Record<string, string>): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(path, base);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function request(
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, string>,
) {
  const response = await fetch(endpoint(path, query), {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }

  return { response, json };
}

function extractMessages(json: unknown): string[] {
  if (!json || typeof json !== "object") return [];
  const obj = json as JsonObject;
  const top = typeof obj.message === "string" ? [obj.message] : [];
  const validationMessages = Array.isArray(obj.validationMessages)
    ? obj.validationMessages
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const message = (item as JsonObject).message;
          return typeof message === "string" ? message : null;
        })
        .filter((item): item is string => Boolean(item))
    : [];
  return [...top, ...validationMessages];
}

function validationItems(json: unknown): JsonObject[] {
  if (!json || typeof json !== "object") return [];
  const items = (json as JsonObject).validationMessages;
  if (!Array.isArray(items)) return [];
  return items.filter((item): item is JsonObject => Boolean(item) && typeof item === "object");
}

function itemMentions(item: JsonObject, needle: string): boolean {
  return Object.values(item).some((value) => typeof value === "string" && value.includes(needle));
}

function invalidToken(json: unknown): boolean {
  if (!json || typeof json !== "object") return false;
  const error = (json as JsonObject).error;
  return (
    error === "Invalid or expired token" ||
    error ===
      "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions."
  );
}

function hasStartDate(createJson: unknown, startDate: string): boolean {
  if (!createJson || typeof createJson !== "object") return false;
  const value = (createJson as JsonObject).value;
  if (!value || typeof value !== "object") return false;
  const employments = (value as JsonObject).employments;
  if (!Array.isArray(employments)) return false;
  return employments.some((employment) => {
    if (!employment || typeof employment !== "object") return false;
    return (employment as JsonObject).startDate === startDate;
  });
}

async function createEmployee(payload: JsonObject) {
  return request("POST", "employee", payload);
}

async function getActiveDepartmentId(): Promise<number | null> {
  const { response, json } = await request("GET", "department", undefined, {
    isInactive: "false",
    count: "1",
    fields: "*",
  });
  if (!response.ok) {
    throw new Error(`Department lookup failed: ${response.status} ${JSON.stringify(json)}`);
  }
  if (!json || typeof json !== "object") return null;
  const values = (json as JsonObject).values;
  if (!Array.isArray(values) || values.length === 0) return null;
  const id = values[0] && typeof values[0] === "object" ? (values[0] as JsonObject).id : null;
  return typeof id === "number" ? id : null;
}

async function createDepartment(): Promise<number> {
  const { response, json } = await request("POST", "department", { name: "General" });
  if (!response.ok) {
    throw new Error(`Department create failed: ${response.status} ${JSON.stringify(json)}`);
  }
  if (!json || typeof json !== "object") {
    throw new Error("Department create returned no JSON body");
  }
  const value = (json as JsonObject).value;
  const id = value && typeof value === "object" ? (value as JsonObject).id : null;
  if (typeof id !== "number") {
    throw new Error(`Department create missing id: ${JSON.stringify(json)}`);
  }
  return id;
}

async function getDivisionId(): Promise<number> {
  const { response, json } = await request("GET", "division", undefined, {
    count: "1",
    fields: "*",
  });
  if (!response.ok) {
    throw new Error(`Division lookup failed: ${response.status} ${JSON.stringify(json)}`);
  }
  if (!json || typeof json !== "object") {
    throw new Error("Division lookup returned no JSON body");
  }
  const values = (json as JsonObject).values;
  if (!Array.isArray(values) || values.length === 0 || !values[0] || typeof values[0] !== "object") {
    throw new Error(`Division lookup returned no values: ${JSON.stringify(json)}`);
  }
  const id = (values[0] as JsonObject).id;
  if (typeof id !== "number") {
    throw new Error(`Division lookup missing id: ${JSON.stringify(json)}`);
  }
  return id;
}

async function verifyEmployment(employeeId: number) {
  const { response, json } = await request("GET", "employee/employment", undefined, {
    employeeId: String(employeeId),
    fields: "*",
  });
  if (!response.ok) {
    throw new Error(`Employment verify failed: ${response.status} ${JSON.stringify(json)}`);
  }
  return json;
}

function extractEmployeeId(json: unknown): number {
  if (!json || typeof json !== "object") {
    throw new Error(`Employee create returned no JSON body: ${JSON.stringify(json)}`);
  }
  const value = (json as JsonObject).value;
  const id = value && typeof value === "object" ? (value as JsonObject).id : null;
  if (typeof id !== "number") {
    throw new Error(`Employee create missing id: ${JSON.stringify(json)}`);
  }
  return id;
}

function employmentVerified(json: unknown, startDate: string): boolean {
  if (!json || typeof json !== "object") return false;
  const values = (json as JsonObject).values;
  if (!Array.isArray(values)) return false;
  return values.some((value) => {
    if (!value || typeof value !== "object") return false;
    return (value as JsonObject).startDate === startDate;
  });
}

async function main() {
  let payload: JsonObject = { ...employeeData };
  let result = await createEmployee(payload);

  if (result.response.status === 403 && invalidToken(result.json)) {
    throw new Error(`Blocked by unusable credentials: ${JSON.stringify(result.json)}`);
  }

  if (!result.response.ok) {
    const messages = extractMessages(result.json);
    const items = validationItems(result.json);
    const needsDepartment =
      result.response.status === 422 &&
      messages.some((msg) => msg.includes("Feltet må fylles ut.")) &&
      items.some((item) => itemMentions(item, "department"));

    if (!needsDepartment) {
      throw new Error(`Employee create failed: ${result.response.status} ${JSON.stringify(result.json)}`);
    }

    let departmentId = await getActiveDepartmentId();
    if (departmentId === null) {
      departmentId = await createDepartment();
    }

    payload = {
      ...payload,
      department: { id: departmentId },
    };
    result = await createEmployee(payload);

    if (result.response.status === 403 && invalidToken(result.json)) {
      throw new Error(`Blocked by unusable credentials: ${JSON.stringify(result.json)}`);
    }

    if (!result.response.ok) {
      const retryMessages = extractMessages(result.json);
      const retryItems = validationItems(result.json);
      const needsDivision =
        result.response.status === 422 &&
        retryMessages.some((msg) => msg.includes("Arbeidsforholdet må knyttes til en virksomhet/underenhet.")) &&
        retryItems.some((item) => itemMentions(item, "division"));

      if (!needsDivision) {
        throw new Error(`Employee create retry failed: ${result.response.status} ${JSON.stringify(result.json)}`);
      }

      const divisionId = await getDivisionId();
      const employments = (payload.employments as JsonObject[]).map((employment) => ({
        ...employment,
        division: { id: divisionId },
      }));
      payload = {
        ...payload,
        employments,
      };
      result = await createEmployee(payload);

      if (result.response.status === 403 && invalidToken(result.json)) {
        throw new Error(`Blocked by unusable credentials: ${JSON.stringify(result.json)}`);
      }

      if (!result.response.ok) {
        throw new Error(`Employee create final retry failed: ${result.response.status} ${JSON.stringify(result.json)}`);
      }
    }
  }

  const employeeId = extractEmployeeId(result.json);

  if (!hasStartDate(result.json, employeeData.employments[0].startDate)) {
    const employmentJson = await verifyEmployment(employeeId);
    if (!employmentVerified(employmentJson, employeeData.employments[0].startDate)) {
      throw new Error(`Employment verification missing start date: ${JSON.stringify(employmentJson)}`);
    }
  }

  console.log(JSON.stringify({ ok: true, employeeId }));
}

await main();
