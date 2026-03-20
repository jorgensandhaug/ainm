const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

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

const response = await api("project", {
  method: "POST",
  body: JSON.stringify({
    name: `Codex Manager Email Probe ${Date.now()}`,
    startDate: "2026-03-20",
    customer: { id: 108162307 },
    projectManager: { email: "simen.sandhaug@gmail.com" },
  }),
});

const body = await parseJsonSafe(response);
console.log(JSON.stringify({ status: response.status, body }, null, 2));
