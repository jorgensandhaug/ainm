const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "w9-56dNHhESeP90zGUKQiyXRpaL2aIaSCUTB4Q_tHvc";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: Locate the invoice
const invUrl = `${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))`;
const invRes = await fetch(invUrl, { headers: H });
const invData = await invRes.json();
if (!invRes.ok) { console.error("GET /invoice failed:", JSON.stringify(invData)); process.exit(1); }

const invoices = invData.values || [];
const match = invoices.find((inv: any) => {
  if (inv.customer?.organizationNumber !== "939210970") return false;
  if (inv.amountExcludingVatCurrency !== 23900 && inv.amountExcludingVat !== 23900) return false;
  const outstanding = inv.amountCurrencyOutstanding ?? inv.amountOutstanding ?? 0;
  if (outstanding <= 0) return false;
  const allLines = [
    ...(inv.orderLines || []),
    ...((inv.orders || []).flatMap((o: any) => o.orderLines || []))
  ];
  return allLines.some((l: any) =>
    (l.description || "").toLowerCase().includes("manutenção") ||
    (l.displayName || "").toLowerCase().includes("manutenção")
  );
});

if (!match) { console.error("No matching invoice found"); process.exit(1); }
const invoiceId = match.id;
const paidAmount = match.amountCurrencyOutstanding ?? match.amountOutstanding;
console.log(`Located invoice ${invoiceId}, outstanding=${paidAmount}`);

// Step 2: Resolve payment type
const ptUrl = `${BASE}/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`;
const ptRes = await fetch(ptUrl, { headers: H });
const ptData = await ptRes.json();
if (!ptRes.ok) { console.error("GET /invoice/paymentType failed:", JSON.stringify(ptData)); process.exit(1); }

const paymentTypes = ptData.values || [];
const pt = paymentTypes.find((p: any) => p.description === "Betalt til bank")
  || paymentTypes.find((p: any) => String(p.debitAccount?.number || "").startsWith("19"));
if (!pt) { console.error("No suitable payment type found"); process.exit(1); }
console.log(`Payment type: ${pt.id} (${pt.description}, debit=${pt.debitAccount?.number})`);

// Step 3: Register payment
const today = new Date().toISOString().slice(0, 10);
const payUrl = `${BASE}/invoice/${invoiceId}/:payment?paymentDate=${today}&paymentTypeId=${pt.id}&paidAmount=${paidAmount}`;
const payRes = await fetch(payUrl, { method: "PUT", headers: H });
const payData = await payRes.json();
if (!payRes.ok) { console.error("PUT /:payment failed:", JSON.stringify(payData)); process.exit(1); }

const remaining = payData.value?.amountCurrencyOutstanding ?? payData.value?.amountOutstanding;
console.log(`Payment registered. Remaining outstanding: ${remaining}`);
