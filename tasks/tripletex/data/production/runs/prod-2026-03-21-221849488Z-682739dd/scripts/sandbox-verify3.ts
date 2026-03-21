// Complete sandbox verification
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const orderId = 402041596;

// Invoice the order
const invRes = await fetch(`${BASE}/order/${orderId}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false`, {
  method: "PUT",
  headers: H,
});
const invData = await invRes.json();
console.log("Invoice created:", invRes.status, "id:", invData.value?.id, "invoiceNumber:", invData.value?.invoiceNumber);

if (!invRes.ok) {
  console.error("Invoice creation failed:", JSON.stringify(invData));
  process.exit(1);
}

// Now test the actual two-call path
console.log("\n=== TWO-CALL PATH TEST ===");

// Call 1: GET /invoice to locate
const getUrl = `${BASE}/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;
const getRes = await fetch(getUrl, { headers: H });
const getData = await getRes.json();
console.log("GET /invoice:", getRes.status, "total invoices:", getData.count);

const target = (getData.values || []).find((inv: any) => {
  if (inv.isCreditNote || inv.isCredited) return false;
  const custMatch = inv.customer?.organizationNumber === "912435113";
  if (!custMatch) return false;
  const amountMatch = inv.amountExcludingVatCurrency === 40550;
  if (!amountMatch) return false;
  const olDesc = (inv.orderLines || []).some((ol: any) => ol.description === "Webdesign");
  const nestedDesc = (inv.orders || []).some((o: any) =>
    (o.orderLines || []).some((ol: any) => ol.description === "Webdesign")
  );
  return olDesc || nestedDesc;
});

if (!target) {
  console.error("No matching invoice found!");
  // Debug: show invoices
  for (const inv of (getData.values || []).slice(0, 5)) {
    console.log("  inv id:", inv.id, "org:", inv.customer?.organizationNumber, "amount:", inv.amountExcludingVatCurrency, "creditNote:", inv.isCreditNote, "credited:", inv.isCredited);
  }
  process.exit(1);
}
console.log("Located invoice id:", target.id, "amount:", target.amountExcludingVatCurrency);

// Call 2: PUT createCreditNote
const creditUrl = `${BASE}/invoice/${target.id}/:createCreditNote?date=2026-03-21&sendToCustomer=false`;
const creditRes = await fetch(creditUrl, { method: "PUT", headers: H });
const creditData = await creditRes.json();
console.log("PUT createCreditNote:", creditRes.status);
console.log("  id:", creditData.value?.id);
console.log("  isCreditNote:", creditData.value?.isCreditNote);
console.log("  creditedInvoice:", creditData.value?.creditedInvoice);

if (creditData.value?.isCreditNote && creditData.value?.creditedInvoice === target.id) {
  console.log("\n✓ Two-call path verified for organizationNumber=912435113, description='Webdesign', amountExcludingVatCurrency=40550");
} else {
  console.error("\n✗ Verification failed!");
}
