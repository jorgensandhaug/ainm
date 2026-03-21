// Test: what about account number (int) + name? Or number+name+"dummy id"?
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

// Get existing dimension value
const dimSearch = await api("GET", "/ledger/accountingDimensionValue/search?fields=id,displayName,dimensionIndex&count=1");
const existingVal = dimSearch.json.values?.[0];
console.log("Using dim value:", existingVal.id, "dimIndex:", existingVal.dimensionIndex);

// First resolve actual IDs for comparison
const acctRes = await api("GET", "/ledger/account?number=6540,1920&fields=id,number,name");
const accts = acctRes.json.values;
console.log("Actual accounts:", accts.map((a: any) => `${a.number} → id=${a.id} name="${a.name}"`));

// Test 3: account with id=0 plus number and name
console.log("\n--- Test 3: account id=0 + number + name ---");
const dimField = `freeAccountingDimension${existingVal.dimensionIndex}`;
const test3 = await api("POST", "/ledger/voucher", {
  date: "2026-03-21",
  description: "Test id=0 + number+name",
  voucherType: null,
  postings: [
    {
      row: 1,
      account: { id: 0, number: 6540, name: accts.find((a: any) => a.number === 6540).name },
      amount: 100,
      amountCurrency: 100,
      amountGross: 100,
      amountGrossCurrency: 100,
      [dimField]: { id: existingVal.id },
    },
    {
      row: 2,
      account: { id: 0, number: 1920, name: accts.find((a: any) => a.number === 1920).name },
      amount: -100,
      amountCurrency: -100,
      amountGross: -100,
      amountGrossCurrency: -100,
    },
  ],
});

if (test3.ok) {
  console.log("SUCCESS with id=0!");
} else {
  console.log("FAILED with id=0");
}
