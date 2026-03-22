const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "aeO5YAI0OobFe9rjyKRPGOVehzFZiSTtXSrNGzVJCUc";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";
const FEE = 40;
const PARTIAL = 5000;

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
    throw new Error(`${method} ${path} failed ${r.status}: ${txt}`);
  }
  const json = JSON.parse(txt);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

async function main() {
  // 1. Locate overdue invoice
  const invoices: any[] = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-03-22&count=1000&sorting=-invoiceDate&fields=*,customer(*)");
  const overdue = invoices.filter((inv: any) => {
    const due = inv.invoiceDueDate;
    const outstanding = inv.amountCurrencyOutstanding ?? inv.amountOutstanding ?? 0;
    return due < TODAY && outstanding > 0;
  });
  if (overdue.length !== 1) {
    console.log(`Found ${overdue.length} overdue invoices, expected 1`);
    if (overdue.length === 0) throw new Error("No overdue invoices found");
    // If multiple, take the one with earliest due date
    overdue.sort((a: any, b: any) => a.invoiceDueDate.localeCompare(b.invoiceDueDate));
  }
  const ov = overdue[0];
  const customerId = ov.customer.id;
  const overdueInvId = ov.id;
  console.log(`Overdue invoice #${ov.invoiceNumber} (id=${overdueInvId}), customer=${customerId}, outstanding=${ov.amountCurrencyOutstanding}, due=${ov.invoiceDueDate}`);

  // 2. Resolve payment type
  const paymentTypes: any[] = await api("GET", "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
  let pt = paymentTypes.find((p: any) => {
    const da = p.debitAccount;
    if (!da) return false;
    const num = da.number ?? 0;
    return num >= 1900 && num < 2000;
  });
  if (!pt) {
    pt = paymentTypes.find((p: any) => p.debitAccount?.isBankAccount);
  }
  if (!pt) {
    pt = paymentTypes.find((p: any) => p.isInvoiceAccount);
  }
  if (!pt) {
    pt = paymentTypes[0];
  }
  const paymentTypeId = pt.id;
  console.log(`Payment type id=${paymentTypeId}, name=${pt.name}`);

  // 3. Resolve ledger accounts 1500 and 3400
  const accounts: any[] = await api("GET", "/ledger/account?number=1500,3400&fields=*");
  const acc1500 = accounts.find((a: any) => a.number === 1500);
  const acc3400 = accounts.find((a: any) => a.number === 3400);
  if (!acc1500 || !acc3400) throw new Error(`Missing accounts: 1500=${acc1500?.id}, 3400=${acc3400?.id}`);
  console.log(`Account 1500 id=${acc1500.id}, Account 3400 id=${acc3400.id}`);

  // 4. Post manual reminder fee voucher
  const voucherBody = {
    date: TODAY,
    description: `Mahngebühr Rechnung ${ov.invoiceNumber}`,
    voucherType: null,
    postings: [
      {
        row: 1,
        date: TODAY,
        description: `Mahngebühr Rechnung ${ov.invoiceNumber}`,
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
        description: `Mahngebühr Rechnung ${ov.invoiceNumber}`,
        account: { id: acc3400.id },
        currency: { id: 1 },
        amount: -FEE,
        amountCurrency: -FEE,
        amountGross: -FEE,
        amountGrossCurrency: -FEE,
      },
    ],
  };
  const voucher = await api("POST", "/ledger/voucher", voucherBody);
  console.log(`Voucher created: id=${voucher.id}, number=${voucher.number}`);

  // 5. Create and send fee invoice
  const invoiceBody = {
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
  };
  const feeInvoice = await api("POST", "/invoice", invoiceBody);
  console.log(`Fee invoice created: id=${feeInvoice.id}, number=${feeInvoice.invoiceNumber}, amount=${feeInvoice.amountCurrency}`);

  // 6. Register partial payment on overdue invoice
  const payResult = await api("PUT", `/invoice/${overdueInvId}/:payment?paymentDate=${TODAY}&paymentTypeId=${paymentTypeId}&paidAmount=${PARTIAL}`);
  console.log(`Payment registered. Remaining outstanding: ${payResult.amountCurrencyOutstanding ?? payResult.amountOutstanding}`);

  // Verification GETs (free)
  console.log("\n--- Verification ---");
  const vv = await api("GET", `/ledger/voucher/${voucher.id}?fields=id,number,date,description,postings(row,account(number,name),amountGross,customer(id,name))`);
  console.log("Voucher:", JSON.stringify(vv, null, 2));

  const fi = await api("GET", `/invoice/${feeInvoice.id}?fields=id,invoiceNumber,amountCurrency,amountExcludingVatCurrency,customer(id,name),isSent`);
  console.log("Fee invoice:", JSON.stringify(fi, null, 2));

  const oi = await api("GET", `/invoice/${overdueInvId}?fields=id,invoiceNumber,amountCurrencyOutstanding,amountOutstanding`);
  console.log("Overdue invoice after payment:", JSON.stringify(oi, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
