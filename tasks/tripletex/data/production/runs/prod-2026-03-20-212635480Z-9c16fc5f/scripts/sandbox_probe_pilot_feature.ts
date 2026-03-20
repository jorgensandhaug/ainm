const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const COMPANY_ID = 108114337;

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

async function call(path: string, init?: RequestInit) {
  const response = await fetch(new URL(path, `${BASE_URL}/`), {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return {
    status: response.status,
    allow: response.headers.get("allow"),
    body,
  };
}

const results = {
  options: await call("pilotFeature", { method: "OPTIONS" }),
  get: await call("pilotFeature?fields=*"),
  putCreateSalaryRedesign: await call("pilotFeature", {
    method: "PUT",
    body: JSON.stringify({
      companyId: COMPANY_ID,
      pilotFeatures: ["CREATE_SALARY_REDESIGN_MVP"],
    }),
  }),
  getAfterCreateSalaryRedesign: await call("pilotFeature?fields=*"),
  putNone: await call("pilotFeature", {
    method: "PUT",
    body: JSON.stringify({
      companyId: COMPANY_ID,
      pilotFeatures: ["NONE"],
    }),
  }),
  getAfterNone: await call("pilotFeature?fields=*"),
};

console.log(JSON.stringify(results, null, 2));
