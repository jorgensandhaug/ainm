const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;
const apiBase = baseUrl.replace(/\/+$/, "");

function apiUrl(pathWithQuery: string): string {
  return `${apiBase}/${pathWithQuery.replace(/^\/+/, "")}`;
}

async function tripletex(pathWithQuery: string) {
  const response = await fetch(apiUrl(pathWithQuery), {
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`Tripletex ${response.status}: ${text}`);
  }
  return data;
}

const customers = await tripletex("customer?count=20&fields=*");
const managers = await tripletex("employee?assignableProjectManagers=true&count=20&fields=*");

console.log(
  JSON.stringify(
    {
      customers: (customers.values ?? []).map((entry: any) => ({
        id: entry.id,
        name: entry.name,
        organizationNumber: entry.organizationNumber,
      })),
      managers: (managers.values ?? []).map((entry: any) => ({
        id: entry.id,
        firstName: entry.firstName,
        lastName: entry.lastName,
        name: entry.name,
        email: entry.email,
      })),
    },
    null,
    2,
  ),
);
