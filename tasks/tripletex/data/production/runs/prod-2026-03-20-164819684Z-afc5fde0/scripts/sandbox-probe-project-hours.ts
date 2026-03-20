import { Buffer } from "node:buffer";

const BASE_URL = process.env.TRIPLETEX_BASE_URL;
const TOKEN = process.env.TRIPLETEX_TOKEN;

if (!BASE_URL) throw new Error("Missing TRIPLETEX_BASE_URL");
if (!TOKEN) throw new Error("Missing TRIPLETEX_TOKEN");

function authHeader() {
  return `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
}

function buildUrl(path: string, query?: Record<string, any>) {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function get(path: string, query?: Record<string, any>) {
  const response = await fetch(buildUrl(path, query), {
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(body));
  return body;
}

const [employee, project, customer] = await Promise.all([
  get("/employee", { email: "sigrid.haugen@example.org", count: 10, fields: "*" }),
  get("/project", { name: "Nettbutikk-utvikling", count: 50, fields: "*,customer(*)" }),
  get("/customer", { organizationNumber: "906155605", count: 10, fields: "*" }),
]);

console.log(JSON.stringify({ employee, project, customer }, null, 2));
