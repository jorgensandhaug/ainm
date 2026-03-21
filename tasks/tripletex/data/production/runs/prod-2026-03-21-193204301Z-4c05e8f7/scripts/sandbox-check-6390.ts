const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { method, headers });
  const json = await r.json();
  console.log(`${method} ${path} → ${r.status}`);
  return json;
}

// Check all 63xx accounts to see which exist by default
const data = await api("GET", "/ledger/account?numberFrom=6300&numberTo=6399&fields=id,number,name&count=100");
console.log("\n6300-6399 accounts:");
for (const a of data.values || []) {
  console.log(`  ${a.number}: ${a.name} (id=${a.id})`);
}

// Also check 1710 and nearby accounts
const data2 = await api("GET", "/ledger/account?numberFrom=1700&numberTo=1749&fields=id,number,name&count=100");
console.log("\n1700-1749 accounts:");
for (const a of data2.values || []) {
  console.log(`  ${a.number}: ${a.name} (id=${a.id})`);
}
