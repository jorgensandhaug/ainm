const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const opts: RequestInit = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const url = `${BASE}${path}`;
  console.log(`\n${method} ${url}`);
  const res = await fetch(url, opts);
  const data = await res.json();
  console.log("Status:", res.status);
  if (res.status >= 400) console.log("Error:", JSON.stringify(data, null, 2));
  return { status: res.status, data };
}

// Step 1: Get valid VAT types
console.log("=== Get VAT types ===");
const vatRes = await api("GET", "/ledger/vatType?fields=*&count=100");
const vat25 = vatRes.data?.values?.find((v: any) => v.percentage === 25 && v.name?.includes("utgå"));
console.log("25% VAT:", JSON.stringify({ id: vat25?.id, name: vat25?.name, number: vat25?.number }));

// Use customer from previous step (or create new)
const customerId = 108386326; // FX Agio Test GmbH

// Step 2: Create order in EUR
console.log("\n=== Create order in EUR ===");
const orderRes = await api("POST", "/order", {
  customer: { id: customerId },
  orderDate: "2026-03-01",
  deliveryDate: "2026-03-01",
  currency: { id: 5 }, // EUR
  orderLines: [{
    description: "FX Agio Test Service",
    count: 1,
    unitPriceExcludingVatCurrency: 13892,
    vatType: { id: vat25?.id },
  }]
});
const orderId = orderRes.data?.value?.id;
console.log("Order ID:", orderId);
if (!orderId) process.exit(1);

// Step 3: Create invoice
console.log("\n=== Create invoice ===");
const invRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=2026-03-01&sendToCustomer=false`);
const invoiceId = invRes.data?.value?.id;
console.log("Invoice ID:", invoiceId);
if (!invoiceId) { console.log("Full response:", JSON.stringify(invRes.data, null, 2)); process.exit(1); }

// Step 4: Read invoice to see amounts
console.log("\n=== Read invoice ===");
const readRes = await api("GET", `/invoice/${invoiceId}?fields=*,currency(*)`);
const inv = readRes.data?.value;
console.log("Invoice details:", JSON.stringify({
  id: inv?.id,
  currency: inv?.currency?.code,
  amount: inv?.amount,
  amountCurrency: inv?.amountCurrency,
  amountOutstanding: inv?.amountOutstanding,
  amountCurrencyOutstanding: inv?.amountCurrencyOutstanding,
  amountExcludingVat: inv?.amountExcludingVat,
  amountExcludingVatCurrency: inv?.amountExcludingVatCurrency,
}, null, 2));

// Verify it's truly EUR (amount !== amountCurrency)
console.log(`\nFX check: amount=${inv?.amount} vs amountCurrency=${inv?.amountCurrency} → ${inv?.amount !== inv?.amountCurrency ? 'TRUE EUR INVOICE' : 'NOK INVOICE'}`);

// Step 5: Get payment type (19xx bank)
console.log("\n=== Get payment types ===");
const ptRes = await api("GET", "/invoice/paymentType?fields=*,debitAccount(*)");
const pts = ptRes.data?.values || [];
// Find 19xx bank payment type
let bankPT = pts.find((pt: any) => {
  const n = pt.debitAccount?.number;
  return n >= 1900 && n < 2000 && pt.debitAccount?.isBankAccount === true;
});
if (!bankPT) {
  bankPT = pts.find((pt: any) => {
    const n = pt.debitAccount?.number;
    return n >= 1900 && n < 2000;
  });
}
console.log("Bank PT:", JSON.stringify({ id: bankPT?.id, desc: bankPT?.description, acct: bankPT?.debitAccount?.number }));

// Step 6: Pay at rate 11.28 NOK/EUR (agio = gain because 11.28 > original rate)
// paidAmountCurrency = amountCurrencyOutstanding (EUR) = 17365 EUR
// paidAmount = amountCurrencyOutstanding * 11.28 = NOK at settlement
const paidAmountCurrency = inv?.amountCurrencyOutstanding;
const paidAmount = paidAmountCurrency * 11.28;
console.log(`\n=== Pay: paidAmountCurrency=${paidAmountCurrency} EUR, paidAmount=${paidAmount} NOK (rate 11.28) ===`);
const payRes = await api("PUT", `/invoice/${invoiceId}/:payment?paymentDate=2026-03-21&paymentTypeId=${bankPT?.id}&paidAmount=${paidAmount}&paidAmountCurrency=${paidAmountCurrency}`);
const payInv = payRes.data?.value;
console.log("Post-payment:", JSON.stringify({
  amountOutstanding: payInv?.amountOutstanding,
  amountCurrencyOutstanding: payInv?.amountCurrencyOutstanding,
}, null, 2));

// Step 7: Check voucher for agio posting
const voucherId = payInv?.voucher?.id;
console.log("\nVoucher ID:", voucherId);
if (voucherId) {
  const vRes = await api("GET", `/ledger/voucher/${voucherId}?fields=*,postings(*,account(*))`);
  const postings = vRes.data?.value?.postings || [];
  console.log("\n=== Voucher postings ===");
  for (const p of postings) {
    console.log(`  Account ${p.account?.number} (${p.account?.name}) | AmountGross: ${p.amountGross} | AmountCurrency: ${p.amountCurrency}`);
  }
}
