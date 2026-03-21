// Test alternative approaches to reduce call count
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`\n${method} ${path} → ${r.status}`);
  if (!r.ok) console.log(JSON.stringify(json).slice(0, 300));
  else console.log(JSON.stringify(json).slice(0, 300));
  return { status: r.status, json, ok: r.ok };
}

async function main() {
  // Test 1: Can we create a voucher with account number + name (no id)?
  // Already proven to fail, but let's try with the exact name from the chart
  console.log("=== TEST 1: Voucher with account number + name, no id ===");
  const acctRes = await api("GET", "/ledger/account?number=7000&fields=*");
  if (acctRes.ok && acctRes.json.values?.length > 0) {
    const acct = acctRes.json.values[0];
    console.log(`Account 7000: id=${acct.id}, name="${acct.name}"`);

    // Try posting with number + name but no id
    const vRes = await api("POST", "/ledger/voucher", {
      date: "2026-03-21",
      description: "test no-id voucher",
      voucherType: null,
      postings: [
        {
          row: 1,
          account: { number: acct.number, name: acct.name },
          amount: 100,
          amountCurrency: 100,
          amountGross: 100,
          amountGrossCurrency: 100,
        },
        {
          row: 2,
          account: { number: 1920, name: "Bank" },
          amount: -100,
          amountCurrency: -100,
          amountGross: -100,
          amountGrossCurrency: -100,
        },
      ],
    });
    console.log("Result:", vRes.ok ? "SUCCESS" : "FAILED");
  }

  // Test 2: Can we use POST /ledger/accountingDimensionValue with multiple creates in one call?
  // Try sending an array body
  console.log("\n=== TEST 2: Batch value create via array body ===");
  // First check existing dimensions
  const dimCheck = await api("GET", "/ledger/accountingDimensionName?fields=*");
  console.log("Existing dimensions:", JSON.stringify(dimCheck.json?.values?.map((d: any) => ({ name: d.dimensionName, index: d.dimensionIndex }))));
}

main().catch(console.error);
