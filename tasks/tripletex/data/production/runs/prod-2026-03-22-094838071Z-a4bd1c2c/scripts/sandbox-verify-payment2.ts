// Sandbox verification: create fresh invoice and pay it with 3-call path
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";

const h: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${path.split("?")[0]}`);
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
  // Setup: create a fresh unpaid invoice
  console.log("=== Setup: create unpaid invoice ===");
  const customers = await api("GET", "/customer?count=1&fields=*");
  const cust = customers.values?.[0];
  if (!cust) throw new Error("No customer");
  console.log(`Customer: id=${cust.id}, name=${cust.name}`);

  const invBody = {
    invoiceDate: TODAY,
    invoiceDueDate: "2026-04-22",
    orders: [{
      customer: { id: cust.id },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [{
        description: "Payment Verification Test",
        count: 1,
        unitPriceExcludingVatCurrency: 8000
      }]
    }]
  };
  const created = await api("POST", "/invoice?sendToCustomer=false", invBody);
  const invId = created.value.id;
  const outstanding = created.value.amountOutstanding;
  console.log(`Created invoice: id=${invId}, outstanding=${outstanding}, amountExVat=${created.value.amountExcludingVatCurrency}`);

  // Now simulate the 3-call payment path
  console.log("\n=== Simulated 3-call path ===");

  // Call 1: Locate invoice (we already know it, but simulate the GET)
  console.log("Call 1: GET /invoice (locate)");
  const invoices = await api("GET",
    `/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`);
  const found = invoices.values?.find((i: any) => i.id === invId);
  if (!found) throw new Error("Invoice not found in locate step");
  console.log(`  Found: id=${found.id}, customer.org=${found.customer?.organizationNumber}, outstanding=${found.amountOutstanding}`);
  const descs: string[] = [];
  if (found.orderLines) found.orderLines.forEach((ol: any) => { if (ol.description) descs.push(ol.description); });
  console.log(`  descriptions: ${JSON.stringify(descs)}`);

  // Call 2: Resolve payment type
  console.log("Call 2: GET /invoice/paymentType");
  const ptRes = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
  const pts = ptRes.values || [];
  const pt = pts.find((p: any) => p.description === "Betalt til bank") || pts[0];
  console.log(`  Selected: id=${pt.id}, desc=${pt.description}, debit=${pt.debitAccount?.number}`);

  // Call 3: Register payment
  console.log("Call 3: PUT /invoice/:payment");
  const payRes = await api("PUT",
    `/invoice/${invId}/:payment?paymentDate=${TODAY}&paymentTypeId=${pt.id}&paidAmount=${outstanding}`);
  console.log(`  Result: outstanding=${payRes.value.amountOutstanding}`);

  console.log(`\n=== VERIFIED: 3-call path works, outstanding=${payRes.value.amountOutstanding} ===`);
}

main().catch(e => { console.error(e); process.exit(1); });
