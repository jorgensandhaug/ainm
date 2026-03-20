const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;
const suffix = `${Date.now()}`;

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

const callLog: Array<{ method: string; path: string; status: number }> = [];

function endpoint(pathWithQuery: string): string {
  return `${baseUrl.replace(/\/$/, "")}/${pathWithQuery}`;
}

async function api<T extends ApiBody>(
  method: string,
  pathWithQuery: string,
  body?: unknown,
): Promise<{ status: number; body: T; raw: string }> {
  const response = await fetch(endpoint(pathWithQuery), {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const raw = await response.text();
  let parsed: T = {} as T;
  if (raw) {
    try {
      parsed = JSON.parse(raw) as T;
    } catch {
      parsed = {} as T;
    }
  }

  callLog.push({ method, path: pathWithQuery, status: response.status });
  return { status: response.status, body: parsed, raw };
}

function getValidationField(body: ApiBody): string | undefined {
  return body.validationMessages?.[0]?.field;
}

function payload(args: { departmentId?: number; divisionId?: number }) {
  return {
    firstName: "Thomas",
    lastName: `Harris Reflection ${suffix}`,
    dateOfBirth: "1991-06-04",
    email: `thomas.harris.reflection.${suffix}@example.org`,
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

async function main() {
  let departmentId: number | undefined;
  let divisionId: number | undefined;

  let createRes = await api<ApiBody>("POST", "employee", payload({}));
  if (createRes.status === 422 && getValidationField(createRes.body) === "department.id") {
    const deptRes = await api<ApiBody>(
      "GET",
      "department?isInactive=false&count=1&fields=*",
    );
    if (deptRes.status !== 200) {
      throw new Error(`department lookup failed: ${deptRes.status} ${deptRes.raw}`);
    }

    const department = deptRes.body.values?.[0];
    if (!department?.id) {
      throw new Error(`no active department for repair branch: ${deptRes.raw}`);
    }
    departmentId = department.id;

    createRes = await api<ApiBody>("POST", "employee", payload({ departmentId }));
  }

  if (
    createRes.status === 422 &&
    getValidationField(createRes.body) === "employments.division.id"
  ) {
    const divisionRes = await api<ApiBody>("GET", "division?count=1&fields=*");
    if (divisionRes.status !== 200 || !divisionRes.body.values?.[0]?.id) {
      throw new Error(`division lookup failed: ${divisionRes.status} ${divisionRes.raw}`);
    }
    divisionId = divisionRes.body.values[0].id;

    createRes = await api<ApiBody>("POST", "employee", payload({ departmentId, divisionId }));
  }

  if (createRes.status !== 201 || !createRes.body.value?.id) {
    throw new Error(`employee create failed: ${createRes.status} ${createRes.raw}`);
  }

  const employee = createRes.body.value;
  const createHasStartDate = Array.isArray(employee.employments)
    ? employee.employments.some((employment: any) => employment?.startDate === "2026-10-06")
    : false;

  const employmentRes = await api<ApiBody>(
    "GET",
    `employee/employment?employeeId=${employee.id}&fields=*`,
  );
  if (employmentRes.status !== 200) {
    throw new Error(`employment verification failed: ${employmentRes.status} ${employmentRes.raw}`);
  }

  const matchingEmployment = employmentRes.body.values?.find(
    (employment: any) => employment?.startDate === "2026-10-06",
  );
  if (!matchingEmployment) {
    throw new Error(`startDate not verified: ${employmentRes.raw}`);
  }

  console.log(
    JSON.stringify(
      {
        callCount: callLog.length,
        callLog,
        branch: {
          departmentRepair: departmentId ?? null,
          divisionRepair: divisionId ?? null,
          createHasStartDate,
        },
        employeeId: employee.id,
        employmentId: matchingEmployment.id,
      },
      null,
      2,
    ),
  );
}

await main();
