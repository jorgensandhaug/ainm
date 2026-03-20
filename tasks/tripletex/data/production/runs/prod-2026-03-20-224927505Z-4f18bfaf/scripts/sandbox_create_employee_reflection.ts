const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const auth = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;
const suffix = String(Date.now());

type Json = Record<string, unknown>;

const employeePayload = {
  firstName: "João",
  lastName: `Rodrigues Reflection ${suffix}`,
  dateOfBirth: "1980-09-05",
  email: `joao.rodrigues.reflection.${suffix}@example.org`,
  userType: "NO_ACCESS",
  employments: [
    {
      startDate: "2026-08-08",
    },
  ],
};

const calls: Array<Record<string, unknown>> = [];

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

  calls.push({
    method,
    path,
    query: opts.query ?? null,
    status: res.status,
    body: opts.body ?? null,
    response: json,
  });

  return { status: res.status, json };
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

async function main() {
  let payload: Json = { ...employeePayload };
  let res = await request("POST", "employee", { body: payload });

  if (res.status === 422 && getValidationFields(res.json).includes("department.id")) {
    const deptRes = await request("GET", "department", {
      query: { isInactive: "false", count: "1", fields: "*" },
    });
    const departmentId = getValues(deptRes.json)[0]?.id as number | undefined;
    if (!departmentId) {
      throw new Error(`Expected existing active department: ${JSON.stringify(deptRes.json)}`);
    }
    payload = { ...payload, department: { id: departmentId } };
    res = await request("POST", "employee", { body: payload });
  }

  if (res.status === 422 && getValidationFields(res.json).includes("employments.division.id")) {
    const divisionRes = await request("GET", "division", {
      query: { count: "1", fields: "*" },
    });
    const divisionId = getValues(divisionRes.json)[0]?.id as number | undefined;
    if (!divisionId) {
      throw new Error(`Expected existing division: ${JSON.stringify(divisionRes.json)}`);
    }
    payload = {
      ...payload,
      employments: [{ startDate: "2026-08-08", division: { id: divisionId } }],
    };
    res = await request("POST", "employee", { body: payload });
  }

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Employee create failed: ${res.status} ${JSON.stringify(res.json)}`);
  }

  const employee = getValue(res.json);
  const employeeId = Number(employee.id);
  const employmentRes = await request("GET", "employee/employment", {
    query: { employeeId: String(employeeId), fields: "*" },
  });
  if (employmentRes.status < 200 || employmentRes.status >= 300) {
    throw new Error(`Employment verify failed: ${employmentRes.status} ${JSON.stringify(employmentRes.json)}`);
  }

  console.log(
    JSON.stringify(
      {
        employeePayload,
        createResponse: employee,
        verifiedEmployment: getValues(employmentRes.json)[0] ?? null,
        callCount: calls.length,
        calls,
      },
      null,
      2,
    ),
  );
}

await main();
