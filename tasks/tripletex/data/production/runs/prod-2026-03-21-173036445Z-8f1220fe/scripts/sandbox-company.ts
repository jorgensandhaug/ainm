const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`\n${method} ${path} => ${res.status}`);
  return { status: res.status, data: json };
}

async function main() {
  // Try different company endpoints
  console.log("=== GET /company ===");
  const c1 = await api("GET", "/company?fields=*");
  if (c1.status === 200) {
    const vals = c1.data?.values || [c1.data?.value];
    for (const v of vals) {
      if (v) console.log("Company:", JSON.stringify({ id: v.id, name: v.name, organizationNumber: v.organizationNumber, type: v.type }, null, 2));
    }
  }

  console.log("\n=== GET /company/1 ===");
  const c2 = await api("GET", "/company/1?fields=*");
  if (c2.status === 200) {
    const v = c2.data?.value;
    if (v) console.log("Company:", JSON.stringify({ id: v.id, name: v.name, organizationNumber: v.organizationNumber }, null, 2));
  }

  // Try /company with/me alternative paths
  console.log("\n=== GET /company/with/me ===");
  const c3 = await api("GET", "/company/with/me");
  console.log("Status:", c3.status);

  // Check existing divisions to see what org numbers they use
  console.log("\n=== DIVISION ORG NUMBERS ===");
  const divRes = await api("GET", "/division?count=5&fields=*");
  const divs = divRes.data?.values || [];
  for (const d of divs.slice(0, 3)) {
    console.log(`Division "${d.name}": orgNum=${d.organizationNumber}, municipality=${JSON.stringify(d.municipality)}`);
  }

  // Check if we can read the logged-in company's org number from the token info
  console.log("\n=== TOKEN INFO ===");
  const t1 = await api("GET", "/token/session/>whoAmI");
  console.log("Token info:", JSON.stringify(t1.data, null, 2).slice(0, 500));
}

main().catch(console.error);
