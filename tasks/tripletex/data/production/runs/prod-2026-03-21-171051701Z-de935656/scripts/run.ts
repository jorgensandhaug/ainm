const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "IFI4uCTYNzsMx46OzamJPwNveVWyYPU_xo6g2bAfV7Y";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";
const FEE = 50;
const PARTIAL = 5000;

async function api(method: string, path: string, body?: any) {
  const url = BASE + path;
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  console.log(`\n>>> ${method} ${path}`);
  const r = await fetch(url, opts);
  const txt = await r.text();
  if (!r.ok) { console.error(`HTTP ${r.status}: ${txt}`); throw new Error(`HTTP ${r.status}`); }
  const json = JSON.parse(txt);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

// 1. Locate overdue invoice
const invoices: any[] = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-03-21&count=1000&sorting=-invoiceDate&fields=*,customer(*)");
const overdue = invoices.filter((i: any) => i.invoiceDueDate < TODAY && (i.amountOutstanding > 0 || i.amountCurrencyOutstanding > 0));
if (overdue.length !== 1) { console.error("Expected 1 overdue invoice, found", overdue.length); process.exit(1); }
const oi = overdue[0];
console.log(`Overdue invoice #${oi.invoiceNumber} id=${oi.id} customer=${oi.customer.id} outstanding=${oi.amountCurrencyOutstanding}`);

// 2. Get payment types
const ptypes: any[] = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
const pt = ptypes.find((p: any) => p.debitAccount && (/^19/.test(String(p.debitAccount.number)) || p.debitAccount.isBankAccount || p.debitAccount.isInvoiceAccount));
if (!pt) { console.error("No usable payment type"); process.exit(1); }
console.log(`Payment type id=${pt.id}`);

// 3. Resolve accounts 1500, 3400
const accounts: any[] = await api("GET", "/ledger/account?number=1500,3400&fields=*");
const acc1500 = accounts.find((a: any) => a.number === 1500);
const acc3400 = accounts.find((a: any) => a.number === 3400);
if (!acc1500 || !acc3400) { console.error("Missing accounts", acc1500, acc3400); process.exit(1); }
console.log(`Account 1500 id=${acc1500.id}, Account 3400 id=${acc3400.id}`);

// 4. Post voucher
const voucher = await api("POST", "/ledger/voucher", {
  date: TODAY,
  description: `Purregebyr faktura ${oi.invoiceNumber}`,
  voucherType: null,
  postings: [
    {
      row: 1, date: TODAY,
      description: `Purregebyr faktura ${oi.invoiceNumber}`,
      account: { id: acc1500.id },
      customer: { id: oi.customer.id },
      currency: { id: 1 },
      amount: FEE, amountCurrency: FEE, amountGross: FEE, amountGrossCurrency: FEE
    },
    {
      row: 2, date: TODAY,
      description: `Purregebyr faktura ${oi.invoiceNumber}`,
      account: { id: acc3400.id },
      currency: { id: 1 },
      amount: -FEE, amountCurrency: -FEE, amountGross: -FEE, amountGrossCurrency: -FEE
    }
  ]
});
console.log(`Voucher id=${voucher.id} number=${voucher.number}`);

// 5. Create and send fee invoice
const feeInv = await api("POST", "/invoice", {
  invoiceDate: TODAY,
  invoiceDueDate: TODAY,
  customer: { id: oi.customer.id },
  orders: [{
    customer: { id: oi.customer.id },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [{
      description: "Purregebyr",
      count: 1,
      unitPriceExcludingVatCurrency: FEE
    }]
  }]
});
console.log(`Fee invoice id=${feeInv.id} number=${feeInv.invoiceNumber} amount=${feeInv.amountCurrency}`);

// 6. Register partial payment on overdue invoice
const payResult = await api("PUT", `/invoice/${oi.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${pt.id}&paidAmount=${PARTIAL}`);
console.log(`Payment registered. Remaining outstanding=${payResult.amountCurrencyOutstanding ?? payResult.amountOutstanding}`);

console.log("\n=== DONE (6 calls) ===");
