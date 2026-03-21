/**
 * Sandbox readback: verify the invoice created in the previous script
 * to confirm order line description is preserved without product reference.
 */
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  console.log(`\n>>> ${method} ${url}`);
  const res = await fetch(url, {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  });
  const json = await res.json();
  console.log(`<<< ${res.status}`);
  console.log(JSON.stringify(json, null, 2));
  return json;
}

async function main() {
  // Read back the invoice created in the previous script
  const invoiceId = 2147631933;
  const inv = await api("GET", `/invoice/${invoiceId}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))`);

  // Check key fields
  const lines = inv.value?.orderLines || [];
  console.log("\n=== Order Line Readback ===");
  for (const line of lines) {
    console.log(`  description: ${line.description}`);
    console.log(`  product: ${JSON.stringify(line.product)}`);
    console.log(`  count: ${line.count}`);
    console.log(`  unitPriceExcludingVatCurrency: ${line.unitPriceExcludingVatCurrency}`);
    console.log(`  vatType: id=${line.vatType?.id} rate=${line.vatType?.percentage}%`);
  }
}

main().catch((e) => { console.error("\nFATAL:", e.message); process.exit(1); });
