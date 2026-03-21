// Test whether physicalAddress can be set on supplier creation alongside postalAddress
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const uniqueId = Date.now().toString().slice(-6);

async function apiJson(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH } };
  if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.log("ERROR:", JSON.stringify(json).slice(0, 500));
  return { ok: r.ok, data: json };
}

async function main() {
  // Test 1: Create supplier with BOTH postalAddress AND physicalAddress
  console.log("=== Test 1: Create supplier with both postalAddress + physicalAddress ===");
  const create1 = await apiJson("POST", "/supplier", {
    name: `PhysAddr-Test-${uniqueId} AS`,
    organizationNumber: "804872205",
    postalAddress: { addressLine1: "Solveien 92", postalCode: "8006", city: "Bodø" },
    physicalAddress: { addressLine1: "Solveien 92", postalCode: "8006", city: "Bodø" },
    bankAccountPresentation: [{ bban: "53239317029" }]
  });

  if (create1.ok) {
    const s = create1.data.value;
    console.log(`  id: ${s.id}`);
    console.log(`  postalAddress: ${JSON.stringify(s.postalAddress)}`);
    console.log(`  physicalAddress: ${JSON.stringify(s.physicalAddress)}`);

    // Now read back with full expansion
    const read = await apiJson("GET", `/supplier/${s.id}?fields=*,postalAddress(*),physicalAddress(*)`);
    if (read.ok) {
      const r = read.data.value;
      console.log(`\n  Read-back postalAddress.addressLine1: ${r.postalAddress?.addressLine1}`);
      console.log(`  Read-back postalAddress.postalCode: ${r.postalAddress?.postalCode}`);
      console.log(`  Read-back postalAddress.city: ${r.postalAddress?.city}`);
      console.log(`  Read-back physicalAddress.addressLine1: ${r.physicalAddress?.addressLine1}`);
      console.log(`  Read-back physicalAddress.postalCode: ${r.physicalAddress?.postalCode}`);
      console.log(`  Read-back physicalAddress.city: ${r.physicalAddress?.city}`);
    }
  }

  // Test 2: Compare with supplier created with ONLY postalAddress (our current approach)
  console.log("\n=== Test 2: Create supplier with ONLY postalAddress (current approach) ===");
  const create2 = await apiJson("POST", "/supplier", {
    name: `PostalOnly-Test-${uniqueId} AS`,
    organizationNumber: "804872205",
    postalAddress: { addressLine1: "Solveien 92", postalCode: "8006", city: "Bodø" },
    bankAccountPresentation: [{ bban: "53239317029" }]
  });

  if (create2.ok) {
    const s = create2.data.value;
    console.log(`  id: ${s.id}`);

    const read = await apiJson("GET", `/supplier/${s.id}?fields=*,postalAddress(*),physicalAddress(*)`);
    if (read.ok) {
      const r = read.data.value;
      console.log(`\n  postalAddress.addressLine1: ${r.postalAddress?.addressLine1}`);
      console.log(`  postalAddress.postalCode: ${r.postalAddress?.postalCode}`);
      console.log(`  postalAddress.city: ${r.postalAddress?.city}`);
      console.log(`  physicalAddress.addressLine1: "${r.physicalAddress?.addressLine1}"`);
      console.log(`  physicalAddress.postalCode: "${r.physicalAddress?.postalCode}"`);
      console.log(`  physicalAddress.city: "${r.physicalAddress?.city}"`);
      console.log(`\n  physicalAddress is EMPTY: ${!r.physicalAddress?.addressLine1 && !r.physicalAddress?.city}`);
    }
  }
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
