// Test: Create a NOK invoice, pay it, then add a manual agio voucher
// Goal: determine if manual voucher for agio on NOK invoice "corrupts" state

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const opts: RequestInit = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`  -> ${res.status}`);
  if (!res.ok) {
    console.log(`  ERROR: ${text}`);
    return null;
  }
  try { return JSON.parse(text); } catch { return text; }
}

async function main() {
  // Step 1: Create a customer
  console.log("=== STEP 1: Create customer ===");
  const custRes = await api("POST", `/customer`, {
    name: "Agio Test SL",
    organizationNumber: "999888771",
    customerNumber: 99771,
  });
  if (!custRes?.value) { console.log("Customer creation failed"); return; }
  const customerId = custRes.value.id;
  console.log(`Customer created: id=${customerId}`);

  // Step 2: Create a NOK invoice (simulating the production scenario)
  // First create an order
  console.log("\n=== STEP 2: Create order ===");
  const orderRes = await api("POST", `/order`, {
    customer: { id: customerId },
    deliveryDate: TODAY,
    orderDate: TODAY,
    isPrioritizeAmountsIncludingVat: true,
  });
  if (!orderRes?.value) { console.log("Order creation failed"); return; }
  const orderId = orderRes.value.id;
  console.log(`Order created: id=${orderId}`);

  // Add order line
  console.log("\n=== STEP 3: Add order line ===");
  const lineRes = await api("POST", `/order/orderline`, {
    order: { id: orderId },
    description: "Test service EUR amount",
    count: 1,
    unitPriceExcludingVatCurrency: 18687,
    vatType: { id: 3 }, // standard 25% MVA
  });
  if (!lineRes?.value) { console.log("Order line creation failed"); return; }
  console.log(`Order line created: id=${lineRes.value.id}`);

  // Create invoice from order
  console.log("\n=== STEP 4: Create invoice ===");
  const invRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
  if (!invRes?.value) { console.log("Invoice creation failed"); return; }
  const invoiceId = invRes.value.id;
  console.log(`Invoice created: id=${invoiceId}`);

  // Read the invoice to check amounts
  console.log("\n=== STEP 5: Read invoice ===");
  const invRead = await api("GET", `/invoice/${invoiceId}?fields=*,currency(*)`);
  if (invRead?.value) {
    const inv = invRead.value;
    console.log(`Invoice details:
  currency=${inv.currency?.code}
  amountExcludingVat=${inv.amountExcludingVat}
  amount=${inv.amount}
  amountCurrency=${inv.amountCurrency}
  amountOutstanding=${inv.amountOutstanding}
  amountCurrencyOutstanding=${inv.amountCurrencyOutstanding}`);
  }

  // Pay the invoice with simple payment
  console.log("\n=== STEP 6: Pay the invoice (simple NOK) ===");
  const payRes = await api("PUT", `/invoice/${invoiceId}/:payment?paymentDate=${TODAY}&paymentTypeId=32813748&paidAmount=${invRead?.value?.amountOutstanding}`);
  if (payRes?.value) {
    console.log(`Payment done: outstanding=${payRes.value.amountOutstanding}`);
  }

  // Check postings on the invoice's voucher BEFORE manual agio
  console.log("\n=== STEP 7: Check voucher postings BEFORE manual agio ===");
  // Find the payment voucher
  const voucherRes = await api("GET", `/ledger/voucher?dateFrom=${TODAY}&dateTo=${TODAY}&fields=*`);
  if (voucherRes?.values) {
    console.log(`Found ${voucherRes.values.length} vouchers`);
    // Get postings for the most recent vouchers
    for (const v of voucherRes.values.slice(-3)) {
      console.log(`\nVoucher ${v.id} (number=${v.number}):`);
      const postRes = await api("GET", `/ledger/posting?voucherId=${v.id}&fields=*,account(*)`);
      if (postRes?.values) {
        for (const p of postRes.values) {
          console.log(`  account=${p.account?.number} amount=${p.amount} amountCurrency=${p.amountCurrency} description=${p.description}`);
        }
      }
    }
  }

  // Step 8: Now try to create a manual voucher for agio
  // The idea: the invoice was conceptually for 18687 EUR, which at rate 10.87 would be
  // 18687 * 1.25 * (10.87 - 10.33) = 23358.75 * 0.54 = 12613.725 NOK agio
  const agioAmount = 12613.73;
  console.log(`\n=== STEP 8: Create manual agio voucher (${agioAmount} NOK) ===`);
  const agioRes = await api("POST", `/ledger/voucher`, {
    date: TODAY,
    description: "Valutagevinst (agio) - kursforskjell",
    postings: [
      {
        date: TODAY,
        account: { id: 424190765 }, // 1920 bank (need to look up)
        amount: agioAmount,
        description: "Kursgevinst EUR-faktura",
      },
      {
        date: TODAY,
        account: { id: 424191214 }, // 8060 agio
        amount: -agioAmount,
        description: "Valutagevinst (agio)",
      },
    ],
  });
  console.log("Agio voucher result:", JSON.stringify(agioRes?.value ? { id: agioRes.value.id, number: agioRes.value.number } : agioRes, null, 2));

  // Step 9: Check state after manual agio
  console.log("\n=== STEP 9: Check invoice state AFTER manual agio ===");
  const invAfter = await api("GET", `/invoice/${invoiceId}?fields=*,currency(*)`);
  if (invAfter?.value) {
    const inv = invAfter.value;
    console.log(`Invoice after agio:
  amountOutstanding=${inv.amountOutstanding}
  amountCurrencyOutstanding=${inv.amountCurrencyOutstanding}`);
  }

  // Step 10: Check postings on account 8060
  console.log("\n=== STEP 10: Check account 8060 postings ===");
  const agio8060 = await api("GET", `/ledger/posting?accountNumberFrom=8060&accountNumberTo=8060&dateFrom=${TODAY}&dateTo=${TODAY}&fields=*,account(*)`);
  if (agio8060?.values) {
    for (const p of agio8060.values) {
      console.log(`  voucherId=${p.voucherId} amount=${p.amount} amountCurrency=${p.amountCurrency} description=${p.description}`);
    }
  }
}

main().catch(console.error);
