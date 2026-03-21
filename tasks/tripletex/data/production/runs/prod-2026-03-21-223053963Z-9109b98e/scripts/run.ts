const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "CNa1zEotQnPuczv9Jn_i3IY-qjbcoj59cHwHEe6kwOU";
const TODAY = "2026-03-21";
const FEE = 40;
const PAYMENT = 5000;

const headers = {
  "Content-Type": "application/json",
  Authorization: "Basic " + btoa("0:" + TOKEN),
};

async function api(method: string, path: string, body?: any) {
  const opts: any = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  const txt = await r.text();
  if (!r.ok) { console.error(`${method} ${path} → ${r.status}`, txt); throw new Error(`${r.status}`); }
  const json = JSON.parse(txt);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

// 1. Locate overdue invoice
const invoices: any[] = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-03-21&count=1000&sorting=-invoiceDate&fields=*,customer(*)");
const overdue = invoices.filter((i: any) => i.invoiceDueDate < TODAY && (i.amountOutstanding > 0 || i.amountCurrencyOutstanding > 0));
if (overdue.length !== 1) { console.error("Expected 1 overdue, got", overdue.length); process.exit(1); }
const inv = overdue[0];
const custId = inv.customer.id;
console.log(`Overdue invoice #${inv.invoiceNumber} id=${inv.id} customer=${custId} outstanding=${inv.amountCurrencyOutstanding} due=${inv.invoiceDueDate}`);

// 2. Resolve payment type
const ptypes: any[] = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
const pt = ptypes.find((p: any) => p.debitAccount && (p.debitAccount.number >= 1900 && p.debitAccount.number < 2000))
  || ptypes.find((p: any) => p.debitAccount?.isBankAccount)
  || ptypes.find((p: any) => p.isIncomingPayment !== false);
if (!pt) { console.error("No payment type found"); process.exit(1); }
console.log(`Payment type id=${pt.id} name=${pt.name}`);

// 3. Resolve ledger accounts 1500 and 3400
const accounts: any[] = await api("GET", "/ledger/account?number=1500,3400&fields=*");
const acc1500 = accounts.find((a: any) => a.number === 1500);
const acc3400 = accounts.find((a: any) => a.number === 3400);
if (!acc1500 || !acc3400) { console.error("Missing accounts", { acc1500, acc3400 }); process.exit(1); }
console.log(`Account 1500 id=${acc1500.id}, Account 3400 id=${acc3400.id}`);

// 4. Post voucher
const voucher = await api("POST", "/ledger/voucher", {
  date: TODAY,
  description: `Reminder fee invoice #${inv.invoiceNumber}`,
  voucherType: null,
  postings: [
    {
      row: 1, date: TODAY, description: `Reminder fee invoice #${inv.invoiceNumber}`,
      account: { id: acc1500.id }, customer: { id: custId }, currency: { id: 1 },
      amount: FEE, amountCurrency: FEE, amountGross: FEE, amountGrossCurrency: FEE,
    },
    {
      row: 2, date: TODAY, description: `Reminder fee invoice #${inv.invoiceNumber}`,
      account: { id: acc3400.id }, currency: { id: 1 },
      amount: -FEE, amountCurrency: -FEE, amountGross: -FEE, amountGrossCurrency: -FEE,
    },
  ],
});
console.log(`Voucher id=${voucher.id} number=${voucher.number}`);

// 5. Create and send fee invoice
const feeInv = await api("POST", "/invoice", {
  invoiceDate: TODAY,
  invoiceDueDate: TODAY,
  customer: { id: custId },
  orders: [
    {
      customer: { id: custId },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [
        { description: "Purregebyr", count: 1, unitPriceExcludingVatCurrency: FEE },
      ],
    },
  ],
});
console.log(`Fee invoice #${feeInv.invoiceNumber} id=${feeInv.id} amount=${feeInv.amountCurrency}`);

// 6. Register partial payment on overdue invoice
const payResult = await api("PUT", `/invoice/${inv.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${pt.id}&paidAmount=${PAYMENT}`);
console.log(`Payment registered. Remaining outstanding=${payResult.amountCurrencyOutstanding ?? payResult.amountOutstanding}`);

console.log("\nDone. 6 API calls, 0 errors.");
