const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "fDWDR-E_B_IPbA02If9u3mR05GiKPwgF7bytZA1xvbg";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: Locate the unpaid invoice for Grünfeld GmbH (888415769), 32800 ex-VAT, "Datenberatung"
const invUrl = `${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;
const invRes = await fetch(invUrl, { headers: H });
if (!invRes.ok) { console.error("GET /invoice failed", invRes.status, await invRes.text()); process.exit(1); }
const invData = await invRes.json();
const invoices = invData.values || [];

// Filter by org number, outstanding > 0, amount match, description match
const target = invoices.find((inv: any) => {
  if (inv.customer?.organizationNumber !== "888415769") return false;
  const outstanding = inv.amountCurrencyOutstanding ?? inv.amountOutstanding ?? 0;
  if (outstanding <= 0) return false;
  // Check description in orderLines and orders.orderLines
  const descs: string[] = [];
  for (const ol of (inv.orderLines || [])) { if (ol.description) descs.push(ol.description); }
  for (const o of (inv.orders || [])) { for (const ol of (o.orderLines || [])) { if (ol.description) descs.push(ol.description); } }
  return descs.some((d: string) => d.toLowerCase().includes("datenberatung"));
});

if (!target) { console.error("No matching invoice found"); process.exit(1); }
const invoiceId = target.id;
const paidAmount = target.amountCurrencyOutstanding ?? target.amountOutstanding;
console.log(`Found invoice ${invoiceId}, outstanding=${paidAmount}`);

// Step 2: Get payment types
const ptUrl = `${BASE}/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`;
const ptRes = await fetch(ptUrl, { headers: H });
if (!ptRes.ok) { console.error("GET /invoice/paymentType failed", ptRes.status, await ptRes.text()); process.exit(1); }
const ptData = await ptRes.json();
const paymentTypes = ptData.values || [];

// Prefer "Betalt til bank" or debitAccount starting with 19
let pt = paymentTypes.find((p: any) => p.description === "Betalt til bank");
if (!pt) pt = paymentTypes.find((p: any) => p.debitAccount?.number?.toString().startsWith("19"));
if (!pt) { console.error("No suitable payment type found"); process.exit(1); }
console.log(`Using paymentTypeId=${pt.id}, description=${pt.description}, debitAccount=${pt.debitAccount?.number}`);

// Step 3: Register payment (query parameters, not JSON body)
const today = new Date().toISOString().slice(0, 10);
const payUrl = `${BASE}/invoice/${invoiceId}/:payment?paymentDate=${today}&paymentTypeId=${pt.id}&paidAmount=${paidAmount}`;
const payRes = await fetch(payUrl, { method: "PUT", headers: H });
if (!payRes.ok) { console.error("PUT /:payment failed", payRes.status, await payRes.text()); process.exit(1); }
const payData = await payRes.json();
console.log("Payment registered successfully");
console.log("Remaining outstanding:", payData.value?.amountCurrencyOutstanding ?? payData.value?.amountOutstanding ?? "check response");
console.log(JSON.stringify(payData, null, 2));
