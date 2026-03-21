const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "Yi7bFvRBeibSxllTjefDiqCbrmzR8-X1tkCbHmRDL0E";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";
const FEE = 40;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!r.ok) {
    console.error(`${method} ${path} → ${r.status}`, JSON.stringify(json).slice(0, 500));
    throw new Error(`${r.status}`);
  }
  console.log(`${method} ${path} → ${r.status}`);
  if (json?.values !== undefined) return json.values;
  if (json?.value !== undefined) return json.value;
  return json;
}

async function main() {
  // 1. Find overdue invoice
  const invoices: any[] = await api("GET",
    "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-03-21&count=1000&sorting=-invoiceDate&fields=*,customer(*)");

  const overdue = invoices.filter((inv: any) =>
    inv.invoiceDueDate < TODAY &&
    (inv.amountOutstanding > 0 || inv.amountCurrencyOutstanding > 0)
  );
  if (overdue.length !== 1) {
    console.error("Expected exactly 1 overdue invoice, found", overdue.length);
    if (overdue.length > 1) {
      overdue.forEach((inv: any) => console.log(`  id=${inv.id} #${inv.invoiceNumber} due=${inv.invoiceDueDate} outstanding=${inv.amountCurrencyOutstanding}`));
    }
    if (overdue.length === 0) return;
  }
  const inv = overdue[0];
  const customerId = inv.customer.id;
  const invoiceId = inv.id;
  console.log(`Overdue invoice: id=${invoiceId} #${inv.invoiceNumber} customer=${customerId} outstanding=${inv.amountCurrencyOutstanding} due=${inv.invoiceDueDate}`);

  // 2. Get payment types
  const paymentTypes: any[] = await api("GET",
    "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
  const pt = paymentTypes.find((p: any) =>
    p.debitAccount && (p.debitAccount.number >= 1900 && p.debitAccount.number < 2000 || p.debitAccount.isBankAccount || p.isInvoiceAccount)
  );
  if (!pt) { console.error("No suitable payment type"); return; }
  console.log(`Payment type: id=${pt.id} name=${pt.description || pt.name}`);

  // 3. Get ledger accounts 1500 and 3400
  const accounts: any[] = await api("GET", "/ledger/account?number=1500,3400&fields=*");
  const acc1500 = accounts.find((a: any) => a.number === 1500);
  const acc3400 = accounts.find((a: any) => a.number === 3400);
  if (!acc1500 || !acc3400) { console.error("Missing accounts", { acc1500, acc3400 }); return; }
  console.log(`Account 1500: id=${acc1500.id}, Account 3400: id=${acc3400.id}`);

  // 4. Book reminder fee voucher
  const voucher = await api("POST", "/ledger/voucher", {
    date: TODAY,
    description: "Mahngebühr",
    voucherType: null,
    postings: [
      {
        row: 1,
        date: TODAY,
        account: { id: acc1500.id },
        customer: { id: customerId },
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
    customer: { id: customerId },
    orders: [],
    orderLines: [
      {
        description: "Mahngebühr",
        count: 1,
        unitPriceExcludingVatCurrency: FEE,
      },
    ],
  });
  console.log(`Fee invoice created: id=${feeInvoice.id} #${feeInvoice.invoiceNumber} amount=${feeInvoice.amountCurrency}`);

  // 6. Register partial payment on overdue invoice
  const paymentResult = await api("PUT",
    `/invoice/${invoiceId}/:payment?paymentDate=${TODAY}&paymentTypeId=${pt.id}&paidAmount=5000`);
  console.log(`Payment registered. Remaining outstanding: ${paymentResult.amountCurrencyOutstanding ?? paymentResult.amountOutstanding}`);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
