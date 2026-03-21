const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "xtk2IC-TUZC034x4yucY-W2t43DutsqWCvwX61fFZLk";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  });
  const json = await res.json();
  if (!res.ok) {
    console.error(`${method} ${path} => ${res.status}`, JSON.stringify(json).slice(0, 500));
    throw new Error(`${res.status}`);
  }
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

// Fetch accounts needed for corrections + resolve unknown IDs
const accounts = await api("GET", "/ledger/account?number=1920,2710,6540,6590,6860,7000&fields=*");
console.log("=== ACCOUNTS BY NUMBER ===");
for (const a of accounts) {
  console.log(`Account ${a.number} "${a.name}" id=${a.id}`);
}

// Resolve IDs from postings
const accountIds = [462989391, 462989121, 462989202, 462989417, 462989397, 462989180];
const knownIds = new Set(accounts.map((a: any) => a.id));
const missingIds = accountIds.filter(id => !knownIds.has(id));

if (missingIds.length > 0) {
  console.log(`\n=== RESOLVING UNKNOWN IDS: ${missingIds.join(",")} ===`);
  const missing = await api("GET", `/ledger/account?id=${missingIds.join(",")}&fields=*`);
  for (const a of missing) {
    console.log(`Account ${a.number} "${a.name}" id=${a.id}`);
  }
}

// Map all posting IDs
console.log("\n=== POSTING ACCOUNT ID MAPPING ===");
for (const id of accountIds) {
  const found = accounts.find((a: any) => a.id === id);
  console.log(`ID ${id} => ${found ? `${found.number} "${found.name}"` : "UNKNOWN (need extra fetch)"}`);
}
