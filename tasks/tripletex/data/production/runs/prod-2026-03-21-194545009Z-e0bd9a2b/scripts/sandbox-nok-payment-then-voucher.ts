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
  if (!r.ok) { console.log(JSON.stringify(respBody).substring(0, 1000)); throw new Error(`POST failed ${r.status}`); }
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
  // Step 1: Create a NOK customer invoice for 12689 NOK (ex-VAT) to mimic production
  // First create a customer
  const custRes = await post(`/customer`, {
    name: "NOK Test SARL E0BD",
    organizationNumber: "863081001",
    isCustomer: true
  });
  const customer = custRes.value;
  console.log(`Customer: ID=${customer.id}`);

  // Create a NOK order
  const orderRes = await post(`/order`, {
    customer: { id: customer.id },
    orderDate: "2026-03-21",
    deliveryDate: "2026-03-21",
    isClosed: false
  });
  const order = orderRes.value;
  console.log(`Order: ID=${order.id}`);

  // Add order line with 25% VAT (12689 ex-VAT, 15861.25 with VAT)
  const lineRes = await post(`/order/orderline`, {
    order: { id: order.id },
    description: "Services",
    count: 1,
    unitPriceExcludingVatCurrency: 12689,
    vatType: { id: 6 } // standard VAT
  });
  console.log(`Order line: ID=${lineRes.value?.id}`);

  // Create invoice
  const invoiceRes = await put(`/order/${order.id}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false`);
  const invoiceId = invoiceRes.value?.id;
  console.log(`Invoice created: ID=${invoiceId}`);

  // Check invoice details
  const invDetail = await get(`/invoice/${invoiceId}?fields=*,currency(*)`);
  const inv = invDetail.value;
  console.log(`\n=== Invoice ===`);
  console.log(`currency=${inv.currency?.code}, amount=${inv.amount}, amountCurrency=${inv.amountCurrency}`);
  console.log(`amountExcludingVat=${inv.amountExcludingVat}, amountOutstanding=${inv.amountOutstanding}`);

  // Step 2: Register simple payment
  const ptRes = await get(`/invoice/paymentType?fields=*,debitAccount(*)`);
  const paymentType = (ptRes.values || []).find((pt: any) =>
    pt.debitAccount?.number >= 1900 && pt.debitAccount?.number < 2000 && pt.debitAccount?.isBankAccount === true
  );
  console.log(`Payment type: ID=${paymentType.id}, debitAccount=${paymentType.debitAccount?.number}`);

  // Pay full outstanding
  const payRes = await put(`/invoice/${invoiceId}/:payment?paymentDate=2026-03-21&paymentTypeId=${paymentType.id}&paidAmount=${inv.amountOutstanding}`);
  console.log(`Payment result: amountOutstanding=${payRes.value?.amountOutstanding}`);

  // Step 3: Now create a manual voucher for disagio
  // Original rate: 11.28, settlement rate: 10.71
  // Disagio = EUR amount * (original rate - settlement rate)
  // But we need to think about what makes sense for a NOK invoice...
  // EUR ex-VAT: 12689, EUR with VAT: 15861.25
  // Disagio at ex-VAT level: 12689 * (11.28 - 10.71) = 12689 * 0.57 = 7232.73
  // Disagio with VAT: 15861.25 * 0.57 = 9040.91
  // Or maybe: 12689 * 1.25 * (11.28 - 10.71) = 9040.9125

  const disagioAmount = Math.round(12689 * (11.28 - 10.71) * 100) / 100;
  console.log(`\nDisagio amount (ex-VAT): ${disagioAmount}`);

  // Try creating a manual voucher
  // Account 8160 = Valutatap/disagio (debit = expense)
  // Account 1920 = Bank (credit)
  try {
    const today = "2026-03-21";

    // First, get the account IDs for 8160 and 1920
    const acc8160Res = await get(`/ledger/account?number=8160&fields=*`);
    const acc8160 = acc8160Res.values?.[0];
    console.log(`Account 8160: ID=${acc8160?.id}, name=${acc8160?.name}`);

    const acc1920Res = await get(`/ledger/account?number=1920&fields=*`);
    const acc1920 = acc1920Res.values?.[0];
    console.log(`Account 1920: ID=${acc1920?.id}, name=${acc1920?.name}`);

    const voucherRes = await post(`/ledger/voucher`, {
      date: today,
      description: "Valutatap/disagio",
      postings: [
        {
          date: today,
          account: { id: acc8160.id },
          amount: disagioAmount,
          description: "Disagio on EUR payment"
        },
        {
          date: today,
          account: { id: acc1920.id },
          amount: -disagioAmount,
          description: "Disagio on EUR payment"
        }
      ]
    });
    console.log(`Voucher created: ID=${voucherRes.value?.id}`);
    console.log(`Voucher response:`, JSON.stringify(voucherRes.value).substring(0, 500));
  } catch (e: any) {
    console.log(`Voucher creation failed: ${e.message}`);
  }

  // Step 4: Verify final state
  const finalInv = await get(`/invoice/${invoiceId}?fields=*,currency(*)`);
  console.log(`\n=== Final invoice state ===`);
  console.log(`amountOutstanding=${finalInv.value?.amountOutstanding}, amountCurrencyOutstanding=${finalInv.value?.amountCurrencyOutstanding}`);
}

main().catch(e => { console.error(e); process.exit(1); });
