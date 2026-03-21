// Check EUR invoice amounts with and without currency(*) expansion
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  console.log(`\n${method} ${url}`);
  const r = await fetch(url, { method, headers });
  const text = await r.text();
  console.log(`  -> ${r.status}`);
  if (!r.ok) { console.log(`  ERR: ${text.slice(0,300)}`); return null; }
  return JSON.parse(text);
}

async function main() {
  // Check specific known EUR invoice from previous sandbox proof
  console.log("=== Invoice 2147581286 WITHOUT currency(*) ===");
  const r1 = await api("GET", "/invoice/2147581286?fields=*");
  if (r1?.value) {
    const v = r1.value;
    console.log(`amount=${v.amount} amountCurrency=${v.amountCurrency} amountOutstanding=${v.amountOutstanding} amountCurrencyOutstanding=${v.amountCurrencyOutstanding}`);
    console.log(`currency=${JSON.stringify(v.currency)}`);
  }

  console.log("\n=== Invoice 2147581286 WITH currency(*) ===");
  const r2 = await api("GET", "/invoice/2147581286?fields=*,currency(*)");
  if (r2?.value) {
    const v = r2.value;
    console.log(`amount=${v.amount} amountCurrency=${v.amountCurrency} amountOutstanding=${v.amountOutstanding} amountCurrencyOutstanding=${v.amountCurrencyOutstanding}`);
    console.log(`currency.code=${v.currency?.code}`);
  }

  // Also: search for invoices where customer org is 999532193 (the sandbox FX customer)
  console.log("\n=== All invoices for org 999532193 ===");
  const r3 = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2027-01-01&customerOrganizationNumber=999532193&fields=*,currency(*)&count=20");
  if (r3) {
    console.log(`Found ${r3.values?.length} invoices`);
    for (const inv of r3.values || []) {
      console.log(`  ID=${inv.id} currency=${inv.currency?.code} amount=${inv.amount} amountCurrency=${inv.amountCurrency} amountOutstanding=${inv.amountOutstanding} amountCurrencyOutstanding=${inv.amountCurrencyOutstanding}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
