const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "3sQ1py3KyAddA8bSnN_X8ZnIS5s_JBsnQc2GVDUg6gw";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const DATE = "2026-03-22";

const ORG = "910441930";
const DESC = "Rapport d'analyse";
const AMOUNT = 6150;

async function run() {
  // Step 1: Locate the invoice
  const getUrl = `${BASE}/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-23&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;
  const getRes = await fetch(getUrl, { headers: { Authorization: AUTH } });
  if (!getRes.ok) throw new Error(`GET /invoice failed: ${getRes.status} ${await getRes.text()}`);
  const data = await getRes.json();
  const invoices = data.values || [];

  // Filter to find the matching invoice
  const candidates = invoices.filter((inv: any) => {
    if (inv.isCreditNote || inv.isCredited) return false;
    if (inv.customer?.organizationNumber !== ORG) return false;
    if (inv.amountExcludingVatCurrency !== AMOUNT && inv.amountExcludingVat !== AMOUNT) return false;
    // Check description in orderLines and orders.orderLines
    const olDescs = (inv.orderLines || []).map((ol: any) => ol.description);
    const nestedDescs = (inv.orders || []).flatMap((o: any) => (o.orderLines || []).map((ol: any) => ol.description));
    const allDescs = [...olDescs, ...nestedDescs];
    return allDescs.some((d: string) => d === DESC);
  });

  if (candidates.length === 0) throw new Error("No matching invoice found");

  // Pick highest id if multiple identical matches
  const target = candidates.reduce((a: any, b: any) => (a.id > b.id ? a : b));
  console.log(`Found invoice id=${target.id}, invoiceNumber=${target.invoiceNumber}, amount=${target.amountExcludingVatCurrency}`);

  // Step 2: Create credit note
  const putUrl = `${BASE}/invoice/${target.id}/:createCreditNote?date=${DATE}&sendToCustomer=false`;
  const putRes = await fetch(putUrl, { method: "PUT", headers: { Authorization: AUTH } });
  if (!putRes.ok) throw new Error(`PUT createCreditNote failed: ${putRes.status} ${await putRes.text()}`);
  const cn = await putRes.json();
  const v = cn.value;
  console.log(`Credit note created: id=${v.id}, invoiceNumber=${v.invoiceNumber}, isCreditNote=${v.isCreditNote}, creditedInvoice=${v.creditedInvoice}`);
}

run().catch((e) => { console.error(e); process.exit(1); });
