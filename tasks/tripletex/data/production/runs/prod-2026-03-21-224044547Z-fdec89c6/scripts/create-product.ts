const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "0cg_E_hMfEmxlz7ONX4WD-G-0o_lGFfUk6e4y6zyjKU";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/product`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Training Session",
    number: 2451,
    priceExcludingVatCurrency: 20350,
  }),
});

const data = await res.json();
console.log("Status:", res.status);
console.log("Response:", JSON.stringify(data, null, 2));

// Verify 25% VAT from write response
const v = data.value;
if (v) {
  const expected = 20350 * 1.25;
  console.log(`\nVerification:`);
  console.log(`  name: ${v.name}`);
  console.log(`  number: ${v.number}`);
  console.log(`  priceExcludingVatCurrency: ${v.priceExcludingVatCurrency}`);
  console.log(`  priceIncludingVatCurrency: ${v.priceIncludingVatCurrency} (expected ${expected})`);
  console.log(`  vatType.id: ${v.vatType?.id}`);
  console.log(`  Match: ${v.priceIncludingVatCurrency === expected}`);
}
