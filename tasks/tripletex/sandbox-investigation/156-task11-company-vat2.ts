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
  // Company ID is 108114337
  const companyId = 108114337;
  
  console.log("=== Company info ===");
  const c = await api("GET", `/company/${companyId}?fields=*`);
  if (c.ok) {
    const d = c.data.value;
    console.log(`  name: ${d.name}`);
    console.log(`  orgNumber: ${d.organizationNumber}`);
    console.log(`  type: ${d.type}`);
    // Print ALL fields
    for (const [k, v] of Object.entries(d)) {
      if (typeof v !== 'object' || v === null) {
        console.log(`  ${k}: ${v}`);
      }
    }
  } else {
    console.log(`  ${c.status}: ${JSON.stringify(c.data).substring(0, 300)}`);
  }

  // Check /company/settings
  console.log("\n=== Company settings ===");
  const s = await api("GET", `/companySettings?fields=*`);
  console.log(`  ${s.status}: ${JSON.stringify(s.data).substring(0, 1000)}`);

  // Check /company/settings/accounting
  console.log("\n=== Company accounting settings ===");
  const a = await api("GET", `/company/settings/accounting?fields=*`);
  console.log(`  ${a.status}: ${JSON.stringify(a.data).substring(0, 1000)}`);
}

main().catch(console.error);
