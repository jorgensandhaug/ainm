const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "ofYTMjxq5rHsGMZ3EoROhEl8H9KL9FcwiunN_oX5x8E";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const DATE = "2026-03-22";

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: Locate invoice
const getUrl = `${BASE}/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-23&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;
const getRes = await fetch(getUrl, { headers });
const getData = await getRes.json();

if (!getRes.ok) {
  console.error("GET /invoice failed:", getRes.status, JSON.stringify(getData));
  process.exit(1);
}

const invoices = getData.values || [];
const candidates = invoices.filter((inv: any) => {
  if (inv.isCreditNote || inv.isCredited) return false;
  if (inv.customer?.organizationNumber !== "902392165") return false;
  if (inv.amountExcludingVatCurrency !== 47350 && inv.amountExcludingVat !== 47350) return false;
  // Check description in orderLines and orders.orderLines
  const olDesc = (inv.orderLines || []).some((ol: any) => ol.description === "Programvarelisens");
  const nestedDesc = (inv.orders || []).some((o: any) =>
    (o.orderLines || []).some((ol: any) => ol.description === "Programvarelisens")
  );
  return olDesc || nestedDesc;
});

if (candidates.length === 0) {
  console.error("No matching invoice found");
  process.exit(1);
}

// Pick highest id (handles duplicates correctly)
const target = candidates.reduce((a: any, b: any) => (a.id > b.id ? a : b));
console.log(`Found invoice id=${target.id}, invoiceNumber=${target.invoiceNumber}, amount=${target.amountExcludingVatCurrency}`);

// Step 2: Create credit note
const putUrl = `${BASE}/invoice/${target.id}/:createCreditNote?date=${DATE}&sendToCustomer=false`;
const putRes = await fetch(putUrl, { method: "PUT", headers });
const putData = await putRes.json();

if (!putRes.ok) {
  console.error("PUT createCreditNote failed:", putRes.status, JSON.stringify(putData));
  process.exit(1);
}

const cn = putData.value;
console.log(`Credit note created: id=${cn.id}, invoiceNumber=${cn.invoiceNumber}, isCreditNote=${cn.isCreditNote}, creditedInvoice=${cn.creditedInvoice}`);
console.log("Done. 2 API calls, 0 errors.");
