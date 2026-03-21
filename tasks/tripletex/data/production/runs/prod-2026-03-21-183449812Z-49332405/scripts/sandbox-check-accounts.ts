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
    return null;
  }
  return JSON.parse(text);
}

// Check account details for 7140 and 7100 (vatType locking)
const accts = await api("GET", "/ledger/account?number=7140,7100&fields=id,number,name,vatType(id,name)");
if (accts) {
  console.log("Account details:");
  for (const a of accts.values) {
    console.log(`  ${a.number}: ${a.name}, vatType=${JSON.stringify(a.vatType)}`);
  }
}

// Now create test vouchers matching the exact task shape
// Error 1: Wrong account — 7140 used instead of 7100, amount 7500
console.log("\n--- Creating test voucher: wrong account 7140, amount 7500 ---");
const wrongAcct = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-01-15",
  description: "Bilgodtgjørelse feil konto",
  postings: [
    { row: 1, account: { id: accts.values.find((a: any) => a.number === 7140).id }, amountGross: 7500, amountGrossCurrency: 7500, vatType: { id: 0 }, description: "Bilgodtgjørelse" },
    { row: 2, account: { id: 424190907 }, amountGross: -7500, amountGrossCurrency: -7500, description: "Bank" } // 1920
  ]
});
if (wrongAcct) console.log("Created voucher:", wrongAcct.value?.id);

// Error 2: Duplicate — 6540, amount 1000 (with "duplikat" keyword)
console.log("\n--- Creating test voucher: duplicate 6540, amount 1000 ---");
const dup = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-01-20",
  description: "Kontorrekvisita duplikat",
  postings: [
    { row: 1, account: { id: 424191132 }, amountGross: 1000, amountGrossCurrency: 1000, vatType: { id: 0 }, description: "Kontorrekvisita" }, // 6540
    { row: 2, account: { id: 424190907 }, amountGross: -1000, amountGrossCurrency: -1000, description: "Bank" } // 1920
  ]
});
if (dup) console.log("Created voucher:", dup.value?.id);

// Error 3: Missing VAT — 4500, 21500 excl. VAT, no 2710 (Case A)
console.log("\n--- Creating test voucher: missing VAT, 4500, 21500, no 2710 ---");
const missingVat = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-02-05",
  description: "Varekjøp uten MVA",
  postings: [
    { row: 1, account: { id: 424191043 }, amountGross: 21500, amountGrossCurrency: 21500, vatType: { id: 0 }, description: "Varekjøp" }, // 4500
    { row: 2, account: { id: 424190907 }, amountGross: -21500, amountGrossCurrency: -21500, description: "Bank" } // 1920
  ]
});
if (missingVat) console.log("Created voucher:", missingVat.value?.id);

// Error 4: Incorrect amount — 6860, 17250 recorded instead of 6000
console.log("\n--- Creating test voucher: incorrect amount 6860, 17250 ---");
const wrongAmt = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-02-12",
  description: "Forsikring feil beløp",
  postings: [
    { row: 1, account: { id: 424191153 }, amountGross: 17250, amountGrossCurrency: 17250, vatType: { id: 0 }, description: "Forsikring" }, // 6860
    { row: 2, account: { id: 424190907 }, amountGross: -17250, amountGrossCurrency: -17250, description: "Bank" } // 1920
  ]
});
if (wrongAmt) console.log("Created voucher:", wrongAmt.value?.id);

console.log("\nTest data created. Now test the correction flow...");
