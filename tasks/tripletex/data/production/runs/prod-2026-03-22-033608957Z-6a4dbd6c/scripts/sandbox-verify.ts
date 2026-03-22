const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) { console.error(`${method} ${path} => ${res.status}`, JSON.stringify(data).slice(0, 500)); }
  return { status: res.status, data };
}

// 1. Find an existing paid invoice to test reversal
const { data: invData } = await api("GET", "/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=10&fields=*,customer(*),orderLines(*),postings(*,voucher(*),account(*))&sorting=-invoiceDate");
console.log("Total invoices found:", invData.count);

// Find a paid invoice (amountCurrencyOutstanding === 0)
const paidInvoices = (invData.values || []).filter((inv: any) => inv.amountCurrencyOutstanding === 0);
console.log("Paid invoices:", paidInvoices.length);

if (paidInvoices.length === 0) {
  console.log("No paid invoices found, creating a test fixture...");

  // Create a simple order
  const { data: custData } = await api("GET", "/customer?count=1&fields=id,name");
  const customerId = custData.values[0].id;
  console.log("Using customer:", customerId, custData.values[0].name);

  const { data: prodData } = await api("GET", "/product?count=1&fields=id,name");
  const productId = prodData.values[0].id;
  console.log("Using product:", productId, prodData.values[0].name);

  // Create order
  const { data: orderRes } = await api("POST", "/order", {
    customer: { id: customerId },
    deliveryDate: "2026-03-22",
    orderDate: "2026-03-22",
    orderLines: [{ product: { id: productId }, count: 1 }]
  });
  const orderId = orderRes.value.id;
  console.log("Created order:", orderId);

  // Invoice it
  const { data: invRes } = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=2026-03-22&sendToCustomer=false`);
  const invoiceId = invRes.value.id;
  console.log("Created invoice:", invoiceId);

  // Pay it
  const { data: ptData } = await api("GET", "/invoice/paymentType?count=5&fields=id,description");
  const paymentTypeId = ptData.values[0].id;
  console.log("Payment type:", paymentTypeId, ptData.values[0].description);

  const { data: payRes } = await api("PUT", `/invoice/${invoiceId}/:payment`, {
    paymentDate: "2026-03-22",
    paymentTypeId,
    paidAmount: invRes.value.amountCurrency,
    paidAmountCurrency: invRes.value.amountCurrency
  });
  console.log("Payment registered");

  // Now re-read the invoice with postings
  const { data: rereadData } = await api("GET", `/invoice/${invoiceId}?fields=*,customer(*),orderLines(*),postings(*,voucher(*),account(*))`);
  const inv = rereadData.value;
  console.log("\nTest fixture invoice:", inv.id, "amountCurrency:", inv.amountCurrency, "outstanding:", inv.amountCurrencyOutstanding);

  // Extract payment voucher
  const postings = inv.postings || [];
  let paymentPosting = postings.find((p: any) => p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE");
  if (!paymentPosting) {
    const negBetaling = postings.filter((p: any) => p.amountCurrency < 0 && p.description?.startsWith("Betaling:"));
    if (negBetaling.length === 1) paymentPosting = negBetaling[0];
  }

  if (!paymentPosting) {
    console.error("Could not find payment posting");
    console.log("Postings:", JSON.stringify(postings.map((p: any) => ({ type: p.type, desc: p.description, amt: p.amountCurrency, vid: p.voucher?.id })), null, 2));
    process.exit(1);
  }

  const pvId = paymentPosting.voucher?.id;
  console.log("Payment voucher id:", pvId, "type:", paymentPosting.type, "amount:", paymentPosting.amountCurrency);

  // Reverse the payment
  const { data: revData, status: revStatus } = await api("PUT", `/ledger/voucher/${pvId}/:reverse?date=2026-03-22`);
  console.log("\nReverse status:", revStatus);
  console.log("Reverse voucher id:", revData.value?.id);

  // Verify
  const { data: verifyData } = await api("GET", `/invoice/${invoiceId}?fields=*,postings(*,voucher(*))`);
  console.log("After reversal - outstanding:", verifyData.value.amountCurrencyOutstanding, "expected:", inv.amountCurrency);
  console.log("SUCCESS:", verifyData.value.amountCurrencyOutstanding === inv.amountCurrency);

} else {
  const inv = paidInvoices[0];
  console.log("\nUsing existing paid invoice:", inv.id, "amountCurrency:", inv.amountCurrency, "outstanding:", inv.amountCurrencyOutstanding);

  const postings = inv.postings || [];
  let paymentPosting = postings.find((p: any) => p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE");
  if (!paymentPosting) {
    const negBetaling = postings.filter((p: any) => p.amountCurrency < 0 && p.description?.startsWith("Betaling:"));
    if (negBetaling.length === 1) paymentPosting = negBetaling[0];
  }

  if (paymentPosting) {
    const pvId = paymentPosting.voucher?.id;
    console.log("Payment voucher id:", pvId, "type:", paymentPosting.type, "amount:", paymentPosting.amountCurrency);

    // Reverse
    const { data: revData, status: revStatus } = await api("PUT", `/ledger/voucher/${pvId}/:reverse?date=2026-03-22`);
    console.log("\nReverse status:", revStatus);
    console.log("Reverse voucher id:", revData.value?.id);

    // Verify
    const { data: verifyData } = await api("GET", `/invoice/${inv.id}?fields=*,postings(*,voucher(*))`);
    console.log("After reversal - outstanding:", verifyData.value.amountCurrencyOutstanding, "expected:", inv.amountCurrency);
    console.log("SUCCESS:", verifyData.value.amountCurrencyOutstanding === inv.amountCurrency);
  } else {
    console.log("No payment posting found on the invoice");
    console.log("Postings:", JSON.stringify(postings.map((p: any) => ({ type: p.type, desc: p.description, amt: p.amountCurrency, vid: p.voucher?.id })), null, 2));
  }
}
