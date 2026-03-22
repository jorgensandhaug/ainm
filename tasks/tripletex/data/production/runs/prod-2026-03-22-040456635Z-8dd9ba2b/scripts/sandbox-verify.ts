// Sandbox verification: confirm the year-end closing flow is correct and check for lower-call paths
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Test 1: Verify account 1209 existence
console.log("=== Test 1: Check account 1209 existence ===");
const r1 = await fetch(`${BASE}/ledger/account?number=1209&fields=id,number,name`, { headers: H });
const d1 = await r1.json();
console.log("Account 1209:", d1.values?.length > 0 ? `EXISTS (id=${d1.values[0].id})` : "DOES NOT EXIST in fresh instances (was created in sandbox previously)");

// Test 2: Verify we can post a voucher to 6010/1209 (depreciation pattern)
console.log("\n=== Test 2: Verify depreciation voucher posting ===");
const acctRes = await fetch(`${BASE}/ledger/account?number=1209,6010&fields=id,number,name`, { headers: H });
const acctData = await acctRes.json();
const accts: Record<number, number> = {};
for (const a of acctData.values) accts[a.number] = a.id;
console.log("Account IDs:", accts);

// Test 3: Verify balance sheet range 3000-8299 excludes tax accounts
console.log("\n=== Test 3: Verify balance sheet range ===");
const bsRes = await fetch(`${BASE}/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8299&fields=account(number),balanceOut&count=1000`, { headers: H });
const bsData = await bsRes.json();
const bsAccounts = (bsData.values || []).map((r: any) => r.account?.number).sort((a: number, b: number) => a - b);
const maxAcct = Math.max(...bsAccounts);
const minAcct = Math.min(...bsAccounts);
console.log(`BS accounts range: ${minAcct} to ${maxAcct}, count=${bsAccounts.length}`);
console.log("Has 8300+?", bsAccounts.some((n: number) => n >= 8300) ? "YES (BUG!)" : "NO (correct)");
let sum = 0;
for (const r of bsData.values || []) sum += r.balanceOut || 0;
console.log(`Sum balanceOut: ${sum}, preTaxProfit: ${-sum}`);

// Test 4: Can we POST voucher without row field? (test if row is truly required)
console.log("\n=== Test 4: Test if row field is required ===");
const testBody = {
  date: "2025-12-31",
  description: "Test voucher without row",
  postings: [
    { account: { id: accts[6010] }, amountGross: 100, amountGrossCurrency: 100, description: "Test" },
    { account: { id: accts[1209] }, amountGross: -100, amountGrossCurrency: -100, description: "Test" },
  ]
};
const testRes = await fetch(`${BASE}/ledger/voucher`, { method: "POST", headers: H, body: JSON.stringify(testBody) });
if (testRes.ok) {
  console.log("Voucher without row: ACCEPTED (row is optional!)");
  const td = await testRes.json();
  console.log("Voucher id:", td.value.id);
} else {
  console.log("Voucher without row: REJECTED", testRes.status, await testRes.text());
}

// Test 5: Verify 8300/2500 exist and are correct account types
console.log("\n=== Test 5: Verify tax accounts ===");
const taxRes = await fetch(`${BASE}/ledger/account?number=8300,2500&fields=id,number,name,type`, { headers: H });
const taxData = await taxRes.json();
for (const a of taxData.values) {
  console.log(`Account ${a.number}: "${a.name}" type=${a.type}`);
}

// Test 6: Verify 8800/2050 exist
console.log("\n=== Test 6: Verify disposition accounts ===");
const dispRes = await fetch(`${BASE}/ledger/account?number=8800,2050&fields=id,number,name,type`, { headers: H });
const dispData = await dispRes.json();
for (const a of dispData.values) {
  console.log(`Account ${a.number}: "${a.name}" type=${a.type}`);
}

console.log("\n=== DONE ===");
