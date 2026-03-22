// Sandbox verification: create paid invoice, then verify 2-call reverse path
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Setup: create customer, product, order, invoice, pay
const tag = Date.now();
const custR = await fetch(`${BASE}/customer`, {
  method: "POST", headers: H,
  body: JSON.stringify({ name: `SandboxReverse ${tag}`, isCustomer: true })
});
const cust = (await custR.json()).value;
console.log("Customer:", cust.id);

const prodR = await fetch(`${BASE}/product`, {
  method: "POST", headers: H,
  body: JSON.stringify({ name: `Nettverksteneste ${tag}`, priceExcludingVatCurrency: 41550 })
});
const prod = (await prodR.json()).value;
console.log("Product:", prod.id);

const orderR = await fetch(`${BASE}/order`, {
  method: "POST", headers: H,
  body: JSON.stringify({
    customer: { id: cust.id },
    deliveryDate: "2026-03-22",
    orderDate: "2026-03-22",
    orderLines: [{ product: { id: prod.id }, count: 1 }]
  })
});
const order = (await orderR.json()).value;
console.log("Order:", order.id);

// Invoice it
const invR = await fetch(`${BASE}/order/${order.id}/:invoice?invoiceDate=2026-03-22&sendToCustomer=false`, {
  method: "PUT", headers: H
});
const inv = (await invR.json()).value;
console.log("Invoice:", inv.id, "number:", inv.invoiceNumber);

// Pay it
const ptR = await fetch(`${BASE}/invoice/paymentType?count=10`, { headers: H });
const pts = (await ptR.json()).values;
const pt = pts.find((p: any) => p.description?.includes("bank")) || pts[0];
console.log("Payment type:", pt.id, pt.description);

const payR = await fetch(`${BASE}/invoice/${inv.id}/:payment`, {
  method: "PUT", headers: H,
  body: JSON.stringify({
    paymentDate: "2026-03-22",
    paymentTypeId: pt.id,
    paidAmount: inv.amount || 41550
  })
});
console.log("Payment status:", payR.status);
const payD = await payR.json();
console.log("Payment result:", JSON.stringify(payD).slice(0, 200));

// NOW: the actual 2-call canonical path
console.log("\n=== CANONICAL 2-CALL PATH ===");

// Call 1: Locate invoice
const locateUrl = `${BASE}/invoice?customerOrgNumber=${cust.organizationNumber || ""}&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`;
// Since sandbox customer has no org number, use customer.id filter
const locateUrl2 = `${BASE}/invoice?customerId=${cust.id}&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`;
const r1 = await fetch(locateUrl2, { headers: H });
const d1 = await r1.json();
console.log("Call 1 - Invoice count:", d1.count);

const target = (d1.values || []).find((i: any) => i.id === inv.id);
if (!target) {
  console.log("Target invoice not found in broad search, trying direct GET");
  const directR = await fetch(`${BASE}/invoice/${inv.id}?fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`, { headers: H });
  const directD = await directR.json();
  console.log("Direct GET status:", directR.status);
  const directInv = directD.value;
  if (directInv) {
    processInvoice(directInv);
  } else {
    console.error("Could not find invoice even via direct GET");
  }
} else {
  processInvoice(target);
}

async function processInvoice(invoice: any) {
  console.log("Invoice:", invoice.id, "amountExcludingVatCurrency:", invoice.amountExcludingVatCurrency, "amountCurrency:", invoice.amountCurrency);
  const postings = invoice.postings || [];

  // Find payment voucher
  let paymentPosting = postings.find(
    (p: any) => p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE"
  );
  if (!paymentPosting) {
    const negBetaling = postings.filter(
      (p: any) => p.amountCurrency < 0 && p.description && p.description.startsWith("Betaling:")
    );
    if (negBetaling.length === 1) {
      paymentPosting = negBetaling[0];
    }
  }

  if (!paymentPosting) {
    console.error("No payment posting found");
    console.log("All postings:", JSON.stringify(postings.map((p: any) => ({
      type: p.type, amount: p.amountCurrency, desc: p.description,
      voucherId: p.voucher?.id, acct: p.account?.number
    })), null, 2));
    return;
  }

  const voucherId = paymentPosting.voucher?.id;
  console.log("Payment voucher:", voucherId, "type:", paymentPosting.type, "desc:", paymentPosting.description);

  // Call 2: Reverse
  const reverseUrl = `${BASE}/ledger/voucher/${voucherId}/:reverse?date=2026-03-22`;
  const r2 = await fetch(reverseUrl, { method: "PUT", headers: H });
  const d2 = await r2.json();
  console.log("Call 2 - Reverse status:", r2.status);
  console.log("Reverse voucher:", d2.value?.id);

  // Verification read (not part of scored path, just for sandbox proof)
  const verifyR = await fetch(`${BASE}/invoice/${invoice.id}?fields=*,postings(*,voucher(*))`, { headers: H });
  const verifyD = await verifyR.json();
  console.log("Verification - amountCurrencyOutstanding:", verifyD.value?.amountCurrencyOutstanding);
  console.log("Expected:", invoice.amountCurrency);
  console.log("Match:", verifyD.value?.amountCurrencyOutstanding === invoice.amountCurrency);
}
