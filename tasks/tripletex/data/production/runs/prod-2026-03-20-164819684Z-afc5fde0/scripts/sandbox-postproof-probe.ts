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
  for (const [key, raw] of Object.entries(query ?? {})) {
    if (raw === undefined || raw === null) continue;
    url.searchParams.set(key, String(raw));
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

const [hourlyRates, bankAccounts] = await Promise.all([
  get("/project/hourlyRates", {
    projectId: 401961924,
    count: 100,
    fields: "*,projectSpecificRates(*,employee(*),activity(*))",
  }),
  get("/ledger/account", { isBankAccount: true, fields: "*" }),
]);

console.log(JSON.stringify({ hourlyRates, bankAccounts }, null, 2));
