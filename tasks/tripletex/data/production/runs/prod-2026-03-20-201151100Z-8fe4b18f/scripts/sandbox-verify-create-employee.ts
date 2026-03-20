const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

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
  const response = await fetch(buildUrl(path, query), {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: response.status, data };
}

function validationMessages(data: any): string[] {
  if (!Array.isArray(data?.validationMessages)) return [];
  return data.validationMessages
    .map((message: any) => {
      if (typeof message === "string") return message;
      const field = message?.field ? `${message.field}: ` : "";
      return `${field}${message?.message ?? message?.developerMessage ?? ""}`.trim();
    })
    .filter(Boolean);
}

function payload(email: string, departmentId?: number, divisionId?: number) {
  return {
    firstName: "Codex",
    lastName: "Empleado Sandbox",
    dateOfBirth: "1991-04-20",
    email,
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
  const suffix = `${Date.now()}`;
  const email = `codex.employee.${suffix}@example.org`;
  const calls: Array<Record<string, unknown>> = [];

  let create1 = await api("POST", "employee", payload(email));
  calls.push({
    call: "POST /employee",
    status: create1.status,
    validationMessages: validationMessages(create1.data),
  });

  let departmentId: number | undefined;
  if (create1.status === 422 && validationMessages(create1.data).some((m) => m.includes("department.id"))) {
    const dept = await api("GET", "department", undefined, {
      isInactive: false,
      count: 1,
      fields: "*",
    });
    calls.push({
      call: "GET /department?isInactive=false&count=1&fields=*",
      status: dept.status,
      id: dept.data?.values?.[0]?.id ?? null,
    });
    departmentId = Number(dept.data?.values?.[0]?.id);
    create1 = await api("POST", "employee", payload(email, departmentId));
    calls.push({
      call: "POST /employee with department",
      status: create1.status,
      validationMessages: validationMessages(create1.data),
    });
  }

  let divisionId: number | undefined;
  if (create1.status === 422 && validationMessages(create1.data).some((m) => m.includes("employments.division.id"))) {
    const division = await api("GET", "division", undefined, {
      count: 1,
      fields: "*",
    });
    calls.push({
      call: "GET /division?count=1&fields=*",
      status: division.status,
      id: division.data?.values?.[0]?.id ?? null,
    });
    divisionId = Number(division.data?.values?.[0]?.id);
    create1 = await api("POST", "employee", payload(email, departmentId, divisionId));
    calls.push({
      call: "POST /employee with department and division",
      status: create1.status,
      userTypeEcho: create1.data?.value?.userType ?? null,
      employmentsEcho: create1.data?.value?.employments ?? null,
    });
  }

  const employeeId = create1.data?.value?.id;
  const employment = await api("GET", "employee/employment", undefined, {
    employeeId,
    fields: "*",
  });
  calls.push({
    call: `GET /employee/employment?employeeId=${employeeId}&fields=*`,
    status: employment.status,
    startDate: employment.data?.values?.[0]?.startDate ?? null,
    divisionId: employment.data?.values?.[0]?.division?.id ?? null,
  });

  console.log(
    JSON.stringify(
      {
        email,
        calls,
      },
      null,
      2,
    ),
  );
}

await main();
