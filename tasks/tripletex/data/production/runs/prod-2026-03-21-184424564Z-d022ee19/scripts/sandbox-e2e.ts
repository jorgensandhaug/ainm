// Full 6-call end-to-end sandbox verification with row fix
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";
const FEE = 70;

function parse(json: any) {
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`${method} ${path} -> ${res.status}`);
  if (!res.ok) {
    console.error("ERROR:", text.substring(0, 500));
    throw new Error(`${res.status}`);
  }
  return parse(JSON.parse(text));
}

async function main() {
  // Call 1: Find overdue invoices
  const invoices = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-03-21&count=1000&sorting=-invoiceDate&fields=*,customer(*)") as any[];
  const overdue = invoices.filter((i: any) => i.invoiceDueDate < TODAY && (i.amountCurrencyOutstanding > 0 || i.amountOutstanding > 0));
  console.log(`Found ${overdue.length} overdue invoice(s)`);
  if (overdue.length === 0) {
    console.log("No overdue invoices in sandbox. Creating a fixture...");
    // Need to create a fixture invoice for testing
    const cust = await api("GET", "/customer?count=1&fields=*") as any[];
    console.log(`Using customer ${cust[0].id}`);
    const fixture = await api("POST", "/invoice", {
      invoiceDate: "2026-02-01",
      invoiceDueDate: "2026-02-15",
      customer: { id: cust[0].id },
      orders: [{
        orderDate: "2026-02-01",
        deliveryDate: "2026-02-01",
        customer: { id: cust[0].id },
        orderLines: [{
          description: "Test product",
          count: 1,
          unitPriceExcludingVatCurrency: 10000,
        }],
      }],
    });
    console.log(`Created fixture invoice #${fixture.invoiceNumber} id=${fixture.id} outstanding=${fixture.amountCurrencyOutstanding}`);
    // Re-read
    const inv2 = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-03-21&count=1000&sorting=-invoiceDate&fields=*,customer(*)") as any[];
    const overdue2 = inv2.filter((i: any) => i.invoiceDueDate < TODAY && (i.amountCurrencyOutstanding > 0 || i.amountOutstanding > 0));
    if (overdue2.length === 0) throw new Error("Still no overdue invoices after fixture");
    return runFlow(overdue2[0]);
  }
  return runFlow(overdue[0]);
}

async function runFlow(inv: any) {
  console.log(`\nOverdue invoice: #${inv.invoiceNumber} id=${inv.id} customer=${inv.customer.id} outstanding=${inv.amountCurrencyOutstanding}`);

  // Call 2: Get payment types
  const paymentTypes = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)") as any[];
  const bankPt = paymentTypes.find((pt: any) =>
    pt.debitAccount && (
      (pt.debitAccount.number >= 1900 && pt.debitAccount.number < 2000) ||
      pt.debitAccount.isBankAccount === true
    )
  ) || paymentTypes.find((pt: any) => pt.isInvoiceAccount === true);
  if (!bankPt) throw new Error("No suitable payment type found");
  console.log(`Payment type: id=${bankPt.id}`);

  // Call 3: Get ledger accounts
  const accounts = await api("GET", "/ledger/account?number=1500,3400&fields=*") as any[];
  const acc1500 = accounts.find((a: any) => a.number === 1500);
  const acc3400 = accounts.find((a: any) => a.number === 3400);
  if (!acc1500 || !acc3400) throw new Error("Missing required accounts");
  console.log(`Account 1500: id=${acc1500.id}, Account 3400: id=${acc3400.id}`);

  // Call 4: Post voucher WITH row values
  const voucher = await api("POST", "/ledger/voucher", {
    date: TODAY,
    description: "Purregebyr",
    voucherType: null,
    postings: [
      {
        row: 1,
        date: TODAY,
        account: { id: acc1500.id },
        customer: { id: inv.customer.id },
        currency: { id: 1 },
        amount: FEE,
        amountCurrency: FEE,
        amountGross: FEE,
        amountGrossCurrency: FEE,
      },
      {
        row: 2,
        date: TODAY,
        account: { id: acc3400.id },
        currency: { id: 1 },
        amount: -FEE,
        amountCurrency: -FEE,
        amountGross: -FEE,
        amountGrossCurrency: -FEE,
      },
    ],
  });
  console.log(`Voucher created: id=${voucher.id} number=${voucher.number}`);

  // Call 5: Create and send fee invoice
  const feeInvoice = await api("POST", "/invoice", {
    invoiceDate: TODAY,
    invoiceDueDate: TODAY,
    customer: { id: inv.customer.id },
    orders: [{
      orderDate: TODAY,
      deliveryDate: TODAY,
      customer: { id: inv.customer.id },
      orderLines: [{
        description: "Purregebyr",
        count: 1,
        unitPriceExcludingVatCurrency: FEE,
      }],
    }],
  });
  console.log(`Fee invoice created: id=${feeInvoice.id} number=${feeInvoice.invoiceNumber} amount=${feeInvoice.amountCurrency}`);

  // Call 6: Register partial payment
  const payment = await api("PUT", `/invoice/${inv.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${bankPt.id}&paidAmount=5000`);
  console.log(`Payment registered. Outstanding after: ${payment.amountCurrencyOutstanding}`);
  console.log(`Expected outstanding: ${inv.amountCurrencyOutstanding - 5000}`);

  console.log("\n=== ALL 6 CALLS SUCCEEDED ===");
}

main().catch((e) => { console.error(e); process.exit(1); });
