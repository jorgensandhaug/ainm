const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

// Quick sandbox verify: run the same locate query shape and confirm the API still works
const searchUrl = `${BASE}/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&count=5&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;
console.log("GET", searchUrl);
const res = await fetch(searchUrl, { headers });
console.log("Status:", res.status);
const data = await res.json();

if (!res.ok) {
  console.error("Failed:", JSON.stringify(data, null, 2));
  process.exit(1);
}

const invoices = data.values || [];
console.log("Invoices returned:", invoices.length);
console.log("Full result size:", data.fullResultSize);

// Show first invoice structure to confirm fields shape
if (invoices.length > 0) {
  const inv = invoices[0];
  console.log("Sample invoice:", {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    isCreditNote: inv.isCreditNote,
    isCredited: inv.isCredited,
    amountExcludingVatCurrency: inv.amountExcludingVatCurrency,
    customerOrgNr: inv.customer?.organizationNumber,
    customerName: inv.customer?.name,
    orderLineDescs: (inv.orderLines || []).map((ol: any) => ol.description),
    nestedOrderLineDescs: (inv.orders || []).flatMap((o: any) => (o.orderLines || []).map((ol: any) => ol.description)),
  });
}

console.log("\nSandbox API shape verified - same query structure works.");
