const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "gvSiDeFaYgAWP-XHU5sMZi5IE4hTPAmuwwWtS1oahlE";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";
const FEE = 70;

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
  // 1. Locate overdue invoice
  const invoices: any[] = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-03-22&count=1000&sorting=-invoiceDate&fields=*,customer(*)");
  const overdue = invoices.filter((inv: any) => inv.invoiceDueDate < TODAY && (inv.amountCurrencyOutstanding > 0 || inv.amountOutstanding > 0));
  if (overdue.length !== 1) {
    console.log(`Found ${overdue.length} overdue invoices, expected 1`);
    if (overdue.length > 1) {
      overdue.forEach((inv: any) => console.log(`  Invoice #${inv.invoiceNumber} id=${inv.id} due=${inv.invoiceDueDate} outstanding=${inv.amountCurrencyOutstanding}`));
    }
    throw new Error("Unexpected overdue invoice count");
  }
  const oi = overdue[0];
  const customerId = oi.customer.id;
  console.log(`Overdue invoice #${oi.invoiceNumber} id=${oi.id} customer=${customerId} outstanding=${oi.amountCurrencyOutstanding} due=${oi.invoiceDueDate}`);

  // 2. Resolve payment type
  const paymentTypes: any[] = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
  const pt = paymentTypes.find((p: any) =>
    p.debitAccount && (
      (p.debitAccount.number >= 1900 && p.debitAccount.number < 2000) ||
      p.debitAccount.isBankAccount === true
    )
  ) || paymentTypes.find((p: any) => p.debitAccount?.isBankAccount === true)
    || paymentTypes[0];
  console.log(`Payment type id=${pt.id} name=${pt.name} debitAccount=${pt.debitAccount?.number}`);

  // 3. Resolve ledger accounts 1500 and 3400
  const accounts: any[] = await api("GET", "/ledger/account?number=1500,3400&fields=*");
  const acc1500 = accounts.find((a: any) => a.number === 1500);
  const acc3400 = accounts.find((a: any) => a.number === 3400);
  if (!acc1500 || !acc3400) throw new Error(`Missing accounts: 1500=${acc1500?.id} 3400=${acc3400?.id}`);
  console.log(`Account 1500 id=${acc1500.id}, Account 3400 id=${acc3400.id}`);

  // 4. Post manual voucher (debit 1500, credit 3400)
  const voucher = await api("POST", "/ledger/voucher", {
    date: TODAY,
    description: `Mahngebühr Rechnung ${oi.invoiceNumber}`,
    voucherType: null,
    postings: [
      {
        row: 1,
        date: TODAY,
        description: `Mahngebühr Rechnung ${oi.invoiceNumber}`,
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
        description: `Mahngebühr Rechnung ${oi.invoiceNumber}`,
        account: { id: acc3400.id },
        currency: { id: 1 },
        amount: -FEE,
        amountCurrency: -FEE,
        amountGross: -FEE,
        amountGrossCurrency: -FEE,
      },
    ],
  });
  console.log(`Voucher created id=${voucher.id} number=${voucher.number}`);

  // 5. Create and send fee invoice
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
  console.log(`Fee invoice created id=${feeInvoice.id} invoiceNumber=${feeInvoice.invoiceNumber} amount=${feeInvoice.amountCurrency}`);

  // 6. Register partial payment of 5000 on overdue invoice
  const paymentResult = await api("PUT", `/invoice/${oi.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${pt.id}&paidAmount=5000`);
  console.log(`Payment registered. Remaining outstanding=${paymentResult.amountCurrencyOutstanding ?? paymentResult.amountOutstanding}`);

  // Verification GETs (free)
  console.log("\n--- Verification ---");
  const vVerify = await api("GET", `/ledger/voucher/${voucher.id}?fields=id,number,date,description,postings(row,account(number,name),amountGross,customer(id,name))`);
  console.log("Voucher:", JSON.stringify(vVerify, null, 2));

  const fiVerify = await api("GET", `/invoice/${feeInvoice.id}?fields=id,invoiceNumber,amountCurrency,amountExcludingVatCurrency,customer(id,name)`);
  console.log("Fee invoice:", JSON.stringify(fiVerify, null, 2));

  const oiVerify = await api("GET", `/invoice/${oi.id}?fields=id,invoiceNumber,amountCurrencyOutstanding,amountOutstanding`);
  console.log("Overdue invoice after payment:", JSON.stringify(oiVerify, null, 2));

  console.log("\nDone. 6 writes completed.");
}

main().catch((e) => { console.error(e); process.exit(1); });
