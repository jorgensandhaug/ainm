const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const PROJECT_ID = 401959961;
const EMPLOYEE_ID = 18478235;

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

function queryString(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

async function api(path: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: authHeader, Accept: "application/json" },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new Error(`${path} failed ${res.status}: ${text}`);
  return data;
}

const project = await api(
  `/project/${PROJECT_ID}${queryString({
    fields: "*,customer(*),projectActivities(*,activity(*)),participants(*,employee(*)),projectManager(*)",
  })}`,
);

const projectSearch = await api(
  `/project${queryString({
    name: "Sandbox Hour Invoice Project 1774020541520",
    count: 20,
    fields: "*,customer(*)",
  })}`,
);

const activities = await api(
  `/activity/>forTimeSheet${queryString({
    projectId: PROJECT_ID,
    employeeId: EMPLOYEE_ID,
    date: "2026-03-20",
    filterExistingHours: false,
    count: 50,
    fields: "*",
  })}`,
);

console.log(
  JSON.stringify(
    {
      project: project.value,
      projectSearch: projectSearch.values,
      activities: activities.values,
    },
    null,
    2,
  ),
);
