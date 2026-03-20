const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

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
  if (!res.ok) {
    throw new Error(`${path} failed ${res.status}: ${text}`);
  }
  return data;
}

const employees = await api(`/employee${queryString({ count: 20, fields: "*" })}`);
const projects = await api(`/project${queryString({ count: 30, fields: "*" })}`);

console.log(
  JSON.stringify(
    {
      employees: (employees.values ?? []).slice(0, 10).map((e: any) => ({
        id: e.id,
        email: e.email,
        displayName: e.displayName,
      })),
      projects: (projects.values ?? []).slice(0, 10).map((p: any) => ({
        id: p.id,
        name: p.name,
        customer: p.customer
          ? {
              id: p.customer.id,
              name: p.customer.name,
              organizationNumber: p.customer.organizationNumber,
            }
          : null,
        projectActivities: Array.isArray(p.projectActivities)
          ? p.projectActivities.slice(0, 10).map((pa: any) => ({
              id: pa.id,
              activity: pa.activity
                ? {
                    id: pa.activity.id,
                    name: pa.activity.name,
                    isChargeable: pa.activity.isChargeable,
                  }
                : null,
            }))
          : [],
      })),
    },
    null,
    2,
  ),
);
