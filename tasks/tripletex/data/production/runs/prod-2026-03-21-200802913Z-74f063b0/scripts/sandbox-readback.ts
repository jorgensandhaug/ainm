const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  // Readback the invoice created in the previous test
  const r = await fetch(BASE + "/invoice/2147633240?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))", { headers: H });
  const body = await r.json();
  console.log(`GET /invoice/2147633240 -> ${r.status}`);
  const inv = body.value;
  console.log("Invoice:", inv.id, "number:", inv.invoiceNumber);
  console.log("Customer:", inv.customer?.name, "org:", inv.customer?.organizationNumber);
  console.log("amountExcludingVatCurrency:", inv.amountExcludingVatCurrency);
  console.log("amountCurrency:", inv.amountCurrency);

  // Check order lines
  for (const order of inv.orders || []) {
    console.log("\nOrder:", order.id);
    for (const line of order.orderLines || []) {
      console.log(`  Line: product#${line.product?.number} "${line.description}" price=${line.unitPriceExcludingVatCurrency} vatType.id=${line.vatType?.id} vat%=${line.vatType?.percentage}`);
    }
  }

  // Also check top-level orderLines
  console.log("\nTop-level orderLines:");
  for (const line of inv.orderLines || []) {
    console.log(`  Line: product#${line.product?.number} "${line.description}" price=${line.unitPriceExcludingVatCurrency} vatType.id=${line.vatType?.id} vat%=${line.vatType?.percentage}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
