const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Check ALL month-end closing accounts
const allAccounts = [1700, 1710, 1720, 1740, 6300, 6390, 8150, 6000, 6010, 6020, 6030, 1029, 1109, 1209, 1249, 5000, 2900];
const res = await fetch(
  `${BASE}/ledger/account?number=${allAccounts.join(",")}&fields=id,number,name&count=100`,
  { headers: H }
);
const data = await res.json();
console.log("Status:", res.status);
console.log("Found accounts:");
const found = new Set<number>();
for (const a of data.values) {
  found.add(a.number);
  console.log(`  ${a.number}: ${a.name} (id=${a.id})`);
}
console.log("\nMissing accounts:");
for (const n of allAccounts) {
  if (!found.has(n)) {
    console.log(`  ${n}: MISSING`);
  }
}
