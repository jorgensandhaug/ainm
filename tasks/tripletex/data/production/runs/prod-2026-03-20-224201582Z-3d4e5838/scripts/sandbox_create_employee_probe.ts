const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

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

type ApiEnvelope<T> = {
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
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
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

function blocked(status: number, body: ErrorBody): never | void {
  if (
    status === 403 &&
    (body.error === "Invalid or expired token" ||
      body.error ===
        "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.")
  ) {
    throw new Error(`Blocked sandbox credentials: ${body.error}`);
  }
}

function hasField(body: ErrorBody, field: string): boolean {
  return !!body.validationMessages?.some((item) => item.field === field);
}

async function main() {
  const suffix = "3d4e5838";
  const payload: EmployeePayload = {
    firstName: "Jules",
    lastName: `Reflection ${suffix}`,
    dateOfBirth: "1982-12-08",
    email: `jules.reflection.${suffix}@example.org`,
    userType: "NO_ACCESS",
    employments: [{ startDate: "2026-12-27" }],
  };

  const trace: Array<Record<string, unknown>> = [];

  let create = await request<ApiEnvelope<{ id: number; employments?: Array<{ startDate?: string }> }> | ErrorBody>(
    "POST",
    "employee",
    { body: payload },
  );
  trace.push({
    step: "post employee initial",
    status: create.status,
    validationMessages: (create.data as ErrorBody).validationMessages ?? null,
  });
  blocked(create.status, create.data as ErrorBody);

  if (create.status === 422 && hasField(create.data as ErrorBody, "department.id")) {
    const dept = await request<ApiEnvelope<{ id: number; name?: string }>>("GET", "department", {
      params: { isInactive: "false", count: "1", fields: "*" },
    });
    trace.push({
      step: "get department",
      status: dept.status,
      departmentId: dept.data.values?.[0]?.id ?? null,
    });
    if (dept.status !== 200 || !dept.data.values?.[0]?.id) {
      throw new Error(`Department probe failed: ${dept.status} ${dept.raw}`);
    }

    payload.department = { id: dept.data.values[0].id };
    create = await request<ApiEnvelope<{ id: number; employments?: Array<{ startDate?: string }> }> | ErrorBody>(
      "POST",
      "employee",
      { body: payload },
    );
    trace.push({
      step: "post employee with department",
      status: create.status,
      validationMessages: (create.data as ErrorBody).validationMessages ?? null,
    });
    blocked(create.status, create.data as ErrorBody);
  }

  if (create.status === 422 && hasField(create.data as ErrorBody, "employments.division.id")) {
    const division = await request<ApiEnvelope<{ id: number; name?: string }>>("GET", "division", {
      params: { count: "1", fields: "*" },
    });
    trace.push({
      step: "get division",
      status: division.status,
      divisionId: division.data.values?.[0]?.id ?? null,
    });
    if (division.status !== 200 || !division.data.values?.[0]?.id) {
      throw new Error(`Division probe failed: ${division.status} ${division.raw}`);
    }

    payload.employments[0]!.division = { id: division.data.values[0].id };
    create = await request<ApiEnvelope<{ id: number; employments?: Array<{ startDate?: string }> }> | ErrorBody>(
      "POST",
      "employee",
      { body: payload },
    );
    trace.push({
      step: "post employee with department and division",
      status: create.status,
      validationMessages: (create.data as ErrorBody).validationMessages ?? null,
    });
    blocked(create.status, create.data as ErrorBody);
  }

  if (create.status !== 200 && create.status !== 201) {
    throw new Error(`Employee probe failed: ${create.status} ${create.raw}`);
  }

  const employeeId = (create.data as ApiEnvelope<{ id: number }>).value?.id;
  if (!employeeId) throw new Error(`Employee probe missing id: ${create.raw}`);

  trace.push({
    step: "employee write response",
    employeeId,
    writeEmployments: (create.data as ApiEnvelope<{ employments?: Array<{ startDate?: string }> }>).value?.employments ?? null,
  });

  const employment = await request<
    ApiEnvelope<{
      id: number;
      startDate?: string;
      division?: { id?: number } | null;
      isMainEmployer?: boolean;
      taxDeductionCode?: string | null;
    }>
  >("GET", "employee/employment", {
    params: { employeeId: String(employeeId), fields: "*" },
  });
  trace.push({
    step: "get employee employment",
    status: employment.status,
    employment: employment.data.values?.[0] ?? null,
  });
  if (employment.status !== 200) {
    throw new Error(`Employment probe failed: ${employment.status} ${employment.raw}`);
  }

  console.log(JSON.stringify(trace, null, 2));
}

await main();
