const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "65N4PJLiofrKUhVEXqtcdiLkcwj7lvwtuNEYZ2IfTbI";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";

const ORG_NR = "963143230";
const EX_VAT = 19600;
const DESC = "Datarådgjeving";

async function api(method: string, path: string, body?: any) {
  const url = BASE + path;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!r.ok) { console.error(`${method} ${path} => ${r.status}`, json); throw new Error(`${r.status}`); }
  return json;
}

// Step 1: Locate the invoice
const invRes = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))");
const invoices = invRes.values || [];
const match = invoices.find((inv: any) => {
  if (inv.customer?.organizationNumber !== ORG_NR) return false;
  if (inv.amountExcludingVatCurrency !== EX_VAT && inv.amountExcludingVat !== EX_VAT) return false;
  const outstanding = inv.amountCurrencyOutstanding ?? inv.amountOutstanding;
  if (!outstanding || outstanding <= 0) return false;
  // Check description in orderLines or orders.orderLines
  const descs: string[] = [];
  for (const ol of (inv.orderLines || [])) if (ol.description) descs.push(ol.description);
  for (const o of (inv.orders || [])) for (const ol of (o.orderLines || [])) if (ol.description) descs.push(ol.description);
  return descs.some((d: string) => d.includes(DESC) || DESC.includes(d) || d.toLowerCase().includes(DESC.toLowerCase()));
});

if (!match) { console.error("No matching invoice found"); process.exit(1); }
const invoiceId = match.id;
const paidAmount = match.amountCurrencyOutstanding ?? match.amountOutstanding;
console.log(`Located invoice ${invoiceId} (invoiceNumber=${match.invoiceNumber}), outstanding=${paidAmount}, customer=${match.customer?.name}`);

// Step 2: Resolve payment type
const ptRes = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
const paymentTypes = ptRes.values || [];
let pt = paymentTypes.find((p: any) => p.description === "Betalt til bank");
if (!pt) pt = paymentTypes.find((p: any) => String(p.debitAccount?.number || "").startsWith("19"));
if (!pt) pt = paymentTypes[0];
if (!pt) { console.error("No payment type found"); process.exit(1); }
console.log(`Using paymentType ${pt.id} (${pt.description}, debit=${pt.debitAccount?.number})`);

// Step 3: Register payment (query params, NOT JSON body)
const payRes = await api("PUT", `/invoice/${invoiceId}/:payment?paymentDate=${TODAY}&paymentTypeId=${pt.id}&paidAmount=${paidAmount}`);
const remaining = payRes.value?.amountCurrencyOutstanding ?? payRes.value?.amountOutstanding;
console.log(`Payment registered. Remaining outstanding: ${remaining}`);

// Verification GET (free)
const verify = await api("GET", `/invoice/${invoiceId}?fields=id,invoiceNumber,amountCurrency,amountCurrencyOutstanding,amountOutstanding,customer(id,name)`);
console.log("Verification:", JSON.stringify(verify.value, null, 2));
