// Test: Can we eliminate the GET /ledger/account call by using account: { number: 8060 } in the voucher?
// The trusted standard says this fails with 422, but let's verify it's still the case.
// Also test: Can we get the paymentType bank account ID without the paymentType call?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.log("Error:", JSON.stringify(json).slice(0, 500));
  return { status: r.status, ok: r.ok, data: json };
}

async function main() {
  // Test 1: Can we use account: { number: 8060 } directly in voucher postings?
  console.log("=== Test 1: account by number (should fail 422) ===");
  const test1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-22",
    description: "Test agio - number only",
    postings: [
      { row: 1, date: "2026-03-22", account: { number: 1920 }, amountGross: 100, amountGrossCurrency: 100, vatType: { id: 0 }, description: "Test" },
      { row: 2, date: "2026-03-22", account: { number: 8060 }, amountGross: -100, amountGrossCurrency: -100, vatType: { id: 0 }, description: "Test" }
    ]
  });

  // Test 2: What if we look up both accounts in one call?
  console.log("\n=== Test 2: GET /ledger/account with comma-separated numbers ===");
  const test2 = await api("GET", "/ledger/account?number=1920,8060&fields=id,number");
  if (test2.ok) {
    console.log("Accounts:", JSON.stringify(test2.data.values));
  }

  // Test 3: Can we infer the bank account from the invoice's postings?
  console.log("\n=== Test 3: Check if invoice postings include bank account ===");
  const inv = await api("GET", "/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&fields=id,amountOutstanding,postings(*,account(*))&count=1");
  if (inv.ok && inv.data.values?.length > 0) {
    const firstInv = inv.data.values[0];
    console.log(`Invoice ${firstInv.id} postings:`, JSON.stringify(firstInv.postings?.map((p: any) => ({
      account: p.account?.number, amount: p.amountGross
    }))));
  }

  // Test 4: Check if paymentType is available via a lighter endpoint
  console.log("\n=== Test 4: Payment type count ===");
  const pt = await api("GET", "/invoice/paymentType?fields=id,description,debitAccount(id,number)&count=5");
  if (pt.ok) {
    console.log("Payment types:", JSON.stringify(pt.data.values?.map((p: any) => ({
      id: p.id, desc: p.description, acct: p.debitAccount?.number, acctId: p.debitAccount?.id
    }))));
  }
}

main().catch(console.error);
