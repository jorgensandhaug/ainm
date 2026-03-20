const baseUrl = process.env.TRIPLETEX_BASE_URL;
const token = process.env.TRIPLETEX_TOKEN;

if (!baseUrl || !token) {
  throw new Error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_TOKEN");
}

const auth = Buffer.from(`0:${token}`).toString("base64");

type JsonObject = Record<string, unknown>;

function endpoint(path: string, query?: Record<string, string>): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(path, base);
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
  body?: unknown,
  query?: Record<string, string>,
) {
  const response = await fetch(endpoint(path, query), {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  return { status: response.status, json };
}

async function main() {
  const probeId = Date.now();
  const email = `lucy.wilson.sandbox.${probeId}@example.org`;
  const basePayload: JsonObject = {
    firstName: "Lucy",
    lastName: `Wilson Sandbox ${probeId}`,
    dateOfBirth: "1986-12-28",
    email,
    userType: "NO_ACCESS",
    employments: [
      {
        startDate: "2026-04-25",
      },
    ],
  };

  const log: JsonObject = {
    probeId,
    email,
    steps: [],
  };

  const first = await request("POST", "employee", basePayload);
  (log.steps as JsonObject[]).push({ step: "post_employee_initial", ...first });

  let payload = basePayload;
  let created = first;

  if (first.status === 422) {
    const departmentRead = await request("GET", "department", undefined, {
      isInactive: "false",
      count: "1",
      fields: "*",
    });
    (log.steps as JsonObject[]).push({ step: "get_department", ...departmentRead });

    const departmentValues =
      departmentRead.json &&
      typeof departmentRead.json === "object" &&
      Array.isArray((departmentRead.json as JsonObject).values)
        ? ((departmentRead.json as JsonObject).values as unknown[])
        : [];

    const departmentId =
      departmentValues[0] && typeof departmentValues[0] === "object"
        ? ((departmentValues[0] as JsonObject).id as number)
        : null;

    if (typeof departmentId === "number") {
      payload = {
        ...payload,
        department: { id: departmentId },
      };

      const second = await request("POST", "employee", payload);
      (log.steps as JsonObject[]).push({ step: "post_employee_with_department", ...second });
      created = second;

      if (second.status === 422) {
        const divisionRead = await request("GET", "division", undefined, {
          count: "1",
          fields: "*",
        });
        (log.steps as JsonObject[]).push({ step: "get_division", ...divisionRead });

        const divisionValues =
          divisionRead.json &&
          typeof divisionRead.json === "object" &&
          Array.isArray((divisionRead.json as JsonObject).values)
            ? ((divisionRead.json as JsonObject).values as unknown[])
            : [];

        const divisionId =
          divisionValues[0] && typeof divisionValues[0] === "object"
            ? ((divisionValues[0] as JsonObject).id as number)
            : null;

        if (typeof divisionId === "number") {
          payload = {
            ...payload,
            employments: [
              {
                startDate: "2026-04-25",
                division: { id: divisionId },
              },
            ],
          };
          const third = await request("POST", "employee", payload);
          (log.steps as JsonObject[]).push({ step: "post_employee_with_department_and_division", ...third });
          created = third;
        }
      }
    }
  }

  if (
    created.status >= 200 &&
    created.status < 300 &&
    created.json &&
    typeof created.json === "object" &&
    (created.json as JsonObject).value &&
    typeof (created.json as JsonObject).value === "object"
  ) {
    const employeeId = ((created.json as JsonObject).value as JsonObject).id;
    if (typeof employeeId === "number") {
      const employmentRead = await request("GET", "employee/employment", undefined, {
        employeeId: String(employeeId),
        fields: "*",
      });
      (log.steps as JsonObject[]).push({ step: "get_employee_employment", ...employmentRead });
    }
  }

  console.log(JSON.stringify(log, null, 2));
}

await main();
