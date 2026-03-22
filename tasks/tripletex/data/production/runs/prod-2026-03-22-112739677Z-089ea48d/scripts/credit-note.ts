const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "4p2kkTaynJj4BdGPnejp8DjOiAuaNkfIClnM6CYlflg";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const DATE = "2026-03-22";

const ORG_NR = "879581265";
const DESCRIPTION = "Conseil en données";
const AMOUNT = 23750;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const res = await fetch(url, {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) {
    console.error(`HTTP ${res.status}:`, JSON.stringify(json).slice(0, 500));
    throw new Error(`HTTP ${res.status}`);
  }
  return json;
}

// Step 1: Locate the invoice
const invoices = await api("GET",
  `/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-23&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`
);

const candidates = (invoices.values || []).filter((inv: any) => {
  if (inv.isCreditNote || inv.isCredited) return false;
  if (inv.customer?.organizationNumber !== ORG_NR) return false;
  if (inv.amountExcludingVatCurrency !== AMOUNT && inv.amountExcludingVat !== AMOUNT) return false;
  const descs = new Set<string>();
  (inv.orderLines || []).forEach((l: any) => descs.add(l.description));
  (inv.orders || []).forEach((o: any) => (o.orderLines || []).forEach((l: any) => descs.add(l.description)));
  return descs.has(DESCRIPTION);
});

if (candidates.length === 0) {
  console.error("No matching invoice found");
  process.exit(1);
}

// Pick highest id if duplicates
const target = candidates.sort((a: any, b: any) => b.id - a.id)[0];
console.log(`Found invoice id=${target.id} number=${target.invoiceNumber} amount=${target.amountExcludingVatCurrency}`);

// Step 2: Create credit note
const cn = await api("PUT", `/invoice/${target.id}/:createCreditNote?date=${DATE}&sendToCustomer=false`);
const cnv = cn.value;
console.log(`Credit note created: id=${cnv.id} number=${cnv.invoiceNumber} isCreditNote=${cnv.isCreditNote} creditedInvoice=${cnv.creditedInvoice}`);
console.log("Done.");
