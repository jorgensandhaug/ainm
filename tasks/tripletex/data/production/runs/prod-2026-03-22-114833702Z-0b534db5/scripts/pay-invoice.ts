const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "sa-eL924-qzR-2BBKpQi51caGrdm_iXRetAB9gFyXr0";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";

const ORG = "891380690";
const EX_VAT = 10100;
const DESC = "Konsulenttimer";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`${method} ${path} → ${r.status}`);
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (r.status >= 400) { console.log(JSON.stringify(json, null, 2)); throw new Error(`${r.status}`); }
  return json;
}

function extract(json: any) {
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

async function main() {
  // Step 1: Locate the invoice
  const invoices = extract(await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))"));

  const match = invoices.find((inv: any) => {
    if (inv.customer?.organizationNumber !== ORG) return false;
    if (inv.amountExcludingVatCurrency !== EX_VAT && inv.amountExcludingVat !== EX_VAT) return false;
    if ((inv.amountCurrencyOutstanding || inv.amountOutstanding || 0) <= 0) return false;
    // Check description in orderLines or orders.orderLines
    const descs: string[] = [];
    (inv.orderLines || []).forEach((ol: any) => { if (ol.description) descs.push(ol.description); });
    (inv.orders || []).forEach((o: any) => (o.orderLines || []).forEach((ol: any) => { if (ol.description) descs.push(ol.description); }));
    return descs.some((d: string) => d.includes(DESC));
  });

  if (!match) { console.log("No matching invoice found"); return; }
  const invoiceId = match.id;
  const outstanding = match.amountCurrencyOutstanding ?? match.amountOutstanding;
  console.log(`Found invoice ${match.invoiceNumber} (id=${invoiceId}), outstanding=${outstanding}`);

  // Step 2: Get payment types
  const ptypes = extract(await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)"));

  let pt = ptypes.find((p: any) => p.description === "Betalt til bank");
  if (!pt) pt = ptypes.find((p: any) => {
    const dn = p.debitAccount?.number;
    return dn && String(dn).startsWith("19");
  });
  if (!pt) pt = ptypes[0];

  console.log(`Using paymentType ${pt.id} (${pt.description})`);

  // Step 3: Register payment
  const payResult = await api("PUT", `/invoice/${invoiceId}/:payment?paymentDate=${TODAY}&paymentTypeId=${pt.id}&paidAmount=${outstanding}`);
  console.log("Payment result:", JSON.stringify(extract(payResult), null, 2));

  // Step 4: Verification GET (free)
  const verify = extract(await api("GET", `/invoice/${invoiceId}?fields=id,invoiceNumber,amountCurrency,amountCurrencyOutstanding,amountOutstanding,customer(id,name)`));
  console.log("Verification:", JSON.stringify(verify, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
