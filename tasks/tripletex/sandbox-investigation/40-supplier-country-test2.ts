// Test: POST /supplier with country as object { id: 161 } (Norway)
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json();
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 500));
  return { status: res.status, data: json };
}

async function main() {
  // Test 1: POST /supplier with country: { id: 161 } (Norway)
  console.log("=== Test 1: country: { id: 161 } ===");
  const s1 = await api("POST", "/supplier", {
    name: `Country Test A ${Date.now()}`,
    postalAddress: {
      addressLine1: "Torggata 92",
      postalCode: "4611",
      city: "Kristiansand",
      country: { id: 161 }
    }
  });
  if (s1.status === 201) {
    console.log("SUCCESS!");
    console.log("postalAddress:", JSON.stringify(s1.data?.value?.postalAddress, null, 2));
  }

  // Test 2: Does an existing supplier WITHOUT explicit country already have country=161?
  console.log("\n=== Test 2: Supplier without explicit country ===");
  const s2 = await api("POST", "/supplier", {
    name: `Country Test B ${Date.now()}`,
    postalAddress: {
      addressLine1: "Solveien 92",
      postalCode: "8006",
      city: "Bodø"
    }
  });
  if (s2.status === 201 && s2.data?.value?.id) {
    const readback = await api("GET", `/supplier/${s2.data.value.id}?fields=*,postalAddress(*)`);
    console.log("postalAddress:", JSON.stringify(readback.data?.value?.postalAddress, null, 2));
    // Check if country is auto-set
    const country = readback.data?.value?.postalAddress?.country;
    console.log("Auto-set country:", country);
  }

  // Test 3: What country IDs are available?
  console.log("\n=== Test 3: GET /country for Norway ===");
  const countries = await api("GET", "/country?isoAlpha2Code=NO&fields=id,isoAlpha2Code,name&count=5");
  for (const c of (countries.data?.values || [])) {
    console.log(`  id=${c.id} code=${c.isoAlpha2Code} name=${c.name}`);
  }

  // Test 4: Check if supplier without country has country auto-populated as NO
  console.log("\n=== Test 4: All recent suppliers' country ===");
  const suppliers = await api("GET", "/supplier?count=5&fields=id,name,postalAddress(country(id,isoAlpha2Code,name))&sorting=id,-1");
  for (const s of (suppliers.data?.values || [])) {
    const c = s.postalAddress?.country;
    console.log(`  ${s.name}: country=${c?.isoAlpha2Code || c?.id || 'null'} (${c?.name || '?'})`);
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
