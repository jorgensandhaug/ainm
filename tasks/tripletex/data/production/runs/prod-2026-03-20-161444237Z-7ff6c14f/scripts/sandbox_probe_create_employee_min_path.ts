const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

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
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} ${response.statusText}`);
    (error as Error & { status?: number; body?: unknown }).status = response.status;
    (error as Error & { status?: number; body?: unknown }).body = data;
    throw error;
  }

  return data;
}

async function main() {
  const suffix = `${Date.now()}`;
  const baseBody = {
    firstName: "Probe",
    lastName: `NoDept${suffix}`,
    dateOfBirth: "1980-04-09",
    email: `probe.nodept.${suffix}@example.org`,
    userType: "NO_ACCESS",
    employments: [{ startDate: "2026-09-22" }],
  };

  const summary: Record<string, unknown> = {};

  try {
    const createNoDept = await api("/employee", {
      method: "POST",
      body: baseBody,
    });
    summary.noDepartmentCreate = createNoDept;

    const employeeId = (createNoDept as any)?.value?.id;
    if (employeeId) {
      summary.noDepartmentEmploymentRead = await api("/employee/employment", {
        query: { employeeId, fields: "*" },
      });
    }
  } catch (error) {
    summary.noDepartmentError = {
      status: (error as { status?: number }).status ?? null,
      body: (error as { body?: unknown }).body ?? null,
    };

    const departments = await api("/department", {
      query: { isInactive: false, count: 1, fields: "*" },
    });
    summary.departmentLookup = departments;

    const departmentId = (departments as any)?.values?.[0]?.id;
    if (!departmentId) {
      throw new Error(`No department available for retry: ${JSON.stringify(departments)}`);
    }

    const withDeptBody = {
      ...baseBody,
      lastName: `WithDept${suffix}`,
      email: `probe.withdept.${suffix}@example.org`,
      department: { id: departmentId },
    };

    try {
      const createWithDept = await api("/employee", {
        method: "POST",
        body: withDeptBody,
      });
      summary.withDepartmentCreate = createWithDept;

      const employeeId = (createWithDept as any)?.value?.id;
      if (employeeId) {
        summary.withDepartmentEmploymentRead = await api("/employee/employment", {
          query: { employeeId, fields: "*" },
        });
      }
    } catch (deptError) {
      summary.withDepartmentError = {
        status: (deptError as { status?: number }).status ?? null,
        body: (deptError as { body?: unknown }).body ?? null,
      };

      const divisions = await api("/division", {
        query: { count: 1, fields: "*" },
      });
      summary.divisionLookup = divisions;

      const divisionId = (divisions as any)?.values?.[0]?.id;
      if (!divisionId) {
        throw new Error(`No division available for retry: ${JSON.stringify(divisions)}`);
      }

      const createWithDeptAndDivision = await api("/employee", {
        method: "POST",
        body: {
          ...withDeptBody,
          lastName: `WithDivision${suffix}`,
          email: `probe.withdivision.${suffix}@example.org`,
          employments: [
            {
              startDate: "2026-09-22",
              division: { id: divisionId },
            },
          ],
        },
      });
      summary.withDepartmentAndDivisionCreate = createWithDeptAndDivision;

      const employeeId = (createWithDeptAndDivision as any)?.value?.id;
      if (employeeId) {
        summary.withDepartmentAndDivisionEmploymentRead = await api("/employee/employment", {
          query: { employeeId, fields: "*" },
        });
      }
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        error: (error as Error).message,
        details: (error as { body?: unknown }).body ?? null,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
