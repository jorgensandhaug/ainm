const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`\n>>> ${method} ${url}`);
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`<<< ${r.status}`);
  if (!r.ok) { console.log(JSON.stringify(data, null, 2)); }
  return { status: r.status, data };
}

async function main() {
  // Look for existing EUR invoices (from previous sandbox proofs)
  console.log("=== ALL EUR INVOICES ===");
  const eurInvRes = await api("GET", "/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2027-01-01&count=100&fields=*,currency(*),customer(*)");
  if (eurInvRes.data?.values) {
    const eurInvoices = eurInvRes.data.values.filter((i: any) => i.currency?.code === "EUR");
    console.log(`Found ${eurInvoices.length} EUR invoices out of ${eurInvRes.data.values.length} total`);
    for (const i of eurInvoices) {
      console.log(JSON.stringify({
        id: i.id, currency: i.currency?.code,
        amount: i.amount, amountCurrency: i.amountCurrency,
        amountOutstanding: i.amountOutstanding,
        amountCurrencyOutstanding: i.amountCurrencyOutstanding,
        customer: i.customer?.name,
        invoiceDate: i.invoiceDate
      }, null, 2));
    }
  }

  // Check what EUR currency id is
  console.log("\n=== EUR CURRENCY ===");
  const eurCurrRes = await api("GET", "/currency?code=EUR&fields=*");
  if (eurCurrRes.data?.values) {
    for (const c of eurCurrRes.data.values) {
      console.log(JSON.stringify(c, null, 2));
    }
  }

  // Now create a test: EUR invoice for a new customer, then pay at different rate
  console.log("\n=== CREATE TEST CUSTOMER ===");
  const custRes = await api("POST", "/customer", {
    name: "FX Disagio Test Customer AS",
    organizationNumber: "999666333",
    invoiceSendMethod: "MANUAL"
  });
  const customerId = custRes.data?.value?.id;
  console.log("Customer ID:", customerId);
  if (!customerId) { console.log("Cannot proceed without customer"); return; }

  // Get EUR currency id
  const eurId = eurCurrRes.data?.values?.find((c: any) => c.code === "EUR")?.id;
  console.log("EUR currency id:", eurId);
  if (!eurId) { console.log("No EUR currency found"); return; }

  // Create an order in EUR with explicit exchange rate
  console.log("\n=== CREATE EUR ORDER ===");
  const orderRes = await api("POST", "/order", {
    customer: { id: customerId },
    orderDate: "2026-03-01",
    deliveryDate: "2026-03-01",
    currency: { id: eurId },
    orderLines: [{
      description: "Consulting services",
      count: 1,
      unitPriceExcludingVatCurrency: 2052
    }]
  });
  const orderId = orderRes.data?.value?.id;
  console.log("Order ID:", orderId);
  if (orderRes.data?.value) {
    console.log(JSON.stringify({
      id: orderRes.data.value.id,
      currency: orderRes.data.value.currency,
      totalExcludingVat: orderRes.data.value.totalExcludingVat,
      totalIncludingVat: orderRes.data.value.totalIncludingVat
    }, null, 2));
  }
  if (!orderId) return;

  // Invoice it
  console.log("\n=== INVOICE THE ORDER ===");
  const invRes = await api("PUT", `/order/${orderId}/:invoice?sendToCustomer=false&invoiceDate=2026-03-01`);
  const invoiceId = invRes.data?.value?.id;
  console.log("Invoice ID:", invoiceId);
  if (invRes.data?.value) {
    console.log(JSON.stringify({
      id: invRes.data.value.id,
      amount: invRes.data.value.amount,
      amountCurrency: invRes.data.value.amountCurrency,
      amountExcludingVat: invRes.data.value.amountExcludingVat,
      amountExcludingVatCurrency: invRes.data.value.amountExcludingVatCurrency,
      amountOutstanding: invRes.data.value.amountOutstanding,
      amountCurrencyOutstanding: invRes.data.value.amountCurrencyOutstanding,
      currency: invRes.data.value.currency
    }, null, 2));
  }
  if (!invoiceId) return;

  // Read the invoice back to see how Tripletex stores the EUR amounts
  console.log("\n=== READ INVOICE WITH EXPANDED CURRENCY ===");
  const readInvRes = await api("GET", `/invoice/${invoiceId}?fields=*,currency(*)`);
  if (readInvRes.data?.value) {
    const inv = readInvRes.data.value;
    console.log(JSON.stringify({
      id: inv.id,
      currency: inv.currency,
      amount: inv.amount,
      amountCurrency: inv.amountCurrency,
      amountExcludingVat: inv.amountExcludingVat,
      amountExcludingVatCurrency: inv.amountExcludingVatCurrency,
      amountOutstanding: inv.amountOutstanding,
      amountCurrencyOutstanding: inv.amountCurrencyOutstanding,
    }, null, 2));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
