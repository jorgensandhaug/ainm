// Test if account: { number, name } works in POST /ledger/voucher (skipping GET /ledger/account)
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (res.status >= 400) console.error("ERROR:", JSON.stringify(json).slice(0, 800));
  return { status: res.status, json };
}

async function main() {
  // Test: account with both number and name
  console.log("=== Test 1: account: { number: 5000, name: 'Lønn til ansatte' } ===");
  const test1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    voucherType: { name: "Lønnsbilag" },
    date: "2026-11-20",
    description: "Test account by number+name",
    postings: [
      { account: { number: 5000, name: "Lønn til ansatte" }, description: "Test debit", amountGross: 500, amountGrossCurrency: 500, row: 1 },
      { account: { number: 1920, name: "Bankinnskudd" }, description: "Test credit", amountGross: -500, amountGrossCurrency: -500, row: 2 },
    ],
  });
  console.log("Result:", JSON.stringify(test1.json).slice(0, 500));

  if (test1.status === 201) {
    // Verify the voucher was created correctly
    const voucherId = test1.json.value?.id;
    if (voucherId) {
      const verify = await api("GET", `/ledger/voucher/${voucherId}?fields=*`);
      console.log("Verification:", JSON.stringify(verify.json).slice(0, 500));
    }
  }
}

main().catch(console.error);
