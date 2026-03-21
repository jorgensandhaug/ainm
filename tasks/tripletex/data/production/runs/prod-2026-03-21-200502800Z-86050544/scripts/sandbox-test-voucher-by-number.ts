// Test if POST /ledger/voucher accepts account: { number: ... } instead of account: { id: ... }
// If it does, we can skip the GET /ledger/account call and save 1 API call on the NOK fallback path.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const DATE = "2026-03-21";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const opts: RequestInit = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`  Status: ${r.status}`);
  if (!r.ok) {
    console.log(`  Error: ${JSON.stringify(json)}`);
  }
  return { status: r.status, ok: r.ok, data: json };
}

async function main() {
  // Test 1: POST /ledger/voucher with account: { number: ... } (no ID)
  console.log("=== Test 1: voucher with account.number (no ID) ===");
  const r1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: DATE,
    description: "Test agio by number",
    postings: [
      {
        row: 1, date: DATE,
        account: { number: 1920 },
        amountGross: 100, amountGrossCurrency: 100,
        vatType: { id: 0 },
        description: "Test debit"
      },
      {
        row: 2, date: DATE,
        account: { number: 8060 },
        amountGross: -100, amountGrossCurrency: -100,
        vatType: { id: 0 },
        description: "Test credit"
      }
    ]
  });

  if (r1.ok) {
    console.log(`  SUCCESS! Voucher created with account.number. ID: ${r1.data.value?.id}`);
    console.log(`  This means we can skip GET /ledger/account and save 1 call!`);
  } else {
    console.log(`  FAILED. account.number does not work — GET /ledger/account is required.`);
  }

  // Test 2: Also test if account: { number: "1920" } (string) works
  console.log("\n=== Test 2: voucher with account.number as string ===");
  const r2 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: DATE,
    description: "Test agio by number string",
    postings: [
      {
        row: 1, date: DATE,
        account: { number: "1920" },
        amountGross: 50, amountGrossCurrency: 50,
        vatType: { id: 0 },
        description: "Test debit string"
      },
      {
        row: 2, date: DATE,
        account: { number: "8060" },
        amountGross: -50, amountGrossCurrency: -50,
        vatType: { id: 0 },
        description: "Test credit string"
      }
    ]
  });

  if (r2.ok) {
    console.log(`  SUCCESS with string number! Voucher ID: ${r2.data.value?.id}`);
  } else {
    console.log(`  FAILED with string number too.`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
