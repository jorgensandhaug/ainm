// Sandbox investigation: can we combine GET /invoice/paymentType with GET /ledger/account in one call?
// Or can we extract payment type info from any other endpoint?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";

async function api(method: string, path: string, body?: any) {
  const url = BASE + path;
  const opts: any = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const txt = await r.text();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) {
    console.log("ERROR:", txt);
    return null;
  }
  const json = JSON.parse(txt);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

// Test 1: Check if invoice response includes any payment type info
console.log("=== TEST 1: Invoice response fields ===");
const invoices: any = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-03-21&count=5&sorting=-invoiceDate&fields=*,customer(*)");
if (invoices && invoices.length > 0) {
  const inv = invoices[0];
  console.log("Invoice keys:", Object.keys(inv).join(", "));
  // Check if there's a paymentType field on the invoice
  console.log("paymentTypeId on invoice:", inv.paymentTypeId);
  console.log("paymentType on invoice:", inv.paymentType);
}

// Test 2: Can we do a batch/list call that combines multiple resource types?
// Check if /token/session> returns company info with payment types
console.log("\n=== TEST 2: Check company payment type from /company ===");
const company: any = await api("GET", "/company?fields=*");
if (company) {
  console.log("Company keys:", Object.keys(company).join(", "));
}

// Test 3: Check if there's a way to get account IDs from the chart of accounts
// without a separate call - e.g., can the voucher accept number-based accounts?
// (Already proved this fails, but let's see if anything changed)
console.log("\n=== TEST 3: Confirm account.number still fails on voucher ===");
const voucherResult = await api("POST", "/ledger/voucher", {
  date: TODAY,
  description: "Test voucher number-based",
  voucherType: null,
  postings: [
    {
      row: 1,
      date: TODAY,
      description: "Test",
      account: { number: 1500 },
      currency: { id: 1 },
      amount: 1,
      amountCurrency: 1,
      amountGross: 1,
      amountGrossCurrency: 1,
    },
    {
      row: 2,
      date: TODAY,
      description: "Test",
      account: { number: 3400 },
      currency: { id: 1 },
      amount: -1,
      amountCurrency: -1,
      amountGross: -1,
      amountGrossCurrency: -1,
    },
  ],
});

// Test 4: Check if the payment endpoint works with paymentType name or description instead of id
console.log("\n=== TEST 4: Check invoice for payment type hints ===");
if (invoices && invoices.length > 0) {
  // Look for any overdue invoice
  const overdue = invoices.filter((inv: any) => inv.invoiceDueDate < TODAY && (inv.amountOutstanding > 0 || inv.amountCurrencyOutstanding > 0));
  console.log(`Found ${overdue.length} overdue invoices`);
  if (overdue.length > 0) {
    const oi = overdue[0];
    console.log(`Overdue: #${oi.invoiceNumber} id=${oi.id} outstanding=${oi.amountCurrencyOutstanding} dueDate=${oi.invoiceDueDate}`);
  }
}

// Test 5: Check if /invoice/paymentType response is needed - can we use id=1 or some default?
console.log("\n=== TEST 5: Payment types available ===");
const pts: any = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
if (pts) {
  for (const p of pts) {
    console.log(`PT id=${p.id} name=${p.name} debit=${p.debitAccount?.number} credit=${p.creditAccount?.number}`);
  }
}
