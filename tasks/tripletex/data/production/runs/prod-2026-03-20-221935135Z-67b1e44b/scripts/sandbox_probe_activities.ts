import { Buffer } from "node:buffer";

const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2/";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const DATE = "2026-03-20";
const PROJECT_ID = 401959961;
const EMPLOYEE_IDS = [18478235, 18478321, 18565207, 18566674];

type Wrapper<T> = { values?: T[] };

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

const results = [];
for (const employeeId of EMPLOYEE_IDS) {
  const payload = await api<Wrapper<any>>("activity/>forTimeSheet", {
    projectId: PROJECT_ID,
    employeeId,
    date: DATE,
    filterExistingHours: false,
    count: 50,
    fields: "*",
  });
  results.push({
    employeeId,
    activities: (payload.values ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      chargeable: item.chargeable,
    })),
  });
}

console.log(JSON.stringify(results, null, 2));
