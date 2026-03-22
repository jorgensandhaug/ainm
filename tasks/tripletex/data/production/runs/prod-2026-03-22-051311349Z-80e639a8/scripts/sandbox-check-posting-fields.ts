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

// Check an existing voucher's postings in detail
console.log("=== Existing voucher postings ===");
const vouchers = await api("GET", "/ledger/voucher?dateFrom=2025-12-31&dateTo=2026-01-01&fields=id,description&count=3");
for (const v of (vouchers.values || []).slice(0, 1)) {
  console.log(`\nVoucher ${v.id}: ${v.description}`);
  const postings = await api("GET", `/ledger/posting?voucherId=${v.id}&fields=*&count=10`);
  for (const p of (postings.values || [])) {
    console.log(JSON.stringify(p, null, 2));
  }
}

// Create a TEST voucher and check all fields
console.log("\n=== Creating test voucher to check field behavior ===");
const accts = await api("GET", "/ledger/account?number=6010,1209&fields=id,number&count=5");
const acctMap: Record<number, number> = {};
for (const a of accts.values) acctMap[a.number] = a.id;

const testV = await api("POST", "/ledger/voucher", {
  date: "2025-12-31",
  description: "FIELD CHECK TEST - DELETE ME",
  postings: [
    { row: 1, account: { id: acctMap[6010] }, amountGross: 12345.67, amountGrossCurrency: 12345.67, description: "Test debit" },
    { row: 2, account: { id: acctMap[1209] }, amountGross: -12345.67, amountGrossCurrency: -12345.67, description: "Test credit" },
  ],
});

if (testV.value) {
  const voucherId = testV.value.id;
  console.log(`Created voucher ${voucherId}`);

  // Get postings with ALL fields
  const postings = await api("GET", `/ledger/posting?voucherId=${voucherId}&fields=*&count=10`);
  for (const p of (postings.values || [])) {
    console.log(`\nPosting row ${p.row}:`);
    console.log(`  amount: ${p.amount}`);
    console.log(`  amountGross: ${p.amountGross}`);
    console.log(`  amountCurrency: ${p.amountCurrency}`);
    console.log(`  amountGrossCurrency: ${p.amountGrossCurrency}`);
    console.log(`  amountVat: ${p.amountVat}`);
    console.log(`  account: ${p.account?.number} ${p.account?.name}`);
    console.log(`  description: ${p.description}`);
  }

  // Clean up
  await api("DELETE", `/ledger/voucher/${voucherId}`);
  console.log(`Deleted voucher ${voucherId}`);
}
