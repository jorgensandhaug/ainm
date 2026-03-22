const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa("0:" + TOKEN)}`;

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method, headers: { Authorization: AUTH } });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  // Try different company endpoints
  const endpoints = [
    "/company/with/me?fields=*",
    "/company/1?fields=*",
    "/token/session/>whoAmI?fields=*",
    "/company/divisions?fields=*",
  ];
  
  for (const ep of endpoints) {
    console.log(`=== GET ${ep} ===`);
    const r = await api("GET", ep);
    console.log(`  ${r.status}: ${JSON.stringify(r.data).substring(0, 800)}\n`);
  }
}

main().catch(console.error);
