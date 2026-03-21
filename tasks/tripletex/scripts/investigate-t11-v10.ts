// Investigate task 11 - Part 10:
// Check accounts used across task 11 prompts. Could account 6590 or 7300 be invalid?
// Also check if the scorer could be checking something we're completely missing.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

// Check all accounts used in task 11 prompts
const accounts = [6540, 6590, 6300, 7300];

console.log("=== Check accounts ===");
for (const acct of accounts) {
  const res = await fetch(`${BASE}/ledger/account?number=${acct}&isApplicableForSupplierInvoice=true&fields=*`, { headers: H });
  const data = await res.json();
  console.log(`Account ${acct}: status=${res.status} count=${data.fullResultSize} ${data.values?.[0] ? `id=${data.values[0].id} name="${data.values[0].name}"` : 'NOT FOUND'}`);

  if (!data.values?.length) {
    // Try without the isApplicable filter
    const res2 = await fetch(`${BASE}/ledger/account?number=${acct}&fields=*`, { headers: H });
    const data2 = await res2.json();
    console.log(`  Without filter: count=${data2.fullResultSize} ${data2.values?.[0] ? `id=${data2.values[0].id} name="${data2.values[0].name}" isApplicable=${data2.values[0].isApplicableForSupplierInvoice}` : 'NOT FOUND'}`);
  }
}

// Check the voucher type for Leverandørfaktura
console.log("\n=== Check voucherType ===");
const vtRes = await fetch(`${BASE}/ledger/voucherType?name=Leverandørfaktura&fields=*`, { headers: H });
const vtData = await vtRes.json();
console.log("VoucherType:", JSON.stringify(vtData.values?.[0], null, 2));

// Also check if there are any "Leverandør" related voucherTypes
const vtAllRes = await fetch(`${BASE}/ledger/voucherType?fields=*`, { headers: H });
const vtAllData = await vtAllRes.json();
console.log("\n=== All voucherTypes ===");
for (const vt of (vtAllData.values || [])) {
  console.log(`  id=${vt.id} name="${vt.name}"`);
}

// Check if the proxy blocks importDocument
console.log("\n=== Check if importDocument is available ===");
const optRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
  method: "OPTIONS", headers: H,
});
console.log("OPTIONS /ledger/voucher/importDocument:", optRes.status);
const optText = await optRes.text();
console.log(optText.substring(0, 500));

// Try a GET to see what error we get
const getRes = await fetch(`${BASE}/ledger/voucher/importDocument`, { headers: H });
console.log("\nGET /ledger/voucher/importDocument:", getRes.status);
