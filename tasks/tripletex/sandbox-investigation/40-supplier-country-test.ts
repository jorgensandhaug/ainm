// Test: Does POST /supplier accept country in postalAddress?
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
  // Test 1: Create supplier WITH country in postalAddress
  console.log("=== Test 1: POST /supplier with country in postalAddress ===");
  const rnd = Math.floor(Math.random() * 90000) + 10000;
  const orgNo = `9${rnd}${(11 - ((3*9 + 7*parseInt(String(rnd)[0]) + 3*parseInt(String(rnd)[1]) + 7*parseInt(String(rnd)[2]) + 3*parseInt(String(rnd)[3]) + 7*parseInt(String(rnd)[4])) % 11)) % 11}`;

  // Use a known valid org number instead
  const supplierRes = await api("POST", "/supplier", {
    name: `Test Country Supplier ${Date.now()}`,
    postalAddress: {
      addressLine1: "Torggata 92",
      postalCode: "4611",
      city: "Kristiansand",
      country: "NO"
    }
  });
  console.log("Response:", JSON.stringify(supplierRes.data?.value?.postalAddress, null, 2));

  // Test 2: Try with country as object (might be nested)
  console.log("\n=== Test 2: country as string 'NO' ===");
  const s2 = await api("POST", "/supplier", {
    name: `Test Country Supplier 2 ${Date.now()}`,
    postalAddress: {
      addressLine1: "Solveien 92",
      postalCode: "8006",
      city: "Bodø",
      country: "NO"
    }
  });
  const addr2 = s2.data?.value?.postalAddress;
  console.log("postalAddress:", JSON.stringify(addr2, null, 2));

  // Test 3: Check the full supplier response for country fields
  if (s2.data?.value?.id) {
    const readback = await api("GET", `/supplier/${s2.data.value.id}?fields=*,postalAddress(*)`);
    const fullAddr = readback.data?.value?.postalAddress;
    console.log("\n=== Test 3: Full readback of supplier postalAddress ===");
    console.log("Full postalAddress:", JSON.stringify(fullAddr, null, 2));

    // Check if country is in a different location
    const supplierFull = readback.data?.value;
    if (supplierFull) {
      console.log("country field:", supplierFull.country);
      console.log("countryCode:", supplierFull.countryCode);
    }
  }

  // Test 4: What fields does postalAddress support?
  console.log("\n=== Test 4: Check address model from existing supplier ===");
  const existing = await api("GET", "/supplier?count=1&fields=*,postalAddress(*)");
  if (existing.data?.values?.length) {
    const ex = existing.data.values[0];
    console.log("Existing supplier postalAddress:", JSON.stringify(ex.postalAddress, null, 2));
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
