// Task 27 full flow test:
// Scenario: NOK invoice exists, task wants agio booked
// Test: pay invoice + manually book agio, then verify final state

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${res.status}${!res.ok ? `: ${JSON.stringify(data).slice(0,300)}` : ""}`);
  return { ok: res.ok, data };
}

async function main() {
  // Find an unpaid invoice to test with
  const invs = await api("GET", "/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2027-01-01&fields=id,invoiceDate,customer(name),currency(code),amount,amountCurrency,amountOutstanding,amountCurrencyOutstanding,amountExcludingVat,amountExcludingVatCurrency&count=100");

  const unpaid = (invs.data?.values || []).filter((inv: any) => inv.amountOutstanding > 0 && inv.amount > 0);
  console.log(`\nUnpaid invoices: ${unpaid.length}`);
  for (const inv of unpaid) {
    console.log(`  id=${inv.id} customer="${inv.customer?.name}" currency=${inv.currency?.code} exVat=${inv.amountExcludingVat} outstanding=${inv.amountOutstanding}`);
  }

  if (unpaid.length === 0) {
    // Create one for testing
    console.log("\nNo unpaid invoices. Creating one...");

    // Get a customer
    const custs = await api("GET", "/customer?fields=id,name&count=5");
    const custId = custs.data?.values?.[0]?.id;
    console.log(`Customer: ${custs.data?.values?.[0]?.name} id=${custId}`);

    // Create order
    const order = await api("POST", "/order", {
      customer: { id: custId },
      orderDate: "2026-03-15",
      deliveryDate: "2026-03-15",
    });
    const orderId = order.data?.value?.id;
    console.log(`Order: ${orderId}`);

    // Add order line
    const ol = await api("POST", "/order/orderline", {
      order: { id: orderId },
      description: "Test product for agio test",
      count: 1,
      unitPriceExcludingVatCurrency: 18687,
      vatType: { id: 0 }, // no VAT for simplicity
    });
    console.log(`OrderLine: ${ol.data?.value?.id}`);

    // Create invoice from order
    const inv = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=2026-03-15&sendToCustomer=false`);
    const invoiceId = inv.data?.value?.id;
    console.log(`Invoice created: ${invoiceId}`);

    if (!invoiceId) {
      console.log("Failed to create invoice. Exiting.");
      return;
    }

    // Read back the invoice
    const invDetail = await api("GET", `/invoice/${invoiceId}?fields=id,amount,amountOutstanding,amountExcludingVat,currency(code)`);
    console.log(`Invoice detail: exVat=${invDetail.data?.value?.amountExcludingVat} outstanding=${invDetail.data?.value?.amountOutstanding}`);

    // Get payment type
    const pts = await api("GET", "/invoice/paymentType?fields=id,description,debitAccount(number,isBankAccount)&count=20");
    const bankPt = (pts.data?.values || []).find((pt: any) => pt.debitAccount?.isBankAccount);
    console.log(`Payment type: ${bankPt?.id} "${bankPt?.description}"`);

    // Test 1: Can we pay more than outstanding?
    console.log("\n=== Test 1: Pay more than outstanding ===");
    const overpay = await api("PUT", `/invoice/${invoiceId}/:payment?paymentDate=2026-03-21&paymentTypeId=${bankPt.id}&paidAmount=${invDetail.data?.value?.amountOutstanding + 5000}`);
    if (overpay.ok) {
      console.log(`Overpayment worked! Outstanding: ${overpay.data?.value?.amountOutstanding}`);
    } else {
      console.log("Overpayment rejected. Testing normal payment...");

      // Test 2: Normal payment + manual agio
      console.log("\n=== Test 2: Normal payment + manual agio ===");
      const normalPay = await api("PUT", `/invoice/${invoiceId}/:payment?paymentDate=2026-03-21&paymentTypeId=${bankPt.id}&paidAmount=${invDetail.data?.value?.amountOutstanding}`);
      if (normalPay.ok) {
        console.log(`Payment done. Outstanding: ${normalPay.data?.value?.amountOutstanding}`);
      }

      // Now book the agio manually
      const agioAmount = 18687 * (10.87 - 10.33); // 10090.98
      const agioRounded = Math.round(agioAmount * 100) / 100;
      console.log(`\nAgio amount (ex-VAT * rate_diff): ${agioRounded}`);

      const accts = await api("GET", "/ledger/account?number=1920,8060&fields=id,number,name&count=10");
      const acctMap: Record<number, number> = {};
      for (const a of accts.data?.values || []) acctMap[a.number] = a.id;

      const agioVoucher = await api("POST", "/ledger/voucher", {
        date: "2026-03-21",
        description: "Valutagevinst (agio)",
        postings: [
          { row: 1, account: { id: acctMap[1920] }, amountGross: agioRounded, amountGrossCurrency: agioRounded, description: "Valutagevinst" },
          { row: 2, account: { id: acctMap[8060] }, amountGross: -agioRounded, amountGrossCurrency: -agioRounded, description: "Agio" },
        ],
      });

      if (agioVoucher.ok) {
        console.log(`Agio voucher created: ${agioVoucher.data?.value?.id}`);

        // Verify the final state
        console.log("\n=== Verification ===");
        const agioBalance = await api("GET", "/balanceSheet?dateFrom=2026-01-01&dateTo=2027-01-01&accountNumberFrom=8060&accountNumberTo=8060&fields=*,account(number,name)&count=10");
        for (const row of agioBalance.data?.values || []) {
          console.log(`  8060 balance: ${row.balanceOut}`);
        }

        const bankBalance = await api("GET", "/balanceSheet?dateFrom=2026-01-01&dateTo=2027-01-01&accountNumberFrom=1920&accountNumberTo=1920&fields=*,account(number,name)&count=10");
        for (const row of bankBalance.data?.values || []) {
          console.log(`  1920 balance: ${row.balanceOut}`);
        }

        // Check the invoice status
        const invCheck = await api("GET", `/invoice/${invoiceId}?fields=id,amountOutstanding,isPaid`);
        console.log(`  Invoice outstanding: ${invCheck.data?.value?.amountOutstanding}, isPaid: ${invCheck.data?.value?.isPaid}`);

        // Check the voucher postings
        const vDetail = await api("GET", `/ledger/voucher/${agioVoucher.data?.value?.id}?fields=id,date,description,postings(account(number,name),amount,amountGross)`);
        console.log(`  Agio voucher postings:`);
        for (const p of vDetail.data?.value?.postings || []) {
          console.log(`    ${p.account?.number} (${p.account?.name}): amount=${p.amount} gross=${p.amountGross}`);
        }
      }
    }
  } else {
    // Use existing unpaid invoice
    const inv = unpaid[0];
    console.log(`\nUsing existing invoice: ${inv.id} (${inv.customer?.name}), outstanding=${inv.amountOutstanding}`);

    // Get payment type
    const pts = await api("GET", "/invoice/paymentType?fields=id,description,debitAccount(number,isBankAccount)&count=20");
    const bankPt = (pts.data?.values || []).find((pt: any) => pt.debitAccount?.isBankAccount);

    // Pay normally
    const pay = await api("PUT", `/invoice/${inv.id}/:payment?paymentDate=2026-03-21&paymentTypeId=${bankPt.id}&paidAmount=${inv.amountOutstanding}`);
    console.log(`Payment: outstanding=${pay.data?.value?.amountOutstanding}`);

    // Book agio manually (using task 27 example amounts)
    const EUR_AMOUNT = inv.amountExcludingVat; // treat as EUR amount
    const agioAmount = Math.round(EUR_AMOUNT * 0.54 * 100) / 100; // rate diff 10.87 - 10.33 = 0.54
    console.log(`\nAgio (${EUR_AMOUNT} * 0.54): ${agioAmount}`);

    const accts = await api("GET", "/ledger/account?number=1920,8060&fields=id,number,name&count=10");
    const acctMap: Record<number, number> = {};
    for (const a of accts.data?.values || []) acctMap[a.number] = a.id;

    const agioV = await api("POST", "/ledger/voucher", {
      date: "2026-03-21",
      description: "Valutagevinst (agio)",
      postings: [
        { row: 1, account: { id: acctMap[1920] }, amountGross: agioAmount, amountGrossCurrency: agioAmount, description: "Valutagevinst" },
        { row: 2, account: { id: acctMap[8060] }, amountGross: -agioAmount, amountGrossCurrency: -agioAmount, description: "Agio" },
      ],
    });

    // Verify
    if (agioV.ok) {
      console.log("Agio voucher posted. Verifying...");
      const v = await api("GET", `/ledger/voucher/${agioV.data?.value?.id}?fields=id,date,description,postings(account(number,name),amount)`);
      for (const p of v.data?.value?.postings || []) {
        console.log(`  ${p.account?.number} (${p.account?.name}): ${p.amount}`);
      }
    }
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
