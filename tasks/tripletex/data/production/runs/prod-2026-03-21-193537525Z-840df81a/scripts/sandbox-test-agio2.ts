// Test manual agio voucher on a NOK invoice
// Using an existing unpaid NOK invoice from the sandbox, or creating a fresh one

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
    console.log(`  ERROR: ${text.substring(0, 500)}`);
    return null;
  }
  try { return JSON.parse(text); } catch { return text; }
}

async function main() {
  // Create a fresh NOK order+invoice for testing
  // Use an existing customer from the sandbox
  const customerId = 108124240; // existing customer

  console.log("=== Create order ===");
  const orderRes = await api("POST", `/order`, {
    customer: { id: customerId },
    deliveryDate: TODAY,
    orderDate: TODAY,
  });
  if (!orderRes?.value) return;
  const orderId = orderRes.value.id;
  console.log(`Order: ${orderId}`);

  // Add order line with vatType id=3 (25% outgoing)
  console.log("=== Add order line ===");
  const lineRes = await api("POST", `/order/orderline`, {
    order: { id: orderId },
    description: "Test service for agio experiment",
    count: 1,
    unitPriceExcludingVatCurrency: 18687,
    vatType: { id: 3 },
  });
  if (!lineRes?.value) {
    // Try without vatType - maybe sandbox uses different ids
    console.log("Trying without explicit vatType...");
    const lineRes2 = await api("POST", `/order/orderline`, {
      order: { id: orderId },
      description: "Test service for agio experiment",
      count: 1,
      unitPriceExcludingVatCurrency: 18687,
    });
    if (!lineRes2?.value) return;
  }

  // Create invoice from order
  console.log("=== Create invoice ===");
  const invRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
  if (!invRes?.value) return;
  const invoiceId = invRes.value.id;
  console.log(`Invoice: ${invoiceId}`);

  // Read invoice
  console.log("=== Read invoice ===");
  const inv = (await api("GET", `/invoice/${invoiceId}?fields=*,currency(*)`))?.value;
  if (!inv) return;
  console.log(`currency=${inv.currency?.code} exVat=${inv.amountExcludingVat} amount=${inv.amount} outstanding=${inv.amountOutstanding}`);

  // Pay the invoice
  console.log("=== Pay invoice ===");
  const payRes = await api("PUT", `/invoice/${invoiceId}/:payment?paymentDate=${TODAY}&paymentTypeId=32813748&paidAmount=${inv.amountOutstanding}`);
  if (!payRes?.value) return;
  console.log(`Paid. Outstanding=${payRes.value.amountOutstanding}`);

  // Now create a manual agio voucher
  // This simulates: we received 18687 EUR * 1.25 * (10.87-10.33) = 12613.73 NOK more
  // Debit 1920 (bank), Credit 8060 (agio)
  const agioAmount = 12613.73;
  console.log(`\n=== Create manual agio voucher: ${agioAmount} ===`);
  const voucherRes = await api("POST", `/ledger/voucher`, {
    date: TODAY,
    description: "Valutagevinst (agio) - kursforskjell EUR",
    postings: [
      {
        date: TODAY,
        account: { id: 424190862 }, // 1920 bank
        amount: agioAmount,
        description: "Kursgevinst innbetaling EUR",
      },
      {
        date: TODAY,
        account: { id: 424191214 }, // 8060 agio
        amount: -agioAmount,
        description: "Valutagevinst (agio)",
      },
    ],
  });
  if (voucherRes?.value) {
    console.log(`Voucher created: id=${voucherRes.value.id}`);
  }

  // Check invoice state after manual voucher
  console.log("\n=== Check invoice after manual voucher ===");
  const invAfter = (await api("GET", `/invoice/${invoiceId}?fields=*`))?.value;
  if (invAfter) {
    console.log(`Outstanding: ${invAfter.amountOutstanding} (should be 0)`);
  }

  // Check 8060 postings
  console.log("\n=== Check account 8060 postings ===");
  const postings = await api("GET", `/ledger/posting?accountNumberFrom=8060&accountNumberTo=8060&dateFrom=${TODAY}&dateTo=${TODAY}&fields=*`);
  if (postings?.values) {
    for (const p of postings.values) {
      console.log(`  voucherId=${p.voucherId} amount=${p.amount} description=${p.description}`);
    }
  }
}

main().catch(console.error);
