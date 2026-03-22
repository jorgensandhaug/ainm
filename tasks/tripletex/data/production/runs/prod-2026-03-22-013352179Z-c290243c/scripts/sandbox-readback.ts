// Read back the voucher created with voucherType by name to confirm it's correct
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function run() {
  // Read back voucher 609264396 with fields=*
  const res = await fetch(`${BASE}/ledger/voucher/609264396?fields=*`, { headers });
  const data = await res.json();
  console.log("Voucher readback:");
  console.log("  id:", data.value.id);
  console.log("  number:", data.value.number);
  console.log("  description:", data.value.description);
  console.log("  date:", data.value.date);
  console.log("  voucherType:", JSON.stringify(data.value.voucherType));
  console.log("  document:", JSON.stringify(data.value.document));

  // Also read the voucher created with voucherType by id (from earlier Test B: 609264034)
  const res2 = await fetch(`${BASE}/ledger/voucher/609264034?fields=*`, { headers });
  const data2 = await res2.json();
  console.log("\nComparison voucher (created with voucherType by id):");
  console.log("  id:", data2.value.id);
  console.log("  number:", data2.value.number);
  console.log("  voucherType:", JSON.stringify(data2.value.voucherType));
}

run().catch(console.error);
