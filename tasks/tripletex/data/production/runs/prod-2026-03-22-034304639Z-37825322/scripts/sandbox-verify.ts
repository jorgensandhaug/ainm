// Sandbox verification: check current state and test 6-call path
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";
const FEE = 35;
const PAYMENT = 5000;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const txt = await r.text();
  console.log(`\n${method} ${path} → ${r.status}`);
  if (!r.ok) { console.log(txt); return null; }
  const json = JSON.parse(txt);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

// Step 1: Create a setup invoice to have an overdue invoice to work with
// First find an existing customer
const customers: any[] = await api("GET", "/customer?count=5&fields=*");
if (!customers || customers.length === 0) { console.log("No customers"); process.exit(1); }
const cust = customers[0];
console.log(`Using customer: ${cust.id} ${cust.name}`);

// Create a past-due invoice for testing
const setupInvoice = await api("POST", "/invoice", {
  invoiceDate: "2026-02-01",
  invoiceDueDate: "2026-02-15",
  customer: { id: cust.id },
  orders: [{
    customer: { id: cust.id },
    orderDate: "2026-02-01",
    deliveryDate: "2026-02-01",
    orderLines: [{
      description: "Test product",
      count: 1,
      unitPriceExcludingVatCurrency: 10000,
    }],
  }],
});
if (!setupInvoice) { console.log("Setup invoice creation failed"); process.exit(1); }
console.log(`Setup invoice: id=${setupInvoice.id} number=${setupInvoice.invoiceNumber} outstanding=${setupInvoice.amountCurrencyOutstanding} due=${setupInvoice.invoiceDueDate}`);

console.log("\n=== Now running the 6-call standard flow ===\n");

// Call 1: Locate overdue invoice
const invoices: any[] = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-03-22&count=1000&sorting=-invoiceDate&fields=*,customer(*)");
if (!invoices) process.exit(1);
const overdue = invoices.filter((i: any) => i.invoiceDueDate < TODAY && (i.amountOutstanding > 0 || i.amountCurrencyOutstanding > 0));
console.log(`Found ${overdue.length} overdue invoices`);
for (const o of overdue) {
  console.log(`  Invoice #${o.invoiceNumber} id=${o.id} outstanding=${o.amountCurrencyOutstanding} due=${o.invoiceDueDate}`);
}

// Pick the one we just created (or the first one)
const inv = overdue.find((i: any) => i.id === setupInvoice.id) || overdue[0];
console.log(`Using overdue invoice #${inv.invoiceNumber} id=${inv.id} customer=${inv.customer.id} outstanding=${inv.amountCurrencyOutstanding}`);
const customerId = inv.customer.id;

// Call 2: Resolve payment type
const paymentTypes: any[] = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
if (!paymentTypes) process.exit(1);
const pt = paymentTypes.find((p: any) => p.debitAccount && (p.debitAccount.number >= 1900 && p.debitAccount.number < 2000 || p.debitAccount.isBankAccount));
if (!pt) { console.log("No usable payment type"); process.exit(1); }
console.log(`Payment type: id=${pt.id} name=${pt.name} debit=${pt.debitAccount?.number}`);

// Call 3: Resolve accounts
const accounts: any[] = await api("GET", "/ledger/account?number=1500,3400&fields=*");
if (!accounts) process.exit(1);
const acc1500 = accounts.find((a: any) => a.number === 1500);
const acc3400 = accounts.find((a: any) => a.number === 3400);
console.log(`Account 1500: id=${acc1500?.id}, Account 3400: id=${acc3400?.id}`);

// Call 4: Post voucher
const voucher = await api("POST", "/ledger/voucher", {
  date: TODAY,
  description: `Reminder fee invoice #${inv.invoiceNumber}`,
  voucherType: null,
  postings: [
    {
      row: 1, date: TODAY,
      description: `Reminder fee invoice #${inv.invoiceNumber}`,
      account: { id: acc1500!.id },
      customer: { id: customerId },
      currency: { id: 1 },
      amount: FEE, amountCurrency: FEE, amountGross: FEE, amountGrossCurrency: FEE,
    },
    {
      row: 2, date: TODAY,
      description: `Reminder fee invoice #${inv.invoiceNumber}`,
      account: { id: acc3400!.id },
      currency: { id: 1 },
      amount: -FEE, amountCurrency: -FEE, amountGross: -FEE, amountGrossCurrency: -FEE,
    },
  ],
});
console.log(`Voucher: id=${voucher?.id} number=${voucher?.number}`);

// Call 5: Create fee invoice
const feeInvoice = await api("POST", "/invoice", {
  invoiceDate: TODAY,
  invoiceDueDate: TODAY,
  customer: { id: customerId },
  orders: [{
    customer: { id: customerId },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [{
      description: "Purregebyr",
      count: 1,
      unitPriceExcludingVatCurrency: FEE,
    }],
  }],
});
console.log(`Fee invoice: id=${feeInvoice?.id} number=${feeInvoice?.invoiceNumber} amount=${feeInvoice?.amountCurrency}`);

// Call 6: Register partial payment
const payResult = await api("PUT", `/invoice/${inv.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${pt.id}&paidAmount=${PAYMENT}`);
console.log(`Payment: remaining=${payResult?.amountCurrencyOutstanding ?? payResult?.amountOutstanding}`);

console.log("\n=== 6-call flow complete ===");
