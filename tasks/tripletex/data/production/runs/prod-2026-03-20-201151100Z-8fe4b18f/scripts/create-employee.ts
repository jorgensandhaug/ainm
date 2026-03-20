const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "J6qRjgwQa8gor-S2RGoH4h7p1oeSgtWcT_DlNRWPoyI";

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

type ApiResponse = {
  status: number;
  data: any;
};

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const url = new URL(path, base);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function api(
  method: string,
  path: string,
  body?: Json,
  query?: Record<string, string | number | boolean | undefined>,
): Promise<ApiResponse> {
  const res = await fetch(buildUrl(path, query), {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: res.status, data };
}

function validationMessages(data: any): string[] {
  const raw = data?.validationMessages;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") return item;
      const field = item?.field ? `${item.field}: ` : "";
      const message = item?.message ?? item?.developerMessage ?? "";
      return `${field}${message}`.trim();
    })
    .filter(Boolean);
}

function hasInvalidToken(resp: ApiResponse): boolean {
  return resp.status === 403 && resp.data?.error === "Invalid or expired token";
}

function hasDepartmentError(resp: ApiResponse): boolean {
  return resp.status === 422 && validationMessages(resp.data).some((m) => m.includes("department.id"));
}

function hasDivisionError(resp: ApiResponse): boolean {
  return resp.status === 422 && validationMessages(resp.data).some((m) => m.includes("employments.division.id"));
}

function employeePayload(departmentId?: number, divisionId?: number) {
  return {
    firstName: "Miguel",
    lastName: "Sánchez",
    dateOfBirth: "1991-04-20",
    email: "miguel.sanchez@example.org",
    userType: "NO_ACCESS",
    ...(departmentId ? { department: { id: departmentId } } : {}),
    employments: [
      {
        startDate: "2026-08-12",
        ...(divisionId ? { division: { id: divisionId } } : {}),
      },
    ],
  };
}

async function main() {
  let createResp = await api("POST", "employee", employeePayload());
  if (hasInvalidToken(createResp)) throw new Error("Blocked: invalid or expired token");

  let departmentId: number | undefined;
  if (hasDepartmentError(createResp)) {
    const deptResp = await api("GET", "department", undefined, {
      isInactive: false,
      count: 1,
      fields: "*",
    });
    if (hasInvalidToken(deptResp)) throw new Error("Blocked: invalid or expired token");
    if (deptResp.status !== 200) {
      throw new Error(`Department lookup failed: ${deptResp.status} ${JSON.stringify(deptResp.data)}`);
    }

    const department = deptResp.data?.values?.[0];
    if (department?.id) {
      departmentId = Number(department.id);
    } else {
      const createDeptResp = await api("POST", "department", { name: "General" });
      if (hasInvalidToken(createDeptResp)) throw new Error("Blocked: invalid or expired token");
      if (createDeptResp.status !== 201 && createDeptResp.status !== 200) {
        throw new Error(`Department create failed: ${createDeptResp.status} ${JSON.stringify(createDeptResp.data)}`);
      }
      departmentId = Number(createDeptResp.data?.value?.id);
      if (!departmentId) throw new Error("Department create returned no id");
    }

    createResp = await api("POST", "employee", employeePayload(departmentId));
    if (hasInvalidToken(createResp)) throw new Error("Blocked: invalid or expired token");
  }

  let divisionId: number | undefined;
  if (hasDivisionError(createResp)) {
    const divisionResp = await api("GET", "division", undefined, {
      count: 1,
      fields: "*",
    });
    if (hasInvalidToken(divisionResp)) throw new Error("Blocked: invalid or expired token");
    if (divisionResp.status !== 200) {
      throw new Error(`Division lookup failed: ${divisionResp.status} ${JSON.stringify(divisionResp.data)}`);
    }

    const division = divisionResp.data?.values?.[0];
    divisionId = Number(division?.id);
    if (!divisionId) throw new Error("Blocked: no division available");

    createResp = await api("POST", "employee", employeePayload(departmentId, divisionId));
    if (hasInvalidToken(createResp)) throw new Error("Blocked: invalid or expired token");
  }

  if (createResp.status !== 201 && createResp.status !== 200) {
    throw new Error(`Employee create failed: ${createResp.status} ${JSON.stringify(createResp.data)}`);
  }

  const employee = createResp.data?.value;
  const employeeId = Number(employee?.id);
  if (!employeeId) throw new Error("Employee create returned no id");

  const employmentHasStartDate = Array.isArray(employee?.employments)
    && employee.employments.some((item: any) => item?.startDate === "2026-08-12");

  let employmentData = employee?.employments;
  if (!employmentHasStartDate) {
    const employmentResp = await api("GET", "employee/employment", undefined, {
      employeeId,
      fields: "*",
    });
    if (hasInvalidToken(employmentResp)) throw new Error("Blocked: invalid or expired token");
    if (employmentResp.status !== 200) {
      throw new Error(`Employment verify failed: ${employmentResp.status} ${JSON.stringify(employmentResp.data)}`);
    }
    employmentData = employmentResp.data?.values ?? [];
    const verified = employmentData.some((item: any) => item?.startDate === "2026-08-12");
    if (!verified) throw new Error("Employment start date not verified");
  }

  console.log(
    JSON.stringify(
      {
        employee: {
          id: employeeId,
          firstName: employee?.firstName,
          lastName: employee?.lastName,
          dateOfBirth: employee?.dateOfBirth,
          email: employee?.email,
        },
        employment: employmentData,
      },
      null,
      2,
    ),
  );
}

await main();
