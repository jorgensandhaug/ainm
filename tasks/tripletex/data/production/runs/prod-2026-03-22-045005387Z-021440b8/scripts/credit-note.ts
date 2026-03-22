const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "nQrAvEUQ-oSjxOPyxMr_Ams97uVOlXSXXn6rhENLdQo";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };
const TODAY = "2026-03-22";

// Step 1: Locate the invoice
const getUrl = `${BASE}/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-23&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;
const res1 = await fetch(getUrl, { headers: H });
if (!res1.ok) { console.error("GET /invoice failed:", res1.status, await res1.text()); process.exit(1); }
const data = await res1.json();
const invoices = data.values || [];

// Find invoice matching org nr 871338140, description "Diseño web", amount 39850
const matches = invoices.filter((inv: any) => {
  if (inv.isCreditNote || inv.isCredited) return false;
  if (inv.customer?.organizationNumber !== "871338140") return false;
  if (inv.amountExcludingVatCurrency !== 39850) return false;
  const descs: string[] = [];
  for (const ol of (inv.orderLines || [])) descs.push(ol.description || "");
  for (const o of (inv.orders || [])) for (const ol of (o.orderLines || [])) descs.push(ol.description || "");
  return descs.some((d: string) => d === "Diseño web");
});

if (matches.length === 0) { console.error("No matching invoice found"); process.exit(1); }

// Pick highest id if duplicates
const target = matches.reduce((a: any, b: any) => (a.id > b.id ? a : b));
console.log("Found invoice id:", target.id, "amount:", target.amountExcludingVatCurrency);

// Step 2: Create credit note
const putUrl = `${BASE}/invoice/${target.id}/:createCreditNote?date=${TODAY}&sendToCustomer=false`;
const res2 = await fetch(putUrl, { method: "PUT", headers: H });
if (!res2.ok) { console.error("PUT createCreditNote failed:", res2.status, await res2.text()); process.exit(1); }
const cn = await res2.json();
console.log("Credit note created:", cn.value?.id, "isCreditNote:", cn.value?.isCreditNote, "creditedInvoice:", cn.value?.creditedInvoice);
