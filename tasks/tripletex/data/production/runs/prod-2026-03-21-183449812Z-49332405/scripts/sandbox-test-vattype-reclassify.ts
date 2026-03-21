const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const AUTH = "Basic " + btoa("0:eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9");
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  if (!r.ok) {
    console.error(`HTTP ${r.status}: ${text}`);
    return { ok: false, status: r.status, body: text };
  }
  return { ok: true, data: JSON.parse(text) };
}

const acctRes = await api("GET", "/ledger/account?number=7140,7100,1920&fields=id,number");
if (!acctRes.ok) process.exit(1);
const acctMap: Record<number, number> = {};
for (const a of (acctRes as any).data.values) acctMap[a.number] = a.id;

// Test 1: Create a voucher with 7140 using vatType 12 (account's default)
console.log("\n=== Test 1: Create voucher with 7140 vatType=12 ===");
const v1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-01-18",
  description: "Test vatType 12 on 7140",
  postings: [
    { row: 1, account: { id: acctMap[7140] }, amountGross: 7500, amountGrossCurrency: 7500, vatType: { id: 12 }, description: "Test" },
    { row: 2, account: { id: acctMap[1920] }, amountGross: -7500, amountGrossCurrency: -7500, description: "Bank" }
  ]
});
console.log("Result:", JSON.stringify(v1, null, 2));

// Test 2: Try reclassification with vatType 12 on BOTH sides (7140 → 7100) — should 422 because 7100 is locked to vatType 0
console.log("\n=== Test 2: Reclassify 7140→7100 with vatType=12 on both ===");
const v2 = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-02-28",
  description: "Reclassify test vatType=12 on both",
  postings: [
    { row: 1, account: { id: acctMap[7140] }, amountGross: -7500, amountGrossCurrency: -7500, vatType: { id: 12 }, description: "Correction" },
    { row: 2, account: { id: acctMap[7100] }, amountGross: 7500, amountGrossCurrency: 7500, vatType: { id: 12 }, description: "Correction" }
  ]
});
console.log("Result:", JSON.stringify(v2, null, 2));

// Test 3: Reclassify with the original's vatType on the reversal side, vatType 0 on target
console.log("\n=== Test 3: Reclassify 7140→7100 with vatType=12 on 7140 side, vatType=0 on 7100 side ===");
const v3 = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-02-28",
  description: "Reclassify test mixed vatType",
  postings: [
    { row: 1, account: { id: acctMap[7140] }, amountGross: -7500, amountGrossCurrency: -7500, vatType: { id: 12 }, description: "Correction from 7140" },
    { row: 2, account: { id: acctMap[7100] }, amountGross: 7500, amountGrossCurrency: 7500, vatType: { id: 0 }, description: "Correction to 7100" }
  ]
});
console.log("Result:", JSON.stringify(v3, null, 2));

// Test 4: Try with vatType 0 on both sides
console.log("\n=== Test 4: Reclassify 7140→7100 with vatType=0 on both ===");
const v4 = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-02-28",
  description: "Reclassify test vatType=0 on both",
  postings: [
    { row: 1, account: { id: acctMap[7140] }, amountGross: -7500, amountGrossCurrency: -7500, vatType: { id: 0 }, description: "Correction from 7140" },
    { row: 2, account: { id: acctMap[7100] }, amountGross: 7500, amountGrossCurrency: 7500, vatType: { id: 0 }, description: "Correction to 7100" }
  ]
});
console.log("Result:", JSON.stringify(v4, null, 2));
