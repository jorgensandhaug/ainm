const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "bnSYweTG54yCWNa8GQtz-weg0rjrczQOTDu8cqfDv9c";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const DATE = "2026-03-22";

const ORG_NR = "802788037";
const DESCRIPTION = "Asesoría de datos";
const AMOUNT_EX_VAT = 8550;

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const res = await fetch(url, { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } });
  const body = await res.json();
  if (!res.ok) { console.error("ERROR", res.status, JSON.stringify(body)); process.exit(1); }
  return body;
}

// Step 1: Locate invoice
const locateRes = await api("GET",
  `/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-23&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`
);

const invoices = (locateRes.values || []).filter((inv: any) => {
  if (inv.isCreditNote || inv.isCredited) return false;
  if (inv.customer?.organizationNumber !== ORG_NR) return false;
  if (inv.amountExcludingVatCurrency !== AMOUNT_EX_VAT && inv.amountExcludingVat !== AMOUNT_EX_VAT) return false;
  const olDescs = (inv.orderLines || []).map((ol: any) => ol.description);
  const nestedDescs = (inv.orders || []).flatMap((o: any) => (o.orderLines || []).map((ol: any) => ol.description));
  const allDescs = [...olDescs, ...nestedDescs];
  return allDescs.some((d: string) => d === DESCRIPTION);
});

if (invoices.length === 0) { console.error("No matching invoice found"); process.exit(1); }

// Pick highest id if duplicates
const target = invoices.reduce((a: any, b: any) => (a.id > b.id ? a : b));
console.log(`Found invoice id=${target.id} number=${target.invoiceNumber} amount=${target.amountExcludingVatCurrency}`);

// Step 2: Create credit note
const cnRes = await api("PUT", `/invoice/${target.id}/:createCreditNote?date=${DATE}&sendToCustomer=false`);
const cn = cnRes.value;
console.log(`Credit note created: id=${cn.id} number=${cn.invoiceNumber} isCreditNote=${cn.isCreditNote} creditedInvoice=${cn.creditedInvoice} amount=${cn.amountExcludingVatCurrency}`);
