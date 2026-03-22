const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "HW2fY1BL-126U040_8V32eE-XV0Hqqjxq0ICvk9KjW0";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: Locate the invoice
const searchUrl = `${BASE}/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-23&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;
const searchRes = await fetch(searchUrl, { headers: H });
const searchData = await searchRes.json();

if (!searchRes.ok) {
  console.error("GET /invoice failed:", searchRes.status, JSON.stringify(searchData));
  process.exit(1);
}

const invoices = searchData.values || [];
console.log(`Found ${invoices.length} invoices total`);

// Filter to the target invoice
const candidates = invoices.filter((inv: any) => {
  if (inv.isCreditNote || inv.isCredited) return false;
  if (inv.customer?.organizationNumber !== "989339028") return false;
  if (inv.amountExcludingVatCurrency !== 19650 && inv.amountExcludingVat !== 19650) return false;
  // Check description in orderLines and orders.orderLines
  const olMatch = inv.orderLines?.some((ol: any) => ol.description === "Maintenance");
  const nestedMatch = inv.orders?.some((o: any) => o.orderLines?.some((ol: any) => ol.description === "Maintenance"));
  return olMatch || nestedMatch;
});

if (candidates.length === 0) {
  console.error("No matching invoice found");
  process.exit(1);
}

// Pick highest id if multiple identical matches
const target = candidates.sort((a: any, b: any) => b.id - a.id)[0];
console.log(`Target invoice id=${target.id}, invoiceNumber=${target.invoiceNumber}, amount=${target.amountExcludingVatCurrency}`);

// Step 2: Create credit note
const creditUrl = `${BASE}/invoice/${target.id}/:createCreditNote?date=2026-03-22&sendToCustomer=false`;
const creditRes = await fetch(creditUrl, { method: "PUT", headers: H });
const creditData = await creditRes.json();

if (!creditRes.ok) {
  console.error("PUT :createCreditNote failed:", creditRes.status, JSON.stringify(creditData));
  process.exit(1);
}

const cn = creditData.value;
console.log(`Credit note created: id=${cn.id}, invoiceNumber=${cn.invoiceNumber}, isCreditNote=${cn.isCreditNote}, creditedInvoice=${cn.creditedInvoice}`);
console.log("Done. 2 API calls, 0 errors.");
