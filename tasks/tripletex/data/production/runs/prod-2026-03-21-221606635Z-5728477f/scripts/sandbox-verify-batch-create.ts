// Verify that the dynamic missing-account approach works
// In sandbox, 6030 and 1209 already exist, so let's verify the general logic pattern
// by testing with accounts that we know exist but confirming the voucher flow

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// The CORRECT approach: define all potential account names, query them all,
// dynamically create any that are missing

const ACCOUNT_NAMES: Record<number, string> = {
  1720: "Andre depositum",
  6300: "Leie lokale",
  6030: "Avskr. maskiner og anlegg",
  1209: "Akk. avskr. maskiner og anlegg",
  5000: "Lønn til ansatte",
  2900: "Forskudd fra kunder",
};

const neededNumbers = Object.keys(ACCOUNT_NAMES).map(Number);

// Step 1: GET all needed accounts
const res = await fetch(
  `${BASE}/ledger/account?number=${neededNumbers.join(",")}&fields=id,number,name&count=100`,
  { headers: H }
);
const data = await res.json();
console.log("GET accounts:", res.status);

const accounts: Record<number, number> = {};
for (const a of data.values) {
  accounts[a.number] = a.id;
}
console.log("Found:", Object.keys(accounts).map(Number));

// Step 1b: Find missing accounts and batch create
const missing = neededNumbers.filter(n => !accounts[n]);
console.log("Missing:", missing);

if (missing.length > 0) {
  const toCreate = missing.map(n => ({ number: n, name: ACCOUNT_NAMES[n] }));
  if (missing.length === 1) {
    console.log("Would create single account:", toCreate[0]);
    // POST /ledger/account
  } else {
    console.log("Would batch create accounts:", toCreate);
    // POST /ledger/account/list
  }
} else {
  console.log("All accounts exist, proceeding directly to voucher");
}

// Step 2: Post voucher (using existing sandbox account IDs)
const accrualAmt = 9200;
const depAmt = Math.round((275800 / 36) * 100) / 100;
const salaryAmt = 45000;

console.log("\nDepreciation:", depAmt);

const voucher = {
  date: "2026-03-31",
  description: "Sandbox test: Månedsavslutning mars 2026 (6030 variant)",
  postings: [
    { row: 1, account: { id: accounts[6300] }, amountGross: accrualAmt, amountGrossCurrency: accrualAmt, description: "Periodisering forskuddsbetalt kostnad" },
    { row: 2, account: { id: accounts[1720] }, amountGross: -accrualAmt, amountGrossCurrency: -accrualAmt, description: "Forskuddsbetalt kostnad" },
    { row: 3, account: { id: accounts[6030] }, amountGross: depAmt, amountGrossCurrency: depAmt, description: "Avskrivning driftsmiddel" },
    { row: 4, account: { id: accounts[1209] }, amountGross: -depAmt, amountGrossCurrency: -depAmt, description: "Akk. avskrivning" },
    { row: 5, account: { id: accounts[5000] }, amountGross: salaryAmt, amountGrossCurrency: salaryAmt, description: "Lønn til ansatte" },
    { row: 6, account: { id: accounts[2900] }, amountGross: -salaryAmt, amountGrossCurrency: -salaryAmt, description: "Påløpt lønn" },
  ],
};

const vRes = await fetch(`${BASE}/ledger/voucher`, {
  method: "POST",
  headers: H,
  body: JSON.stringify(voucher),
});
const vData = await vRes.json();
console.log("\nVoucher:", vRes.status);
console.log("Voucher ID:", vData.value?.id);
console.log("Postings:", vData.value?.postings?.length);

if (vRes.ok) {
  // Verify posting amounts
  for (const p of vData.value.postings) {
    console.log(`  Row ${p.row}: account ${p.account.id}, amount=${p.amount}, desc="${p.description}"`);
  }
}
