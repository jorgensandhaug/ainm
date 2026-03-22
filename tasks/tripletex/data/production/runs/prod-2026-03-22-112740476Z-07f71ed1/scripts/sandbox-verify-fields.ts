// Sandbox verification: confirm that customer(*) is needed in the fields expansion
// and that there's no way to skip the account lookup for agio vouchers
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { method, headers: { Authorization: AUTH } });
  const json = await r.json();
  console.log(`${method} ${path} → ${r.status}`);
  return json;
}

async function main() {
  // Test 1: GET /invoice with fields=*,currency(*) — does it include customer.organizationNumber?
  const res1 = await api("GET", "/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2027-01-01&count=3&fields=*,currency(*)");
  const inv1 = res1.values?.[0];
  console.log("Test 1 - fields=*,currency(*) customer shape:", JSON.stringify(inv1?.customer));
  console.log("  → customer.organizationNumber:", inv1?.customer?.organizationNumber);
  // Expected: customer is { id, url } stub without organizationNumber

  // Test 2: GET /invoice with fields=*,currency(*),customer(*) — includes orgNumber?
  const res2 = await api("GET", "/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2027-01-01&count=3&fields=*,currency(*),customer(*)");
  const inv2 = res2.values?.[0];
  console.log("\nTest 2 - fields=*,currency(*),customer(*) customer shape:", JSON.stringify(inv2?.customer).slice(0, 200));
  console.log("  → customer.organizationNumber:", inv2?.customer?.organizationNumber);
  // Expected: customer is fully expanded with organizationNumber

  // Test 3: Can we embed account info in the paymentType response?
  const res3 = await api("GET", "/invoice/paymentType?fields=*,debitAccount(*),creditAccount(*)&count=5");
  const pt = res3.values?.[0];
  console.log("\nTest 3 - paymentType shape:", JSON.stringify(pt).slice(0, 300));
  // Check if any agio-related info is available from paymentType

  // Test 4: Does GET /ledger/account support multiple account numbers in one call?
  const res4 = await api("GET", "/ledger/account?number=8060,8160&fields=id,number,name");
  console.log("\nTest 4 - multi-account lookup:", JSON.stringify(res4.values));
  // If this works, we could fetch both agio and disagio in one call

  console.log("\nDone - all sandbox verification complete");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
