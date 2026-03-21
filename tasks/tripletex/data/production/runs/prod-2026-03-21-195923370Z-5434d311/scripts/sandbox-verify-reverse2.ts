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
  if (!res.ok) { console.error("ERROR", res.status, text); process.exit(1); }
  try { return JSON.parse(text); } catch { return text; }
}

// Look up VAT types first
const vatRes = await api("GET", "/ledger/vatType?count=100");
const vatTypes = vatRes?.values || [];
const vat25 = vatTypes.find((v: any) => v.percentage === 25 && v.name?.includes("25"));
console.log("VAT 25% id:", vat25?.id, "name:", vat25?.name);
const vatTypeId = vat25?.id || vatTypes[0]?.id;

const ts = Date.now();

// Create customer
const custRes = await api("POST", "/customer", {
  name: `SandboxReverseVerify ${ts}`,
  organizationNumber: String(800000000 + Math.floor(Math.random() * 99999999)),
  customerNumber: 90000 + Math.floor(Math.random() * 9000),
});
const customerId = custRes?.value?.id;
console.log("Customer id:", customerId);

// Create product with correct VAT type
const prodRes = await api("POST", "/product", {
  name: `Systemutvikling ${ts}`,
  priceExcludingVatCurrency: 46850,
  vatType: { id: vatTypeId },
});
const productId = prodRes?.value?.id;
console.log("Product id:", productId);

// Create order
const orderRes = await api("POST", "/order", {
  customer: { id: customerId },
  deliveryDate: "2026-03-21",
  orderDate: "2026-03-21",
  orderLines: [{ product: { id: productId }, count: 1 }],
});
const orderId = orderRes?.value?.id;
console.log("Order id:", orderId);

// Invoice the order
const invoiceRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false`);
const invoiceId = invoiceRes?.value?.id;
console.log("Invoice id:", invoiceId);

// Pay the invoice
const payRes = await api("PUT", `/invoice/${invoiceId}/:payment?paymentDate=2026-03-21&paymentTypeId=32813748&paidAmount=58562.5`);
console.log("Payment registered:", payRes?.value?.id);

// === 2-CALL REVERSAL PATH ===
console.log("\n=== 2-call reversal path (scored calls only) ===");

// Call 1: Locate invoice
const locateRes = await api("GET", `/invoice?customerOrgNumber=${custRes?.value?.organizationNumber}&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`);
const invoices = locateRes?.values || [];
console.log("Invoices found:", invoices.length);

if (invoices.length === 0) {
  // Sandbox search lag - try direct
  console.log("Search lag - trying direct GET");
  const directRes = await api("GET", `/invoice/${invoiceId}?fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`);
  const inv = directRes?.value;
  if (inv) {
    console.log("Direct GET found invoice. amountExcludingVatCurrency:", inv.amountExcludingVatCurrency);
    const postings: any[] = inv.postings || [];
    let payPostings = postings.filter((p: any) =>
      p.amountCurrency < 0 && p.description?.startsWith("Betaling:") && (p.type === null || p.type === undefined)
    );
    console.log("Payment postings:", payPostings.length);
    for (const p of payPostings) {
      console.log("  id:", p.id, "amount:", p.amountCurrency, "voucher:", p.voucher?.id, "type:", p.type, "desc:", p.description);
    }
    const pvId = payPostings[0]?.voucher?.id;
    if (pvId) {
      // Call 2: Reverse
      const revRes = await api("PUT", `/ledger/voucher/${pvId}/:reverse?date=2026-03-21`);
      console.log("Reverse voucher:", revRes?.value?.id);
      // Proof read (not scored)
      const proofRes = await api("GET", `/invoice/${invoiceId}?fields=*`);
      console.log("After reversal - outstanding:", proofRes?.value?.amountCurrencyOutstanding, "expected:", inv.amountCurrency);
    }
  }
} else {
  const inv = invoices[0];
  console.log("amountExcludingVatCurrency:", inv.amountExcludingVatCurrency, "amountCurrency:", inv.amountCurrency, "outstanding:", inv.amountCurrencyOutstanding);

  const postings: any[] = inv.postings || [];
  let payPostings = postings.filter((p: any) =>
    p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE"
  );
  if (payPostings.length === 0) {
    payPostings = postings.filter((p: any) =>
      p.amountCurrency < 0 && p.description?.startsWith("Betaling:") && (p.type === null || p.type === undefined)
    );
  }

  console.log("Payment postings:", payPostings.length);
  for (const p of payPostings) {
    console.log("  id:", p.id, "amount:", p.amountCurrency, "voucher:", p.voucher?.id, "type:", p.type, "account:", p.account?.number, "desc:", p.description);
  }

  const pvId = payPostings[0]?.voucher?.id;
  if (pvId) {
    // Call 2: Reverse
    const revRes = await api("PUT", `/ledger/voucher/${pvId}/:reverse?date=2026-03-21`);
    console.log("Reverse voucher:", revRes?.value?.id);

    // Proof read (extra, not scored)
    const proofRes = await api("GET", `/invoice/${invoiceId}?fields=*`);
    console.log("After reversal - outstanding:", proofRes?.value?.amountCurrencyOutstanding, "expected:", inv.amountCurrency);
    console.log("Match:", proofRes?.value?.amountCurrencyOutstanding === inv.amountCurrency);
  }
}

console.log("\nDone.");
