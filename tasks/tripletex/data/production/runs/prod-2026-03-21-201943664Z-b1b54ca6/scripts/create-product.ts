const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "T4PaU1jsU1y9PaiNqJVX8o9AaVxuosE2aXg1PcTGbXg";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: Resolve 0% OUTGOING VAT type
const vatDate = "2026-03-21";
const vatUrl = `${BASE}/ledger/vatType?typeOfVat=OUTGOING&vatDate=${vatDate}&fields=*`;
console.log("GET", vatUrl);
const vatRes = await fetch(vatUrl, { headers: H });
const vatBody = await vatRes.json();
console.log("VAT status:", vatRes.status);

if (!vatRes.ok) {
  console.error("VAT lookup failed:", JSON.stringify(vatBody));
  process.exit(1);
}

const vatTypes = vatBody.values || [];
const zeroVat = vatTypes.find((v: any) => v.percentage === 0);
if (!zeroVat) {
  console.error("No 0% OUTGOING VAT found. Available:", vatTypes.map((v: any) => `id=${v.id} ${v.percentage}%`));
  process.exit(1);
}
console.log("Found 0% VAT:", JSON.stringify({ id: zeroVat.id, name: zeroVat.name, percentage: zeroVat.percentage }));

// Step 2: Create product
const product = {
  name: "Livro de receitas",
  number: 7946,
  priceExcludingVatCurrency: 18250,
  vatType: { id: zeroVat.id },
};
console.log("\nPOST /product", JSON.stringify(product));
const createRes = await fetch(`${BASE}/product`, { method: "POST", headers: H, body: JSON.stringify(product) });
const createBody = await createRes.json();
console.log("Create status:", createRes.status);
console.log("Response:", JSON.stringify(createBody, null, 2));

if (!createRes.ok) {
  console.error("Product creation failed");
  process.exit(1);
}

const v = createBody.value;
console.log("\n=== VERIFICATION ===");
console.log("id:", v.id);
console.log("name:", v.name);
console.log("number:", v.number);
console.log("priceExcludingVatCurrency:", v.priceExcludingVatCurrency);
console.log("priceIncludingVatCurrency:", v.priceIncludingVatCurrency);
console.log("vatType.id:", v.vatType?.id);
console.log("vatType.percentage:", v.vatType?.percentage);
