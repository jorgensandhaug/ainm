const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  // Test 1: GET /invoice with fields=* only (no nested expansions)
  console.log("=== Test 1: fields=* without nested expansions ===");
  const url1 = `${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=3&fields=*`;
  const r1 = await fetch(url1, { headers: H });
  const d1 = await r1.json();
  console.log("Status:", r1.status);
  if (r1.ok && d1.values?.length) {
    const inv = d1.values[0];
    console.log("Invoice id:", inv.id);
    console.log("orderLines:", JSON.stringify(inv.orderLines?.map((l: any) => ({ desc: l.description, id: l.id })), null, 2));
    console.log("customer:", JSON.stringify(inv.customer));
    console.log("amountOutstanding:", inv.amountOutstanding);
    console.log("amountCurrencyOutstanding:", inv.amountCurrencyOutstanding);
    console.log("amountExcludingVatCurrency:", inv.amountExcludingVatCurrency);
  }

  // Test 2: GET /invoice with full expansions (as playbook recommends)
  console.log("\n=== Test 2: fields=* with nested expansions ===");
  const url2 = `${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=3&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;
  const r2 = await fetch(url2, { headers: H });
  const d2 = await r2.json();
  console.log("Status:", r2.status);
  if (r2.ok && d2.values?.length) {
    const inv = d2.values[0];
    console.log("Invoice id:", inv.id);
    console.log("orderLines:", JSON.stringify(inv.orderLines?.map((l: any) => ({ desc: l.description, id: l.id })), null, 2));
    console.log("customer.organizationNumber:", inv.customer?.organizationNumber);
    console.log("customer.name:", inv.customer?.name);
  }

  // Test 3: customerOrganizationNumber as server-side filter
  console.log("\n=== Test 3: customerOrganizationNumber filter ===");
  // Use a known sandbox customer org number
  const url3 = `${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&customerOrganizationNumber=907791616&count=10&fields=*,customer(*),orderLines(*)`;
  const r3 = await fetch(url3, { headers: H });
  const d3 = await r3.json();
  console.log("Status:", r3.status);
  if (r3.ok) {
    console.log("Found", d3.values?.length, "invoices for org 907791616");
    d3.values?.forEach((inv: any) => {
      console.log("  id:", inv.id, "customer:", inv.customer?.name, "orgNr:", inv.customer?.organizationNumber,
        "outstanding:", inv.amountCurrencyOutstanding,
        "lines:", inv.orderLines?.map((l: any) => l.description));
    });
  } else {
    console.log("Error:", JSON.stringify(d3));
  }

  // Test 4: invoiceStatus filter
  console.log("\n=== Test 4: invoiceStatus=UNPAID filter ===");
  const url4 = `${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&invoiceStatus=UNPAID&count=5&fields=*,customer(*),orderLines(*)`;
  const r4 = await fetch(url4, { headers: H });
  const d4 = await r4.json();
  console.log("Status:", r4.status);
  if (r4.ok) {
    console.log("Found", d4.values?.length, "UNPAID invoices");
    d4.values?.forEach((inv: any) => {
      console.log("  id:", inv.id, "outstanding:", inv.amountCurrencyOutstanding,
        "lines:", inv.orderLines?.map((l: any) => l.description));
    });
  } else {
    console.log("Error:", JSON.stringify(d4));
  }

  // Test 5: GET /invoice/paymentType with fields=* only (no debitAccount expansion)
  console.log("\n=== Test 5: paymentType fields=* without expansion ===");
  const url5 = `${BASE}/invoice/paymentType?fields=*`;
  const r5 = await fetch(url5, { headers: H });
  const d5 = await r5.json();
  console.log("Status:", r5.status);
  if (r5.ok) {
    d5.values?.forEach((pt: any) => {
      console.log("  id:", pt.id, "desc:", pt.description, "isBankAccount:", pt.isBankAccount,
        "debitAccount:", JSON.stringify(pt.debitAccount), "creditAccount:", JSON.stringify(pt.creditAccount));
    });
  }

  // Test 6: GET /invoice/paymentType with full expansion
  console.log("\n=== Test 6: paymentType fields=*,debitAccount(*),creditAccount(*) ===");
  const url6 = `${BASE}/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`;
  const r6 = await fetch(url6, { headers: H });
  const d6 = await r6.json();
  console.log("Status:", r6.status);
  if (r6.ok) {
    d6.values?.forEach((pt: any) => {
      console.log("  id:", pt.id, "desc:", pt.description, "name:", pt.name,
        "isBankAccount:", pt.isBankAccount, "isInvoiceAccount:", pt.isInvoiceAccount,
        "debitAccount.number:", pt.debitAccount?.number,
        "creditAccount:", pt.creditAccount ? pt.creditAccount.number : null);
    });
  }
}

main().catch(e => { console.error(e); process.exit(1); });
