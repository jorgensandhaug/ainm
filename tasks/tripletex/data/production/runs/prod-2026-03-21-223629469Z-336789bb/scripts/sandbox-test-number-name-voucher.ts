// Test: can we skip GET /ledger/account by using account number+name on voucher postings?
// If this works, we could drop from 5 to 4 calls.
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const r = await fetch(`${BASE}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (r.status >= 400) console.log(JSON.stringify(json, null, 2));
  return { status: r.status, data: json };
}

async function main() {
  // First get an existing dimension value to use for voucher test
  const dims = await api("GET", "/ledger/accountingDimensionValue?count=1&fields=id,displayName,dimensionIndex");
  if (dims.status !== 200 || !dims.data.values?.length) {
    console.log("No existing dimension values in sandbox, skipping voucher tests");
    return;
  }
  const dimVal = dims.data.values[0];
  console.log(`Using existing dim value: id=${dimVal.id}, name=${dimVal.displayName}, idx=${dimVal.dimensionIndex}`);

  // Test 1: account with number + name (string number)
  console.log("\n--- Test 1: account number (string) + name, no id ---");
  const today = new Date().toISOString().slice(0, 10);
  const t1 = await api("POST", "/ledger/voucher", {
    date: today, description: "sandbox-test-numname", voucherType: null,
    postings: [
      { row: 1, account: { number: "6340", name: "Reisekostnad" }, amount: 100, amountCurrency: 100, amountGross: 100, amountGrossCurrency: 100, [`freeAccountingDimension${dimVal.dimensionIndex}`]: { id: dimVal.id } },
      { row: 2, account: { number: "1920", name: "Bankinnskudd" }, amount: -100, amountCurrency: -100, amountGross: -100, amountGrossCurrency: -100 },
    ],
  });

  // Test 2: account with number (integer) + name
  console.log("\n--- Test 2: account number (int) + name, no id ---");
  const t2 = await api("POST", "/ledger/voucher", {
    date: today, description: "sandbox-test-intname", voucherType: null,
    postings: [
      { row: 1, account: { number: 6340, name: "Reisekostnad" }, amount: 100, amountCurrency: 100, amountGross: 100, amountGrossCurrency: 100, [`freeAccountingDimension${dimVal.dimensionIndex}`]: { id: dimVal.id } },
      { row: 2, account: { number: 1920, name: "Bankinnskudd" }, amount: -100, amountCurrency: -100, amountGross: -100, amountGrossCurrency: -100 },
    ],
  });

  // Test 3: account with only number (no name, no id)
  console.log("\n--- Test 3: account number only, no name, no id ---");
  const t3 = await api("POST", "/ledger/voucher", {
    date: today, description: "sandbox-test-numonly", voucherType: null,
    postings: [
      { row: 1, account: { number: 6340 }, amount: 100, amountCurrency: 100, amountGross: 100, amountGrossCurrency: 100, [`freeAccountingDimension${dimVal.dimensionIndex}`]: { id: dimVal.id } },
      { row: 2, account: { number: 1920 }, amount: -100, amountCurrency: -100, amountGross: -100, amountGrossCurrency: -100 },
    ],
  });

  console.log(`\nSummary: Test1=${t1.status} Test2=${t2.status} Test3=${t3.status}`);
}

main().catch(e => { console.error(e); process.exit(1); });
