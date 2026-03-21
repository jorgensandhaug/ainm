const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

// Verify the exact flow used in production: 1700→6300, 6020→1029, 5000→2900
// with prepaid 3400, dep 289700/84=3448.81, salary 45000

const accrualAmt = 3400;
const depAmt = Math.round((289700 / 84) * 100) / 100;
const salaryAmt = 45000;

console.log("Depreciation:", depAmt);

// Step 1: GET accounts
const acctNums = [1700, 6300, 6020, 1029, 5000, 2900];
const r1 = await fetch(`${BASE}/ledger/account?number=${acctNums.join(",")}&fields=id,number,name&count=100`, { headers: H });
const d1 = await r1.json();
console.log("GET accounts:", r1.status, "found:", d1.values?.length);

const acctMap: Record<number, number> = {};
for (const a of d1.values) {
  acctMap[a.number] = a.id;
  console.log(`  ${a.number} → id ${a.id} (${a.name})`);
}

const missing = acctNums.filter(n => !acctMap[n]);
console.log("Missing:", missing);

// In sandbox, 1029 exists from prior tests. Skip creation.
// Just verify voucher works.

if (missing.length > 0) {
  console.log("Would need to create:", missing);
}

// Step 2: POST combined voucher
const voucher = {
  date: "2026-03-31",
  description: "Sandbox: Månedsavslutning mars 2026",
  postings: [
    { row: 1, account: { id: acctMap[6300] }, amountGross: accrualAmt, amountGrossCurrency: accrualAmt, description: "Periodisering forskuddsbetalt kostnad" },
    { row: 2, account: { id: acctMap[1700] }, amountGross: -accrualAmt, amountGrossCurrency: -accrualAmt, description: "Forskuddsbetalt kostnad" },
    { row: 3, account: { id: acctMap[6020] }, amountGross: depAmt, amountGrossCurrency: depAmt, description: "Avskrivning driftsmiddel" },
    { row: 4, account: { id: acctMap[1029] }, amountGross: -depAmt, amountGrossCurrency: -depAmt, description: "Akk. avskrivning" },
    { row: 5, account: { id: acctMap[5000] }, amountGross: salaryAmt, amountGrossCurrency: salaryAmt, description: "Lønn til ansatte" },
    { row: 6, account: { id: acctMap[2900] }, amountGross: -salaryAmt, amountGrossCurrency: -salaryAmt, description: "Påløpt lønn" },
  ],
};

const r2 = await fetch(`${BASE}/ledger/voucher`, { method: "POST", headers: H, body: JSON.stringify(voucher) });
const d2 = await r2.json();
console.log("POST voucher:", r2.status);
if (r2.ok) {
  console.log("Voucher ID:", d2.value.id, "Number:", d2.value.number);
  console.log("Postings:", d2.value.postings?.length);
  // Verify posting amounts
  for (const p of d2.value.postings) {
    console.log(`  row ${p.row}: account ${p.account?.id} (${p.account?.number}), gross=${p.amountGross}, desc="${p.description}"`);
  }
} else {
  console.log("Error:", JSON.stringify(d2));
}
