// Test: Can we skip the initial GET /ledger/account and instead
// blindly POST /ledger/account/list for the typically-missing accounts
// while using a single GET only for the typically-existing ones?
// Or better: can we create missing accounts AND get existing account IDs in fewer calls?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const HEADERS = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: HEADERS };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) console.log(JSON.stringify(data, null, 2).substring(0, 500));
  return { status: res.status, data, ok: res.ok };
}

// Test 1: Try to batch-create accounts that already exist (should 422)
console.log("=== Test 1: Batch create already-existing accounts ===");
const t1 = await api("POST", "/ledger/account/list", [
  { number: 6010, name: "Avskrivninger" },
  { number: 1700, name: "Forskuddsbetalt leiekostnad" },
]);
console.log();

// Test 2: Try to batch-create mix of existing and new
console.log("=== Test 2: Batch create mix (existing 6010 + new 9999) ===");
const t2 = await api("POST", "/ledger/account/list", [
  { number: 6010, name: "Avskrivninger" },
  { number: 9999, name: "Test account" },
]);
console.log();

// Test 3: Check if account 1209 exists in sandbox (it was created in prior runs)
console.log("=== Test 3: Check 1209 and 8700 existence ===");
const t3 = await api("GET", "/ledger/account?number=1209,8700&fields=id,number,name");
if (t3.ok) {
  console.log("Found:", JSON.stringify(t3.data.values?.map((a: any) => ({ id: a.id, number: a.number, name: a.name }))));
}
console.log();

// Test 4: Can we do POST /ledger/voucher without account ID, using just number?
console.log("=== Test 4: Voucher with account number instead of ID ===");
const t4 = await api("POST", "/ledger/voucher", {
  date: "2025-12-31",
  description: "Test voucher with account number",
  postings: [
    { row: 1, account: { number: 6010 }, amountGross: 100, amountGrossCurrency: 100, description: "Test debit" },
    { row: 2, account: { number: 1209 }, amountGross: -100, amountGrossCurrency: -100, description: "Test credit" },
  ],
});
console.log();

// Test 5: Can we do POST /ledger/voucher with ONLY account number, no name, no id?
console.log("=== Test 5: Voucher with bare account number object ===");
const t5 = await api("POST", "/ledger/voucher", {
  date: "2025-12-31",
  description: "Test voucher bare number",
  postings: [
    { row: 1, account: { number: 6010 }, amountGross: 50, amountGrossCurrency: 50, description: "Test debit" },
    { row: 2, account: { number: 1700 }, amountGross: -50, amountGrossCurrency: -50, description: "Test credit" },
  ],
});
if (t5.ok) {
  console.log("SUCCESS! Voucher posted with bare account numbers (no IDs needed)");
  console.log("Response:", JSON.stringify(t5.data.value || t5.data, null, 2).substring(0, 500));
}
console.log();

// Clean up test account 9999 if created
if (t2.ok) {
  const cleanup = t2.data.values?.find((a: any) => a.number === 9999);
  if (cleanup) {
    console.log("Cleaning up test account 9999...");
    await api("DELETE", `/ledger/account/${cleanup.id}`);
  }
}

console.log("Done with sandbox tests.");
