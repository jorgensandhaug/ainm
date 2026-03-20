const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const CUSTOMER = {
  id: 108162307,
  name: "Codex Payment Probe 752963",
  organizationNumber: "889752963",
};

const MANAGER = {
  id: 18441996,
  name: "Simen Sandhaug f675e571",
  email: "simen.sandhaug@gmail.com",
};

function buildUrl(pathWithQuery: string): string {
  return new URL(pathWithQuery, BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`).toString();
}

async function api(pathWithQuery: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`);
  headers.set("Accept", "application/json");
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(buildUrl(pathWithQuery), { ...init, headers });
}

async function parseJsonSafe(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function probe(label: string, payload: unknown) {
  const response = await api("project", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const body = await parseJsonSafe(response);
  return { label, status: response.status, body };
}

const results = [];

results.push(await probe("skip-customer-read", {
  name: `Codex Partial Shortcut Customer ${Date.now()}`,
  startDate: "2026-03-20",
  customer: {
    name: CUSTOMER.name,
    organizationNumber: CUSTOMER.organizationNumber,
  },
  projectManager: { id: MANAGER.id },
}));

results.push(await probe("skip-manager-read", {
  name: `Codex Partial Shortcut Manager ${Date.now()}`,
  startDate: "2026-03-20",
  customer: { id: CUSTOMER.id },
  projectManager: {
    name: MANAGER.name,
    email: MANAGER.email,
  },
}));

console.log(JSON.stringify(results, null, 2));
