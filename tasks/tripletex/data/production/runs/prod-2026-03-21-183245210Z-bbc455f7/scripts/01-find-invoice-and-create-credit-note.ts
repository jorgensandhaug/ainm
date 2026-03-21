const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "d9luOmbt4aO5tHa5ly2p9lS8CUuqkAYvDcpyU-zT7AQ";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: Locate the invoice
const searchUrl = `${BASE}/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;
console.log("GET", searchUrl);
const searchRes = await fetch(searchUrl, { headers });
console.log("Status:", searchRes.status);
const searchData = await searchRes.json();

if (!searchRes.ok) {
  console.error("Search failed:", JSON.stringify(searchData, null, 2));
  process.exit(1);
}

const invoices = searchData.values || [];
console.log("Total invoices returned:", invoices.length);

// Find the invoice for Elvdal AS (812449982), "Datarådgjeving", 45300 excl. VAT
const target = invoices.find((inv: any) => {
  if (inv.isCreditNote || inv.isCredited) return false;
  if (inv.customer?.organizationNumber !== "812449982") return false;
  if (inv.amountExcludingVatCurrency !== 45300) return false;

  // Check description in orderLines and orders.orderLines
  const topDesc = (inv.orderLines || []).some((ol: any) => ol.description === "Datarådgjeving");
  const nestedDesc = (inv.orders || []).some((o: any) =>
    (o.orderLines || []).some((ol: any) => ol.description === "Datarådgjeving")
  );
  return topDesc || nestedDesc;
});

if (!target) {
  console.error("No matching invoice found");
  console.log("Candidates with org 812449982:", invoices.filter((i: any) => i.customer?.organizationNumber === "812449982").map((i: any) => ({
    id: i.id,
    amount: i.amountExcludingVatCurrency,
    isCreditNote: i.isCreditNote,
    isCredited: i.isCredited,
    orderLines: (i.orderLines || []).map((ol: any) => ol.description),
  })));
  process.exit(1);
}

console.log("Found invoice:", target.id, "invoiceNumber:", target.invoiceNumber, "amount:", target.amountExcludingVatCurrency);

// Step 2: Create credit note
const creditUrl = `${BASE}/invoice/${target.id}/:createCreditNote?date=2026-03-21&sendToCustomer=false`;
console.log("PUT", creditUrl);
const creditRes = await fetch(creditUrl, { method: "PUT", headers });
console.log("Status:", creditRes.status);
const creditData = await creditRes.json();

if (!creditRes.ok) {
  console.error("Credit note creation failed:", JSON.stringify(creditData, null, 2));
  process.exit(1);
}

const cn = creditData.value;
console.log("Credit note created:");
console.log("  id:", cn.id);
console.log("  invoiceNumber:", cn.invoiceNumber);
console.log("  isCreditNote:", cn.isCreditNote);
console.log("  creditedInvoice:", cn.creditedInvoice);
console.log("  amountExcludingVatCurrency:", cn.amountExcludingVatCurrency);
console.log("  customer:", cn.customer?.name, cn.customer?.organizationNumber);
