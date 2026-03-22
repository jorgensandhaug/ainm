const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa("0:" + TOKEN)}`;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  // Find company - try /company with no ID
  const c1 = await api("GET", "/company?fields=*");
  console.log("GET /company:", c1.status);
  if (c1.ok) {
    const vals = c1.data.values || [c1.data.value];
    for (const c of vals) {
      if (!c) continue;
      console.log("\n=== COMPANY ===");
      for (const [k, v] of Object.entries(c)) {
        if (v !== null && v !== undefined && typeof v !== 'object') {
          console.log(`  ${k} = ${JSON.stringify(v)}`);
        } else if (v && typeof v === 'object') {
          console.log(`  ${k} = ${JSON.stringify(v).substring(0, 150)}`);
        }
      }
    }
  }

  // Try /company/with/ME
  const cMe = await api("GET", "/company/with/ME?fields=*");
  console.log("\nGET /company/with/ME:", cMe.status);
  if (cMe.ok) {
    const c = cMe.data.value;
    if (c) {
      console.log(`  id=${c.id} name="${c.name}"`);
      for (const [k, v] of Object.entries(c)) {
        if (typeof v !== 'object') console.log(`  ${k} = ${v}`);
      }
    }
  }

  // Try /token/session
  const tok = await api("GET", "/token/session/>whoAmI?fields=*");
  console.log("\nGET whoAmI:", tok.status, JSON.stringify(tok.data).substring(0, 300));

  // Try /company/0
  const c0 = await api("GET", "/company/0?fields=*");
  console.log("\nGET /company/0:", c0.status, JSON.stringify(c0.data).substring(0, 300));

  // Try logged in user's company
  const loggedIn = await api("GET", "/token/session/>whoAmI");
  if (loggedIn.ok) {
    const companyId = loggedIn.data.value?.company?.id;
    console.log(`\nCompany ID from whoAmI: ${companyId}`);
    if (companyId) {
      const comp = await api("GET", `/company/${companyId}?fields=*`);
      console.log(`GET /company/${companyId}:`, comp.status);
      if (comp.ok) {
        const c = comp.data.value;
        for (const [k, v] of Object.entries(c)) {
          if (typeof v !== 'object') console.log(`  ${k} = ${v}`);
          else if (v) console.log(`  ${k} = ${JSON.stringify(v).substring(0, 150)}`);
        }
      }
    }
  }
}

main().catch(console.error);
