const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "adGJB0unGbYBiRt7lvozd0YVV-NnO4etAZ-e7YFqTDU";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const TARGET_ORG = "866946108";
const TARGET_DESC = "Sesión de formación";

async function main() {
  // Step 1: GET invoices with full expansion
  const invoiceUrl = `${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;
  const r1 = await fetch(invoiceUrl, { headers: H });
  if (!r1.ok) { console.error("GET /invoice failed", r1.status, await r1.text()); return; }
  const invoices = (await r1.json()).values;

  // Step 2: Filter locally
  const match = invoices.find((inv: any) => {
    if (!inv.customer || inv.customer.organizationNumber !== TARGET_ORG) return false;
    if ((inv.amountOutstanding ?? 0) <= 0) return false;
    // Check descriptions in orderLines and orders.orderLines
    const descs: string[] = [];
    if (inv.orderLines) inv.orderLines.forEach((ol: any) => { if (ol.description) descs.push(ol.description); });
    if (inv.orders) inv.orders.forEach((o: any) => {
      if (o.orderLines) o.orderLines.forEach((ol: any) => { if (ol.description) descs.push(ol.description); });
    });
    return descs.some((d: string) => d.toLowerCase().includes("formación") || d.toLowerCase().includes("sesión"));
  });

  if (!match) { console.error("No matching invoice found"); return; }
  console.log(`Found invoice id=${match.id}, outstanding=${match.amountOutstanding}, amountCurrencyOutstanding=${match.amountCurrencyOutstanding}`);

  // Step 3: GET payment types
  const r2 = await fetch(`${BASE}/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`, { headers: H });
  if (!r2.ok) { console.error("GET /invoice/paymentType failed", r2.status, await r2.text()); return; }
  const paymentTypes = (await r2.json()).values;

  // Find "Betalt til bank" or debitAccount starting with 19
  let pt = paymentTypes.find((p: any) => p.description === "Betalt til bank");
  if (!pt) pt = paymentTypes.find((p: any) => p.debitAccount?.number?.toString().startsWith("19"));
  if (!pt) { console.error("No suitable payment type found"); return; }
  console.log(`Using paymentType id=${pt.id}, description=${pt.description}, debitAccount=${pt.debitAccount?.number}`);

  // Step 4: PUT payment - parameters as query params
  const outstanding = match.amountOutstanding;
  const today = new Date().toISOString().slice(0, 10);
  const payUrl = `${BASE}/invoice/${match.id}/:payment?paymentDate=${today}&paymentTypeId=${pt.id}&paidAmount=${outstanding}`;
  const r3 = await fetch(payUrl, { method: "PUT", headers: H });
  if (!r3.ok) { console.error("PUT /:payment failed", r3.status, await r3.text()); return; }
  const result = await r3.json();
  console.log("Payment registered successfully");
  console.log(JSON.stringify(result, null, 2));
}

main();
