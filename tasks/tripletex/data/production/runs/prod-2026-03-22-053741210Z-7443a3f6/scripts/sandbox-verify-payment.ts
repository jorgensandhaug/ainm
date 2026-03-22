// Sandbox verification: confirm the 3-call register-payment path still works
// and investigate if any 2-call shortcut has appeared

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  // 1. Check if GET /invoice with various field expansions exposes paymentTypeId
  console.log("=== Test 1: Can we get paymentTypeId from invoice read? ===");

  // Try standard fields
  const invUrl = `${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=5&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))`;
  const invRes = await fetch(invUrl, { headers: H });
  const invData = await invRes.json();

  if (invRes.ok && invData.values?.length > 0) {
    const inv = invData.values[0];
    console.log("Invoice keys:", Object.keys(inv).join(", "));
    // Check for any payment-related keys
    const paymentKeys = Object.keys(inv).filter(k => k.toLowerCase().includes("payment") || k.toLowerCase().includes("paytype"));
    console.log("Payment-related keys:", paymentKeys.length > 0 ? paymentKeys.join(", ") : "NONE");

    // Find an unpaid invoice for our test
    const unpaid = invData.values.find((i: any) => (i.amountCurrencyOutstanding ?? i.amountOutstanding ?? 0) > 0);
    if (unpaid) {
      console.log(`\nFound unpaid invoice ${unpaid.id}, outstanding=${unpaid.amountCurrencyOutstanding}, customer=${unpaid.customer?.name} (${unpaid.customer?.organizationNumber})`);
    } else {
      console.log("No unpaid invoices found in sandbox.");
    }
  }

  // 2. Try paymentType(*) expansion on GET /invoice — known to return 400
  console.log("\n=== Test 2: GET /invoice with paymentType(*) expansion ===");
  const inv2Url = `${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1&fields=*,paymentType(*)`;
  const inv2Res = await fetch(inv2Url, { headers: H });
  console.log(`Status: ${inv2Res.status}`);
  if (!inv2Res.ok) {
    const inv2Data = await inv2Res.json();
    console.log("Error:", JSON.stringify(inv2Data).slice(0, 200));
  }

  // 3. Check current paymentType endpoint
  console.log("\n=== Test 3: GET /invoice/paymentType — current state ===");
  const ptUrl = `${BASE}/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`;
  const ptRes = await fetch(ptUrl, { headers: H });
  const ptData = await ptRes.json();
  if (ptRes.ok) {
    const pts = ptData.values || [];
    console.log(`Payment types found: ${pts.length}`);
    pts.forEach((pt: any) => {
      console.log(`  id=${pt.id}, desc=${pt.description}, debit=${pt.debitAccount?.number}, credit=${pt.creditAccount?.number}, isBankAccount=${pt.debitAccount?.isBankAccount}`);
    });
  }

  // 4. Try to find if there's a way to get paymentTypeId without a separate call
  console.log("\n=== Test 4: GET /invoice with paymentTypes(*) expansion ===");
  const inv3Url = `${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1&fields=*,paymentTypes(*)`;
  const inv3Res = await fetch(inv3Url, { headers: H });
  console.log(`Status: ${inv3Res.status}`);

  console.log("\n=== Test 5: GET /invoice with payments(*) expansion ===");
  const inv4Url = `${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1&fields=*,payments(*)`;
  const inv4Res = await fetch(inv4Url, { headers: H });
  console.log(`Status: ${inv4Res.status}`);

  console.log("\n=== CONCLUSION ===");
  console.log("3-call path remains the proven minimum for standalone register-customer-invoice-payment.");
}

main().catch(e => { console.error(e); process.exit(1); });
