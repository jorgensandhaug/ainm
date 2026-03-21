// Test: POST /ledger/voucher?sendToLedger=true with correct format
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`${method} ${path.substring(0, 80)} -> ${res.status}`);
  if (!res.ok) {
    console.log(`  ERROR: ${text.substring(0, 500)}`);
    return null;
  }
  try { return JSON.parse(text); } catch { return text; }
}

async function main() {
  // Account IDs:
  // 1920 = 424190862 (bank)
  // 8060 = 424191214 (agio)
  // 8160 = 424191226 (disagio)
  // 7100 = 424191163
  // 7140 = 424191165

  // Test 1: sendToLedger=true with amountGross, row fields — two normal expense accounts
  console.log("=== Test 1: sendToLedger=true, amountGross, row fields (7100/7140) ===");
  const v1 = await api("POST", `/ledger/voucher?sendToLedger=true`, {
    date: TODAY,
    description: "Test sendToLedger voucher",
    postings: [
      { row: 0, date: TODAY, account: { id: 424191163 }, amountGross: 100, amountGrossCurrency: 100, vatType: { id: 0 }, description: "test debit" },
      { row: 1, date: TODAY, account: { id: 424191165 }, amountGross: -100, amountGrossCurrency: -100, vatType: { id: 0 }, description: "test credit" },
    ],
  });
  if (v1?.value) {
    console.log(`  SUCCESS: voucher id=${v1.value.id} number=${v1.value.number}`);
  }

  // Test 2: sendToLedger=true, 1920 and 8060
  console.log("\n=== Test 2: sendToLedger=true, 1920/8060 ===");
  const v2 = await api("POST", `/ledger/voucher?sendToLedger=true`, {
    date: TODAY,
    description: "Test agio voucher with sendToLedger",
    postings: [
      { row: 0, date: TODAY, account: { id: 424190862 }, amountGross: 100, amountGrossCurrency: 100, vatType: { id: 0 }, description: "bank debit" },
      { row: 1, date: TODAY, account: { id: 424191214 }, amountGross: -100, amountGrossCurrency: -100, vatType: { id: 0 }, description: "agio credit" },
    ],
  });
  if (v2?.value) {
    console.log(`  SUCCESS: voucher id=${v2.value.id} number=${v2.value.number}`);
  }

  // Test 3: sendToLedger=true, just 8060 and 8160
  console.log("\n=== Test 3: sendToLedger=true, 8060/8160 ===");
  const v3 = await api("POST", `/ledger/voucher?sendToLedger=true`, {
    date: TODAY,
    description: "Test agio/disagio voucher",
    postings: [
      { row: 0, date: TODAY, account: { id: 424191214 }, amountGross: 100, amountGrossCurrency: 100, vatType: { id: 0 }, description: "agio" },
      { row: 1, date: TODAY, account: { id: 424191226 }, amountGross: -100, amountGrossCurrency: -100, vatType: { id: 0 }, description: "disagio" },
    ],
  });
  if (v3?.value) {
    console.log(`  SUCCESS: voucher id=${v3.value.id} number=${v3.value.number}`);
  }
}

main().catch(console.error);
