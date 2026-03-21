const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  const b = await r.text();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.log(b.slice(0, 500)); return null; }
  return JSON.parse(b);
}

// Test 1: Verify which accounts exist in sandbox
const NEEDED = [1700, 6300, 6020, 1029, 5000, 2900];
const acctResp = await api("GET", `/ledger/account?number=${NEEDED.join(",")}&fields=id,number,name&count=100`);
if (acctResp) {
  console.log("Existing:", acctResp.values.map((a: any) => `${a.number} (${a.name})`));
  const found = new Set(acctResp.values.map((a: any) => a.number));
  const missing = NEEDED.filter(n => !found.has(n));
  console.log("Missing:", missing);
}

// Test 2: Can we skip the GET and create account + voucher with inline account references?
// Try posting a voucher with account: { number: 5000 } instead of account: { id: xxx }
console.log("\n--- Test: voucher with account.number only (no id) ---");
const testVoucher = await api("POST", "/ledger/voucher", {
  date: "2026-03-31",
  description: "Test voucher with account.number only",
  postings: [
    { row: 1, account: { number: 5000 }, amountGross: 100, amountGrossCurrency: 100, description: "Test debit" },
    { row: 2, account: { number: 2900 }, amountGross: -100, amountGrossCurrency: -100, description: "Test credit" },
  ],
});
if (testVoucher) {
  console.log("SUCCESS: voucher created with account.number only, id:", testVoucher.value?.id);
} else {
  console.log("FAILED: account.number only does not work, id is required");
}

// Test 3: Can we create a missing account and post voucher referencing it by number in the same call?
// First check if 1029 exists in sandbox
console.log("\n--- Test: does 1029 exist in sandbox? ---");
const check1029 = await api("GET", "/ledger/account?number=1029&fields=id,number,name&count=1");
if (check1029) {
  console.log("1029 result:", check1029.values);
}

console.log("\nDone.");
