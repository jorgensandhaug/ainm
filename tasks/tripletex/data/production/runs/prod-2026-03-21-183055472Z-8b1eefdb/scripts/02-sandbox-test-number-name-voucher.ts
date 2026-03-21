// Test: can we skip GET /ledger/account by providing number+name on voucher postings?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: unknown) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", Authorization: AUTH },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.log("Error:", JSON.stringify(json, null, 2));
  return { status: r.status, ok: r.ok, json };
}

// First get an existing dimension value id from sandbox
const dimSearch = await api("GET", "/ledger/accountingDimensionValue/search?fields=id,displayName,dimensionIndex&count=1");
const existingVal = dimSearch.json.values?.[0];
if (!existingVal) { console.log("No existing dimension values in sandbox"); process.exit(0); }
console.log("Using existing dim value:", existingVal.id, existingVal.displayName, "dimIndex:", existingVal.dimensionIndex);

// Test 1: voucher with account number + name (no id)
console.log("\n--- Test 1: account number + name, no id ---");
const dimField = `freeAccountingDimension${existingVal.dimensionIndex}`;
const test1 = await api("POST", "/ledger/voucher", {
  date: "2026-03-21",
  description: "Test number+name voucher",
  voucherType: null,
  postings: [
    {
      row: 1,
      account: { number: 6540, name: "Inventaranskaffelse" },
      amount: 100,
      amountCurrency: 100,
      amountGross: 100,
      amountGrossCurrency: 100,
      [dimField]: { id: existingVal.id },
    },
    {
      row: 2,
      account: { number: 1920, name: "Bankinnskudd" },
      amount: -100,
      amountCurrency: -100,
      amountGross: -100,
      amountGrossCurrency: -100,
    },
  ],
});

if (test1.ok) {
  console.log("SUCCESS! Voucher created with number+name, no GET needed!");
  console.log("Voucher id:", test1.json.value?.id);
} else {
  console.log("FAILED - number+name not enough");
}

// Test 2: voucher with just number (string)
console.log("\n--- Test 2: account number only (string) ---");
const test2 = await api("POST", "/ledger/voucher", {
  date: "2026-03-21",
  description: "Test number-only voucher",
  voucherType: null,
  postings: [
    {
      row: 1,
      account: { number: "6540" },
      amount: 100,
      amountCurrency: 100,
      amountGross: 100,
      amountGrossCurrency: 100,
      [dimField]: { id: existingVal.id },
    },
    {
      row: 2,
      account: { number: "1920" },
      amount: -100,
      amountCurrency: -100,
      amountGross: -100,
      amountGrossCurrency: -100,
    },
  ],
});

if (test2.ok) {
  console.log("SUCCESS! Voucher created with number only!");
  console.log("Voucher id:", test2.json.value?.id);
} else {
  console.log("FAILED - number-only still doesn't work");
}
