const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "W1uwscuGTJMiKWeRy0S-Ke6PrPLWsf9WXYTiXTn0CaQ";

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

type ValidationMessage = {
  field?: string;
  message?: string;
};

type ApiBody = {
  value?: any;
  values?: any[];
  error?: string;
  message?: string;
  source?: string;
  validationMessages?: ValidationMessage[];
};

function endpoint(pathWithQuery: string): string {
  return `${baseUrl.replace(/\/$/, "")}/${pathWithQuery}`;
}

async function api<T extends ApiBody>(
  pathWithQuery: string,
  init: RequestInit = {},
): Promise<{ status: number; body: T; raw: string }> {
  const response = await fetch(endpoint(pathWithQuery), {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });

  const raw = await response.text();
  let body: T = {} as T;
  if (raw) {
    try {
      body = JSON.parse(raw) as T;
    } catch {
      body = {} as T;
    }
  }

  return { status: response.status, body, raw };
}

function fail(message: string, details?: unknown): never {
  if (details !== undefined) {
    console.error(message, JSON.stringify(details, null, 2));
  } else {
    console.error(message);
  }
  process.exit(1);
}

function isInvalidToken(body: ApiBody): boolean {
  return (
    body.error === "Invalid or expired token" ||
    body.error ===
      "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions."
  );
}

function getValidationField(body: ApiBody): string | undefined {
  return body.validationMessages?.[0]?.field;
}

function employeePayload(args: {
  departmentId?: number;
  divisionId?: number;
}) {
  return {
    firstName: "Thomas",
    lastName: "Harris",
    dateOfBirth: "1991-06-04",
    email: "thomas.harris@example.org",
    userType: "NO_ACCESS",
    ...(args.departmentId ? { department: { id: args.departmentId } } : {}),
    employments: [
      {
        startDate: "2026-10-06",
        ...(args.divisionId ? { division: { id: args.divisionId } } : {}),
      },
    ],
  };
}

async function createEmployee(args: {
  departmentId?: number;
  divisionId?: number;
}) {
  return api("employee", {
    method: "POST",
    body: JSON.stringify(employeePayload(args)),
  });
}

async function main() {
  let departmentId: number | undefined;
  let divisionId: number | undefined;

  let createRes = await createEmployee({});
  if (createRes.status === 403 && isInvalidToken(createRes.body)) {
    fail("Blocked by unusable credentials", createRes.body);
  }

  if (createRes.status === 422 && getValidationField(createRes.body) === "department.id") {
    const deptRes = await api<ApiBody>("department?isInactive=false&count=1&fields=*");
    if (deptRes.status === 403 && isInvalidToken(deptRes.body)) {
      fail("Blocked by unusable credentials", deptRes.body);
    }
    if (deptRes.status !== 200) {
      fail("Department lookup failed", { status: deptRes.status, body: deptRes.body, raw: deptRes.raw });
    }

    const existingDepartment = deptRes.body.values?.[0];
    if (existingDepartment?.id) {
      departmentId = existingDepartment.id;
    } else {
      const newDeptRes = await api<ApiBody>("department", {
        method: "POST",
        body: JSON.stringify({ name: "Default" }),
      });
      if (newDeptRes.status === 403 && isInvalidToken(newDeptRes.body)) {
        fail("Blocked by unusable credentials", newDeptRes.body);
      }
      if (newDeptRes.status !== 201 || !newDeptRes.body.value?.id) {
        fail("Department create failed", {
          status: newDeptRes.status,
          body: newDeptRes.body,
          raw: newDeptRes.raw,
        });
      }
      departmentId = newDeptRes.body.value.id;
    }

    createRes = await createEmployee({ departmentId });
  }

  if (
    createRes.status === 422 &&
    getValidationField(createRes.body) === "employments.division.id"
  ) {
    const divisionRes = await api<ApiBody>("division?count=1&fields=*");
    if (divisionRes.status === 403 && isInvalidToken(divisionRes.body)) {
      fail("Blocked by unusable credentials", divisionRes.body);
    }
    if (divisionRes.status !== 200 || !divisionRes.body.values?.[0]?.id) {
      fail("Division lookup failed", {
        status: divisionRes.status,
        body: divisionRes.body,
        raw: divisionRes.raw,
      });
    }

    divisionId = divisionRes.body.values[0].id;
    createRes = await createEmployee({ departmentId, divisionId });
  }

  if (createRes.status === 403 && isInvalidToken(createRes.body)) {
    fail("Blocked by unusable credentials", createRes.body);
  }
  if (createRes.status !== 201 || !createRes.body.value?.id) {
    fail("Employee create failed", {
      status: createRes.status,
      body: createRes.body,
      raw: createRes.raw,
    });
  }

  const employee = createRes.body.value;
  const employmentWithStartDate = Array.isArray(employee.employments)
    ? employee.employments.find((employment: any) => employment?.startDate === "2026-10-06")
    : undefined;

  if (employmentWithStartDate) {
    console.log(
      JSON.stringify(
        {
          employeeId: employee.id,
          verifiedBy: "create-response",
          employee,
        },
        null,
        2,
      ),
    );
    return;
  }

  const employmentRes = await api<ApiBody>(`employee/employment?employeeId=${employee.id}&fields=*`);
  if (employmentRes.status === 403 && isInvalidToken(employmentRes.body)) {
    fail("Blocked by unusable credentials", employmentRes.body);
  }
  if (employmentRes.status !== 200) {
    fail("Employment verification failed", {
      status: employmentRes.status,
      body: employmentRes.body,
      raw: employmentRes.raw,
    });
  }

  const matchingEmployment = employmentRes.body.values?.find(
    (employment: any) => employment?.startDate === "2026-10-06",
  );
  if (!matchingEmployment) {
    fail("Employment start date not confirmed", employmentRes.body);
  }

  console.log(
    JSON.stringify(
      {
        employeeId: employee.id,
        verifiedBy: "employment-read",
        employee,
        employment: matchingEmployment,
      },
      null,
      2,
    ),
  );
}

await main();
