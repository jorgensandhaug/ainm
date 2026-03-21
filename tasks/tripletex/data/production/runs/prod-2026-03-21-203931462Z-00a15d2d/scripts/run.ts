const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "UWWVJsXzjnmSUPffU-hpGtPEmrMESCaiQDUKlMZQQm0";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";
const FEE = 50;
const PAYMENT = 5000;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const txt = await r.text();
  console.log(`${method} ${path} -> ${r.status}`);
  if (!r.ok) {
    console.log("ERROR:", txt);
    throw new Error(`${r.status} ${txt}`);
  }
  const json = JSON.parse(txt);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

// 1. Locate overdue invoice
const invoices: any[] = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-03-21&count=1000&sorting=-invoiceDate&fields=*,customer(*)");
const overdue = invoices.filter((inv: any) => inv.invoiceDueDate < TODAY && (inv.amountCurrencyOutstanding > 0 || inv.amountOutstanding > 0));
if (overdue.length !== 1) throw new Error(`Expected 1 overdue invoice, found ${overdue.length}`);
const oi = overdue[0];
console.log(`Overdue invoice #${oi.invoiceNumber} id=${oi.id} customer=${oi.customer.id} outstanding=${oi.amountCurrencyOutstanding}`);

// 2. Resolve payment type
const paymentTypes: any[] = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
const pt = paymentTypes.find((p: any) => p.debitAccount && (p.debitAccount.number >= 1900 && p.debitAccount.number < 2000 || p.debitAccount.isBankAccount));
if (!pt) throw new Error("No usable payment type found");
console.log(`Payment type id=${pt.id} name=${pt.name}`);

// 3. Resolve ledger accounts
const accounts: any[] = await api("GET", "/ledger/account?number=1500,3400&fields=*");
const acc1500 = accounts.find((a: any) => a.number === 1500);
const acc3400 = accounts.find((a: any) => a.number === 3400);
if (!acc1500 || !acc3400) throw new Error(`Missing accounts: 1500=${!!acc1500} 3400=${!!acc3400}`);
console.log(`Account 1500 id=${acc1500.id}, Account 3400 id=${acc3400.id}`);

// 4. Post manual voucher
const voucher = await api("POST", "/ledger/voucher", {
  date: TODAY,
  description: `Reminder fee invoice ${oi.invoiceNumber}`,
  voucherType: null,
  postings: [
    {
      row: 1,
      date: TODAY,
      description: `Reminder fee invoice ${oi.invoiceNumber}`,
      account: { id: acc1500.id },
      customer: { id: oi.customer.id },
      currency: { id: 1 },
      amount: FEE,
      amountCurrency: FEE,
      amountGross: FEE,
      amountGrossCurrency: FEE,
    },
    {
      row: 2,
      date: TODAY,
      description: `Reminder fee invoice ${oi.invoiceNumber}`,
      account: { id: acc3400.id },
      currency: { id: 1 },
      amount: -FEE,
      amountCurrency: -FEE,
      amountGross: -FEE,
      amountGrossCurrency: -FEE,
    },
  ],
});
console.log(`Voucher id=${voucher.id} number=${voucher.number}`);

// 5. Create and send fee invoice
const feeInvoice = await api("POST", "/invoice", {
  invoiceDate: TODAY,
  invoiceDueDate: TODAY,
  customer: { id: oi.customer.id },
  orders: [
    {
      customer: { id: oi.customer.id },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [
        {
          description: "Frais de rappel",
          count: 1,
          unitPriceExcludingVatCurrency: FEE,
        },
      ],
    },
  ],
});
console.log(`Fee invoice id=${feeInvoice.id} number=${feeInvoice.invoiceNumber} amount=${feeInvoice.amountCurrency}`);

// 6. Register partial payment on overdue invoice
const paymentResult = await api("PUT", `/invoice/${oi.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${pt.id}&paidAmount=${PAYMENT}`);
console.log(`Payment registered. Remaining outstanding=${paymentResult.amountCurrencyOutstanding}`);

console.log("\n=== SUMMARY ===");
console.log(`Overdue invoice: #${oi.invoiceNumber} (id=${oi.id}), customer=${oi.customer.id}, was outstanding=${oi.amountCurrencyOutstanding}`);
console.log(`Voucher: id=${voucher.id}, debit 1500 +${FEE}, credit 3400 -${FEE}`);
console.log(`Fee invoice: #${feeInvoice.invoiceNumber} (id=${feeInvoice.id}), amount=${feeInvoice.amountCurrency}`);
console.log(`Partial payment: ${PAYMENT} NOK, remaining outstanding=${paymentResult.amountCurrencyOutstanding}`);
