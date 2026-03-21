// Verify what vatType was auto-applied on the invoice without explicit vatType
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string) {
  const r = await fetch(`${BASE}${path}`, { method, headers: { "Authorization": AUTH } });
  return await r.json();
}

// Read back the invoice we just created (id 2147648832)
const inv = await api("GET", "/invoice/2147648832?fields=*");
console.log("Invoice amount:", inv.value?.amount);
console.log("Invoice amountExcludingVat:", inv.value?.amountExcludingVatCurrency);
console.log("Invoice projectInvoiceDetails:", inv.value?.projectInvoiceDetails?.length);

// Read the order line
const orderLines = await api("GET", "/order/orderline?orderId=402044418&fields=*");
console.log("OrderLine vatType:", JSON.stringify(orderLines.values?.[0]?.vatType));
console.log("OrderLine unitPriceExcludingVatCurrency:", orderLines.values?.[0]?.unitPriceExcludingVatCurrency);
console.log("OrderLine amountExcludingVatCurrency:", orderLines.values?.[0]?.amountExcludingVatCurrency);
