const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "YQIHkw1lIuFEyqfC56zYGOvPE84JwXvVZoYoqtPsUes";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const today = "2026-03-22";
const tomorrow = "2026-03-23";

// Step 1: Locate the invoice
const locateUrl = `${BASE}/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=${tomorrow}&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;
const locateRes = await fetch(locateUrl, { headers: H });
if (!locateRes.ok) { console.error("Locate failed:", locateRes.status, await locateRes.text()); process.exit(1); }
const locateData = await locateRes.json();
const invoices = locateData.values || [];

// Filter: org 900993560, description "Maintenance", amount 30500, not credit note, not credited
const candidates = invoices.filter((inv: any) => {
  if (inv.isCreditNote || inv.isCredited) return false;
  if (inv.customer?.organizationNumber !== "900993560") return false;
  if (inv.amountExcludingVatCurrency !== 30500) return false;
  const descs: string[] = [];
  (inv.orderLines || []).forEach((ol: any) => descs.push(ol.description));
  (inv.orders || []).forEach((o: any) => (o.orderLines || []).forEach((ol: any) => descs.push(ol.description)));
  return descs.some((d: string) => d === "Maintenance");
});

if (candidates.length === 0) { console.error("No matching invoice found"); process.exit(1); }

// Pick highest id if duplicates
const target = candidates.reduce((a: any, b: any) => a.id > b.id ? a : b);
console.log("Found invoice:", target.id, "invoiceNumber:", target.invoiceNumber, "amount:", target.amountExcludingVatCurrency);

// Step 2: Create credit note
const creditUrl = `${BASE}/invoice/${target.id}/:createCreditNote?date=${today}&sendToCustomer=false`;
const creditRes = await fetch(creditUrl, { method: "PUT", headers: H });
if (!creditRes.ok) { console.error("Credit note failed:", creditRes.status, await creditRes.text()); process.exit(1); }
const creditData = await creditRes.json();
const cn = creditData.value;
console.log("Credit note created:", cn.id, "invoiceNumber:", cn.invoiceNumber, "isCreditNote:", cn.isCreditNote, "creditedInvoice:", cn.creditedInvoice, "amount:", cn.amountCurrency);
