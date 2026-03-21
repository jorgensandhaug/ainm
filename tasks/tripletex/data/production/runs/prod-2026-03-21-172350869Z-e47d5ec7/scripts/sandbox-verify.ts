const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) {
    console.error(text);
    return null;
  }
  if (!text) return null;
  const json = JSON.parse(text);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

// Test 1: Check which accounts exist in sandbox for the 6010/1249 mapping
console.log("=== Test 1: Account existence for 6010→1249 mapping ===");
const accounts = await api("GET", "/ledger/account?number=1700,6300,6010,1249,5000,2900,1029,6020,1109,1209&fields=id,number,name&count=100");
if (accounts) {
  console.log("Accounts found:");
  for (const a of accounts) {
    console.log(`  ${a.number}: ${a.name} (id=${a.id})`);
  }
  const found = new Set(accounts.map((a: any) => a.number));
  for (const n of [1700, 6300, 6010, 1249, 5000, 2900, 1029, 6020, 1109, 1209]) {
    if (!found.has(n)) console.log(`  MISSING: ${n}`);
  }
}

// Test 2: Post a test voucher using 6010→1249 mapping to confirm it works
console.log("\n=== Test 2: Combined voucher with 6010→1249 depreciation ===");
if (accounts) {
  const accountMap = new Map<number, number>();
  for (const a of accounts) accountMap.set(a.number, a.id);

  // Check if 1249 and 6010 exist
  if (accountMap.has(1249) && accountMap.has(6010) && accountMap.has(1700) && accountMap.has(6300) && accountMap.has(5000) && accountMap.has(2900)) {
    const depAmt = Math.round((107950 / 72) * 100) / 100;
    console.log(`Depreciation amount: ${depAmt}`);

    const voucher = {
      date: "2026-03-31",
      description: "Sandbox test: Månedsavslutning mars 2026 (6010→1249)",
      postings: [
        { row: 1, account: { id: accountMap.get(6300) }, amountGross: 11900, amountGrossCurrency: 11900, description: "Periodisering forskuddsbetalt kostnad" },
        { row: 2, account: { id: accountMap.get(1700) }, amountGross: -11900, amountGrossCurrency: -11900, description: "Forskuddsbetalt kostnad" },
        { row: 3, account: { id: accountMap.get(6010) }, amountGross: depAmt, amountGrossCurrency: depAmt, description: "Avskrivning driftsmiddel" },
        { row: 4, account: { id: accountMap.get(1249) }, amountGross: -depAmt, amountGrossCurrency: -depAmt, description: "Akk. avskrivning" },
        { row: 5, account: { id: accountMap.get(5000) }, amountGross: 45000, amountGrossCurrency: 45000, description: "Lønn til ansatte" },
        { row: 6, account: { id: accountMap.get(2900) }, amountGross: -45000, amountGrossCurrency: -45000, description: "Påløpt lønn" },
      ],
    };

    const result = await api("POST", "/ledger/voucher", voucher);
    if (result) {
      console.log(`Voucher created: id=${result.id}, number=${result.number}`);
      console.log(`Postings: ${result.postings?.length || 0}`);
    }
  } else {
    console.log("Not all accounts exist. Missing accounts need to be created first.");
    const missing = [1249, 6010, 1700, 6300, 5000, 2900].filter(n => !accountMap.has(n));
    console.log("Missing:", missing);
  }
}

console.log("\nDone.");
