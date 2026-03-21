const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { method, headers: H });
  const json = await r.json();
  console.log(`${method} ${path} -> ${r.status}`);
  return { ok: r.ok, status: r.status, json };
}

async function main() {
  // Read back the invoice we just created (id 2147635495) with expanded fields
  const res = await api("GET", "/invoice/2147635495?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))");
  if (!res.ok) {
    console.error("Readback failed:", JSON.stringify(res.json));
    return;
  }
  const inv = res.json.value;
  console.log("Invoice:", inv.id, "number:", inv.invoiceNumber);
  console.log("amountExcludingVatCurrency:", inv.amountExcludingVatCurrency);
  console.log("amountCurrency:", inv.amountCurrency);
  console.log("Lines:");
  for (const ol of inv.orderLines || []) {
    console.log(`  product: ${ol.product?.number} "${ol.product?.name}" | desc: "${ol.description}" | price: ${ol.unitPriceExcludingVatCurrency} | vat: ${ol.vatType?.percentage}%`);
  }
}

main();
