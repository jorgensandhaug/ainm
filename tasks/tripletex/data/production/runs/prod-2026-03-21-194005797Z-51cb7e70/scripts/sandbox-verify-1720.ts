const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

// Verify account 1720 exists and check all 6 accounts for this variant
const acctRes = await fetch(`${BASE}/ledger/account?number=1720,6300,6020,1029,5000,2900&fields=id,number,name&count=100`, { headers: H });
const acctData = await acctRes.json();
console.log("Account lookup status:", acctRes.status);
console.log("Accounts found:", JSON.stringify(acctData.values?.map((a: any) => ({ id: a.id, number: a.number, name: a.name }))));

const found = new Set((acctData.values || []).map((a: any) => a.number));
console.log("1720 exists:", found.has(1720));
console.log("6300 exists:", found.has(6300));
console.log("6020 exists:", found.has(6020));
console.log("1029 exists:", found.has(1029));
console.log("5000 exists:", found.has(5000));
console.log("2900 exists:", found.has(2900));

// Test the combined voucher with 1720→6300 mapping
const acctMap = new Map<number, number>();
for (const a of acctData.values || []) acctMap.set(a.number, a.id);

if (!acctMap.has(1720) || !acctMap.has(6300) || !acctMap.has(6020) || !acctMap.has(1029) || !acctMap.has(5000) || !acctMap.has(2900)) {
  console.log("Some accounts missing, skipping voucher test");
  process.exit(0);
}

const voucher = {
  date: "2026-03-31",
  description: "Sandbox verify: 1720→6300 variant",
  postings: [
    { row: 1, account: { id: acctMap.get(6300) }, amountGross: 8050, amountGrossCurrency: 8050, description: "Periodisering forskuddsbetalt kostnad" },
    { row: 2, account: { id: acctMap.get(1720) }, amountGross: -8050, amountGrossCurrency: -8050, description: "Forskuddsbetalt kostnad" },
    { row: 3, account: { id: acctMap.get(6020) }, amountGross: 3746.88, amountGrossCurrency: 3746.88, description: "Avskrivning driftsmiddel" },
    { row: 4, account: { id: acctMap.get(1029) }, amountGross: -3746.88, amountGrossCurrency: -3746.88, description: "Akk. avskrivning" },
    { row: 5, account: { id: acctMap.get(5000) }, amountGross: 45000, amountGrossCurrency: 45000, description: "Lønn til ansatte" },
    { row: 6, account: { id: acctMap.get(2900) }, amountGross: -45000, amountGrossCurrency: -45000, description: "Påløpt lønn" },
  ],
};

const vRes = await fetch(`${BASE}/ledger/voucher`, { method: "POST", headers: H, body: JSON.stringify(voucher) });
const vData = await vRes.json();
console.log("\nVoucher status:", vRes.status);
console.log("Voucher postings:", vData.value?.postings?.length);
console.log("Voucher id:", vData.value?.id);
