import { Buffer } from "node:buffer";

const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2/";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

type Wrapper<T> = { value?: T; values?: T[] };

function authHeader() {
  return `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
}

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(path, BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function api<T>(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const response = await fetch(buildUrl(path, query), {
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${text}`);
  }
  return JSON.parse(text) as T;
}

const employees = await api<Wrapper<any>>("employee", { count: 50, fields: "*" });
const projects = await api<Wrapper<any>>("project", { count: 100, fields: "*,customer(*)" });

console.log(JSON.stringify({
  employees: (employees.values ?? []).slice(0, 20).map((item) => ({
    id: item.id,
    name: `${item.firstName ?? ""} ${item.lastName ?? ""}`.trim(),
    email: item.email,
  })),
  projects: (projects.values ?? []).slice(0, 40).map((item) => ({
    id: item.id,
    name: item.name,
    customerId: item.customer?.id,
    customerName: item.customer?.name,
    customerOrg: item.customer?.organizationNumber,
  })),
}, null, 2));
