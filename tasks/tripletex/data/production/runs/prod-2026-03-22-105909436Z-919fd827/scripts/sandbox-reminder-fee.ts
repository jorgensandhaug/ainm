const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "84xSx8Svhl6RVbr1bQQtf1-aeaUpVFTQxv7kb_hQusg";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";
const FEE = 60;
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
    throw new Error(`${r.status} on ${method} ${path}: ${txt}`);
  }
  const json = JSON.parse(txt);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

async function main() {
  // Step 1: Locate overdue invoice
  const invoices: any[] = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-03-22&count=1000&sorting=-invoiceDate&fields=*,customer(*)");
  const overdue = invoices.filter((inv: any) => {
    const due = inv.invoiceDueDate;
    const outstanding = inv.amountCurrencyOutstanding ?? inv.amountOutstanding ?? 0;
    return due < TODAY && outstanding > 0;
  });
  if (overdue.length === 0) throw new Error("No overdue invoices found");
  if (overdue.length > 1) console.log(`WARN: ${overdue.length} overdue invoices, picking first`);
  const oi = overdue[0];
  const customerId = oi.customer.id;
  const overdueId = oi.id;
  const overdueNum = oi.invoiceNumber;
  const outstandingBefore = oi.amountCurrencyOutstanding ?? oi.amountOutstanding;
  console.log(`Overdue invoice #${overdueNum} (id=${overdueId}), customer=${customerId}, outstanding=${outstandingBefore}, due=${oi.invoiceDueDate}`);

  // Step 2: Resolve payment type
  const paymentTypes: any[] = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
  const pt = paymentTypes.find((p: any) => {
    const da = p.debitAccount;
    if (!da) return false;
    const num = da.number;
    return (num >= 1900 && num < 2000) || da.isBankAccount || da.isInvoiceAccount;
  }) || paymentTypes[0];
  const paymentTypeId = pt.id;
  console.log(`Payment type: id=${paymentTypeId}, name=${pt.name}`);

  // Step 3: Resolve ledger accounts 1500 and 3400
  const accounts: any[] = await api("GET", "/ledger/account?number=1500,3400&fields=*");
  const acc1500 = accounts.find((a: any) => a.number === 1500);
  const acc3400 = accounts.find((a: any) => a.number === 3400);
  if (!acc1500 || !acc3400) throw new Error(`Missing accounts: 1500=${acc1500?.id}, 3400=${acc3400?.id}`);
  console.log(`Account 1500: id=${acc1500.id}, name=${acc1500.name}`);
  console.log(`Account 3400: id=${acc3400.id}, name=${acc3400.name}`);

  // Step 4: Post manual voucher (debit 1500, credit 3400)
  const voucher = await api("POST", "/ledger/voucher", {
    date: TODAY,
    description: `Mahngebühr Rechnung ${overdueNum}`,
    voucherType: null,
    postings: [
      {
        row: 1,
        date: TODAY,
        description: `Mahngebühr Rechnung ${overdueNum}`,
        account: { id: acc1500.id },
        customer: { id: customerId },
        amount: FEE,
        amountCurrency: FEE,
        amountGross: FEE,
        amountGrossCurrency: FEE,
      },
      {
        row: 2,
        date: TODAY,
        description: `Mahngebühr Rechnung ${overdueNum}`,
        account: { id: acc3400.id },
        amount: -FEE,
        amountCurrency: -FEE,
        amountGross: -FEE,
        amountGrossCurrency: -FEE,
      },
    ],
  });
  console.log(`Voucher created: id=${voucher.id}, number=${voucher.number}`);

  // Step 5: Create and send fee invoice
  const feeInvoice = await api("POST", "/invoice", {
    invoiceDate: TODAY,
    invoiceDueDate: TODAY,
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
        orderDate: TODAY,
        deliveryDate: TODAY,
        orderLines: [
          {
            description: "Mahngebühr",
            count: 1,
            unitPriceExcludingVatCurrency: FEE,
          },
        ],
      },
    ],
  });
  console.log(`Fee invoice created: id=${feeInvoice.id}, number=${feeInvoice.invoiceNumber}, amount=${feeInvoice.amountCurrency}`);

  // Step 6: Register partial payment on overdue invoice
  const paymentResult = await api("PUT", `/invoice/${overdueId}/:payment?paymentDate=${TODAY}&paymentTypeId=${paymentTypeId}&paidAmount=${PAYMENT}`);
  const remainingOutstanding = paymentResult.amountCurrencyOutstanding ?? paymentResult.amountOutstanding ?? "unknown";
  console.log(`Payment registered: paidAmount=${PAYMENT}, remaining outstanding=${remainingOutstanding}`);

  // Verification GETs (free)
  console.log("\n=== VERIFICATION ===");
  const vVerify = await api("GET", `/ledger/voucher/${voucher.id}?fields=id,number,date,description,postings(row,account(number,name),amountGross,customer(id,name))`);
  console.log("Voucher:", JSON.stringify(vVerify, null, 2));

  const fiVerify = await api("GET", `/invoice/${feeInvoice.id}?fields=id,invoiceNumber,amountCurrency,amountExcludingVatCurrency,customer(id,name)`);
  console.log("Fee invoice:", JSON.stringify(fiVerify, null, 2));

  const oiVerify = await api("GET", `/invoice/${overdueId}?fields=id,invoiceNumber,amountCurrencyOutstanding,amountOutstanding`);
  console.log("Overdue invoice after payment:", JSON.stringify(oiVerify, null, 2));

  console.log("\n=== SUMMARY ===");
  console.log(`Overdue invoice: #${overdueNum} (id=${overdueId}), customer=${customerId}`);
  console.log(`Outstanding before: ${outstandingBefore}, after: ${remainingOutstanding}`);
  console.log(`Voucher: #${voucher.number} (id=${voucher.id}), accounts 1500/3400, amount ${FEE}`);
  console.log(`Fee invoice: #${feeInvoice.invoiceNumber} (id=${feeInvoice.id}), amount ${feeInvoice.amountCurrency}`);
  console.log(`Partial payment: ${PAYMENT} NOK`);
  console.log(`Total write calls: 6`);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
