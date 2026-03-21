import { Buffer } from "node:buffer";

const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

function unwrap<T>(json: any): T {
  if (json?.values !== undefined) return json.values as T;
  if (json?.value !== undefined) return json.value as T;
  return json as T;
}

function buildUrl(path: string, query?: Record<string, string>): string {
  const base = BASE_URL.replace(/\/+$/, "");
  const url = new URL(`${base}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  }
  return url.toString();
}

async function api<T>(path: string, query: Record<string, string>) {
  const response = await fetch(buildUrl(path, query), {
    headers: {
      Authorization: `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${path} ${response.status}: ${JSON.stringify(json ?? text)}`);
  return unwrap<T>(json);
}

const employmentIds = ["2816696", "2816697", "2816699"];

const output: any[] = [];
for (const employmentId of employmentIds) {
  const details = await api<any[]>("/employee/employment/details", {
    employmentId,
    fields: "*,occupationCode(*)",
  });
  output.push({
    employmentId,
    details,
  });
}

console.log(JSON.stringify(output, null, 2));
