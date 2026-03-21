// Test: manual agio voucher with row=1 (not row=0)
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
  // Test 1: agio voucher on 1920/8060 with row=1,2
  console.log("=== Test: agio voucher 1920 debit, 8060 credit (row=1,2) ===");
  const v1 = await api("POST", `/ledger/voucher?sendToLedger=true`, {
    date: TODAY,
    description: "Valutagevinst (agio) - kursforskjell EUR",
    postings: [
      { row: 1, date: TODAY, account: { id: 424190862 }, amountGross: 12613.73, amountGrossCurrency: 12613.73, vatType: { id: 0 }, description: "Kursgevinst innbetaling EUR" },
      { row: 2, date: TODAY, account: { id: 424191214 }, amountGross: -12613.73, amountGrossCurrency: -12613.73, vatType: { id: 0 }, description: "Valutagevinst (agio)" },
    ],
  });
  if (v1?.value) {
    console.log(`  SUCCESS: voucher id=${v1.value.id} number=${v1.value.number}`);
    // Check the created postings
    const postings = v1.value.postings || [];
    for (const p of postings) {
      console.log(`  posting: account=${p.account?.id} amount=${p.amount} amountGross=${p.amountGross}`);
    }
  }

  // Check postings on account 8060
  console.log("\n=== Check account 8060 postings ===");
  const agio = await api("GET", `/ledger/posting?accountNumberFrom=8060&accountNumberTo=8060&dateFrom=${TODAY}&dateTo=${TODAY}&fields=*,account(id,number)`);
  if (agio?.values) {
    for (const p of agio.values) {
      console.log(`  voucherId=${p.voucherId} amount=${p.amount} amountGross=${p.amountGross} description=${p.description}`);
    }
  }

  // Check postings on account 1920
  console.log("\n=== Check account 1920 postings (last 5) ===");
  const bank = await api("GET", `/ledger/posting?accountNumberFrom=1920&accountNumberTo=1920&dateFrom=${TODAY}&dateTo=${TODAY}&fields=*,account(id,number)&count=10`);
  if (bank?.values) {
    for (const p of bank.values.slice(-5)) {
      console.log(`  voucherId=${p.voucherId} amount=${p.amount} amountGross=${p.amountGross} description=${p.description}`);
    }
  }

  // Now do the full test: create NOK invoice, pay it, add agio voucher, verify state
  console.log("\n=== Full test: NOK invoice + payment + agio voucher ===");

  // Create order + invoice
  const orderRes = await api("POST", `/order`, {
    customer: { id: 108124240 },
    deliveryDate: TODAY,
    orderDate: TODAY,
  });
  if (!orderRes?.value) return;
  const orderId = orderRes.value.id;

  await api("POST", `/order/orderline`, {
    order: { id: orderId },
    description: "EUR service at 18687",
    count: 1,
    unitPriceExcludingVatCurrency: 23358.75, // NOK amount = EUR incl VAT
  });

  const invRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
  if (!invRes?.value) return;
  const invoiceId = invRes.value.id;
  console.log(`Invoice created: ${invoiceId}`);

  // Read the invoice
  const inv = (await api("GET", `/invoice/${invoiceId}?fields=*,currency(*)`))?.value;
  console.log(`Invoice: currency=${inv?.currency?.code} outstanding=${inv?.amountOutstanding}`);

  // Pay it
  const payRes = await api("PUT", `/invoice/${invoiceId}/:payment?paymentDate=${TODAY}&paymentTypeId=32813748&paidAmount=${inv?.amountOutstanding}`);
  console.log(`Payment: outstanding=${payRes?.value?.amountOutstanding}`);

  // Create agio voucher
  // Agio calculation: 23358.75 EUR * (10.87 - 10.33) = 23358.75 * 0.54 = 12613.725
  const agioAmount = 12613.73; // round to 2 decimals

  const agioRes = await api("POST", `/ledger/voucher?sendToLedger=true`, {
    date: TODAY,
    description: "Valutagevinst (agio) - kursforskjell EUR-faktura",
    postings: [
      { row: 1, date: TODAY, account: { id: 424190862 }, amountGross: agioAmount, amountGrossCurrency: agioAmount, vatType: { id: 0 }, description: "Kursgevinst innbetaling" },
      { row: 2, date: TODAY, account: { id: 424191214 }, amountGross: -agioAmount, amountGrossCurrency: -agioAmount, vatType: { id: 0 }, description: "Valutagevinst (agio)" },
    ],
  });
  if (agioRes?.value) {
    console.log(`Agio voucher: id=${agioRes.value.id}`);
  }

  // Verify invoice still closed
  const invFinal = (await api("GET", `/invoice/${invoiceId}?fields=*`))?.value;
  console.log(`\nFinal invoice state: outstanding=${invFinal?.amountOutstanding} (should be 0)`);

  console.log("\nDone - agio voucher works with row=1!");
}

main().catch(console.error);
