const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "-RQR_K-FVN9v2EIaNrSW8CEMx14r0JnZu6TwFiTx_6g";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = new Date().toISOString().slice(0, 10);

const ORG = "975013723";
const AMOUNT_EX_VAT = 45100;
const DESC = "Licence logicielle";

async function api(path: string, method = "GET", body?: any) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!r.ok) { console.error(`${method} ${url} → ${r.status}`, json); throw new Error(`${r.status}`); }
  return json;
}

// Step 1: Locate the unpaid invoice
const invRes = await api("/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))");
const invoices = invRes.values || [];

// Step 2: Filter locally
const match = invoices.find((inv: any) => {
  if (inv.customer?.organizationNumber !== ORG) return false;
  const outstanding = inv.amountOutstanding ?? inv.amountCurrencyOutstanding;
  if (!outstanding || outstanding <= 0) return false;
  // Check description in orderLines and nested orders.orderLines
  const descs: string[] = [];
  for (const ol of (inv.orderLines || [])) { if (ol.description) descs.push(ol.description); }
  for (const ord of (inv.orders || [])) { for (const ol of (ord.orderLines || [])) { if (ol.description) descs.push(ol.description); } }
  return descs.some((d: string) => d.toLowerCase().includes(DESC.toLowerCase()) || DESC.toLowerCase().includes(d.toLowerCase()));
});

if (!match) { console.error("No matching unpaid invoice found"); process.exit(1); }
console.log(`Found invoice id=${match.id} outstanding=${match.amountOutstanding} amountCurrencyOutstanding=${match.amountCurrencyOutstanding}`);

const paidAmount = match.amountOutstanding ?? match.amountCurrencyOutstanding;

// Step 3: Get payment types
const ptRes = await api("/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
const paymentTypes = ptRes.values || [];

// Prefer "Betalt til bank" or debitAccount starting with 19
let pt = paymentTypes.find((p: any) => p.description === "Betalt til bank");
if (!pt) pt = paymentTypes.find((p: any) => p.debitAccount?.number?.toString().startsWith("19"));
if (!pt) { console.error("No suitable payment type found"); process.exit(1); }
console.log(`Using paymentType id=${pt.id} desc=${pt.description} debit=${pt.debitAccount?.number}`);

// Step 4: Register payment (query params, not body)
const payUrl = `/invoice/${match.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${pt.id}&paidAmount=${paidAmount}`;
const payRes = await api(payUrl, "PUT");
console.log("Payment response:", JSON.stringify(payRes, null, 2));
