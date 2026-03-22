const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "aln874Pfay8mPUAst714CZoUF8Fte38mn0Dv-MaN9l4";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: locate the invoice
const getUrl =
  `${BASE}/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-23` +
  `&count=1000&sorting=-invoiceDate` +
  `&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;

const res1 = await fetch(getUrl, { headers: H });
if (!res1.ok) {
  console.error("GET /invoice failed:", res1.status, await res1.text());
  process.exit(1);
}
const data = await res1.json();
const invoices = data.values || [];

// Find the invoice for Brückentor GmbH (901668566), "Webdesign", 38800 NOK ex-VAT
const target = invoices.find((inv: any) => {
  if (inv.isCreditNote || inv.isCredited) return false;
  if (inv.customer?.organizationNumber !== "901668566") return false;
  if (inv.amountExcludingVatCurrency !== 38800) return false;
  // Check description in orderLines or orders.orderLines
  const olMatch = inv.orderLines?.some((ol: any) => ol.description === "Webdesign");
  const oolMatch = inv.orders?.some((o: any) =>
    o.orderLines?.some((ol: any) => ol.description === "Webdesign")
  );
  return olMatch || oolMatch;
});

if (!target) {
  console.error("No matching invoice found");
  console.log("Total invoices:", invoices.length);
  process.exit(1);
}

console.log("Found invoice:", target.id, "number:", target.invoiceNumber);

// Step 2: create credit note
const putUrl = `${BASE}/invoice/${target.id}/:createCreditNote?date=2026-03-22&sendToCustomer=false`;
const res2 = await fetch(putUrl, { method: "PUT", headers: H });
if (!res2.ok) {
  console.error("PUT createCreditNote failed:", res2.status, await res2.text());
  process.exit(1);
}
const cn = await res2.json();
const v = cn.value;
console.log("Credit note created:");
console.log("  id:", v.id);
console.log("  invoiceNumber:", v.invoiceNumber);
console.log("  isCreditNote:", v.isCreditNote);
console.log("  creditedInvoice:", v.creditedInvoice);
console.log("  amountExcludingVatCurrency:", v.amountExcludingVatCurrency);
