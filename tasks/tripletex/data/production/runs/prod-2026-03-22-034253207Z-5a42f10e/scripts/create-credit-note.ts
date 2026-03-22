const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "E8jema3RH5ZbFyAIRYPnyvaGOUmwGlI673fT_TamVsE";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const DATE = "2026-03-22";

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: Locate the invoice
const locateUrl = `${BASE}/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-23&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;
console.log("GET", locateUrl);
const locateRes = await fetch(locateUrl, { headers });
if (!locateRes.ok) {
  console.error("Locate failed:", locateRes.status, await locateRes.text());
  process.exit(1);
}
const locateData = await locateRes.json();
const invoices = locateData.values || [];
console.log(`Found ${invoices.length} invoices total`);

// Filter to the target invoice
const candidates = invoices.filter((inv: any) => {
  if (inv.isCreditNote || inv.isCredited) return false;
  const custMatch = inv.customer?.organizationNumber === "949502619";
  if (!custMatch) return false;
  const amtMatch = inv.amountExcludingVatCurrency === 11250 || inv.amountExcludingVat === 11250;
  if (!amtMatch) return false;
  // Check description in orderLines and orders.orderLines
  const topDesc = (inv.orderLines || []).some((ol: any) => ol.description === "Programvarelisens");
  const nestedDesc = (inv.orders || []).some((o: any) =>
    (o.orderLines || []).some((ol: any) => ol.description === "Programvarelisens")
  );
  return topDesc || nestedDesc;
});

if (candidates.length !== 1) {
  console.error(`Expected 1 candidate, found ${candidates.length}`);
  if (candidates.length > 1) candidates.forEach((c: any) => console.log("  candidate id:", c.id));
  process.exit(1);
}

const targetId = candidates[0].id;
console.log(`Target invoice id: ${targetId}`);

// Step 2: Create credit note
const creditUrl = `${BASE}/invoice/${targetId}/:createCreditNote?date=${DATE}&sendToCustomer=false`;
console.log("PUT", creditUrl);
const creditRes = await fetch(creditUrl, { method: "PUT", headers });
if (!creditRes.ok) {
  console.error("Credit note failed:", creditRes.status, await creditRes.text());
  process.exit(1);
}
const creditData = await creditRes.json();
const cn = creditData.value;
console.log("Credit note created:");
console.log("  id:", cn.id);
console.log("  invoiceNumber:", cn.invoiceNumber);
console.log("  isCreditNote:", cn.isCreditNote);
console.log("  creditedInvoice:", cn.creditedInvoice);
console.log("  amountExcludingVatCurrency:", cn.amountExcludingVatCurrency);
console.log("Done. 2 API calls, 0 errors.");
