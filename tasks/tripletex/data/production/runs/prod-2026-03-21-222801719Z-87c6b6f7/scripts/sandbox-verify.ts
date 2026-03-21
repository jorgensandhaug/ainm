// Sandbox verification: confirm the 1710→6390 + 6020→1029 variant works with same parameters
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Same accounts as production run
const needed = [1710, 6390, 6020, 1029, 5000, 2900];

// Step 1: GET accounts
const acctRes = await fetch(`${BASE}/ledger/account?number=${needed.join(",")}&fields=id,number,name&count=100`, { headers: H });
const acctData = await acctRes.json();
console.log("GET accounts:", acctRes.status);
for (const a of acctData.values) console.log(`  ${a.number}: id=${a.id} name="${a.name}"`);

const acctMap: Record<number, number> = {};
for (const a of acctData.values) acctMap[a.number] = a.id;

const missing = needed.filter(n => !acctMap[n]);
console.log("Missing:", missing);

// In sandbox, 1029 should already exist from prior testing
// If missing, create
if (missing.length > 0) {
  const names: Record<number, string> = { 1029: "Akk. avskr. immaterielle eiendeler" };
  const toCreate = missing.map(n => ({ number: n, name: names[n] || `Account ${n}` }));
  const createRes = missing.length === 1
    ? await fetch(`${BASE}/ledger/account`, { method: "POST", headers: H, body: JSON.stringify(toCreate[0]) })
    : await fetch(`${BASE}/ledger/account/list`, { method: "POST", headers: H, body: JSON.stringify(toCreate) });
  console.log("Create accounts:", createRes.status, await createRes.text());
}

// Same calculations
const accrualAmt = 12250;
const depAmt = Math.round((144950 / (9 * 12)) * 100) / 100;
console.log("Depreciation:", depAmt, "(expected 1342.13)");

// Step 2: POST voucher
const voucher = {
  date: "2026-03-31",
  description: "Månedsavslutning mars 2026",
  postings: [
    { row: 1, account: { id: acctMap[6390] }, amountGross: accrualAmt, amountGrossCurrency: accrualAmt, description: "Periodisering forskuddsbetalt kostnad" },
    { row: 2, account: { id: acctMap[1710] }, amountGross: -accrualAmt, amountGrossCurrency: -accrualAmt, description: "Forskuddsbetalt kostnad" },
    { row: 3, account: { id: acctMap[6020] }, amountGross: depAmt, amountGrossCurrency: depAmt, description: "Avskrivning driftsmiddel" },
    { row: 4, account: { id: acctMap[1029] }, amountGross: -depAmt, amountGrossCurrency: -depAmt, description: "Akk. avskrivning" },
    { row: 5, account: { id: acctMap[5000] }, amountGross: 45000, amountGrossCurrency: 45000, description: "Lønn til ansatte" },
    { row: 6, account: { id: acctMap[2900] }, amountGross: -45000, amountGrossCurrency: -45000, description: "Påløpt lønn" },
  ],
};

const vRes = await fetch(`${BASE}/ledger/voucher`, { method: "POST", headers: H, body: JSON.stringify(voucher) });
const vBody = await vRes.json();
console.log("POST voucher:", vRes.status);

if (vRes.ok) {
  console.log("Voucher ID:", vBody.value?.id);
  console.log("Postings count:", vBody.value?.postings?.length);
  // Verify each posting
  for (const p of vBody.value?.postings || []) {
    console.log(`  Row ${p.row}: account ${p.account?.number} amount ${p.amountGross} desc="${p.description}"`);
  }
} else {
  console.error("Error:", JSON.stringify(vBody));
}
