const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { method, headers });
  const json = await r.json();
  return json;
}

// Check specific accounts that matter for month-end closing variants
const check = [1700, 1710, 1720, 1740, 6300, 6390, 8150, 6000, 6010, 6020, 6030, 1029, 1109, 1209, 1249, 5000, 2900];
const data = await api("GET", `/ledger/account?number=${check.join(",")}&fields=id,number,name&count=100`);
const found = new Set<number>();
for (const a of data.values || []) {
  found.add(a.number);
  console.log(`  ${a.number}: ${a.name} (id=${a.id})`);
}
console.log("\nFound:", [...found].sort((a,b) => a-b));
console.log("Missing:", check.filter(n => !found.has(n)));
