// Test: can we post a voucher with account number+name to skip the GET /ledger/account call?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";

async function api(method: string, path: string, body?: any) {
  const url = BASE + path;
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  console.log(`\n>>> ${method} ${path}`);
  const r = await fetch(url, opts);
  const txt = await r.text();
  console.log(`Status: ${r.status}`);
  if (txt.length < 2000) console.log(txt);
  else console.log(txt.substring(0, 1000) + "...");
  const json = JSON.parse(txt);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

// First, get a customer to use
const customers = await api("GET", "/customer?count=1&fields=id,name");
const custId = customers[0].id;
console.log(`Using customer id=${custId}`);

// Test 1: Try voucher with account number + name (no id)
console.log("\n=== TEST 1: voucher with account number + name (no id) ===");
try {
  const v1 = await api("POST", "/ledger/voucher", {
    date: TODAY,
    description: "Test voucher number+name",
    voucherType: null,
    postings: [
      {
        row: 1, date: TODAY, description: "Test",
        account: { number: 1500, name: "Kundefordringer" },
        customer: { id: custId },
        currency: { id: 1 },
        amount: 50, amountCurrency: 50, amountGross: 50, amountGrossCurrency: 50
      },
      {
        row: 2, date: TODAY, description: "Test",
        account: { number: 3400, name: "Offentlig tilskudd/refusjon" },
        currency: { id: 1 },
        amount: -50, amountCurrency: -50, amountGross: -50, amountGrossCurrency: -50
      }
    ]
  });
  console.log("TEST 1 SUCCEEDED:", JSON.stringify(v1).substring(0, 500));
} catch (e: any) {
  console.log("TEST 1 FAILED:", e.message);
}

// Test 2: Try voucher with just account number (no id, no name) — re-confirm failure
console.log("\n=== TEST 2: voucher with just account number (no id, no name) ===");
try {
  const v2 = await api("POST", "/ledger/voucher", {
    date: TODAY,
    description: "Test voucher number only",
    voucherType: null,
    postings: [
      {
        row: 1, date: TODAY, description: "Test",
        account: { number: 1500 },
        customer: { id: custId },
        currency: { id: 1 },
        amount: 50, amountCurrency: 50, amountGross: 50, amountGrossCurrency: 50
      },
      {
        row: 2, date: TODAY, description: "Test",
        account: { number: 3400 },
        currency: { id: 1 },
        amount: -50, amountCurrency: -50, amountGross: -50, amountGrossCurrency: -50
      }
    ]
  });
  console.log("TEST 2 SUCCEEDED:", JSON.stringify(v2).substring(0, 500));
} catch (e: any) {
  console.log("TEST 2 FAILED:", e.message);
}
