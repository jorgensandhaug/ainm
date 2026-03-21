// Sandbox verification: confirm the canonical 5-call path works
// and explore whether any 4-call path is possible

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const TODAY = "2026-03-21";

const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json();
  console.log(`\n${method} ${path} → ${res.status}`);
  if (!res.ok) {
    console.error(JSON.stringify(json, null, 2));
  }
  return { status: res.status, ok: res.ok, json };
}

async function main() {
  // Step 1: Check what customers exist
  const custRes = await api("GET", "/customer?count=5&fields=id,name,organizationNumber");
  if (custRes.ok) {
    const custs = custRes.json.values;
    console.log("Available customers:", custs.map((c: any) => `${c.name} (org=${c.organizationNumber}, id=${c.id})`));
  }

  // Step 2: Check what products exist
  const prodRes = await api("GET", "/product?count=1000&fields=id,name,number");
  if (prodRes.ok) {
    const prods = prodRes.json.values;
    console.log("Available products:", prods.map((p: any) => `${p.name} (number=${p.number}, id=${p.id})`));
  }

  // Step 3: Check payment types
  const ptRes = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
  if (ptRes.ok) {
    const pts = ptRes.json.values;
    console.log("Payment types:", pts.map((pt: any) =>
      `${pt.description} (id=${pt.id}, debit=${pt.debitAccount?.number}, credit=${pt.creditAccount?.number})`
    ));
  }

  // Use the first available customer and two products for a test order
  if (!custRes.ok || !prodRes.ok || !ptRes.ok) {
    console.log("Cannot proceed: sandbox data issue");
    return;
  }

  const customer = custRes.json.values[0];
  const products = prodRes.json.values;

  if (!customer || products.length < 2) {
    console.log("Need at least 1 customer and 2 products");
    return;
  }

  const p1 = products[0];
  const p2 = products[1];

  // Find incoming payment type
  const paymentTypes = ptRes.json.values;
  const incomingPt = paymentTypes.find((pt: any) =>
    pt.debitAccount && pt.debitAccount.number >= 1900 && pt.debitAccount.number <= 1999
  );
  if (!incomingPt) {
    console.log("No incoming payment type found");
    return;
  }

  console.log(`\nUsing customer: ${customer.name} (id=${customer.id})`);
  console.log(`Using products: ${p1.name} (id=${p1.id}), ${p2.name} (id=${p2.id})`);
  console.log(`Using payment type: ${incomingPt.description} (id=${incomingPt.id})`);

  // Step 4: Create order with embedded lines
  const orderBody = {
    customer: { id: customer.id },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [
      {
        product: { id: p1.id },
        description: p1.name,
        count: 1,
        unitPriceExcludingVatCurrency: 1000,
      },
      {
        product: { id: p2.id },
        description: p2.name,
        count: 1,
        unitPriceExcludingVatCurrency: 2000,
      },
    ],
  };
  const orderRes = await api("POST", "/order", orderBody);
  if (!orderRes.ok) {
    console.log("Order creation failed");
    return;
  }
  const orderId = orderRes.json.value.id;
  console.log(`Order created: id=${orderId}`);

  // Step 5: Invoice + payment in one call
  const invoicePath = `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false&paymentTypeId=${incomingPt.id}&paidAmount=0.01&paymentTypeIdRestAmount=${incomingPt.id}`;
  const invoiceRes = await api("PUT", invoicePath);
  if (!invoiceRes.ok) {
    console.log("Invoice creation failed");
    return;
  }
  const invoice = invoiceRes.json.value;
  console.log(`Invoice created: id=${invoice.id}, number=${invoice.invoiceNumber}`);
  console.log(`Outstanding: ${invoice.amountOutstanding ?? invoice.amountCurrencyOutstanding}`);
  console.log(`Amount: ${invoice.amount}, AmountCurrency: ${invoice.amountCurrency}`);

  const outstanding = invoice.amountOutstanding ?? invoice.amountCurrencyOutstanding ?? 0;
  if (outstanding === 0) {
    console.log("\nSUCCESS: 5-call path confirmed in sandbox");
  } else {
    console.log(`\nWARNING: Outstanding = ${outstanding}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
