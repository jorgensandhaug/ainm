const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  const b = await r.text();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.log(b.slice(0, 800)); return null; }
  return JSON.parse(b);
}

// Test: Full combined 6-line voucher in sandbox to verify the exact shape works
const acctResp = await api("GET", "/ledger/account?number=1700,6300,6020,1029,5000,2900&fields=id,number,name&count=100");
if (!acctResp) process.exit(1);

const acctMap = new Map<number, number>();
for (const a of acctResp.values) acctMap.set(a.number, a.id);
console.log("Account map:", Object.fromEntries(acctMap));

const accrualAmt = 8950;
const depAmt = Math.round((240050 / 60) * 100) / 100; // 4000.83
const salaryAmt = 45000;
console.log(`Depreciation amount: ${depAmt}`);

const voucher = await api("POST", "/ledger/voucher", {
  date: "2026-03-31",
  description: "Månedsavslutning mars 2026 (sandbox verify)",
  postings: [
    { row: 1, account: { id: acctMap.get(6300) }, amountGross: accrualAmt, amountGrossCurrency: accrualAmt, description: "Periodisering forskuddsbetalt kostnad" },
    { row: 2, account: { id: acctMap.get(1700) }, amountGross: -accrualAmt, amountGrossCurrency: -accrualAmt, description: "Forskuddsbetalt kostnad" },
    { row: 3, account: { id: acctMap.get(6020) }, amountGross: depAmt, amountGrossCurrency: depAmt, description: "Avskrivning driftsmiddel" },
    { row: 4, account: { id: acctMap.get(1029) }, amountGross: -depAmt, amountGrossCurrency: -depAmt, description: "Akk. avskrivning" },
    { row: 5, account: { id: acctMap.get(5000) }, amountGross: salaryAmt, amountGrossCurrency: salaryAmt, description: "Lønn til ansatte" },
    { row: 6, account: { id: acctMap.get(2900) }, amountGross: -salaryAmt, amountGrossCurrency: -salaryAmt, description: "Påløpt lønn" },
  ],
});

if (voucher) {
  console.log("\nVoucher created successfully!");
  console.log("ID:", voucher.value.id);
  console.log("Date:", voucher.value.date);
  console.log("Description:", voucher.value.description);
  console.log("Postings count:", voucher.value.postings?.length || "N/A (link only)");
}

console.log("\nDone. 2 calls total in sandbox (all accounts existed).");
