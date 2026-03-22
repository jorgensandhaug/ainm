const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  console.log(`${method} ${path} → ${res.status}`);
  return data;
}

const accts = await api("GET", "/ledger/account?number=6010,1209&fields=id,number&count=5");
const acctMap: Record<number, number> = {};
for (const a of accts.values) acctMap[a.number] = a.id;

// Create test voucher
const testV = await api("POST", "/ledger/voucher", {
  date: "2025-12-31",
  description: "POSTING FIELD TEST",
  postings: [
    { row: 1, account: { id: acctMap[6010] }, amountGross: 12345.67, amountGrossCurrency: 12345.67, description: "Test debit" },
    { row: 2, account: { id: acctMap[1209] }, amountGross: -12345.67, amountGrossCurrency: -12345.67, description: "Test credit" },
  ],
});
const voucherId = testV.value.id;
console.log(`Created voucher ${voucherId}`);

// Get postings by date range instead of voucherId
const postings = await api("GET", `/ledger/posting?dateFrom=2025-12-31&dateTo=2026-01-01&accountNumberFrom=6010&accountNumberTo=6010&fields=id,amount,amountGross,amountCurrency,amountGrossCurrency,amountVat,account(number,name),description,row&count=5&sorting=-id`);
console.log("\nLatest 6010 postings:");
for (const p of (postings.values || []).slice(0, 3)) {
  console.log(`  row=${p.row} amount=${p.amount} amountGross=${p.amountGross} amountCurrency=${p.amountCurrency} amountGrossCurrency=${p.amountGrossCurrency} amountVat=${p.amountVat} desc="${p.description}"`);
}

// Also check 1209 postings
const postings2 = await api("GET", `/ledger/posting?dateFrom=2025-12-31&dateTo=2026-01-01&accountNumberFrom=1209&accountNumberTo=1209&fields=id,amount,amountGross,amountCurrency,amountGrossCurrency,amountVat,account(number,name),description,row&count=5&sorting=-id`);
console.log("\nLatest 1209 postings:");
for (const p of (postings2.values || []).slice(0, 3)) {
  console.log(`  row=${p.row} amount=${p.amount} amountGross=${p.amountGross} amountCurrency=${p.amountCurrency} amountGrossCurrency=${p.amountGrossCurrency} amountVat=${p.amountVat} desc="${p.description}"`);
}

// Clean up
await api("DELETE", `/ledger/voucher/${voucherId}`);

// Now check: what does the voucher response look like?
console.log("\n=== Testing voucher with full field expansion ===");
const testV2 = await api("POST", "/ledger/voucher", {
  date: "2025-12-31",
  description: "POSTING FIELD TEST 2",
  postings: [
    { row: 1, account: { id: acctMap[6010] }, amountGross: 99999.99, amountGrossCurrency: 99999.99, description: "Test" },
    { row: 2, account: { id: acctMap[1209] }, amountGross: -99999.99, amountGrossCurrency: -99999.99, description: "Test" },
  ],
});
console.log("\nVoucher response postings:");
for (const p of (testV2.value?.postings || [])) {
  console.log(`  row=${p.row} amount=${p.amount} amountGross=${p.amountGross} amountCurrency=${p.amountCurrency} amountGrossCurrency=${p.amountGrossCurrency}`);
}
await api("DELETE", `/ledger/voucher/${testV2.value.id}`);
