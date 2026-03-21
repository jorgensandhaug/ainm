// Sandbox verification: create a customer, product, order, invoice it, pay it, then reverse with 2-call path
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

const ts = Date.now();

// 1. Create customer
const custR = await fetch(`${BASE}/customer`, {
  method: "POST",
  headers,
  body: JSON.stringify({ name: `SandboxReverse ${ts}`, organizationNumber: String(100000000 + Math.floor(Math.random() * 900000000)) })
});
const cust = (await custR.json()).value;
console.log("Customer:", cust.id, cust.name);

// 2. Create product
const prodR = await fetch(`${BASE}/product`, {
  method: "POST",
  headers,
  body: JSON.stringify({ name: `Diseño web ${ts}`, priceExcludingVatCurrency: 35800 })
});
const prodJson = await prodR.json();
if (!prodR.ok) { console.error("Product creation failed:", prodR.status, JSON.stringify(prodJson)); process.exit(1); }
const prod = prodJson.value;
console.log("Product:", prod.id, prod.name);

// 3. Create order
const orderR = await fetch(`${BASE}/order`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    customer: { id: cust.id },
    deliveryDate: "2026-03-21",
    orderDate: "2026-03-21",
    orderLines: [{ product: { id: prod.id }, count: 1 }]
  })
});
const order = (await orderR.json()).value;
console.log("Order:", order.id);

// 4. Invoice the order
const invR = await fetch(`${BASE}/order/${order.id}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false`, {
  method: "PUT",
  headers
});
const inv = (await invR.json()).value;
console.log("Invoice:", inv.id, "invoiceNumber:", inv.invoiceNumber, "amountCurrency:", inv.amountCurrency, "amountExcludingVatCurrency:", inv.amountExcludingVatCurrency);

// 5. Get payment types
const ptR = await fetch(`${BASE}/invoice/paymentType?count=5&fields=id,description`, { headers });
const pts = (await ptR.json()).values;
console.log("Payment types:", pts.map((p: any) => `${p.id}:${p.description}`));
const paymentTypeId = pts[0].id;

// 6. Pay the invoice
const payR = await fetch(`${BASE}/invoice/${inv.id}/:payment?paymentDate=2026-03-21&paymentTypeId=${paymentTypeId}&paidAmount=${inv.amountCurrency}`, {
  method: "PUT",
  headers
});
console.log("Payment response status:", payR.status);
const payData = await payR.json();
console.log("Payment:", JSON.stringify(payData).slice(0, 200));

// === NOW SIMULATE THE PRODUCTION 2-CALL PATH ===
console.log("\n=== PRODUCTION 2-CALL PATH ===");

// Call 1: Locate invoice by customer org number
const locateUrl = `${BASE}/invoice?customerOrgNumber=${cust.organizationNumber}&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`;
console.log("GET", locateUrl.replace(BASE, ""));
const r1 = await fetch(locateUrl, { headers });
const d1 = await r1.json();
console.log("Invoice count:", d1.count);

if (d1.count === 0) {
  console.log("Sandbox search lag - trying direct GET /invoice/{id}");
  const directR = await fetch(`${BASE}/invoice/${inv.id}?fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`, { headers });
  const directD = await directR.json();
  const directInv = directD.value;
  console.log("Direct invoice:", directInv.id, "amountExcludingVatCurrency:", directInv.amountExcludingVatCurrency, "amountCurrencyOutstanding:", directInv.amountCurrencyOutstanding);

  const postings = directInv.postings as any[];
  console.log("Postings:");
  postings.forEach((p: any) => console.log(`  desc=${p.description} amount=${p.amountCurrency} type=${p.type} voucherId=${p.voucher?.id} account=${p.account?.number}`));

  // Find payment posting
  const payPostings = postings.filter((p: any) => p.amountCurrency < 0 && p.description?.startsWith("Betaling:"));
  if (payPostings.length === 1) {
    const pvId = payPostings[0].voucher.id;
    console.log("Payment voucher id:", pvId);

    // Call 2: Reverse
    const revUrl = `${BASE}/ledger/voucher/${pvId}/:reverse?date=2026-03-21`;
    console.log("PUT", revUrl.replace(BASE, ""));
    const r2 = await fetch(revUrl, { method: "PUT", headers });
    const d2 = await r2.json();
    console.log("Reverse voucher id:", d2.value?.id);

    // Verify
    const vR = await fetch(`${BASE}/invoice/${inv.id}?fields=*,postings(*,voucher(*))`, { headers });
    const vD = await vR.json();
    console.log("After reversal - amountCurrencyOutstanding:", vD.value.amountCurrencyOutstanding);
  }
} else {
  const invoices = d1.values;
  const target = invoices.filter((i: any) => i.amountExcludingVatCurrency === 35800);
  console.log("Filtered invoices with ex-VAT 35800:", target.length);

  if (target.length === 1) {
    const inv2 = target[0];
    console.log("Target invoice:", inv2.id, "amountCurrencyOutstanding:", inv2.amountCurrencyOutstanding);

    const postings = inv2.postings as any[];
    console.log("Postings:");
    postings.forEach((p: any) => console.log(`  desc=${p.description} amount=${p.amountCurrency} type=${p.type} voucherId=${p.voucher?.id} account=${p.account?.number}`));

    // Find payment posting
    const payPostings = postings.filter((p: any) => p.amountCurrency < 0 && p.description?.startsWith("Betaling:"));
    if (payPostings.length === 1) {
      const pvId = payPostings[0].voucher.id;
      console.log("Payment voucher id:", pvId);

      // Call 2: Reverse
      const revUrl = `${BASE}/ledger/voucher/${pvId}/:reverse?date=2026-03-21`;
      console.log("PUT", revUrl.replace(BASE, ""));
      const r2 = await fetch(revUrl, { method: "PUT", headers });
      const d2 = await r2.json();
      console.log("Reverse voucher id:", d2.value?.id);

      // Verify (not part of 2-call path, just for sandbox proof)
      const vR = await fetch(`${BASE}/invoice/${inv2.id}?fields=*,postings(*,voucher(*))`, { headers });
      const vD = await vR.json();
      console.log("After reversal - amountCurrencyOutstanding:", vD.value.amountCurrencyOutstanding);
    }
  }
}
