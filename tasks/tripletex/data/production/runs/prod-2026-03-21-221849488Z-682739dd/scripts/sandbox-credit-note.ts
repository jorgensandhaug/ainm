const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "RCV6cANvdwbEEsb19MG57JMhEqRRtW1AZ2BMy_eV4mg";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: Find the invoice for Nordlicht GmbH (912435113), "Webdesign", 40550 excl VAT
const getUrl = `${BASE}/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;
const getRes = await fetch(getUrl, { headers: H });
const getData = await getRes.json();

if (!getRes.ok) {
  console.error("GET /invoice failed:", getRes.status, JSON.stringify(getData));
  process.exit(1);
}

const invoices = getData.values || [];
const target = invoices.find((inv: any) => {
  if (inv.isCreditNote || inv.isCredited) return false;
  const custMatch = inv.customer?.organizationNumber === "912435113";
  if (!custMatch) return false;
  const amountMatch = inv.amountExcludingVatCurrency === 40550;
  if (!amountMatch) return false;
  // Check description in orderLines and orders.orderLines
  const olDesc = (inv.orderLines || []).some((ol: any) => ol.description === "Webdesign");
  const nestedDesc = (inv.orders || []).some((o: any) =>
    (o.orderLines || []).some((ol: any) => ol.description === "Webdesign")
  );
  return olDesc || nestedDesc;
});

if (!target) {
  console.error("No matching invoice found. Total invoices:", invoices.length);
  // Log org numbers for debug
  const orgs = invoices.map((i: any) => i.customer?.organizationNumber).filter(Boolean);
  console.error("Org numbers in invoices:", [...new Set(orgs)]);
  process.exit(1);
}

console.log("Found invoice id:", target.id, "invoiceNumber:", target.invoiceNumber);

// Step 2: Create credit note
const creditUrl = `${BASE}/invoice/${target.id}/:createCreditNote?date=2026-03-21&sendToCustomer=false`;
const creditRes = await fetch(creditUrl, { method: "PUT", headers: H });
const creditData = await creditRes.json();

if (!creditRes.ok) {
  console.error("PUT createCreditNote failed:", creditRes.status, JSON.stringify(creditData));
  process.exit(1);
}

console.log("Credit note created:");
console.log("  id:", creditData.value?.id);
console.log("  invoiceNumber:", creditData.value?.invoiceNumber);
console.log("  isCreditNote:", creditData.value?.isCreditNote);
console.log("  creditedInvoice:", creditData.value?.creditedInvoice);
console.log("Done.");
