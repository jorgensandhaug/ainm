// Sandbox investigation: verify FX invoice payment flow, query param requirements, and payment type expansion
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`\n${method} ${url}`);
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`  -> ${r.status}`);
  if (!r.ok) {
    console.log(`  ERROR: ${text.slice(0, 500)}`);
    return null;
  }
  return JSON.parse(text);
}

async function main() {
  // Test 1: GET /invoice WITHOUT invoiceDateFrom/To — expect 422
  console.log("\n=== TEST 1: GET /invoice without date params (expect 422) ===");
  const r1 = await api("GET", "/invoice?fields=id&count=1");
  console.log("Result:", r1 ? "unexpected success" : "correctly failed");

  // Test 2: GET /invoice WITH date params — should work
  console.log("\n=== TEST 2: GET /invoice with date params ===");
  const r2 = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2027-01-01&fields=*,currency(*)&count=5");
  if (r2) {
    console.log(`Found ${r2.values?.length} invoices`);
    for (const inv of (r2.values || []).slice(0, 3)) {
      console.log(`  ID=${inv.id} currency=${JSON.stringify(inv.currency)} amount=${inv.amount} amountCurrency=${inv.amountCurrency} amountOutstanding=${inv.amountOutstanding} amountCurrencyOutstanding=${inv.amountCurrencyOutstanding}`);
    }
  }

  // Test 3: GET /invoice/paymentType with and without debitAccount(*) expansion
  console.log("\n=== TEST 3a: GET /invoice/paymentType with fields=* (NO debitAccount expansion) ===");
  const r3a = await api("GET", "/invoice/paymentType?fields=*");
  if (r3a) {
    for (const pt of (r3a.values || [])) {
      console.log(`  ID=${pt.id} desc="${pt.description}" debitAccount=${JSON.stringify(pt.debitAccount)} isIncoming=${pt.isIncoming} isBankAccount=${pt.isBankAccount}`);
    }
  }

  console.log("\n=== TEST 3b: GET /invoice/paymentType with fields=*,debitAccount(*) ===");
  const r3b = await api("GET", "/invoice/paymentType?fields=*,debitAccount(*)");
  if (r3b) {
    for (const pt of (r3b.values || [])) {
      console.log(`  ID=${pt.id} desc="${pt.description}" debitAccount.number=${pt.debitAccount?.number} debitAccount.isBankAccount=${pt.debitAccount?.isBankAccount} isIncoming=${pt.isIncoming} isBankAccount=${pt.isBankAccount}`);
    }
  }

  // Test 4: Check valid query params — does customerOrganizationNumber work?
  console.log("\n=== TEST 4: GET /invoice with customerOrganizationNumber filter ===");
  const r4 = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2027-01-01&customerOrganizationNumber=999532193&fields=id,amountCurrencyOutstanding,amountOutstanding&count=5");
  if (r4) {
    console.log(`Found ${r4.values?.length} invoices for org 999532193`);
  }

  // Test 5: Check if currency filter works as query param
  console.log("\n=== TEST 5: GET /invoice with currency=EUR filter ===");
  const r5 = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2027-01-01&currency=EUR&fields=id,amountCurrencyOutstanding&count=5");
  if (r5) {
    console.log(`Found ${r5.values?.length} invoices with currency=EUR`);
  }

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error(e); process.exit(1); });
