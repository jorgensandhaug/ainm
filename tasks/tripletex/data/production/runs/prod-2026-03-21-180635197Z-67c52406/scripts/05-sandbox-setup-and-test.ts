const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`\n${method} ${url}`);
  if (body) console.log("Body:", JSON.stringify(body));
  const opts: RequestInit = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`Status: ${res.status}`);
  let data;
  try { data = JSON.parse(text); } catch { console.log("Raw:", text); return null; }
  if (!res.ok) { console.log("Error:", JSON.stringify(data, null, 2)); return null; }
  return data;
}

// Step 1: Create a customer that simulates Solmar SL
const custRes = await api("POST", "/customer", {
  name: "Sandbox Agio Test SL",
  organizationNumber: "877276260",
  isCustomer: true,
});
const customerId = custRes?.value?.id;
console.log("Customer ID:", customerId);

// Step 2: Create a product for the order line
const prodRes = await api("POST", "/product", {
  name: "Agio Test Product",
  number: "AGIO-TEST-" + Date.now(),
  priceExcludingVatCurrency: 18687,
  vatType: { id: 3 }, // 25% MVA
});
const productId = prodRes?.value?.id;
console.log("Product ID:", productId);

// Step 3: Create order
const orderRes = await api("POST", "/order", {
  customer: { id: customerId },
  orderDate: "2026-02-01",
  deliveryDate: "2026-02-01",
  orderLines: [{
    product: { id: productId },
    count: 1,
  }],
});
const orderId = orderRes?.value?.id;
console.log("Order ID:", orderId);

// Step 4: Create invoice from order
const invRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=2026-02-01&sendToCustomer=false`);
const invoiceId = invRes?.value?.id;
console.log("Invoice ID:", invoiceId);

// Step 5: Read the invoice to see its state
const readInv = await api("GET", `/invoice/${invoiceId}?fields=*,currency(*)`);
const inv = readInv?.value;
console.log("\n=== INVOICE STATE ===");
console.log("amount:", inv?.amount);
console.log("amountCurrency:", inv?.amountCurrency);
console.log("amountExcludingVat:", inv?.amountExcludingVat);
console.log("amountOutstanding:", inv?.amountOutstanding);
console.log("amountCurrencyOutstanding:", inv?.amountCurrencyOutstanding);
console.log("currency:", inv?.currency?.code);
console.log("voucher:", inv?.voucher?.id);

// This should be: amount=23358.75 NOK, amountExcludingVat=18687, currency=NOK
// Exactly matching the production invoice

// Step 6: Now test the payment + manual agio approach
// First pay the invoice normally
const paymentTypeId = 32813748; // "Betalt til bank", debit 1920

const payRes = await api("PUT",
  `/invoice/${invoiceId}/:payment?paymentDate=2026-03-21&paymentTypeId=${paymentTypeId}&paidAmount=${inv?.amountOutstanding}&paidAmountCurrency=${inv?.amountCurrencyOutstanding}`
);
console.log("\n=== PAYMENT RESPONSE ===");
const payVal = payRes?.value;
console.log("amountOutstanding:", payVal?.amountOutstanding);
console.log("amountCurrencyOutstanding:", payVal?.amountCurrencyOutstanding);

// Step 7: Now post the agio manually
// Agio = 18687 * (10.87 - 10.33) = 18687 * 0.54 = 10090.98
const agioExVat = 18687 * (10.87 - 10.33);
const agioRounded = Math.round(agioExVat * 100) / 100;
console.log("\n=== AGIO CALCULATION ===");
console.log("Ex-VAT agio:", agioRounded);

// Also calculate on full amount
const agioInclVat = 23358.75 * (10.87 - 10.33);
const agioInclRounded = Math.round(agioInclVat * 100) / 100;
console.log("Incl-VAT agio:", agioInclRounded);

// Post journal voucher for agio (ex-VAT version first)
console.log("\n=== POSTING AGIO VOUCHER ===");
const voucherRes = await api("POST", "/ledger/voucher", {
  date: "2026-03-21",
  description: "Valutagevinst (agio) - kursendring EUR/NOK",
  postings: [
    {
      date: "2026-03-21",
      account: { id: 0 }, // will lookup
      amount: agioRounded,
      description: "Agio kursgevinst EUR"
    },
    {
      date: "2026-03-21",
      account: { id: 0 }, // will lookup
      amount: -agioRounded,
      description: "Agio kursgevinst EUR"
    }
  ]
});
console.log("Voucher result:", JSON.stringify(voucherRes, null, 2));
