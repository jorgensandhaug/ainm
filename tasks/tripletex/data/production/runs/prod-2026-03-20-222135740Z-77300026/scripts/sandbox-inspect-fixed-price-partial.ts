const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2/";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.append(key, String(value));
  }
  return url;
}

async function request(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const response = await fetch(buildUrl(path, query), {
    headers: { Authorization: authHeader, Accept: "application/json" },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(JSON.stringify({ status: response.status, body }, null, 2));
  }
  return body;
}

async function main() {
  const fixtures = [
    {
      customerOrg: "907433498",
      projectName: "Automatiseringsprosjekt",
      email: "solveig.eide@example.org",
    },
    {
      customerOrg: "931336738",
      projectName: "Mise à niveau infrastructure",
      email: "nathan.thomas@example.org",
    },
    {
      customerOrg: "870827946",
      projectName: "Nettbutikk-utvikling",
      email: "kristian.nilsen@example.org",
    },
    {
      customerOrg: "816896770",
      projectName: "Desarrollo e-commerce",
      email: "nathan.thomas@example.org",
    },
    {
      customerOrg: "825338756",
      projectName: "Automatiseringsprosjekt",
      email: "knut.kvamme@example.org",
    },
  ];

  const results = [];
  for (const fixture of fixtures) {
    const [projectBody, customerBody, employeeBody] = await Promise.all([
      request("project", {
        name: fixture.projectName,
        count: 50,
        fields: "*,customer(*),projectManager(*)",
      }),
      request("customer", {
        organizationNumber: fixture.customerOrg,
        count: 10,
        fields: "*",
      }),
      request("employee", {
        email: fixture.email,
        assignableProjectManagers: true,
        count: 10,
        fields: "*",
      }),
    ]);

    results.push({
      fixture,
      projects: projectBody?.values ?? [],
      customers: customerBody?.values ?? [],
      employees: employeeBody?.values ?? [],
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
