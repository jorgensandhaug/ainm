const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "ljxta0Fk_XOgXspNx9DBsaK3sCEJJSheWdL2Gl2yLRk";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";

const ORG_NO = "830362894";
const AMOUNT_EX_VAT = 32200;
const DESCRIPTION = "System Development";

const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const opts: any = { method, headers: h };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) {
    console.error(`HTTP ${r.status}:`, JSON.stringify(data).slice(0, 500));
    throw new Error(`HTTP ${r.status}`);
  }
  return data;
}

async function main() {
  // Step 1: Locate the invoice
  const invoices = await api("GET",
    "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))");

  const candidates = (invoices.values || []).filter((inv: any) => {
    if (!inv.customer || inv.customer.organizationNumber !== ORG_NO) return false;
    if (inv.amountOutstanding <= 0) return false;
    // Check description in orderLines or orders.orderLines
    const descs: string[] = [];
    if (inv.orderLines) inv.orderLines.forEach((ol: any) => { if (ol.description) descs.push(ol.description); });
    if (inv.orders) inv.orders.forEach((o: any) => {
      if (o.orderLines) o.orderLines.forEach((ol: any) => { if (ol.description) descs.push(ol.description); });
    });
    return descs.some((d: string) => d.includes(DESCRIPTION));
  });

  if (candidates.length === 0) throw new Error("No matching invoice found");

  // Pick the one closest to the expected amount
  const invoice = candidates.sort((a: any, b: any) =>
    Math.abs(a.amountExcludingVatCurrency - AMOUNT_EX_VAT) - Math.abs(b.amountExcludingVatCurrency - AMOUNT_EX_VAT)
  )[0];

  console.log(`Found invoice id=${invoice.id}, amountExVat=${invoice.amountExcludingVatCurrency}, outstanding=${invoice.amountOutstanding}, outstandingCurrency=${invoice.amountCurrencyOutstanding}`);

  const paidAmount = invoice.amountOutstanding;

  // Step 2: Get payment types
  const ptRes = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
  const paymentTypes = ptRes.values || [];

  // Prefer "Betalt til bank" or debitAccount starting with 19
  let pt = paymentTypes.find((p: any) => p.description === "Betalt til bank");
  if (!pt) pt = paymentTypes.find((p: any) => p.debitAccount && String(p.debitAccount.number).startsWith("19"));
  if (!pt) pt = paymentTypes[0];
  if (!pt) throw new Error("No payment type found");

  console.log(`Using paymentType id=${pt.id}, desc=${pt.description}, debit=${pt.debitAccount?.number}`);

  // Step 3: Register payment (query params, NOT body)
  const payRes = await api("PUT",
    `/invoice/${invoice.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${pt.id}&paidAmount=${paidAmount}`);

  console.log("Payment registered:", JSON.stringify(payRes).slice(0, 500));
  console.log(`Remaining outstanding: ${payRes?.value?.amountOutstanding ?? "unknown"}`);
}

main().catch(e => { console.error(e); process.exit(1); });
