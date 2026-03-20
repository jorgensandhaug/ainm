const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const token = "5E4umgkiuPlRMti1ERZj2cA5jcQUhspfI-lU7cXr2os";

const auth = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;

type Json = Record<string, unknown>;

const employeePayload = {
  firstName: "João",
  lastName: "Rodrigues",
  dateOfBirth: "1980-09-05",
  email: "joao.rodrigues@example.org",
  userType: "NO_ACCESS",
  employments: [
    {
      startDate: "2026-08-08",
    },
  ],
};

function makeUrl(path: string, query?: Record<string, string>) {
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`);
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
  opts: { query?: Record<string, string>; body?: unknown } = {},
) {
  const res = await fetch(makeUrl(path, opts.query), {
    method,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }

  if (
    res.status === 403 &&
    typeof json === "object" &&
    json !== null &&
    "error" in json &&
    ((((json as Json).error as string) || "").includes("Invalid or expired token") ||
      (((json as Json).error as string) || "").includes("Invalid or expired proxy token"))
  ) {
    throw new Error(`Blocked credentials: ${JSON.stringify(json)}`);
  }

  return { status: res.status, json, text };
}

function getValidationFields(json: unknown): string[] {
  if (!json || typeof json !== "object") return [];
  const msgs = (json as Json).validationMessages;
  if (!Array.isArray(msgs)) return [];
  return msgs
    .map((msg) =>
      msg && typeof msg === "object" && "field" in msg ? String((msg as Json).field) : "",
    )
    .filter(Boolean);
}

function getValues(json: unknown): Json[] {
  if (!json || typeof json !== "object") return [];
  const values = (json as Json).values;
  return Array.isArray(values) ? (values as Json[]) : [];
}

function getValue(json: unknown): Json {
  if (!json || typeof json !== "object") {
    throw new Error(`Unexpected response: ${JSON.stringify(json)}`);
  }
  const value = (json as Json).value;
  if (!value || typeof value !== "object") {
    throw new Error(`Missing response.value: ${JSON.stringify(json)}`);
  }
  return value as Json;
}

async function createEmployee(payload: Json) {
  return request("POST", "employee", { body: payload });
}

async function verifyEmployment(employeeId: number) {
  const res = await request("GET", "employee/employment", {
    query: {
      employeeId: String(employeeId),
      fields: "*",
    },
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Employment verify failed: ${res.status} ${JSON.stringify(res.json)}`);
  }
  const values = getValues(res.json);
  const employment = values.find(
    (value) => Number(value.employeeId) === employeeId || Number((value.employee as Json)?.id) === employeeId,
  );
  if (!employment) {
    throw new Error(`Employment not found for employee ${employeeId}: ${JSON.stringify(res.json)}`);
  }
  return employment;
}

async function main() {
  let payload: Json = { ...employeePayload };
  let res = await createEmployee(payload);

  if (res.status === 422) {
    const fields = getValidationFields(res.json);
    if (fields.includes("department.id")) {
      const deptRes = await request("GET", "department", {
        query: {
          isInactive: "false",
          count: "1",
          fields: "*",
        },
      });
      if (deptRes.status < 200 || deptRes.status >= 300) {
        throw new Error(`Department lookup failed: ${deptRes.status} ${JSON.stringify(deptRes.json)}`);
      }
      let departmentId = getValues(deptRes.json)[0]?.id as number | undefined;
      if (!departmentId) {
        const createDeptRes = await request("POST", "department", {
          body: { name: "General" },
        });
        if (createDeptRes.status < 200 || createDeptRes.status >= 300) {
          throw new Error(
            `Department create failed: ${createDeptRes.status} ${JSON.stringify(createDeptRes.json)}`,
          );
        }
        departmentId = Number(getValue(createDeptRes.json).id);
      }
      payload = { ...payload, department: { id: departmentId } };
      res = await createEmployee(payload);
    }
  }

  if (res.status === 422) {
    const fields = getValidationFields(res.json);
    if (fields.includes("employments.division.id")) {
      const divisionRes = await request("GET", "division", {
        query: {
          count: "1",
          fields: "*",
        },
      });
      if (divisionRes.status < 200 || divisionRes.status >= 300) {
        throw new Error(`Division lookup failed: ${divisionRes.status} ${JSON.stringify(divisionRes.json)}`);
      }
      const divisionId = getValues(divisionRes.json)[0]?.id as number | undefined;
      if (!divisionId) {
        throw new Error(`No division found: ${JSON.stringify(divisionRes.json)}`);
      }
      payload = {
        ...payload,
        employments: [
          {
            startDate: "2026-08-08",
            division: { id: divisionId },
          },
        ],
      };
      res = await createEmployee(payload);
    }
  }

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Employee create failed: ${res.status} ${JSON.stringify(res.json)}`);
  }

  const employee = getValue(res.json);
  const employeeId = Number(employee.id);
  if (!employeeId) {
    throw new Error(`Missing employee id: ${JSON.stringify(res.json)}`);
  }

  const employments = Array.isArray(employee.employments) ? employee.employments : [];
  const echoedStartDate = employments.find(
    (item) => item && typeof item === "object" && "startDate" in (item as Json),
  ) as Json | undefined;

  const employment = echoedStartDate ?? (await verifyEmployment(employeeId));

  console.log(
    JSON.stringify(
      {
        employee: {
          id: employeeId,
          firstName: employee.firstName,
          lastName: employee.lastName,
          dateOfBirth: employee.dateOfBirth,
          email: employee.email,
        },
        employment: {
          id: employment.id,
          startDate: employment.startDate,
        },
      },
      null,
      2,
    ),
  );
}

await main();
