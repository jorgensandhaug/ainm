// Sandbox verification: create a paid invoice, then reverse the payment in 2 calls
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(method, url);
  const opts: any = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  if (!res.ok) { console.error("ERROR", res.status, text); return null; }
  try { return JSON.parse(text); } catch { return text; }
}

// Step 1: Create a customer
const ts = Date.now();
const custRes = await api("POST", "/customer", {
  name: `SandboxReverseTest ${ts}`,
  organizationNumber: String(800000000 + Math.floor(Math.random() * 99999999)),
  customerNumber: 90000 + Math.floor(Math.random() * 9000),
});
const customerId = custRes?.value?.id;
console.log("Customer id:", customerId);

// Step 2: Create a product
const prodRes = await api("POST", "/product", {
  name: `TestProduct ${ts}`,
  priceExcludingVatCurrency: 46850,
  vatType: { id: 3 }, // 25% MVA
});
const productId = prodRes?.value?.id;
console.log("Product id:", productId);

// Step 3: Create an order
const orderRes = await api("POST", "/order", {
  customer: { id: customerId },
  deliveryDate: "2026-03-21",
  orderDate: "2026-03-21",
  orderLines: [{ product: { id: productId }, count: 1 }],
});
const orderId = orderRes?.value?.id;
console.log("Order id:", orderId);

// Step 4: Invoice the order
const invoiceRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false`);
const invoiceId = invoiceRes?.value?.id;
console.log("Invoice id:", invoiceId);

// Step 5: Look up payment types
const ptRes = await api("GET", "/invoice/paymentType");
const paymentTypes = ptRes?.values || [];
console.log("Payment types:", paymentTypes.map((pt: any) => `${pt.id}:${pt.description}`));

// Step 6: Pay the invoice
const payTypeId = paymentTypes[0]?.id;
const payRes = await api("PUT", `/invoice/${invoiceId}/:payment?paymentDate=2026-03-21&paymentTypeId=${payTypeId}&paidAmount=58562.5`);
console.log("Payment registered, invoice id:", payRes?.value?.id);

// === NOW TEST THE 2-CALL REVERSAL PATH ===
console.log("\n=== Testing 2-call reversal path ===");

// Call 1: Locate the invoice and extract payment voucher
const locateRes = await api("GET", `/invoice?id=${invoiceId}&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`);
const invoice = locateRes?.values?.[0];
if (!invoice) {
  console.error("Invoice not found in search, trying direct GET");
  const directRes = await api("GET", `/invoice/${invoiceId}?fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`);
  console.log("Direct GET result:", JSON.stringify(directRes?.value, null, 2));
} else {
  console.log("Invoice found. amountCurrency:", invoice.amountCurrency, "amountCurrencyOutstanding:", invoice.amountCurrencyOutstanding);
  console.log("amountExcludingVatCurrency:", invoice.amountExcludingVatCurrency);

  const postings: any[] = invoice.postings || [];

  // Try typed postings first
  let paymentPostings = postings.filter((p: any) =>
    p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE"
  );

  // Fallback: unique negative Betaling posting with type=null
  if (paymentPostings.length === 0) {
    paymentPostings = postings.filter((p: any) =>
      p.amountCurrency < 0 &&
      p.description?.startsWith("Betaling:") &&
      (p.type === null || p.type === undefined)
    );
  }

  console.log("Payment postings:", paymentPostings.length);
  for (const p of paymentPostings) {
    console.log("  id:", p.id, "amount:", p.amountCurrency, "voucher:", p.voucher?.id, "type:", p.type, "account:", p.account?.number, "desc:", p.description);
  }

  const paymentVoucherIds = [...new Set(paymentPostings.map((p: any) => p.voucher?.id).filter(Boolean))];
  if (paymentVoucherIds.length !== 1) {
    console.error("Expected 1 payment voucher, got", paymentVoucherIds.length);
  } else {
    const pvId = paymentVoucherIds[0];

    // Call 2: Reverse
    const reverseRes = await api("PUT", `/ledger/voucher/${pvId}/:reverse?date=2026-03-21`);
    console.log("Reverse voucher id:", reverseRes?.value?.id);

    // Verification read (not part of the 2-call path, just for proof)
    const verifyRes = await api("GET", `/invoice/${invoiceId}?fields=*,postings(*,voucher(*))`);
    console.log("After reversal - amountCurrencyOutstanding:", verifyRes?.value?.amountCurrencyOutstanding);
    console.log("Expected:", invoice.amountCurrency);
    console.log("Match:", verifyRes?.value?.amountCurrencyOutstanding === invoice.amountCurrency);
  }
}

console.log("\nDone.");
