const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const opts: RequestInit = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const url = `${BASE}${path}`;
  console.log(`\n${method} ${url}`);
  if (body) console.log("Body:", JSON.stringify(body, null, 2));
  const res = await fetch(url, opts);
  const data = await res.json();
  console.log("Status:", res.status);
  if (res.status >= 400) {
    console.log("Error:", JSON.stringify(data, null, 2));
  }
  return { status: res.status, data };
}

// Step 1: Create a customer for FX testing
console.log("=== Step 1: Create customer ===");
const custRes = await api("POST", "/customer", {
  name: "FX Agio Test GmbH",
  organizationNumber: "999888777",
  isCustomer: true,
});
const customerId = custRes.data?.value?.id;
console.log("Customer ID:", customerId);

// Step 2: Get EUR currency ID
console.log("\n=== Step 2: Get EUR currency ===");
const currRes = await api("GET", "/currency?code=EUR&fields=*");
const eurId = currRes.data?.values?.[0]?.id;
console.log("EUR currency ID:", eurId);

// Step 3: Create an order with EUR currency at rate 10.38
console.log("\n=== Step 3: Create order in EUR ===");
const orderRes = await api("POST", "/order", {
  customer: { id: customerId },
  orderDate: "2026-03-01",
  deliveryDate: "2026-03-01",
  currency: { id: eurId },
  // 13892 EUR ex-VAT, rate 10.38
  orderLines: [
    {
      description: "FX Test Service",
      count: 1,
      unitPriceExcludingVatCurrency: 13892,
      vatType: { id: 3 }, // 25% VAT
    }
  ]
});
const orderId = orderRes.data?.value?.id;
console.log("Order ID:", orderId);

// Step 4: Create invoice from order
console.log("\n=== Step 4: Create invoice from order ===");
const invRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=2026-03-01&sendToCustomer=false`);
console.log("Invoice response:", JSON.stringify(invRes.data?.value, null, 2));
const invoiceId = invRes.data?.value?.id;
console.log("Invoice ID:", invoiceId);

// Step 5: Read the invoice to see amounts
console.log("\n=== Step 5: Read invoice ===");
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

// Step 6: Get payment types
console.log("\n=== Step 6: Get payment types ===");
const ptRes = await api("GET", "/invoice/paymentType?fields=*,debitAccount(*)");
const paymentTypes = ptRes.data?.values || [];
const bankPT = paymentTypes.find((pt: any) => {
  const acct = pt.debitAccount?.number;
  return acct >= 1900 && acct < 2000;
});
console.log("Bank payment type:", JSON.stringify({
  id: bankPT?.id,
  description: bankPT?.description,
  debitAccount: bankPT?.debitAccount?.number,
}, null, 2));
const paymentTypeId = bankPT?.id;

// Step 7: Pay the invoice at rate 11.28 NOK/EUR (agio - gain)
// paidAmountCurrency = amountCurrencyOutstanding (EUR)
// paidAmount = amountCurrencyOutstanding * 11.28 (NOK at settlement rate)
const paidAmountCurrency = inv?.amountCurrencyOutstanding;
const paidAmount = paidAmountCurrency * 11.28;
console.log(`\n=== Step 7: Pay invoice — paidAmountCurrency=${paidAmountCurrency} EUR, paidAmount=${paidAmount} NOK ===`);
const payRes = await api("PUT", `/invoice/${invoiceId}/:payment?paymentDate=2026-03-21&paymentTypeId=${paymentTypeId}&paidAmount=${paidAmount}&paidAmountCurrency=${paidAmountCurrency}`);
console.log("Payment result:", JSON.stringify({
  amountOutstanding: payRes.data?.value?.amountOutstanding,
  amountCurrencyOutstanding: payRes.data?.value?.amountCurrencyOutstanding,
}, null, 2));

// Step 8: Check the payment voucher to verify agio booking
const paymentVoucherId = payRes.data?.value?.voucher?.id || payRes.data?.value?.voucherId;
console.log("Payment voucher ID:", paymentVoucherId);

// Get voucher postings to check for agio account 8060
if (paymentVoucherId) {
  console.log("\n=== Step 8: Check voucher for agio ===");
  const voucherRes = await api("GET", `/ledger/voucher/${paymentVoucherId}?fields=*,postings(*)`);
  const postings = voucherRes.data?.value?.postings || [];
  for (const p of postings) {
    console.log(`  Account ${p.account?.id} | Debit: ${p.amountGross} | AmountCurrency: ${p.amountCurrency}`);
  }

  // Also get postings with account expansion
  const postingsRes = await api("GET", `/ledger/voucher/${paymentVoucherId}?fields=*,postings(*,account(*))`);
  const postings2 = postingsRes.data?.value?.postings || [];
  for (const p of postings2) {
    console.log(`  Account ${p.account?.number} (${p.account?.name}) | Amount: ${p.amountGross} | AmountCurrency: ${p.amountCurrency}`);
  }
}
