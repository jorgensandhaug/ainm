// Test: can we get both account 6300 and 2400 in a single API call?
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
  } else {
    console.log(JSON.stringify(data).slice(0, 300));
  }
}

async function main() {
  // Test 1: numberFrom/numberTo range
  await test("Test 1: numberFrom=2400&numberTo=6300", "/ledger/account?numberFrom=2400&numberTo=6300&fields=id,number");

  // Test 2: Multiple number params?
  await test("Test 2: number=6300 (single)", "/ledger/account?number=6300&fields=id,number");

  // Test 3: number as comma-separated
  await test("Test 3: number=6300,2400", "/ledger/account?number=6300%2C2400&fields=id,number");

  // Test 4: id filter - can we use the supplier response to get account 2400 id?
  // The supplier response should have a linked account (vendorAccountId or similar)
  // Let's check the supplier schema for this
  await test("Test 4: number=2400", "/ledger/account?number=2400&fields=id,number");

  // Test 5: Can we use numberListFilter?
  await test("Test 5: numberListFilter", "/ledger/account?numberListFilter=6300;2400&fields=id,number");
}

main().catch(console.error);
