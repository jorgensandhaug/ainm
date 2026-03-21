// Create a proper EUR invoice for 18687 EUR at rate 10.33, pay at 10.87, see auto-agio
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`${method} ${path.substring(0, 80)} -> ${res.status}`);
  if (!res.ok) {
    console.log(`  ERROR: ${text.substring(0, 500)}`);
    return null;
  }
  try { return JSON.parse(text); } catch { return text; }
}

async function main() {
  // Find EUR currency ID
  const currRes = await api("GET", `/currency?code=EUR&fields=*`);
  const eur = currRes?.values?.find((c: any) => c.code === "EUR");
  console.log(`EUR currency: id=${eur?.id}`);

  // Create customer
  const custRes = await api("POST", `/customer`, {
    name: "EUR Agio Test SL 2",
    organizationNumber: "999888772",
    customerNumber: 99772,
  });
  const customerId = custRes?.value?.id;
  console.log(`Customer: ${customerId}`);

  // Create order with EUR currency
  const orderRes = await api("POST", `/order`, {
    customer: { id: customerId },
    deliveryDate: TODAY,
    orderDate: TODAY,
    currency: { id: eur?.id },
  });
  const orderId = orderRes?.value?.id;
  console.log(`Order: ${orderId}`);

  // Add order line - 18687 EUR ex-VAT
  const lineRes = await api("POST", `/order/orderline`, {
    order: { id: orderId },
    description: "Service EUR 18687",
    count: 1,
    unitPriceExcludingVatCurrency: 18687,
  });
  console.log(`Line: ${lineRes?.value?.id}`);

  // Create invoice
  const invRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
  const invoiceId = invRes?.value?.id;
  console.log(`Invoice: ${invoiceId}`);

  // Read invoice details
  const inv = (await api("GET", `/invoice/${invoiceId}?fields=*,currency(*)`))?.value;
  if (inv) {
    console.log(`\nInvoice details:
  currency=${inv.currency?.code}
  amountExcludingVat=${inv.amountExcludingVat} (NOK ex-VAT)
  amountExcludingVatCurrency=${inv.amountExcludingVatCurrency} (EUR ex-VAT)
  amount=${inv.amount} (NOK total)
  amountCurrency=${inv.amountCurrency} (EUR total)
  amountOutstanding=${inv.amountOutstanding} (NOK outstanding)
  amountCurrencyOutstanding=${inv.amountCurrencyOutstanding} (EUR outstanding)`);
  }

  // Pay at rate 10.87
  const paidAmountCurrency = inv?.amountCurrencyOutstanding; // EUR
  const paidAmount = paidAmountCurrency * 10.87; // NOK at settlement rate
  console.log(`\nPayment: ${paidAmountCurrency} EUR * 10.87 = ${paidAmount} NOK`);

  const payRes = await api("PUT", `/invoice/${invoiceId}/:payment?paymentDate=${TODAY}&paymentTypeId=32813748&paidAmount=${paidAmount}&paidAmountCurrency=${paidAmountCurrency}`);
  if (payRes?.value) {
    console.log(`Outstanding: ${payRes.value.amountOutstanding} / ${payRes.value.amountCurrencyOutstanding}`);
  }

  // Check what postings were created on 8060
  console.log("\n=== Auto-generated 8060 postings ===");
  const agioPostings = await api("GET", `/ledger/posting?accountNumberFrom=8060&accountNumberTo=8060&dateFrom=${TODAY}&dateTo=${TODAY}&fields=*,account(id,number)`);
  if (agioPostings?.values) {
    for (const p of agioPostings.values) {
      console.log(`  amount=${p.amount} desc=${p.description}`);
    }
  }

  // Check 8160 postings
  console.log("\n=== Auto-generated 8160 postings ===");
  const disagioPostings = await api("GET", `/ledger/posting?accountNumberFrom=8160&accountNumberTo=8160&dateFrom=${TODAY}&dateTo=${TODAY}&fields=*,account(id,number)`);
  if (disagioPostings?.values) {
    for (const p of disagioPostings.values) {
      console.log(`  amount=${p.amount} desc=${p.description}`);
    }
  }

  // Find the payment voucher and check ALL its postings
  // The payment voucher should be the most recent one
  console.log("\n=== Payment voucher postings ===");
  const vouchers = await api("GET", `/ledger/voucher?dateFrom=${TODAY}&dateTo=${TODAY}&fields=id,number,description&count=5`);
  if (vouchers?.values) {
    // Get the most recent voucher (likely the payment one)
    const lastVouchers = vouchers.values.slice(-3);
    for (const v of lastVouchers) {
      console.log(`\nVoucher ${v.id} (num=${v.number}): ${v.description}`);
      const postings = await api("GET", `/ledger/posting?voucherId=${v.id}&fields=*,account(id,number)`);
      if (postings?.values) {
        for (const p of postings.values) {
          console.log(`  acct=${p.account?.number} amount=${p.amount} amountCurrency=${p.amountCurrency} desc=${p.description}`);
        }
      }
    }
  }
}

main().catch(console.error);
