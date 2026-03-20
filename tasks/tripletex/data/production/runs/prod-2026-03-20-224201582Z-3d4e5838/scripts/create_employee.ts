const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "JKbqJNrGjMpRIo3E80FhoKG2P0P01YjacTlO1cqpLVE";

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

type TripletexList<T> = {
  values?: T[];
  fullResultSize?: number;
};

type ValidationMessage = {
  field?: string;
  message?: string;
};

type TripletexErrorBody = {
  error?: string;
  message?: string;
  source?: string;
  validationMessages?: ValidationMessage[];
};

type TripletexResponse<T> = {
  value?: T;
  values?: T[];
  fullResultSize?: number;
};

type EmployeePayload = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email: string;
  userType: "NO_ACCESS";
  employments: Array<{
    startDate: string;
    division?: { id: number };
  }>;
  department?: { id: number };
};

function buildUrl(path: string, params?: Record<string, string>): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(path, normalizedBase);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function request<T>(
  method: string,
  path: string,
  options: {
    params?: Record<string, string>;
    body?: unknown;
  } = {},
): Promise<{ status: number; data: T; raw: string }> {
  const response = await fetch(buildUrl(path, options.params), {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const raw = await response.text();
  const data = raw ? (JSON.parse(raw) as T) : ({} as T);

  return { status: response.status, data, raw };
}

function ensureUsableCredentials(status: number, body: TripletexErrorBody): void {
  if (status !== 403) return;
  if (
    body.error === "Invalid or expired token" ||
    body.error ===
      "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions."
  ) {
    throw new Error(`Blocked credentials: ${body.error}`);
  }
}

function validationField(body: TripletexErrorBody, field: string): boolean {
  return !!body.validationMessages?.some((entry) => entry.field === field);
}

async function createDepartment(): Promise<number> {
  const read = await request<TripletexList<{ id: number }>>("GET", "department", {
    params: { isInactive: "false", count: "1", fields: "*" },
  });
  if (read.status !== 200) {
    ensureUsableCredentials(read.status, read.data as TripletexErrorBody);
    throw new Error(`Department lookup failed: ${read.status} ${read.raw}`);
  }

  const existing = read.data.values?.[0];
  if (existing?.id) return existing.id;

  const created = await request<TripletexResponse<{ id: number }>>("POST", "department", {
    body: { name: "General" },
  });
  if (created.status !== 201 && created.status !== 200) {
    ensureUsableCredentials(created.status, created.data as TripletexErrorBody);
    throw new Error(`Department create failed: ${created.status} ${created.raw}`);
  }

  const id = created.data.value?.id;
  if (!id) throw new Error(`Department create missing id: ${created.raw}`);
  return id;
}

async function getDivisionId(): Promise<number> {
  const read = await request<TripletexList<{ id: number }>>("GET", "division", {
    params: { count: "1", fields: "*" },
  });
  if (read.status !== 200) {
    ensureUsableCredentials(read.status, read.data as TripletexErrorBody);
    throw new Error(`Division lookup failed: ${read.status} ${read.raw}`);
  }
  const id = read.data.values?.[0]?.id;
  if (!id) throw new Error(`Division lookup returned no usable division: ${read.raw}`);
  return id;
}

async function createEmployee(payload: EmployeePayload) {
  return request<TripletexResponse<{ id: number; employments?: Array<{ startDate?: string }> }> | TripletexErrorBody>(
    "POST",
    "employee",
    { body: payload },
  );
}

async function main() {
  const payload: EmployeePayload = {
    firstName: "Jules",
    lastName: "Bernard",
    dateOfBirth: "1982-12-08",
    email: "jules.bernard@example.org",
    userType: "NO_ACCESS",
    employments: [{ startDate: "2026-12-27" }],
  };

  let response = await createEmployee(payload);
  ensureUsableCredentials(response.status, response.data as TripletexErrorBody);

  if (response.status === 422 && validationField(response.data as TripletexErrorBody, "department.id")) {
    payload.department = { id: await createDepartment() };
    response = await createEmployee(payload);
    ensureUsableCredentials(response.status, response.data as TripletexErrorBody);
  }

  if (response.status === 422 && validationField(response.data as TripletexErrorBody, "employments.division.id")) {
    payload.employments[0]!.division = { id: await getDivisionId() };
    response = await createEmployee(payload);
    ensureUsableCredentials(response.status, response.data as TripletexErrorBody);
  }

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`Employee create failed: ${response.status} ${response.raw}`);
  }

  const employeeId = (response.data as TripletexResponse<{ id: number }>).value?.id;
  if (!employeeId) {
    throw new Error(`Employee create missing id: ${response.raw}`);
  }

  const echoedStartDate = (response.data as TripletexResponse<{ employments?: Array<{ startDate?: string }> }>).value
    ?.employments?.[0]?.startDate;

  let employmentData: unknown = null;
  if (echoedStartDate !== "2026-12-27") {
    const employment = await request<TripletexList<{ id: number; startDate?: string; employee?: { id?: number } }>>(
      "GET",
      "employee/employment",
      { params: { employeeId: String(employeeId), fields: "*" } },
    );
    if (employment.status !== 200) {
      ensureUsableCredentials(employment.status, employment.data as TripletexErrorBody);
      throw new Error(`Employment verification failed: ${employment.status} ${employment.raw}`);
    }

    const match = employment.data.values?.find((item) => item.employee?.id === employeeId) ?? employment.data.values?.[0];
    if (match?.startDate !== "2026-12-27") {
      throw new Error(`Employment start date mismatch: ${employment.raw}`);
    }
    employmentData = match;
  }

  console.log(
    JSON.stringify(
      {
        employee: (response.data as TripletexResponse<unknown>).value,
        employment: employmentData,
      },
      null,
      2,
    ),
  );
}

await main();
