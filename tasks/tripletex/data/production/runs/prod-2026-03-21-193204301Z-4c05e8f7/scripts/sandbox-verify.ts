const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.log("ERROR:", JSON.stringify(json).slice(0, 500)); }
  return { status: r.status, data: json };
}

// Check which accounts exist: 1710, 6390, 6020, 1029, 5000, 2900
const acctNumbers = [1710, 6390, 6020, 1029, 5000, 2900];
const { data: acctData } = await api("GET", `/ledger/account?number=${acctNumbers.join(",")}&fields=id,number,name&count=100`);

console.log("\nAccount lookup results:");
for (const a of acctData.values || []) {
  console.log(`  ${a.number}: ${a.name} (id=${a.id})`);
}

const existing = new Map<number, number>();
for (const a of acctData.values || []) {
  existing.set(a.number, a.id);
}

const missing = acctNumbers.filter(n => !existing.has(n));
console.log("\nMissing accounts:", missing);
console.log("Existing accounts:", [...existing.keys()]);
