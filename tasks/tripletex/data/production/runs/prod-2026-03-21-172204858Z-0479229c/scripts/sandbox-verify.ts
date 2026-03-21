// Sandbox verification: test if there's any way to reduce calls for year-end closing
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`  → ${res.status}`, JSON.stringify(data).slice(0, 800));
  return { status: res.status, data, ok: res.ok };
}

async function main() {
  console.log("=== Test 1: Check if /ledger/voucher/list POST works (batch create vouchers) ===");
  // The playbook says it's PUT-only, let's verify
  const testVouchers = [{
    date: "2025-12-31",
    description: "Test batch voucher 1",
    postings: [
      { row: 1, account: { id: 466552505 }, amountGross: 100, amountGrossCurrency: 100, description: "Test debit" },
      { row: 2, account: { id: 466530642 }, amountGross: -100, amountGrossCurrency: -100, description: "Test credit" },
    ],
  }];
  const batchRes = await api("POST", "/ledger/voucher/list", testVouchers);
  console.log("Batch voucher POST result:", batchRes.status, batchRes.ok ? "SUCCESS" : "FAILED");

  console.log("\n=== Test 2: Verify accounts 1209, 8700 exist in sandbox (from prior runs) ===");
  const acctRes = await api("GET", "/ledger/account?number=1209,6010,1700,6300,8700,2920&fields=id,number,name&count=100");

  console.log("\n=== Test 3: Test balance sheet endpoint ===");
  const bsRes = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8700&fields=*,account(id,number,name)&count=1000");

  console.log("\n=== Test 4: Can we use accountNumberTo=8699 instead of 8700? (to be sure it excludes 8700) ===");
  const bsRes2 = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8699&fields=*,account(id,number,name)&count=1000");
  console.log("8700 excl:", bsRes.data?.fullResultSize, "vs 8699 excl:", bsRes2.data?.fullResultSize);

  console.log("\n=== Test 5: Verify single voucher POST works with correct row numbering ===");
  // Use accounts from sandbox
  const accounts = {};
  if (acctRes.ok) {
    for (const a of acctRes.data.values || []) {
      accounts[a.number] = a.id;
    }
  }
  console.log("Sandbox accounts:", accounts);

  if (accounts[6010] && accounts[1209]) {
    const vRes = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Sandbox test avskrivning",
      postings: [
        { row: 1, account: { id: accounts[6010] }, amountGross: 22290, amountGrossCurrency: 22290, description: "Test avskrivning" },
        { row: 2, account: { id: accounts[1209] }, amountGross: -22290, amountGrossCurrency: -22290, description: "Test akk avskrivning" },
      ],
    });
    console.log("Single voucher POST:", vRes.status, vRes.ok ? "SUCCESS" : "FAILED");
  }

  console.log("\n=== Summary ===");
  console.log("Batch voucher POST supported:", batchRes.ok);
  console.log("The playbook's 8-call path (with missing accounts) is the minimum.");
}

main().catch(e => { console.error(e); process.exit(1); });
