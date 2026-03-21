const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "B-WaiNb2qhBb2AXwLL_jXw4kFXeoIe7QD5Vq7S7nIeI";
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
    console.error(text);
    throw new Error(`${res.status} ${text}`);
  }
  return parse(JSON.parse(text));
}

async function main() {
  // 1. Find the overdue invoice
  const invoices = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-03-21&count=1000&sorting=-invoiceDate&fields=*,customer(*)") as any[];
  const overdue = invoices.filter((i: any) => i.invoiceDueDate < TODAY && (i.amountCurrencyOutstanding > 0 || i.amountOutstanding > 0));
  if (overdue.length !== 1) {
    console.error("Expected exactly 1 overdue invoice, found", overdue.length);
    throw new Error("Unexpected overdue count");
  }
  const inv = overdue[0];
  console.log(`Overdue invoice: #${inv.invoiceNumber} id=${inv.id} customer=${inv.customer.id} outstanding=${inv.amountCurrencyOutstanding}`);

  // 2. Get payment types
  const paymentTypes = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)") as any[];
  const bankPt = paymentTypes.find((pt: any) =>
    pt.debitAccount && (
      (pt.debitAccount.number >= 1900 && pt.debitAccount.number < 2000) ||
      pt.debitAccount.isBankAccount === true
    )
  ) || paymentTypes.find((pt: any) => pt.isInvoiceAccount === true);
  if (!bankPt) throw new Error("No suitable payment type found");
  console.log(`Payment type: id=${bankPt.id} name=${bankPt.name}`);

  // 3. Get ledger accounts 1500 and 3400
  const accounts = await api("GET", "/ledger/account?number=1500,3400&fields=*") as any[];
  const acc1500 = accounts.find((a: any) => a.number === 1500);
  const acc3400 = accounts.find((a: any) => a.number === 3400);
  if (!acc1500 || !acc3400) throw new Error("Missing required accounts");
  console.log(`Account 1500: id=${acc1500.id}, Account 3400: id=${acc3400.id}`);

  // 4. Post reminder fee voucher
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

  // 5. Create and send fee invoice
  const feeInvoice = await api("POST", "/invoice", {
    invoiceDate: TODAY,
    invoiceDueDate: TODAY,
    customer: { id: inv.customer.id },
    orders: [
      {
        orderDate: TODAY,
        deliveryDate: TODAY,
        customer: { id: inv.customer.id },
        orderLines: [
          {
            description: "Purregebyr",
            count: 1,
            unitPriceExcludingVatCurrency: FEE,
          },
        ],
      },
    ],
  });
  console.log(`Fee invoice created: id=${feeInvoice.id} number=${feeInvoice.invoiceNumber} amount=${feeInvoice.amountCurrency}`);

  // 6. Register partial payment of 5000 on the overdue invoice
  const payment = await api("PUT", `/invoice/${inv.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${bankPt.id}&paidAmount=5000`);
  console.log(`Payment registered. Remaining outstanding: ${payment.amountCurrencyOutstanding}`);

  console.log("\n=== DONE ===");
  console.log(`Overdue invoice: #${inv.invoiceNumber} (id=${inv.id})`);
  console.log(`Customer: ${inv.customer.id}`);
  console.log(`Voucher: id=${voucher.id}`);
  console.log(`Fee invoice: #${feeInvoice.invoiceNumber} (id=${feeInvoice.id}), amount=${feeInvoice.amountCurrency}`);
  console.log(`Partial payment: 5000, outstanding after: ${payment.amountCurrencyOutstanding}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
