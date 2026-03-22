const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "TBEtBNrp_UM2S-zNhghkSl5X8rxD14_6ZsIMpunxbzQ";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: Locate the invoice
const searchUrl = `${BASE}/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-23&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;
const searchRes = await fetch(searchUrl, { headers: H });
if (!searchRes.ok) { console.error("GET /invoice failed:", searchRes.status, await searchRes.text()); process.exit(1); }
const searchData = await searchRes.json();
const invoices = searchData.values || [];

// Find the invoice for Lysgård AS (866100829) with "Webdesign" and 9900 excl. VAT
const match = invoices.filter((inv: any) => {
  if (inv.isCreditNote || inv.isCredited) return false;
  const orgMatch = inv.customer?.organizationNumber === "866100829";
  if (!orgMatch) return false;
  const amountMatch = inv.amountExcludingVatCurrency === 9900;
  if (!amountMatch) return false;
  // Check description in orderLines or orders.orderLines
  const olDesc = (inv.orderLines || []).some((ol: any) => ol.description === "Webdesign");
  const nestedDesc = (inv.orders || []).some((o: any) => (o.orderLines || []).some((ol: any) => ol.description === "Webdesign"));
  return olDesc || nestedDesc;
});

if (match.length !== 1) {
  console.error(`Expected 1 invoice match, found ${match.length}`);
  if (match.length === 0) {
    // Debug: show all invoices for this org
    const orgInvs = invoices.filter((inv: any) => inv.customer?.organizationNumber === "866100829" && !inv.isCreditNote && !inv.isCredited);
    console.error("Invoices for org 866100829:", JSON.stringify(orgInvs.map((i: any) => ({ id: i.id, amount: i.amountExcludingVatCurrency, orderLines: i.orderLines?.map((ol: any) => ol.description), nestedOL: i.orders?.map((o: any) => o.orderLines?.map((ol: any) => ol.description)) })), null, 2));
  }
  process.exit(1);
}

const invoiceId = match[0].id;
console.log("Found invoice id:", invoiceId);

// Step 2: Create credit note
const creditUrl = `${BASE}/invoice/${invoiceId}/:createCreditNote?date=2026-03-22&sendToCustomer=false`;
const creditRes = await fetch(creditUrl, { method: "PUT", headers: H });
if (!creditRes.ok) { console.error("PUT createCreditNote failed:", creditRes.status, await creditRes.text()); process.exit(1); }
const creditData = await creditRes.json();
const cn = creditData.value;
console.log("Credit note created:");
console.log("  id:", cn.id);
console.log("  invoiceNumber:", cn.invoiceNumber);
console.log("  isCreditNote:", cn.isCreditNote);
console.log("  creditedInvoice:", cn.creditedInvoice);
console.log("  amountExcludingVatCurrency:", cn.amountExcludingVatCurrency);
