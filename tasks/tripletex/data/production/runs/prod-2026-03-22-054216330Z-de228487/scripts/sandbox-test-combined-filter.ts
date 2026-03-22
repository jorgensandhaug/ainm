// Test: comma-separated account numbers with and without isApplicableForSupplierInvoice filter
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function test(label: string, path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: AUTH } });
  const data = await res.json();
  console.log(`\n${label}`);
  console.log(`GET ${path} -> ${res.status}`);
  if (data.values) {
    console.log(`Found ${data.values.length} accounts:`);
    for (const v of data.values) {
      console.log(`  ${v.number} -> id=${v.id}`);
    }
  }
}

async function main() {
  // With isApplicableForSupplierInvoice=true
  await test("Combined + isApplicableForSupplierInvoice=true", "/ledger/account?number=6300%2C2400&isApplicableForSupplierInvoice=true&fields=id,number");

  // Without filter
  await test("Combined, no filter", "/ledger/account?number=6300%2C2400&fields=id,number");

  // Single expense account with filter
  await test("6300 only + filter", "/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=id,number");

  // Single supplier account with filter
  await test("2400 only + filter", "/ledger/account?number=2400&isApplicableForSupplierInvoice=true&fields=id,number");
}

main().catch(console.error);
