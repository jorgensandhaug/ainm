// Task 27: Test FX payment scenarios
// 1. Check if EUR invoices have amount===amountCurrency in some setups
// 2. Test what happens when we send FX params on such invoices
// 3. Verify agio auto-booking behavior

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json();
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 600));
  return { status: res.status, data: json };
}

async function main() {
  // Step 1: Look at all invoices with currency expansion
  console.log("=== Step 1: All invoices with currency(*) ===");
  const invRes = await api("GET", "/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2031-01-01&fields=*,currency(*)&count=100");
  const invoices = invRes.data?.values || [];
  console.log(`Found ${invoices.length} invoices`);

  for (const inv of invoices) {
    const curr = inv.currency?.code || "?";
    const eq = inv.amount === inv.amountCurrency ? "EQUAL" : "DIFF";
    console.log(`  #${inv.invoiceNumber} id=${inv.id} curr=${curr} amount=${inv.amount} amountCurr=${inv.amountCurrency} outstanding=${inv.amountOutstanding} outstandingCurr=${inv.amountCurrencyOutstanding} [${eq}]`);
  }

  // Step 2: Find/create a EUR customer and invoice for testing
  // First check if we have any EUR invoices
  const eurInvoices = invoices.filter((i: any) => i.currency?.code === "EUR");
  const nokInvoicesWithOutstanding = invoices.filter((i: any) =>
    i.currency?.code === "NOK" && i.amountOutstanding > 0
  );
  console.log(`\nEUR invoices: ${eurInvoices.length}`);
  console.log(`NOK invoices with outstanding: ${nokInvoicesWithOutstanding.length}`);

  // Step 3: Check what currencies are available
  console.log("\n=== Step 3: Available currencies ===");
  const currRes = await api("GET", "/currency?count=10&fields=*");
  const currencies = currRes.data?.values || [];
  for (const c of currencies.slice(0, 5)) {
    console.log(`  ${c.code} factor=${c.factor} id=${c.id}`);
  }

  // Step 4: Check accounts 8060, 8160
  console.log("\n=== Step 4: Agio/Disagio accounts ===");
  const accRes = await api("GET", "/ledger/account?number=8060,8160,1920&fields=id,number,name");
  for (const a of (accRes.data?.values || [])) {
    console.log(`  ${a.number} "${a.name}" id=${a.id}`);
  }

  // Step 5: Try to create a EUR invoice with amount===amountCurrency
  // First create a test customer
  console.log("\n=== Step 5: Create test customer for EUR invoice ===");
  const custRes = await api("POST", "/customer", {
    name: "FX Test 27 GmbH",
    organizationNumber: "999270001",
    invoiceSendMethod: "MANUAL"
  });
  const custId = custRes.data?.value?.id;
  console.log(`Customer id=${custId}`);

  if (custId) {
    // Resolve VAT type
    const vatRes = await api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*");
    const vatTypes = vatRes.data?.values || [];
    const vat0 = vatTypes.find((v: any) => v.percentage === 0);
    console.log(`VAT 0% id=${vat0?.id}`);

    // Find EUR currency id
    const eurCurr = currencies.find((c: any) => c.code === "EUR");
    console.log(`EUR currency id=${eurCurr?.id}`);

    // Create an invoice in EUR
    // The key question: does Tripletex always convert amount to NOK, or can we get amount===amountCurrency?
    console.log("\n=== Step 6: Create EUR invoice ===");
    const invCreateRes = await api("POST", "/invoice", {
      invoiceDate: "2026-03-21",
      invoiceDueDate: "2026-04-21",
      customer: { id: custId },
      currency: { id: eurCurr?.id },
      orders: [{
        customer: { id: custId },
        orderDate: "2026-03-21",
        deliveryDate: "2026-03-21",
        currency: { id: eurCurr?.id },
        orderLines: [{
          description: "EUR test service",
          count: 1,
          unitPriceExcludingVatCurrency: 10000,
          vatType: { id: vat0?.id }
        }]
      }]
    });
    console.log(`Invoice create status=${invCreateRes.status}`);
    const newInvId = invCreateRes.data?.value?.id;

    if (newInvId) {
      // Read back with currency expansion
      const readback = await api("GET", `/invoice/${newInvId}?fields=*,currency(*)`);
      const inv = readback.data?.value;
      console.log(`\nEUR invoice readback:`);
      console.log(`  id=${inv?.id} invoiceNumber=${inv?.invoiceNumber}`);
      console.log(`  currency.code=${inv?.currency?.code}`);
      console.log(`  amount=${inv?.amount} amountCurrency=${inv?.amountCurrency}`);
      console.log(`  amountOutstanding=${inv?.amountOutstanding} amountCurrencyOutstanding=${inv?.amountCurrencyOutstanding}`);
      console.log(`  amountExcludingVat=${inv?.amountExcludingVat} amountExcludingVatCurrency=${inv?.amountExcludingVatCurrency}`);
      console.log(`  amount===amountCurrency: ${inv?.amount === inv?.amountCurrency}`);

      // Now test: pay with FX params — settlement rate different from original
      // Original rate would be whatever Tripletex used when creating the invoice
      // Settlement rate: let's say 11.0 NOK/EUR
      const settlementRate = 11.0;
      const outstandingEUR = inv?.amountCurrencyOutstanding;
      const paidNOK = outstandingEUR * settlementRate;

      console.log(`\n=== Step 7: Pay EUR invoice with FX params ===`);
      console.log(`  paidAmountCurrency=${outstandingEUR} EUR`);
      console.log(`  paidAmount=${paidNOK} NOK (at rate ${settlementRate})`);

      // Get payment type
      const ptRes = await api("GET", "/invoice/paymentType?fields=*,debitAccount(*)");
      const paymentTypes = ptRes.data?.values || [];
      const bankPt = paymentTypes.find((pt: any) =>
        pt.debitAccount?.number >= 1900 && pt.debitAccount?.number < 2000 && pt.debitAccount?.isBankAccount
      ) || paymentTypes.find((pt: any) =>
        pt.debitAccount?.number >= 1900 && pt.debitAccount?.number < 2000
      );
      console.log(`Payment type: id=${bankPt?.id} desc="${bankPt?.description}" acct=${bankPt?.debitAccount?.number}`);

      const payRes = await api("PUT", `/invoice/${newInvId}/:payment?paymentDate=2026-03-21&paymentTypeId=${bankPt?.id}&paidAmount=${paidNOK}&paidAmountCurrency=${outstandingEUR}`);
      console.log(`Payment result: status=${payRes.status}`);
      if (payRes.data?.value) {
        console.log(`  amountOutstanding=${payRes.data.value.amountOutstanding}`);
        console.log(`  amountCurrencyOutstanding=${payRes.data.value.amountCurrencyOutstanding}`);
      }

      // Check if agio was auto-booked by looking at the payment voucher
      console.log("\n=== Step 8: Check for auto-booked FX postings ===");
      // Look for recent postings on 8060 and 8160
      const postRes = await api("GET", `/ledger/posting?dateFrom=2026-03-21&dateTo=2026-03-22&accountNumber=8060,8160&fields=*&count=100`);
      const fxPostings = postRes.data?.values || [];
      console.log(`FX postings found: ${fxPostings.length}`);
      for (const p of fxPostings) {
        console.log(`  acct=${p.account?.number || p.account?.id} amount=${p.amount} amountCurrency=${p.amountCurrency} date=${p.date}`);
      }
    }
  }

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
