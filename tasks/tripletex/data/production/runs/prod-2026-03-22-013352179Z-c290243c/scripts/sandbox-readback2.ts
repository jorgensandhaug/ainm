// Check if voucherType needs specific field expansion
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function run() {
  // Try different field expansions
  for (const fields of ["id,number,voucherType", "id,number,voucherType(id,name)", "voucherType(*)"]) {
    const res = await fetch(`${BASE}/ledger/voucher/609264396?fields=${encodeURIComponent(fields)}`, { headers });
    const data = await res.json();
    console.log(`fields=${fields}:`, JSON.stringify(data.value?.voucherType || data.value));
  }

  // Also compare: GET all recent vouchers to see their voucherType
  const res2 = await fetch(`${BASE}/ledger/voucher?dateFrom=2026-03-22&count=5&fields=id,number,description,voucherType(*)`, { headers });
  const data2 = await res2.json();
  console.log("\nRecent vouchers:");
  for (const v of data2.values || []) {
    console.log(`  id=${v.id} number=${v.number} desc="${v.description}" voucherType=${JSON.stringify(v.voucherType)}`);
  }
}

run().catch(console.error);
