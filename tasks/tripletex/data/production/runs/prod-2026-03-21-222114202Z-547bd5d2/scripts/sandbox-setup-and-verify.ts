const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const HEADERS = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: Create a customer
const custResp = await fetch(`${BASE}/customer`, {
  method: "POST",
  headers: HEADERS,
  body: JSON.stringify({
    name: "Sandbox Polaris Verify " + Date.now(),
    organizationNumber: "896496468",
  }),
});
const custData = await custResp.json();
const customerId = custData.value.id;
console.log("Customer created:", customerId);

// Step 2: Create an order
const orderResp = await fetch(`${BASE}/order`, {
  method: "POST",
  headers: HEADERS,
  body: JSON.stringify({
    customer: { id: customerId },
    deliveryDate: "2026-03-21",
    orderDate: "2026-03-21",
    orderLines: [
      { description: "Skylagring", count: 1, unitPriceExcludingVatCurrency: 17200 },
    ],
  }),
});
const orderData = await orderResp.json();
const orderId = orderData.value.id;
console.log("Order created:", orderId);

// Step 3: Create invoice from order
const invoiceResp = await fetch(`${BASE}/order/${orderId}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false`, {
  method: "PUT",
  headers: HEADERS,
});
const invoiceData = await invoiceResp.json();
const invoiceId = invoiceData.value.id;
console.log("Invoice created:", invoiceId);

// Step 4: Pay the invoice
const paymentTypeResp = await fetch(`${BASE}/invoice/paymentType`, { headers: HEADERS });
const paymentTypeData = await paymentTypeResp.json();
const bankPaymentType = paymentTypeData.values.find((pt: any) => pt.description?.includes("Bank"));
const paymentTypeId = bankPaymentType?.id || paymentTypeData.values[0].id;
console.log("Payment type:", paymentTypeId);

const payResp = await fetch(
  `${BASE}/invoice/${invoiceId}/:payment?paymentDate=2026-03-21&paymentTypeId=${paymentTypeId}&paidAmount=17200`,
  { method: "PUT", headers: HEADERS }
);
const payData = await payResp.json();
console.log("Payment status:", payResp.status);

// Now test the 2-call reverse path
console.log("\n=== Testing 2-call reverse path ===");

// Call 1: Locate invoice
const locateUrl = `${BASE}/invoice?customerOrgNumber=896496468&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`;
const locateResp = await fetch(locateUrl, { headers: HEADERS });
const locateData = await locateResp.json();
console.log("Locate count:", locateData.count);

// Find our invoice by id (in sandbox there may be many)
const targetInvoice = locateData.values.find((inv: any) => inv.id === invoiceId);
if (!targetInvoice) {
  console.log("Invoice not found in broad search, trying direct GET");
  // Direct fallback
  const directResp = await fetch(`${BASE}/invoice/${invoiceId}?fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`, { headers: HEADERS });
  const directData = await directResp.json();
  console.log("Direct GET status:", directResp.status);
  const postings = directData.value.postings || [];
  const paymentPostings = postings.filter((p: any) =>
    p.amountCurrency < 0 && p.description && p.description.startsWith("Betaling:")
  );
  console.log("Payment postings found:", paymentPostings.length);
  if (paymentPostings.length === 1) {
    const pvId = paymentPostings[0].voucher.id;
    console.log("Payment voucher id:", pvId);
    // Call 2: Reverse
    const revResp = await fetch(`${BASE}/ledger/voucher/${pvId}/:reverse?date=2026-03-21`, {
      method: "PUT",
      headers: HEADERS,
    });
    const revData = await revResp.json();
    console.log("Reverse status:", revResp.status);
    console.log("Reverse voucher:", revData.value?.id);
  }
} else {
  console.log("Found invoice:", targetInvoice.id, "amountExcludingVatCurrency:", targetInvoice.amountExcludingVatCurrency);
  const postings = targetInvoice.postings || [];
  const paymentPostings = postings.filter((p: any) =>
    p.amountCurrency < 0 && p.description && p.description.startsWith("Betaling:")
  );
  console.log("Payment postings found:", paymentPostings.length);
  if (paymentPostings.length === 1) {
    const pvId = paymentPostings[0].voucher.id;
    console.log("Payment voucher id:", pvId);
    // Call 2: Reverse
    const revResp = await fetch(`${BASE}/ledger/voucher/${pvId}/:reverse?date=2026-03-21`, {
      method: "PUT",
      headers: HEADERS,
    });
    const revData = await revResp.json();
    console.log("Reverse status:", revResp.status);
    console.log("Reverse voucher:", revData.value?.id);
  }
}

// Verify outstanding amount reopened
const verifyResp = await fetch(`${BASE}/invoice/${invoiceId}?fields=*,postings(*,voucher(*))`, { headers: HEADERS });
const verifyData = await verifyResp.json();
console.log("\n=== Verification ===");
console.log("amountCurrencyOutstanding:", verifyData.value.amountCurrencyOutstanding);
console.log("amountCurrency:", verifyData.value.amountCurrency);
