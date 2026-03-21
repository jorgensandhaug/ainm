const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 0: Create a customer, order, invoice, and pay it — then reverse the payment
// This mirrors the production task shape exactly

// 0a: Create customer
const custR = await fetch(`${BASE}/customer`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({
    name: "Sandbox Windkraft Verify " + Date.now(),
    organizationNumber: "823566441",
    isCustomer: true,
  }),
});
const custD = await custR.json();
console.log("Customer:", custR.status, custD.value?.id);
const customerId = custD.value?.id;

// 0b: Create order
const orderR = await fetch(`${BASE}/order`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({
    customer: { id: customerId },
    deliveryDate: "2026-03-21",
    orderDate: "2026-03-21",
    orderLines: [{ description: "Wartung", count: 1, unitPriceExcludingVatCurrency: 29500 }],
  }),
});
const orderD = await orderR.json();
console.log("Order:", orderR.status, orderD.value?.id);
const orderId = orderD.value?.id;

// 0c: Invoice the order
const invR = await fetch(`${BASE}/order/${orderId}/:invoice?sendToCustomer=false&invoiceDate=2026-03-21`, {
  method: "PUT",
  headers: h,
});
const invD = await invR.json();
console.log("Invoice:", invR.status, invD.value?.id);
const invoiceId = invD.value?.id;

// 0d: Pay the invoice
const payR = await fetch(`${BASE}/invoice/${invoiceId}/:payment?paymentDate=2026-03-21&paymentTypeId=0&paidAmount=${invD.value?.amountCurrency || 29500}&paidAmountCurrency=${invD.value?.amountCurrency || 29500}`, {
  method: "PUT",
  headers: h,
});
const payD = await payR.json();
console.log("Payment:", payR.status);

// Now simulate the production 2-call path
console.log("\n=== PRODUCTION 2-CALL PATH ===\n");

// Call 1: GET invoice by org number
const r1 = await fetch(`${BASE}/invoice?customerOrgNumber=823566441&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`, { headers: h });
const d1 = await r1.json();
console.log("Call 1 - Invoice search:", r1.status, "count:", d1.count);

// Filter to find our specific invoice
const invoices = d1.values || [];
// Find our invoice by id (in production we'd filter by amountExcludingVatCurrency)
const target = invoices.find((v: any) => v.id === invoiceId);
if (!target) {
  console.log("Invoice not found in broad search (sandbox timing issue). Trying direct GET...");
  const directR = await fetch(`${BASE}/invoice/${invoiceId}?fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`, { headers: h });
  const directD = await directR.json();
  console.log("Direct GET:", directR.status);

  // Extract payment voucher
  const postings = directD.value?.postings || [];
  const paymentPostings = postings.filter((p: any) =>
    (p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE") ||
    (p.amountCurrency < 0 && p.description && p.description.startsWith("Betaling:"))
  );
  const voucherIds = [...new Set(paymentPostings.map((p: any) => p.voucher?.id).filter(Boolean))];
  console.log("Payment voucher ids:", voucherIds);

  if (voucherIds.length === 1) {
    // Call 2: Reverse
    const r2 = await fetch(`${BASE}/ledger/voucher/${voucherIds[0]}/:reverse?date=2026-03-21`, { method: "PUT", headers: h });
    const d2 = await r2.json();
    console.log("Call 2 - Reverse:", r2.status, "reverse voucher id:", d2.value?.id);

    // Verify
    const verR = await fetch(`${BASE}/invoice/${invoiceId}?fields=amountCurrencyOutstanding,amountCurrency,amountExcludingVatCurrency`, { headers: h });
    const verD = await verR.json();
    console.log("Verification - outstanding:", verD.value?.amountCurrencyOutstanding, "amountCurrency:", verD.value?.amountCurrency, "exVat:", verD.value?.amountExcludingVatCurrency);
  }
} else {
  console.log("Found invoice in broad search, id:", target.id, "amountExcludingVatCurrency:", target.amountExcludingVatCurrency);

  // Extract payment voucher
  const postings = target.postings || [];
  const paymentPostings = postings.filter((p: any) =>
    (p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE") ||
    (p.amountCurrency < 0 && p.description && p.description.startsWith("Betaling:"))
  );
  const voucherIds = [...new Set(paymentPostings.map((p: any) => p.voucher?.id).filter(Boolean))];
  console.log("Payment voucher ids:", voucherIds);
  console.log("Payment postings:", paymentPostings.map((p: any) => ({ desc: p.description, amt: p.amountCurrency, voucherId: p.voucher?.id, type: p.type, acct: p.account?.number })));

  if (voucherIds.length === 1) {
    // Call 2: Reverse
    const r2 = await fetch(`${BASE}/ledger/voucher/${voucherIds[0]}/:reverse?date=2026-03-21`, { method: "PUT", headers: h });
    const d2 = await r2.json();
    console.log("Call 2 - Reverse:", r2.status, "reverse voucher id:", d2.value?.id);

    // Verify
    const verR = await fetch(`${BASE}/invoice/${invoiceId}?fields=amountCurrencyOutstanding,amountCurrency,amountExcludingVatCurrency`, { headers: h });
    const verD = await verR.json();
    console.log("Verification - outstanding:", verD.value?.amountCurrencyOutstanding, "amountCurrency:", verD.value?.amountCurrency, "exVat:", verD.value?.amountExcludingVatCurrency);
  }
}
