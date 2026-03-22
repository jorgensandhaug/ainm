// Test whether `currency: { id: 1 }` on voucher-level vs posting-level vs omitted matters

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("ERROR:", JSON.stringify(json, null, 2));
  return { status: res.status, data: json };
}

function unwrap(json: any) {
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

async function main() {
  // Get account IDs for 1500 and 3400
  const accsRes = await api("GET", "/ledger/account?number=1500,3400&fields=*");
  const accs = unwrap(accsRes.data);
  const acc1500 = accs.find((a: any) => a.number === 1500);
  const acc3400 = accs.find((a: any) => a.number === 3400);
  console.log(`1500 id=${acc1500.id}, 3400 id=${acc3400.id}`);

  // Get a customer ID
  const custRes = await api("GET", "/customer?count=1&fields=id,name");
  const cust = unwrap(custRes.data)[0];
  console.log(`Customer: id=${cust.id} name=${cust.name}`);

  // TEST 1: currency on voucher level (should fail)
  console.log("\n=== TEST 1: currency on voucher level ===");
  const t1 = await api("POST", "/ledger/voucher", {
    date: TODAY,
    description: "Test currency on voucher",
    voucherType: null,
    currency: { id: 1 },
    postings: [
      { row: 1, account: { id: acc1500.id }, customer: { id: cust.id }, amount: 10, amountCurrency: 10, amountGross: 10, amountGrossCurrency: 10 },
      { row: 2, account: { id: acc3400.id }, amount: -10, amountCurrency: -10, amountGross: -10, amountGrossCurrency: -10 },
    ],
  });
  console.log("Result:", t1.status);

  // TEST 2: currency on each posting (should work per playbook)
  console.log("\n=== TEST 2: currency on each posting ===");
  const t2 = await api("POST", "/ledger/voucher", {
    date: TODAY,
    description: "Test currency on postings",
    voucherType: null,
    postings: [
      { row: 1, account: { id: acc1500.id }, customer: { id: cust.id }, currency: { id: 1 }, amount: 10, amountCurrency: 10, amountGross: 10, amountGrossCurrency: 10 },
      { row: 2, account: { id: acc3400.id }, currency: { id: 1 }, amount: -10, amountCurrency: -10, amountGross: -10, amountGrossCurrency: -10 },
    ],
  });
  console.log("Result:", t2.status);

  // TEST 3: no currency anywhere (should work per production run)
  console.log("\n=== TEST 3: no currency at all ===");
  const t3 = await api("POST", "/ledger/voucher", {
    date: TODAY,
    description: "Test no currency",
    voucherType: null,
    postings: [
      { row: 1, account: { id: acc1500.id }, customer: { id: cust.id }, amount: 10, amountCurrency: 10, amountGross: 10, amountGrossCurrency: 10 },
      { row: 2, account: { id: acc3400.id }, amount: -10, amountCurrency: -10, amountGross: -10, amountGrossCurrency: -10 },
    ],
  });
  console.log("Result:", t3.status);

  // Summary
  console.log("\n=== SUMMARY ===");
  console.log(`Test 1 (voucher-level currency): ${t1.status}`);
  console.log(`Test 2 (posting-level currency): ${t2.status}`);
  console.log(`Test 3 (no currency): ${t3.status}`);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
