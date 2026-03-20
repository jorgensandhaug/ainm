const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const EMPLOYEE_ID = 18587860;

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

const routes = [
  {
    path: "salary/employee",
    body: {
      id: EMPLOYEE_ID,
      firstName: "Probe",
      lastName: "Employee",
    },
  },
  {
    path: `salary/employee/${EMPLOYEE_ID}`,
    body: {
      id: EMPLOYEE_ID,
      firstName: "Probe",
      lastName: "Employee",
    },
  },
  {
    path: "salary/employeeToEmploymentsRelationship",
    body: {
      employee: { id: EMPLOYEE_ID },
    },
  },
  {
    path: `salary/employeeToEmploymentsRelationship/${EMPLOYEE_ID}`,
    body: {
      employee: { id: EMPLOYEE_ID },
    },
  },
  {
    path: "salaryV2/employee",
    body: {
      id: EMPLOYEE_ID,
      firstName: "Probe",
      lastName: "Employee",
    },
  },
  {
    path: "salaryV2/employeeToEmploymentsRelationship",
    body: {
      employee: { id: EMPLOYEE_ID },
    },
  },
  {
    path: "salary/v2/employee",
    body: {
      id: EMPLOYEE_ID,
      firstName: "Probe",
      lastName: "Employee",
    },
  },
  {
    path: "salary/v2/employeeToEmploymentsRelationship",
    body: {
      employee: { id: EMPLOYEE_ID },
    },
  },
  {
    path: "createSalary/employee",
    body: {
      id: EMPLOYEE_ID,
      firstName: "Probe",
      lastName: "Employee",
    },
  },
  {
    path: "createSalary/employeeToEmploymentRelationship",
    body: {
      employee: { id: EMPLOYEE_ID },
    },
  },
  {
    path: "createSalary/employeeToEmploymentsRelationship",
    body: {
      employee: { id: EMPLOYEE_ID },
    },
  },
  {
    path: "tsk/internal/context",
  },
  {
    path: "clientContext",
  },
  {
    path: "pilotFeature",
    body: {},
  },
  {
    path: "userPilotFeature",
    body: {},
  },
];

async function probe(method: "GET" | "OPTIONS" | "POST", path: string, body?: unknown) {
  const response = await fetch(new URL(path, `${BASE_URL}/`), {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(method === "POST" ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
  });
  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return {
    method,
    path,
    status: response.status,
    allow: response.headers.get("allow"),
    body: parsed,
  };
}

const results = [];
for (const route of routes) {
  results.push(await probe("OPTIONS", route.path));
  results.push(await probe("GET", `${route.path}?fields=*`));
  if ("body" in route) {
    results.push(await probe("POST", route.path, route.body));
  }
}

console.log(JSON.stringify(results.filter((row) => row.status !== 404), null, 2));
