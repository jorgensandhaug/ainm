const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "H_MXpgjpgro230tkE1vzSoxvO1ugRReshPKbwPRFB94";

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

type ApiOptions = {
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
};

async function api(path: string, options: ApiOptions = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
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

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} ${response.statusText}`);
    (error as Error & { status?: number; body?: unknown }).status = response.status;
    (error as Error & { status?: number; body?: unknown }).body = json ?? text;
    throw error;
  }

  return json;
}

function getErrorMessage(error: unknown): string {
  const body = (error as { body?: any })?.body;
  if (typeof body === "string") return body;
  if (body && typeof body.error === "string") return body.error;
  if (body && typeof body.message === "string") return body.message;
  return JSON.stringify(body ?? {});
}

async function resolveDepartmentId() {
  const departmentList = await api("/department", {
    query: { isInactive: false, count: 1, fields: "*" },
  });

  const existingDepartment = departmentList?.values?.[0];
  if (existingDepartment?.id) return existingDepartment.id as number;

  const createdDepartment = await api("/department", {
    method: "POST",
    body: { name: "General" },
  });

  const departmentId = createdDepartment?.value?.id;
  if (!departmentId) {
    throw new Error(`Department create returned no id: ${JSON.stringify(createdDepartment)}`);
  }

  return departmentId as number;
}

async function resolveDivisionId() {
  const divisionList = await api("/division", {
    query: { count: 1, fields: "*" },
  });

  const divisionId = divisionList?.values?.[0]?.id;
  if (!divisionId) {
    throw new Error(`No division available: ${JSON.stringify(divisionList)}`);
  }

  return divisionId as number;
}

async function createEmployee(departmentId: number, divisionId?: number) {
  const body: Record<string, unknown> = {
    firstName: "André",
    lastName: "Almeida",
    dateOfBirth: "1980-04-09",
    email: "andre.almeida@example.org",
    userType: "NO_ACCESS",
    department: { id: departmentId },
    employments: [
      {
        startDate: "2026-09-22",
        ...(divisionId ? { division: { id: divisionId } } : {}),
      },
    ],
  };

  return api("/employee", { method: "POST", body });
}

async function verifyEmploymentStartDate(employeeId: number) {
  const employmentList = await api("/employee/employment", {
    query: { employeeId, fields: "*" },
  });

  const employment = employmentList?.values?.find(
    (item: any) => item?.startDate === "2026-09-22",
  );

  if (!employment) {
    throw new Error(`Employment verification failed: ${JSON.stringify(employmentList)}`);
  }

  return employment;
}

async function main() {
  const departmentId = await resolveDepartmentId();

  let employeeResponse;
  try {
    employeeResponse = await createEmployee(departmentId);
  } catch (error) {
    const status = (error as { status?: number }).status;
    const message = getErrorMessage(error);

    if (status === 403 && message.includes("Invalid or expired token")) {
      throw error;
    }

    if (status === 422 && message.includes("virksomhet/underenhet")) {
      const divisionId = await resolveDivisionId();
      employeeResponse = await createEmployee(departmentId, divisionId);
    } else {
      throw error;
    }
  }

  const employee = employeeResponse?.value;
  const employeeId = employee?.id;
  if (!employeeId) {
    throw new Error(`Employee create returned no id: ${JSON.stringify(employeeResponse)}`);
  }

  const employment = await verifyEmploymentStartDate(employeeId);

  console.log(
    JSON.stringify(
      {
        employeeId,
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
        dateOfBirth: employee.dateOfBirth,
        verifiedStartDate: employment.startDate,
        departmentId,
        employmentId: employment.id,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(JSON.stringify({
    error: (error as Error).message,
    details: (error as { body?: unknown }).body ?? null,
  }, null, 2));
  process.exit(1);
});
