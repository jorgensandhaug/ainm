const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "lOeg5qlKbs9aalun2ep4-N1j1FbG5mopWltDrlcWEjg";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const DATE = "2026-03-21";

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const res = await fetch(url, { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } });
  const body = await res.json();
  if (!res.ok) { console.error("ERROR", res.status, JSON.stringify(body)); process.exit(1); }
  return body;
}

// Step 1: Locate invoice
const invoices = await api("GET",
  "/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))"
);

const candidates = (invoices.values || []).filter((inv: any) => {
  if (inv.isCreditNote || inv.isCredited) return false;
  if (inv.customer?.organizationNumber !== "991882502") return false;
  if (inv.amountExcludingVatCurrency !== 13100 && inv.amountExcludingVat !== 13100) return false;
  const descs: string[] = [];
  for (const ol of inv.orderLines || []) descs.push(ol.description);
  for (const o of inv.orders || []) for (const ol of o.orderLines || []) descs.push(ol.description);
  return descs.includes("Opplæring");
});

if (candidates.length !== 1) { console.error("Expected 1 invoice, found", candidates.length); process.exit(1); }
const invoiceId = candidates[0].id;
console.log("Found invoice id:", invoiceId);

// Step 2: Create credit note
const cn = await api("PUT", `/invoice/${invoiceId}/:createCreditNote?date=${DATE}&sendToCustomer=false`);
console.log("Credit note created:", JSON.stringify({ id: cn.value?.id, invoiceNumber: cn.value?.invoiceNumber, isCreditNote: cn.value?.isCreditNote, creditedInvoice: cn.value?.creditedInvoice }));
