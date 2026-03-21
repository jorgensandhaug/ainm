const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string): Promise<any> {
  const url = `${BASE}${path}`;
  console.log(`GET ${url.substring(0, 150)}`);
  const r = await fetch(url, { headers });
  const body = await r.json();
  console.log(`Status: ${r.status}`);
  if (!r.ok) { console.log(JSON.stringify(body).substring(0, 500)); throw new Error(`GET failed ${r.status}`); }
  return body;
}

async function post(path: string, body: any): Promise<any> {
  const url = `${BASE}${path}`;
  console.log(`POST ${url}`);
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const respBody = await r.json();
  console.log(`Status: ${r.status}`);
  if (!r.ok) { console.log(JSON.stringify(respBody).substring(0, 500)); throw new Error(`POST failed ${r.status}`); }
  return respBody;
}

async function put(path: string): Promise<any> {
  const url = `${BASE}${path}`;
  console.log(`PUT ${url}`);
  const r = await fetch(url, { method: "PUT", headers });
  const body = await r.json();
  console.log(`Status: ${r.status}`);
  if (!r.ok) { console.log(JSON.stringify(body).substring(0, 500)); throw new Error(`PUT failed ${r.status}`); }
  return body;
}

async function main() {
  // Step 1: Find EUR currency ID
  const currRes = await get(`/currency?code=EUR&fields=*`);
  const eurCurrency = currRes.values?.[0];
  if (!eurCurrency) throw new Error("EUR currency not found");
  console.log(`EUR currency ID: ${eurCurrency.id}`);

  // Step 2: Create a customer "Océan Test SARL"
  const custRes = await post(`/customer`, {
    name: "Océan Reflection E0BD SARL",
    organizationNumber: "863081793",
    isCustomer: true
  });
  const customer = custRes.value;
  console.log(`Customer: ID=${customer.id}, name=${customer.name}`);

  // Step 3: Create a EUR order
  const orderRes = await post(`/order`, {
    customer: { id: customer.id },
    orderDate: "2026-03-21",
    deliveryDate: "2026-03-21",
    currency: { id: eurCurrency.id },
    isClosed: false
  });
  const order = orderRes.value;
  console.log(`Order: ID=${order.id}`);

  // Step 4: Add an order line for 12689 EUR (ex-VAT, no VAT on export)
  const lineRes = await post(`/order/orderline`, {
    order: { id: order.id },
    description: "Consulting services",
    count: 1,
    unitPriceExcludingVatCurrency: 12689,
    vatType: { id: 6 } // try common VAT type
  });
  console.log(`Order line: ID=${lineRes.value?.id}`);

  // Step 5: Create invoice from order
  const invoiceRes = await put(`/order/${order.id}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false`);
  const invoiceId = invoiceRes.value?.id;
  console.log(`Invoice created: ID=${invoiceId}`);

  // Step 6: Fetch the invoice to see all fields
  const invDetail = await get(`/invoice/${invoiceId}?fields=*,currency(*)`);
  const inv = invDetail.value;
  console.log(`\n=== Invoice details ===`);
  console.log(`currency.code: ${inv.currency?.code}`);
  console.log(`amount: ${inv.amount}`);
  console.log(`amountCurrency: ${inv.amountCurrency}`);
  console.log(`amountExcludingVat: ${inv.amountExcludingVat}`);
  console.log(`amountExcludingVatCurrency: ${inv.amountExcludingVatCurrency}`);
  console.log(`amountOutstanding: ${inv.amountOutstanding}`);
  console.log(`amountCurrencyOutstanding: ${inv.amountCurrencyOutstanding}`);
  console.log(`amount === amountCurrency: ${inv.amount === inv.amountCurrency}`);

  // Step 7: Get payment type
  const ptRes = await get(`/invoice/paymentType?fields=*,debitAccount(*)`);
  const paymentTypes = ptRes.values || [];
  let paymentType = paymentTypes.find((pt: any) =>
    pt.debitAccount?.number >= 1900 && pt.debitAccount?.number < 2000 && pt.debitAccount?.isBankAccount === true
  );
  if (!paymentType) throw new Error("No payment type");
  console.log(`Payment type: ID=${paymentType.id}, debitAccount=${paymentType.debitAccount?.number}`);

  // Step 8: Register payment with FX difference (settlement rate 10.71 vs original ~11.28)
  const paidAmountCurrency = inv.amountCurrencyOutstanding;
  const settlementRate = 10.71;
  const paidAmount = Math.round(paidAmountCurrency * settlementRate * 100) / 100;
  console.log(`\nPaying: paidAmountCurrency=${paidAmountCurrency} EUR, paidAmount=${paidAmount} NOK (at rate ${settlementRate})`);

  const payRes = await put(`/invoice/${invoiceId}/:payment?paymentDate=2026-03-21&paymentTypeId=${paymentType.id}&paidAmount=${paidAmount}&paidAmountCurrency=${paidAmountCurrency}`);
  const payInv = payRes.value;
  console.log(`Payment result: amountOutstanding=${payInv?.amountOutstanding}, amountCurrencyOutstanding=${payInv?.amountCurrencyOutstanding}`);

  // Step 9: Check voucher for FX entries
  // Find the payment voucher
  const voucherRes = await get(`/ledger/voucher?dateFrom=2026-03-21&dateTo=2026-03-21&fields=*`);
  const vouchers = voucherRes.values || [];
  console.log(`\nVouchers found: ${vouchers.length}`);

  // Get the most recent voucher postings
  for (const v of vouchers.slice(-3)) {
    console.log(`\nVoucher ${v.id}, type=${v.typeId}, desc=${v.description}`);
    const postRes = await get(`/ledger/voucher/${v.id}?fields=*,postings(*,account(*))`);
    const postings = postRes.value?.postings || [];
    for (const p of postings) {
      console.log(`  Account ${p.account?.number} (${p.account?.name}): amount=${p.amount}, amountCurrency=${p.amountCurrency}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
