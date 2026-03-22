const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "PHPIcWCf4OBb_0kEaaHUYDb-1jtx072zT5SfypZsOOo";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };
const TODAY = "2026-03-22";

async function main() {
  // Step 1: Locate the invoice
  const invUrl = `${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))`;
  const invRes = await fetch(invUrl, { headers: H });
  const invData = await invRes.json();
  if (!invRes.ok) { console.error("GET /invoice failed:", invRes.status, JSON.stringify(invData)); process.exit(1); }

  const invoices = invData.values || [];
  const match = invoices.find((inv: any) => {
    if (!inv.customer || String(inv.customer.organizationNumber) !== "906739542") return false;
    if (inv.amountExcludingVatCurrency !== 6800 && inv.amountExcludingVat !== 6800) return false;
    const outstanding = inv.amountCurrencyOutstanding ?? inv.amountOutstanding ?? 0;
    if (outstanding <= 0) return false;
    // Check description in orderLines or orders.orderLines
    const descs: string[] = [];
    if (inv.orderLines) inv.orderLines.forEach((ol: any) => { if (ol.description) descs.push(ol.description); });
    if (inv.orders) inv.orders.forEach((o: any) => {
      if (o.orderLines) o.orderLines.forEach((ol: any) => { if (ol.description) descs.push(ol.description); });
    });
    return descs.some((d: string) => d.toLowerCase().includes("consultoria de dados"));
  });

  if (!match) { console.error("No matching invoice found. Total invoices:", invoices.length); process.exit(1); }
  const invoiceId = match.id;
  const outstanding = match.amountCurrencyOutstanding ?? match.amountOutstanding;
  console.log(`Found invoice ${invoiceId}, outstanding=${outstanding}`);

  // Step 2: Get payment type
  const ptUrl = `${BASE}/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`;
  const ptRes = await fetch(ptUrl, { headers: H });
  const ptData = await ptRes.json();
  if (!ptRes.ok) { console.error("GET /invoice/paymentType failed:", ptRes.status, JSON.stringify(ptData)); process.exit(1); }

  const pts = ptData.values || [];
  // Prefer "Betalt til bank" or debit account 19xx
  let pt = pts.find((p: any) => p.description === "Betalt til bank") ||
           pts.find((p: any) => p.debitAccount && String(p.debitAccount.number).startsWith("19")) ||
           pts[0];
  if (!pt) { console.error("No payment type found"); process.exit(1); }
  console.log(`Using payment type ${pt.id} (${pt.description}, debit=${pt.debitAccount?.number})`);

  // Step 3: Register payment
  const payUrl = `${BASE}/invoice/${invoiceId}/:payment?paymentDate=${TODAY}&paymentTypeId=${pt.id}&paidAmount=${outstanding}`;
  const payRes = await fetch(payUrl, { method: "PUT", headers: H });
  const payData = await payRes.json();
  if (!payRes.ok) { console.error("PUT /:payment failed:", payRes.status, JSON.stringify(payData)); process.exit(1); }

  const remaining = payData.value?.amountCurrencyOutstanding ?? payData.value?.amountOutstanding;
  console.log(`Payment registered. Remaining outstanding: ${remaining}`);
  if (remaining === 0) console.log("SUCCESS: Invoice fully paid.");
}

main().catch(e => { console.error(e); process.exit(1); });
