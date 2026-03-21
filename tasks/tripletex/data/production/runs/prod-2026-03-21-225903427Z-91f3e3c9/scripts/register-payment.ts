const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "HOcQGeTYSeh42S-OTjYYMIh5Mx8CgJBUZdRg8GPtv4Y";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  // Step 1: Locate the invoice
  const invUrl = `${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;
  const invRes = await fetch(invUrl, { headers: H });
  const invData = await invRes.json();
  if (!invRes.ok) { console.error("GET /invoice failed:", invRes.status, invData); process.exit(1); }

  const invoices = invData.values || [];
  const match = invoices.find((inv: any) => {
    if (inv.customer?.organizationNumber !== "830362894") return false;
    if (!inv.amountOutstanding || inv.amountOutstanding <= 0) return false;
    // Check order lines for "System Development"
    const topLines = (inv.orderLines || []).map((ol: any) => (ol.description || "").toLowerCase());
    const orderLines = (inv.orders || []).flatMap((o: any) => (o.orderLines || []).map((ol: any) => (ol.description || "").toLowerCase()));
    const allDescs = [...topLines, ...orderLines];
    return allDescs.some((d: string) => d.includes("system development"));
  });

  if (!match) { console.error("No matching invoice found"); process.exit(1); }
  console.log("Found invoice:", match.id, "outstanding:", match.amountOutstanding, "outstandingCurrency:", match.amountCurrencyOutstanding);

  // Step 2: Get payment types
  const ptUrl = `${BASE}/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`;
  const ptRes = await fetch(ptUrl, { headers: H });
  const ptData = await ptRes.json();
  if (!ptRes.ok) { console.error("GET /invoice/paymentType failed:", ptRes.status, ptData); process.exit(1); }

  const types = ptData.values || [];
  let paymentType = types.find((t: any) => t.description === "Betalt til bank");
  if (!paymentType) {
    paymentType = types.find((t: any) => t.debitAccount?.number?.toString().startsWith("19"));
  }
  if (!paymentType) { console.error("No valid payment type found"); process.exit(1); }
  console.log("Payment type:", paymentType.id, paymentType.description, "debit:", paymentType.debitAccount?.number);

  // Step 3: Register payment
  const paidAmount = match.amountOutstanding;
  const today = new Date().toISOString().slice(0, 10);
  const payUrl = `${BASE}/invoice/${match.id}/:payment?paymentDate=${today}&paymentTypeId=${paymentType.id}&paidAmount=${paidAmount}`;
  const payRes = await fetch(payUrl, { method: "PUT", headers: H });
  const payData = await payRes.json();
  if (!payRes.ok) { console.error("PUT /:payment failed:", payRes.status, payData); process.exit(1); }
  console.log("Payment registered. Response:", JSON.stringify(payData, null, 2));
}

main();
