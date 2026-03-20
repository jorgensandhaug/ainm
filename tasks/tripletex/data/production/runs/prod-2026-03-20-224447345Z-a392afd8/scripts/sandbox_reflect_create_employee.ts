const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;
const unique = Date.now().toString();

type TripletexList<T> = {
  values?: T[];
  fullResultSize?: number;
};

type TripletexValue<T> = {
  value?: T;
};

type ValidationMessage = {
  field?: string;
  message?: string;
};

type ErrorBody = {
  error?: string;
  message?: string;
  source?: string;
  validationMessages?: ValidationMessage[];
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

type StepLog = {
  step: string;
  status: number;
  body: unknown;
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
  options: { params?: Record<string, string>; body?: unknown } = {},
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

function validationField(body: ErrorBody, field: string): boolean {
  return !!body.validationMessages?.some((entry) => entry.field === field);
}

async function main() {
  const expectedStartDate = "2026-08-08";
  const steps: StepLog[] = [];
  const payload: EmployeePayload = {
    firstName: "João",
    lastName: `Rodrigues Reflection ${unique}`,
    dateOfBirth: "1980-09-05",
    email: `joao.rodrigues.${unique}@example.org`,
    userType: "NO_ACCESS",
    employments: [{ startDate: expectedStartDate }],
  };

  let create = await request<TripletexValue<{ id: number; employments?: Array<{ startDate?: string }> }> | ErrorBody>(
    "POST",
    "employee",
    { body: payload },
  );
  steps.push({ step: "POST /employee (initial)", status: create.status, body: create.data });

  if (create.status === 422 && validationField(create.data as ErrorBody, "department.id")) {
    const departmentRead = await request<TripletexList<{ id: number; name?: string }>>("GET", "department", {
      params: { isInactive: "false", count: "1", fields: "*" },
    });
    steps.push({ step: "GET /department", status: departmentRead.status, body: departmentRead.data });
    const departmentId = departmentRead.data.values?.[0]?.id;
    if (!departmentId) {
      throw new Error(`Sandbox department read returned no department: ${departmentRead.raw}`);
    }
    payload.department = { id: departmentId };
    create = await request<TripletexValue<{ id: number; employments?: Array<{ startDate?: string }> }> | ErrorBody>(
      "POST",
      "employee",
      { body: payload },
    );
    steps.push({ step: "POST /employee (with department)", status: create.status, body: create.data });
  }

  if (create.status === 422 && validationField(create.data as ErrorBody, "employments.division.id")) {
    const divisionRead = await request<TripletexList<{ id: number; name?: string }>>("GET", "division", {
      params: { count: "1", fields: "*" },
    });
    steps.push({ step: "GET /division", status: divisionRead.status, body: divisionRead.data });
    const divisionId = divisionRead.data.values?.[0]?.id;
    if (!divisionId) {
      throw new Error(`Sandbox division read returned no division: ${divisionRead.raw}`);
    }
    payload.employments[0]!.division = { id: divisionId };
    create = await request<TripletexValue<{ id: number; employments?: Array<{ startDate?: string }> }> | ErrorBody>(
      "POST",
      "employee",
      { body: payload },
    );
    steps.push({ step: "POST /employee (with department + division)", status: create.status, body: create.data });
  }

  if (create.status !== 200 && create.status !== 201) {
    throw new Error(`Sandbox employee create failed: ${create.status} ${create.raw}`);
  }

  const employeeId = (create.data as TripletexValue<{ id: number }>).value?.id;
  if (!employeeId) {
    throw new Error(`Sandbox employee create missing id: ${create.raw}`);
  }

  const employmentRead = await request<TripletexList<{ id: number; startDate?: string; division?: { id?: number } }>>(
    "GET",
    "employee/employment",
    { params: { employeeId: String(employeeId), fields: "*" } },
  );
  steps.push({ step: "GET /employee/employment", status: employmentRead.status, body: employmentRead.data });

  const startDate = employmentRead.data.values?.[0]?.startDate;
  if (startDate !== expectedStartDate) {
    throw new Error(`Sandbox employment startDate mismatch: ${employmentRead.raw}`);
  }

  console.log(
    JSON.stringify(
      {
        employeeId,
        unique,
        steps,
      },
      null,
      2,
    ),
  );
}

await main();
