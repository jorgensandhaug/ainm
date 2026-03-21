// Check which accumulated depreciation accounts exist
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: H });
  const data = await res.json();
  return data;
}

async function main() {
  // Check all possible accumulated depreciation accounts
  console.log("=== Accumulated depreciation accounts ===");
  const accts = await api("/ledger/account?number=1200,1201,1209,1210,1219,1230,1239,1240,1249,1250,1259&fields=id,number,name");
  for (const a of accts.values) {
    console.log(`  ${a.number}: ${a.name} (id=${a.id})`);
  }

  // Also check the full 1200-1259 range
  console.log("\n=== Full 1200-1259 range ===");
  const range = await api("/ledger/account?numberFrom=1200&numberTo=1259&fields=id,number,name&count=100");
  for (const a of range.values) {
    console.log(`  ${a.number}: ${a.name}`);
  }

  // Check 6000-6099 range for depreciation accounts
  console.log("\n=== 6000-6099 range (depreciation) ===");
  const dep6 = await api("/ledger/account?numberFrom=6000&numberTo=6099&fields=id,number,name&count=100");
  for (const a of dep6.values) {
    console.log(`  ${a.number}: ${a.name}`);
  }
}

main().catch(console.error);
