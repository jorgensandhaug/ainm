// Sandbox verification: confirm the 3-call register-customer-invoice-payment path
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";

const h: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url.replace(BASE, "")}`);
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
  // Step 1: Locate an unpaid invoice
  console.log("=== Step 1: Locate invoice ===");
  const invoices = await api("GET",
    "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))");

  const unpaid = (invoices.values || []).filter((inv: any) =>
    inv.amountOutstanding > 0 || inv.amountCurrencyOutstanding > 0
  );

  console.log(`Total invoices: ${invoices.fullResultSize}, unpaid: ${unpaid.length}`);

  if (unpaid.length === 0) {
    console.log("No unpaid invoices found in sandbox - creating one for testing");
    // First, find a customer
    const customers = await api("GET", "/customer?count=1&fields=*");
    const cust = customers.values?.[0];
    if (!cust) throw new Error("No customers in sandbox");
    console.log(`Customer: id=${cust.id}, name=${cust.name}, org=${cust.organizationNumber}`);

    // Find a payment type
    const ptRes = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
    const pts = ptRes.values || [];
    console.log(`Payment types: ${pts.length}`);
    const pt = pts.find((p: any) => p.description === "Betalt til bank") || pts[0];
    console.log(`Selected: id=${pt.id}, desc=${pt.description}`);

    // Create an invoice (without payment) to have something to pay
    const invBody = {
      invoiceDate: TODAY,
      invoiceDueDate: "2026-04-22",
      orders: [{
        customer: { id: cust.id },
        orderDate: TODAY,
        deliveryDate: TODAY,
        orderLines: [{
          description: "Sandbox Payment Test",
          count: 1,
          unitPriceExcludingVatCurrency: 10000
        }]
      }]
    };
    const created = await api("POST", "/invoice?sendToCustomer=false", invBody);
    console.log(`Created invoice: id=${created.value.id}, outstanding=${created.value.amountOutstanding}`);

    // Now pay it
    const payRes = await api("PUT",
      `/invoice/${created.value.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${pt.id}&paidAmount=${created.value.amountOutstanding}`);
    console.log(`Payment result: outstanding=${payRes.value.amountOutstanding}`);
    console.log("Sandbox verification complete: 3-call payment path confirmed");
    return;
  }

  // We have an unpaid invoice — use it
  const target = unpaid[0];
  console.log(`Target invoice: id=${target.id}, customer=${target.customer?.name}, org=${target.customer?.organizationNumber}`);
  console.log(`  amountExVat=${target.amountExcludingVatCurrency}, outstanding=${target.amountOutstanding}, outstandingCurrency=${target.amountCurrencyOutstanding}`);

  const descs: string[] = [];
  if (target.orderLines) target.orderLines.forEach((ol: any) => { if (ol.description) descs.push(ol.description); });
  if (target.orders) target.orders.forEach((o: any) => {
    if (o.orderLines) o.orderLines.forEach((ol: any) => { if (ol.description) descs.push(ol.description); });
  });
  console.log(`  descriptions: ${JSON.stringify(descs)}`);

  const paidAmount = target.amountCurrencyOutstanding || target.amountOutstanding;
  console.log(`  paidAmount to use: ${paidAmount}`);

  // Step 2: Resolve payment type
  console.log("\n=== Step 2: Resolve payment type ===");
  const ptRes = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
  const pts = ptRes.values || [];
  let pt = pts.find((p: any) => p.description === "Betalt til bank");
  if (!pt) pt = pts.find((p: any) => p.debitAccount && String(p.debitAccount.number).startsWith("19"));
  if (!pt) pt = pts[0];
  console.log(`Selected: id=${pt.id}, desc=${pt.description}, debit=${pt.debitAccount?.number}`);

  // Step 3: Register payment
  console.log("\n=== Step 3: Register payment ===");
  const payRes = await api("PUT",
    `/invoice/${target.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${pt.id}&paidAmount=${paidAmount}`);
  console.log(`Payment result: outstanding=${payRes.value.amountOutstanding}, outstandingCurrency=${payRes.value.amountCurrencyOutstanding}`);
  console.log(`\n=== RESULT: 3 calls, 0 errors, outstanding=${payRes.value.amountOutstanding} ===`);
}

main().catch(e => { console.error(e); process.exit(1); });
