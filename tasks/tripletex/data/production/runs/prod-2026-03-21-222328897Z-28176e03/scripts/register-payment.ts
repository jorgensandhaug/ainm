const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "K2BYoRFHTAH3CPNmChL61rR2NvqqX2MksHnX0HL_NNw";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  // Step 1: GET invoices with full expansion
  const invUrl = `${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;
  console.log("GET /invoice ...");
  const invRes = await fetch(invUrl, { headers: H });
  if (!invRes.ok) { console.error("invoice GET failed", invRes.status, await invRes.text()); process.exit(1); }
  const invData = await invRes.json();
  const invoices = invData.values || [];

  // Filter: customer org 924324104, description "Cloud Storage", outstanding > 0
  const match = invoices.filter((inv: any) => {
    if (!inv.customer || inv.customer.organizationNumber !== "924324104") return false;
    if (inv.amountOutstanding <= 0 && inv.amountCurrencyOutstanding <= 0) return false;
    // Check descriptions in orderLines and orders.orderLines
    const descs: string[] = [];
    if (inv.orderLines) inv.orderLines.forEach((ol: any) => { if (ol.description) descs.push(ol.description); });
    if (inv.orders) inv.orders.forEach((o: any) => { if (o.orderLines) o.orderLines.forEach((ol: any) => { if (ol.description) descs.push(ol.description); }); });
    return descs.some((d: string) => d.includes("Cloud Storage"));
  });

  if (match.length === 0) { console.error("No matching invoice found"); process.exit(1); }
  if (match.length > 1) { console.warn("Multiple matches, using first:", match.map((m: any) => m.id)); }
  const inv = match[0];
  const outstanding = inv.amountOutstanding || inv.amountCurrencyOutstanding;
  console.log(`Found invoice ${inv.id}, outstanding=${outstanding}`);

  // Step 2: GET payment types
  const ptUrl = `${BASE}/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`;
  console.log("GET /invoice/paymentType ...");
  const ptRes = await fetch(ptUrl, { headers: H });
  if (!ptRes.ok) { console.error("paymentType GET failed", ptRes.status, await ptRes.text()); process.exit(1); }
  const ptData = await ptRes.json();
  const pts = ptData.values || [];

  // Select: prefer "Betalt til bank" or debitAccount.number starting with 19
  let paymentType = pts.find((p: any) => p.description === "Betalt til bank");
  if (!paymentType) paymentType = pts.find((p: any) => p.debitAccount && String(p.debitAccount.number).startsWith("19"));
  if (!paymentType) { console.error("No suitable payment type found"); process.exit(1); }
  console.log(`Using paymentType ${paymentType.id} (${paymentType.description}, debit=${paymentType.debitAccount?.number})`);

  // Step 3: PUT payment (query params, not body)
  const today = new Date().toISOString().split("T")[0];
  const payUrl = `${BASE}/invoice/${inv.id}/:payment?paymentDate=${today}&paymentTypeId=${paymentType.id}&paidAmount=${outstanding}`;
  console.log(`PUT /invoice/${inv.id}/:payment ...`);
  const payRes = await fetch(payUrl, { method: "PUT", headers: H });
  const payBody = await payRes.text();
  console.log("Payment response:", payRes.status, payBody);
  if (!payRes.ok) { console.error("Payment failed"); process.exit(1); }
  console.log("DONE — payment registered successfully");
}

main().catch(e => { console.error(e); process.exit(1); });
